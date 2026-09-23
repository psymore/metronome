import './styles.css';
import { AudioEngine, type SoundSlot } from './engine/audioEngine';
import { SoundLibrary } from './sounds/soundLibrary';
import { SoundStore } from './sounds/soundStore';
import { DEFAULT_SETTINGS, loadSettings, type Settings, saveSettings } from './state/settings';
import { createStore } from './state/store';
import { mountControls } from './ui/controls';
import { mountDebugOverlay } from './ui/debugOverlay';
import { byId } from './ui/dom';
import { mountSettingsDialog } from './ui/settingsDialog';
import { mountSignatureDialog } from './ui/signatureDialog';
import { mountSoundDialog } from './ui/soundDialog';
import { createToast } from './ui/toast';
import { mountTransport } from './ui/transport';
import { mountVizSwitch } from './ui/vizSwitch';
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
    toast(`Couldn't load that sound (${result.error}). Using the default.`);
    store.set(slot === 'accent' ? { accentSoundId: fallback } : { normalSoundId: fallback });
  }
}

void applySound('accent');
void applySound('normal');
store.subscribe((s, prev) => {
  if (s.accentSoundId !== prev.accentSoundId) void applySound('accent');
  if (s.normalSoundId !== prev.normalSoundId) void applySound('normal');
});

const viz = new VizController(
  byId<HTMLCanvasElement>('viz'),
  {
    running: () => engine.running,
    heardTime: () => engine.heardTime(store.get().syncOffsetMs),
    beatAt: (time) => engine.timeline.beatAt(time),
  },
  () => store.get(),
);
store.subscribe(() => viz.invalidate());

const transport = mountTransport({ engine, toast, onToggle: () => viz.invalidate() });
mountVizSwitch({ store });
mountControls({ store, toggle: transport.toggle });
mountSignatureDialog({ store });
mountSettingsDialog({ store });
mountSoundDialog({ store, engine, sounds, library, toast });

if (new URLSearchParams(location.search).has('debug')) {
  mountDebugOverlay(byId('debug'), engine);
}
