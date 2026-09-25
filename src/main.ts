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
import { mountClickFx } from './ui/clickFx';
import { mountControls } from './ui/controls';
import { mountDebugOverlay } from './ui/debugOverlay';
import { byId } from './ui/dom';
import { fitColumnLabels } from './ui/labelFit';
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
    fitColumnLabels();
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
    // Reaching the start of the bar past the target means the target bars already played in full.
    if (target > 0 && barIndex >= target) {
      void transport.toggle();
      toast(format('toast.songLengthEnded', { n: target }));
    }
  },
);
store.subscribe(() => viz.invalidate());

const wakeLock = createWakeLock();

// A bar under the tempo controls that steps down one second at a time over the practice length.
// A recursive setTimeout ticks once a second — corrected against actual elapsed wall-clock time
// so per-tick scheduling overhead can't accumulate into drift — and writes a single CSS custom
// property (--gone) that clip-path reads. No per-second DOM nodes, no work between ticks.
let practiceTimer: ReturnType<typeof setTimeout> | undefined;
let practiceTick: ReturnType<typeof setTimeout> | undefined;
const practiceFadeBar = byId('practiceFadeBar');

function clearPracticeTimer(): void {
  clearTimeout(practiceTimer);
  clearTimeout(practiceTick);
  practiceTimer = undefined;
  practiceTick = undefined;
  practiceFadeBar.hidden = true;
  practiceFadeBar.style.setProperty('--gone', '0');
}

function startPracticeTimer(minutes: number): void {
  clearTimeout(practiceTimer);
  clearTimeout(practiceTick);
  if (minutes <= 0) {
    practiceFadeBar.hidden = true;
    return;
  }
  practiceFadeBar.hidden = false;
  practiceFadeBar.style.setProperty('--gone', '0');
  const totalSeconds = minutes * 60;
  const startedAt = performance.now();

  const tick = (): void => {
    const elapsedMs = performance.now() - startedAt;
    const elapsedSeconds = Math.min(totalSeconds, Math.round(elapsedMs / 1000));
    practiceFadeBar.style.setProperty('--gone', String((elapsedSeconds / totalSeconds) * 100));
    if (elapsedSeconds < totalSeconds) {
      practiceTick = setTimeout(tick, 1000 - (elapsedMs % 1000));
    }
  };
  tick();

  practiceTimer = setTimeout(() => {
    practiceTimer = undefined;
    if (!engine.running) return;
    void transport.toggle();
    toast(format('toast.practiceTimerEnded', { minutes }));
  }, totalSeconds * 1000);
}

const transport = mountTransport({
  engine,
  toast,
  onToggle: () => {
    wakeLock.setActive(engine.running);
    viz.invalidate();
    if (!engine.running) {
      clearPracticeTimer();
      barCounter.textContent = 'Bar −';
      return;
    }
    startPracticeTimer(store.get().practiceMinutes);
  },
});
// Changing the practice length mid-session restarts the countdown (and its fade) from now,
// instead of waiting for a stop/start to pick up the new value.
store.subscribe((s, prev) => {
  if (s.practiceMinutes !== prev.practiceMinutes && engine.running) {
    startPracticeTimer(s.practiceMinutes);
  }
});
mountVizSwitch({ store });
mountControls({ store, toggle: transport.toggle });
mountSignatureDialog({ store });
mountSettingsDialog({
  store,
  onStartPractice: () => {
    if (engine.running) {
      startPracticeTimer(store.get().practiceMinutes);
    } else {
      void transport.toggle();
    }
  },
});
mountSoundDialog({ store, engine, sounds, library, toast });
mountLanguageSwitch({ store });
mountClickFx();
applyTranslations();
fitColumnLabels();

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
