import './styles.css';
import { AudioEngine, type SoundSlot } from './engine/audioEngine';
import { applyLanguage, applyTranslations, format } from './i18n/i18n';
import { SoundLibrary } from './sounds/soundLibrary';
import { SoundStore } from './sounds/soundStore';
import {
  cycleBeatLevel,
  DEFAULT_SETTINGS,
  loadSettings,
  type Settings,
  saveSettings,
} from './state/settings';
import { createStore } from './state/store';
import { mountControls } from './ui/controls';
import { mountDebugOverlay } from './ui/debugOverlay';
import { byId } from './ui/dom';
import { mountLanguageSwitch } from './ui/languageSwitch';
import { mountSettingsDialog } from './ui/settingsDialog';
import { mountSignatureDialog } from './ui/signatureDialog';
import { mountSoundDialog } from './ui/soundDialog';
import { createToast } from './ui/toast';
import { mountTransport } from './ui/transport';
import { mountVizSwitch } from './ui/vizSwitch';
import { createWakeLock } from './ui/wakeLock';
import { VizController } from './viz/vizController';

function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

const storage = safeLocalStorage();
const store = createStore<Settings>(loadSettings(storage));
store.subscribe((s) => saveSettings(storage, s));

const applyTheme = (s: Settings) => {
  document.documentElement.dataset.theme = s.theme;
};
applyTheme(store.get());
store.subscribe(applyTheme);

applyLanguage(store.get().language);
document.documentElement.lang = store.get().language;
store.subscribe((s, prev) => {
  if (s.language !== prev.language) {
    applyLanguage(s.language);
    document.documentElement.lang = s.language;
    transport.refreshLabel();
  }
});

const toast = createToast(byId('toast'));
const engine = new AudioEngine({ getPattern: () => store.get() });
engine.setVolume(store.get().volume);
store.subscribe((s, prev) => {
  if (s.volume !== prev.volume) engine.setVolume(s.volume);
});

const sounds = new SoundStore();
const library = new SoundLibrary({
  sampleRate: engine.sampleRate,
  decode: (bytes) => engine.decode(bytes),
  loadBytes: async (id) => (await sounds.get(id))?.bytes,
});

const slotRequest: Record<SoundSlot, number> = { accent: 0, normal: 0 };

async function applySound(slot: SoundSlot): Promise<void> {
  const request = ++slotRequest[slot];
  const s = store.get();
  const id = slot === 'accent' ? s.accentSoundId : s.normalSoundId;
  const fallback =
    slot === 'accent' ? DEFAULT_SETTINGS.accentSoundId : DEFAULT_SETTINGS.normalSoundId;
  const result = await library.resolve(id, fallback);
  if (request !== slotRequest[slot]) return; // a newer selection finished first
  engine.setSound(slot, result.pcm);
  if (result.error) {
    toast(format('toast.soundLoadError', { error: result.error }));
    store.set(slot === 'accent' ? { accentSoundId: fallback } : { normalSoundId: fallback });
  }
}

void applySound('accent');
void applySound('normal');
store.subscribe((s, prev) => {
  if (s.accentSoundId !== prev.accentSoundId) void applySound('accent');
  if (s.normalSoundId !== prev.normalSoundId) void applySound('normal');
});

const playBtn = byId('playBtn');
const barCounter = byId('barCounter');

barCounter.addEventListener('click', async () => {
  const current = store.get().targetBars;
  const input = prompt(format('barCounter.prompt', {}), String(current || '0'));
  if (input === null) return;
  const n = Number(input);
  if (!Number.isNaN(n) && n >= 0 && n <= 999) {
    store.set({ targetBars: n });
  }
});

const viz = new VizController(
  byId<HTMLCanvasElement>('viz'),
  {
    running: () => engine.running,
    heardTime: () => engine.heardTime(store.get().syncOffsetMs),
    beatAt: (time) => engine.timeline.beatAt(time),
  },
  () => store.get(),
  (index) => store.set({ levels: cycleBeatLevel(store.get().levels, index) }),
  (level, barIndex) => {
    if (level === 'accent') {
      playBtn.classList.remove('pulse');
      void playBtn.offsetWidth; // restart the animation even if it's already mid-pulse
      playBtn.classList.add('pulse');
    }
    if (store.get().haptics && level !== 'mute' && navigator.vibrate) {
      navigator.vibrate(level === 'accent' ? 30 : 12);
    }
    const target = store.get().targetBars;
    barCounter.textContent =
      target > 0
        ? format('barCounter.withTarget', { n: barIndex + 1, total: target })
        : format('barCounter.plain', { n: barIndex + 1 });
  },
);
store.subscribe(() => viz.invalidate());

const wakeLock = createWakeLock();
let practiceTimer: ReturnType<typeof setTimeout> | undefined;
let practiceTimerInterval: ReturnType<typeof setInterval> | undefined;
const practiceTimerFill = byId('practiceTimerFill');

const transport = mountTransport({
  engine,
  toast,
  onToggle: () => {
    wakeLock.setActive(engine.running);
    viz.invalidate();
    clearTimeout(practiceTimer);
    clearInterval(practiceTimerInterval);
    practiceTimer = undefined;
    practiceTimerInterval = undefined;
    practiceTimerFill.style.width = '100%';
    if (!engine.running) {
      barCounter.textContent = 'Bar −';
      return;
    }
    const minutes = store.get().practiceMinutes;
    if (minutes > 0) {
      const startTime = performance.now();
      const durationMs = minutes * 60_000;
      practiceTimerInterval = setInterval(() => {
        const elapsed = performance.now() - startTime;
        const remaining = Math.max(0, durationMs - elapsed);
        const percent = (remaining / durationMs) * 100;
        practiceTimerFill.style.width = `${percent}%`;
      }, 100);
      practiceTimer = setTimeout(() => {
        clearInterval(practiceTimerInterval);
        practiceTimerInterval = undefined;
        if (!engine.running) return;
        void transport.toggle();
        toast(format('toast.practiceTimerEnded', { minutes }));
      }, durationMs);
    }
  },
});
mountVizSwitch({ store });
mountControls({ store, toggle: transport.toggle });
mountSignatureDialog({ store });
mountSettingsDialog({ store });
mountSoundDialog({ store, engine, sounds, library, toast });
mountLanguageSwitch({ store });
applyTranslations();

if (new URLSearchParams(location.search).has('debug')) {
  mountDebugOverlay(byId('debug'), engine);
}

if (!('__TAURI_INTERNALS__' in window)) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {
      // Offline support is a bonus; the app works without it.
    });
}
