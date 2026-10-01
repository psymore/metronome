import './styles.css';
import { AudioEngine, type SoundSlot } from './engine/audioEngine';
import type { Pattern } from './engine/scheduler';
import { applyLanguage, applyTranslations, format, t } from './i18n/i18n';
import { SoundLibrary } from './sounds/soundLibrary';
import { SoundStore } from './sounds/soundStore';
import { barCounterFinished, formatBarCounter, formatIdleBarCounter } from './state/barCounter';
import { formatTimeLeft, practiceProgressPercent } from './state/practiceTimer';
import {
  cycleBeatLevel,
  DEFAULT_SETTINGS,
  loadSettings,
  nextLevel,
  patternFromSettings,
  resizePolyLevels,
  type Settings,
  saveSettings,
  toggleSub,
} from './state/settings';
import { createStore } from './state/store';
import { mountBarCounterDialog } from './ui/barCounterDialog';
import { mountClickFx } from './ui/clickFx';
import { mountControls } from './ui/controls';
import { mountDebugOverlay } from './ui/debugOverlay';
import { byId } from './ui/dom';
import { mountErrorFloor } from './ui/errorFloor';
import { mountInfoButtons } from './ui/infoButtons';
import { createInfoPopup } from './ui/infoPopup';
import { mountKnob } from './ui/knob';
import { mountKnobHint } from './ui/knobHint';
import { fitColumnLabels } from './ui/labelFit';
import { mountMenuDrawer } from './ui/menuDrawer';
import { mountPolyrhythmControls } from './ui/polyrhythmDialog';
import { mountPracticeTimerDialog } from './ui/practiceTimerDialog';
import { createPwaReloadHandler } from './ui/pwaReload';
import { mountSignatureDialog } from './ui/signatureDialog';
import { mountSoundDialog } from './ui/soundDialog';
import { createSoundPreview } from './ui/soundPreview';
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

const barCounter = byId('barCounter');
const showIdleBarCounter = (): void => {
  const s = store.get();
  barCounter.textContent = formatIdleBarCounter(s.targetBars, s.loopCount);
};

const applyTheme = (s: Settings) => {
  document.documentElement.dataset.theme = s.theme;
  document.documentElement.classList.toggle('depth-25d', s.depth25d);
};
applyTheme(store.get());
store.subscribe(applyTheme);

applyLanguage(store.get().language);
document.documentElement.lang = store.get().language;
showIdleBarCounter();
store.subscribe((s, prev) => {
  if (s.language !== prev.language) {
    applyLanguage(s.language);
    document.documentElement.lang = s.language;
    knob.invalidate();
    fitColumnLabels();
    if (!engine.running) showIdleBarCounter();
    if (practiceTotalSeconds > 0) renderPauseButton();
  }
});

const toast = createToast(byId('toast'));
const showInfo = createInfoPopup(byId('infoPopup'));
// A floor under whatever the rest of the app didn't already catch — a broken render loop or a
// stray rejection shouldn't fail silently with no visible signal to the user.
const errorFloor = mountErrorFloor({
  onError: (listener) => window.addEventListener('error', (e) => listener(e.error ?? e.message)),
  onUnhandledRejection: (listener) =>
    window.addEventListener('unhandledrejection', (e) => listener(e.reason)),
  now: () => Date.now(),
  logError: (reason) => console.error(reason),
  showToast: (message) => toast(message),
  getMessage: () => t('toast.unexpectedError'),
  isBooted: () => document.documentElement.dataset.booted === 'true',
});
// Memoised on the settings object identity (the store replaces it wholesale on every `set`) so
// this per-tick call doesn't recompute the pattern when nothing changed.
let cachedSettings: Settings | null = null;
let cachedPattern: Pattern | null = null;
const engine = new AudioEngine({
  getPattern: () => {
    const s = store.get();
    if (s !== cachedSettings || !cachedPattern) {
      cachedSettings = s;
      cachedPattern = patternFromSettings(s);
    }
    return cachedPattern;
  },
  getPolyPattern: () => store.get(),
});
engine.setVolume(store.get().volume);
engine.setAccentGain(store.get().accentGain);
engine.setMediumGain(store.get().mediumGain);
engine.setNormalGain(store.get().normalGain);
store.subscribe((s, prev) => {
  if (s.volume !== prev.volume) engine.setVolume(s.volume);
  if (s.accentGain !== prev.accentGain) engine.setAccentGain(s.accentGain);
  if (s.mediumGain !== prev.mediumGain) engine.setMediumGain(s.mediumGain);
  if (s.normalGain !== prev.normalGain) engine.setNormalGain(s.normalGain);
});

const sounds = new SoundStore();
const library = new SoundLibrary({
  sampleRate: engine.sampleRate,
  decode: (bytes) => engine.decode(bytes),
  loadBytes: async (id) => (await sounds.get(id))?.bytes,
});
const previewSound = createSoundPreview(engine, library, toast);

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

store.subscribe((s, prev) => {
  if (s.accentSoundId !== prev.accentSoundId) void applySound('accent');
  if (s.normalSoundId !== prev.normalSoundId) void applySound('normal');
});

const polySlotRequest: Record<'polyA' | 'polyB', number> = { polyA: 0, polyB: 0 };

async function applyPolySound(slot: 'polyA' | 'polyB'): Promise<void> {
  const request = ++polySlotRequest[slot];
  const s = store.get();
  const id = slot === 'polyA' ? s.polyrhythm.soundIdA : s.polyrhythm.soundIdB;
  const fallback =
    slot === 'polyA' ? DEFAULT_SETTINGS.polyrhythm.soundIdA : DEFAULT_SETTINGS.polyrhythm.soundIdB;
  const result = await library.resolve(id, fallback);
  if (request !== polySlotRequest[slot]) return;
  engine.setPolySound(slot, result.pcm);
  if (result.error) {
    toast(format('toast.soundLoadError', { error: result.error }));
    store.set({
      polyrhythm: {
        ...store.get().polyrhythm,
        ...(slot === 'polyA' ? { soundIdA: fallback } : { soundIdB: fallback }),
      },
    });
  }
}

store.subscribe((s, prev) => {
  if (s.polyrhythm.soundIdA !== prev.polyrhythm.soundIdA) void applyPolySound('polyA');
  if (s.polyrhythm.soundIdB !== prev.polyrhythm.soundIdB) void applyPolySound('polyB');
});

const dialHub = byId('dialHub');
const viz = new VizController(
  byId<HTMLCanvasElement>('viz'),
  {
    running: () => engine.running,
    heardTime: () => engine.heardTime(store.get().syncOffsetMs),
    beatAt: (time) => engine.timeline.beatAt(time),
    polyBeatAt: (layer, time) =>
      (layer === 'A' ? engine.polyTimelineA : engine.polyTimelineB).beatAt(time),
  },
  () => store.get(),
  (index) => store.set({ levels: cycleBeatLevel(store.get().levels, index) }),
  (level, barIndex) => {
    if (level === 'accent') knob.flash();
    dialHub.classList.remove('pulse');
    void dialHub.offsetWidth; // restart the animation even if it's already mid-pulse
    dialHub.classList.add('pulse');
    if (store.get().haptics && level !== 'mute' && navigator.vibrate) {
      navigator.vibrate(level === 'accent' ? 30 : level === 'medium' ? 20 : 12);
    }
    const { targetBars, loopCount } = store.get();
    barCounter.textContent = formatBarCounter(barIndex, targetBars, loopCount);
    // Reaching the start of the bar past the target (across every loop) means the song
    // already played in full.
    if (barCounterFinished(barIndex, targetBars, loopCount)) {
      void transport.toggle();
      toast(format('toast.songLengthEnded', { n: targetBars * loopCount }));
    }
  },
  (layer, index) => {
    const p = store.get().polyrhythm;
    const src = layer === 'A' ? p.levelsA : p.levelsB;
    const next = [...src];
    next[index] = nextLevel(src[index] ?? 'normal');
    store.set({ polyrhythm: { ...p, ...(layer === 'A' ? { levelsA: next } : { levelsB: next }) } });
  },
  (err) => errorFloor.report(err),
  (beat, k) => {
    const s = store.get();
    const sub = patternFromSettings(s).subdivision;
    store.set({ subOff: toggleSub(s.subOff, s.beatsPerBar, sub, beat, k) });
  },
);
store.subscribe(() => viz.invalidate());
// Keep per-node level arrays sized to the ratio: growing adds default entries, shrinking trims.
store.subscribe((s, prev) => {
  const p = s.polyrhythm;
  const q = prev.polyrhythm;
  const patch: Partial<Settings['polyrhythm']> = {};
  if (p.a !== q.a && p.levelsA.length !== p.a) patch.levelsA = resizePolyLevels(p.levelsA, p.a);
  if (p.b !== q.b && p.levelsB.length !== p.b) patch.levelsB = resizePolyLevels(p.levelsB, p.b);
  if (Object.keys(patch).length > 0) store.set({ polyrhythm: { ...p, ...patch } });
});
store.subscribe((s) => {
  byId('stage').dataset.polyrhythm = String(s.polyrhythm.enabled);
});
byId('stage').dataset.polyrhythm = String(store.get().polyrhythm.enabled);

store.subscribe((s, prev) => {
  // Swap schedulers in place on the running context: no stop/start cycle, so nothing here
  // bypasses Transport's busy guard, resume() timeout or error toast, or needs a user gesture.
  if (s.polyrhythm.enabled !== prev.polyrhythm.enabled) engine.switchMode();
});

store.subscribe((s, prev) => {
  if (!engine.running && (s.targetBars !== prev.targetBars || s.loopCount !== prev.loopCount)) {
    showIdleBarCounter();
  }
});

const wakeLock = createWakeLock();

// A bar under the tempo controls that steps down one second at a time over the practice length,
// with a countdown readout and its own pause/stop controls (independent of the metronome
// itself: pausing or stopping the timer doesn't touch playback). A recursive setTimeout ticks
// once a second — corrected against actual elapsed wall-clock time so per-tick scheduling
// overhead can't accumulate into drift — and writes a single CSS custom property (--gone) that
// clip-path reads, plus the countdown text. No per-second DOM nodes, no work between ticks.
let practiceTick: ReturnType<typeof setTimeout> | undefined;
let practiceEndTimer: ReturnType<typeof setTimeout> | undefined;
let practiceTotalSeconds = 0;
// Seconds already elapsed from runs before the current one (0 unless resuming from a pause).
let practiceElapsedBeforeRun = 0;
let practiceRunStartedAt = 0;
let practicePaused = false;
// True only while the countdown has run out on its own (see finishPracticeTimer) — kept
// separate from practicePaused so a plain metronome stop/start (tapping the knob, etc.) doesn't
// look like "resume" and silently relaunch the timer. Only the Replay button clears it.
let practiceFinished = false;
const practiceTimerBar = byId('practiceTimerBar');
const practiceTimerButtons = byId('practiceTimerButtons');
const practiceFadeBar = byId('practiceFadeBar');
const practiceTimeLeft = byId('practiceTimeLeft');
const practicePauseBtn = byId<HTMLButtonElement>('practicePauseBtn');
const practiceResetBtn = byId<HTMLButtonElement>('practiceResetBtn');
const practiceDeleteBtn = byId<HTMLButtonElement>('practiceDeleteBtn');

function renderPracticeProgress(elapsedSeconds: number): void {
  practiceFadeBar.style.setProperty(
    '--gone',
    String(practiceProgressPercent(elapsedSeconds, practiceTotalSeconds)),
  );
  practiceTimeLeft.textContent = formatTimeLeft(elapsedSeconds, practiceTotalSeconds);
}

function renderPauseButton(): void {
  practicePauseBtn.classList.toggle('paused', practicePaused);
  practicePauseBtn.setAttribute(
    'aria-label',
    t(practicePaused ? 'practiceTimer.resumeAriaLabel' : 'practiceTimer.pauseAriaLabel'),
  );
}

function stopPracticeTimer(): void {
  clearTimeout(practiceTick);
  clearTimeout(practiceEndTimer);
  practiceTick = undefined;
  practiceEndTimer = undefined;
  practiceTotalSeconds = 0;
  practiceElapsedBeforeRun = 0;
  practicePaused = false;
  practiceFinished = false;
  practiceTimerBar.classList.add('is-off');
  practiceTimerButtons.classList.add('is-off');
  practiceFadeBar.style.setProperty('--gone', '0');
  practicePauseBtn.classList.remove('finished');
  practiceResetBtn.disabled = false;
}

/** Countdown reached 0 on its own: unlike stopPracticeTimer, the bar and its buttons stay put
 *  instead of vanishing — pause/resume becomes a replay button and Reset is disabled, since
 *  there's nothing left running to reset. */
function finishPracticeTimer(): void {
  clearTimeout(practiceTick);
  clearTimeout(practiceEndTimer);
  practiceTick = undefined;
  practiceEndTimer = undefined;
  // Anchoring the next resume at 0 elapsed (not practiceTotalSeconds) means pressing replay
  // starts a fresh countdown instead of instantly hitting the end again.
  practiceElapsedBeforeRun = 0;
  practicePaused = true;
  practiceFinished = true;
  renderPracticeProgress(practiceTotalSeconds); // shows 0:00 / fully drained
  practicePauseBtn.classList.add('finished');
  practiceResetBtn.disabled = true;
}

/** (Re)starts the running countdown from practiceElapsedBeforeRun, whether this is a fresh
 *  session or a resume after a pause. */
function runPracticeCountdown(): void {
  practiceRunStartedAt = performance.now();
  const remainingSeconds = practiceTotalSeconds - practiceElapsedBeforeRun;

  const tick = (): void => {
    const elapsedMs = performance.now() - practiceRunStartedAt;
    const elapsedSeconds = Math.min(
      practiceTotalSeconds,
      practiceElapsedBeforeRun + Math.round(elapsedMs / 1000),
    );
    renderPracticeProgress(elapsedSeconds);
    if (elapsedSeconds < practiceTotalSeconds) {
      practiceTick = setTimeout(tick, 1000 - (elapsedMs % 1000));
    }
  };
  tick();

  practiceEndTimer = setTimeout(() => {
    finishPracticeTimer();
    // The practice session ending is a cue about time, not a reason to cut the beat off
    // mid-bar — the metronome keeps playing until the player stops it themselves.
    if (store.get().haptics && navigator.vibrate) navigator.vibrate([20, 40, 20]);
  }, remainingSeconds * 1000);
}

function startPracticeTimer(seconds: number): void {
  clearTimeout(practiceTick);
  clearTimeout(practiceEndTimer);
  if (seconds <= 0) {
    stopPracticeTimer();
    return;
  }
  practiceTotalSeconds = seconds;
  practiceElapsedBeforeRun = 0;
  practicePaused = false;
  practiceFinished = false;
  practiceTimerBar.classList.remove('is-off');
  practiceTimerButtons.classList.remove('is-off');
  practicePauseBtn.classList.remove('finished');
  practiceResetBtn.disabled = false;
  renderPauseButton();
  renderPracticeProgress(0);
  runPracticeCountdown();
}

function pausePracticeTimer(): void {
  if (practicePaused || practiceTotalSeconds <= 0) return;
  clearTimeout(practiceTick);
  clearTimeout(practiceEndTimer);
  const elapsedMs = performance.now() - practiceRunStartedAt;
  practiceElapsedBeforeRun = Math.min(
    practiceTotalSeconds,
    practiceElapsedBeforeRun + Math.round(elapsedMs / 1000),
  );
  practicePaused = true;
  renderPracticeProgress(practiceElapsedBeforeRun);
  renderPauseButton();
}

function resumePracticeTimer(): void {
  if (!practicePaused) return;
  practicePaused = false;
  renderPauseButton();
  runPracticeCountdown();
}

/** The timer's Reset button (↺ icon): rewinds to the full configured length and stops the
 *  metronome too, but — unlike stopPracticeTimer — leaves the bar on screen (paused at 0
 *  elapsed) instead of dismissing it. Only the Delete button dismisses it. */
function resetAndStopPracticeTimer(): void {
  if (engine.running) void transport.toggle(); // stops the metronome; onToggle pauses the timer
  clearTimeout(practiceTick);
  clearTimeout(practiceEndTimer);
  practiceElapsedBeforeRun = 0;
  practicePaused = true;
  practiceFinished = false;
  practicePauseBtn.classList.remove('finished');
  practiceResetBtn.disabled = false;
  renderPracticeProgress(0);
  renderPauseButton();
}

// Proxies straight to the metronome's own toggle rather than calling pause/resumePracticeTimer
// itself: onToggle below already pauses/resumes the timer in lockstep with engine.running, so
// this keeps the timer's pause button and the metronome's play state as one single switch.
// The "finished" (replay) case needs its own path: the metronome may already be running (it
// keeps playing after the countdown ends on its own — see runPracticeCountdown), so a plain
// toggle() there would just stop it instead of starting a fresh countdown.
practicePauseBtn.addEventListener('click', () => {
  if (practiceFinished) {
    startPracticeTimer(store.get().practiceSeconds);
    if (!engine.running) void transport.toggle();
    return;
  }
  void transport.toggle();
});
practiceResetBtn.addEventListener('click', resetAndStopPracticeTimer);

// Delete button: inline confirm pattern — first click splits to [ ✕ | ✓ ],
// ✓ closes timer, ✕ or timeout resets button.
{
  let deleteState: 'idle' | 'confirming' = 'idle';
  let deleteTimeout: ReturnType<typeof setTimeout> | undefined;

  const resetDeleteBtn = (): void => {
    clearTimeout(deleteTimeout);
    deleteTimeout = undefined;
    deleteState = 'idle';
    practiceDeleteBtn.innerHTML = '<img src="/src/assets/icons/delete.png" alt="" class="practice-icon-img" aria-hidden="true" />';
    practiceDeleteBtn.classList.remove('is-confirming');
  };

  practiceDeleteBtn.addEventListener('click', () => {
    if (deleteState === 'idle') {
      deleteState = 'confirming';
      practiceDeleteBtn.classList.add('is-confirming');

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'confirm-cancel-btn';
      cancelBtn.textContent = '✕';
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetDeleteBtn();
      });

      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = 'confirm-confirm-btn';
      confirmBtn.textContent = '✓';
      confirmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (engine.running) void transport.toggle();
        stopPracticeTimer();
        store.set({ practiceSeconds: 0 });
        resetDeleteBtn();
      });

      practiceDeleteBtn.innerHTML = '';
      practiceDeleteBtn.appendChild(cancelBtn);
      practiceDeleteBtn.appendChild(confirmBtn);

      deleteTimeout = setTimeout(resetDeleteBtn, 3000);
    }
  });
}

const knobEl = byId<HTMLCanvasElement>('knob');
const transport = mountTransport({
  engine,
  toast,
  onBusyChange: (busy) => knobEl.classList.toggle('starting', busy),
  onToggle: () => {
    wakeLock.setActive(engine.running);
    knob.invalidate();
    viz.invalidate();
    if (!engine.running) {
      // Stopping the metronome pauses the timer (keeping it on screen) rather than resetting
      // it — only the timer's own Stop/× buttons do that. Not when finished, though: the timer
      // is already at rest showing its replay button, and pausePracticeTimer would no-op
      // anyway (see its own guard) — this is just about not touching finished's own state.
      if (!practiceFinished) pausePracticeTimer();
      showIdleBarCounter();
      return;
    }
    // A finished timer stays exactly as it is — showing its replay button — no matter what the
    // metronome does. Only the replay button itself (see its own click handler) restarts it;
    // otherwise a plain knob tap to start playing again would silently relaunch the countdown.
    if (practiceFinished) return;
    if (practicePaused) {
      // If elapsed is 0 the timer was reset (Stop button) — start fresh rather than resume.
      if (practiceElapsedBeforeRun === 0 && practiceTotalSeconds > 0) {
        startPracticeTimer(practiceTotalSeconds);
      } else {
        resumePracticeTimer();
      }
    } else {
      startPracticeTimer(store.get().practiceSeconds);
    }
  },
});
// Changing the practice length mid-session restarts the countdown (and its fade) from now,
// instead of waiting for a stop/start to pick up the new value.
store.subscribe((s, prev) => {
  if (s.practiceSeconds !== prev.practiceSeconds && engine.running) {
    startPracticeTimer(s.practiceSeconds);
  }
});

const knob = mountKnob(byId<HTMLCanvasElement>('knob'), {
  store,
  isRunning: () => engine.running,
  toggle: () => void transport.toggle(),
});
mountKnobHint(byId('knobHint'), storage);
// Until the initial sounds finish loading (IndexedDB + decode for custom sounds can be slow on
// mobile), buffers are null and beats would play silently. Block the knob's center tap until
// they're ready.
knob.setDisabled(true);
void Promise.all([
  applySound('accent'),
  applySound('normal'),
  applyPolySound('polyA'),
  applyPolySound('polyB'),
]).finally(() => {
  knob.setDisabled(false);
});

mountVizSwitch({ store });
mountControls({ store, toggle: transport.toggle });
mountSignatureDialog({ store });
mountPolyrhythmControls({ store, sounds, previewSound });
mountBarCounterDialog({ store, toast });
mountPracticeTimerDialog({
  store,
  onStartPractice: () => {
    if (engine.running) {
      startPracticeTimer(store.get().practiceSeconds);
    } else {
      void transport.toggle();
    }
  },
});
mountMenuDrawer({ store });
mountSoundDialog({ store, engine, sounds, library, previewSound, toast });
mountInfoButtons(showInfo);
mountClickFx();
applyTranslations();
fitColumnLabels();
// Inter loads asynchronously (font-display: swap): labels get measured against the fallback
// font first, and its metrics can be narrower, so a label that fit at startup can overflow
// once Inter actually swaps in. Re-check once web fonts have finished loading, and again on
// any resize that might cross the desktop breakpoint (the column width itself changes there).
// The knob's BPM readout and the visualiser's node labels are canvas text, so they also keep the
// fallback font until repainted — the knob repaints on its own invalidate(), but idle nodes come
// from the sprite cache, which must be force-cleared or they'd keep the fallback font's glyphs.
document.fonts?.ready.then(() => {
  fitColumnLabels();
  knob.invalidate();
  viz.invalidateSprites();
});
window.addEventListener('resize', () => fitColumnLabels());

if (new URLSearchParams(location.search).has('debug')) {
  mountDebugOverlay(byId('debug'), engine);
}

if (!('__TAURI_INTERNALS__' in window)) {
  import('virtual:pwa-register')
    .then(({ registerSW }) =>
      registerSW({
        immediate: true,
        onNeedReload: createPwaReloadHandler({
          isRunning: () => engine.running,
          isHidden: () => document.hidden,
          onVisibilityChange: (listener) => document.addEventListener('visibilitychange', listener),
          reload: () => location.reload(),
        }),
      }),
    )
    .catch(() => {
      // Offline support is a bonus; the app works without it.
    });
}

// The boot loader (inline styles in index.html, so it can paint before this bundle even
// finishes loading) has done its job once we get here — everything above has run
// synchronously, so the real UI is already in the DOM and ready to be shown. Fade it out
// (matching its own inline transition) rather than removing it outright — it stays in the DOM
// so the title button below can bring it back as an on-demand preview.
const bootLoader = document.getElementById('bootLoader');
/** pointer-events must track visibility, not just sit at "none" forever: while the preview is
 *  actually showing it should behave like the real loading screen and block clicks on whatever
 *  is behind it (Settings, the knob, ...) — it was previously always pointer-events: none, so
 *  the real buttons underneath stayed clickable right through it.
 *  Also toggles the "is-hidden" class (see styles.css), which pauses the spin/color-cycle
 *  animations on the nodes and knob — opacity: 0 alone doesn't stop a running CSS animation,
 *  so without this they'd keep ticking in the background for the entire life of the tab, never
 *  actually visible again unless the preview is reopened. */
function setBootLoaderHidden(hidden: boolean): void {
  if (!bootLoader) return;
  bootLoader.style.opacity = hidden ? '0' : '1';
  bootLoader.style.pointerEvents = hidden ? 'none' : 'auto';
  bootLoader.classList.toggle('is-hidden', hidden);
}
setBootLoaderHidden(true);
// A signal the index.html boot-failure script can check that isn't the loader's own opacity —
// that gets set back to '1' every time the title button below reopens it as a preview, which
// would otherwise make a later, unrelated window error look exactly like a failed boot.
document.documentElement.dataset.booted = 'true';

// Clicking the "Metronome" title replays the boot loading screen — just a fun way to see it
// again without reloading the page. It stays open until closed (no auto-hide timer), and
// closing snaps it shut instantly (transition: none, skipping the normal 250ms fade) since a
// deliberate close reads as "dismiss this now", not "fade it like usual."
let titlePreviewShowing = false;
function closeTitlePreview(): void {
  if (!bootLoader || !titlePreviewShowing) return;
  titlePreviewShowing = false;
  bootLoader.style.transition = 'none';
  setBootLoaderHidden(true);
  bootLoader.classList.remove('boot-playing'); // back to the same at-rest state next time
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      bootLoader.style.transition = '';
    });
  });
}
byId('titleBtn').addEventListener('click', () => {
  if (!bootLoader) return;
  // While showing, the overlay itself sits on top and intercepts the click (see
  // #bootTopbar below) — this only ever fires to open it, or via keyboard activation
  // (Enter/Space), which targets the focused element directly regardless of what's drawn
  // on top of it.
  if (titlePreviewShowing) {
    closeTitlePreview();
    return;
  }
  titlePreviewShowing = true;
  setBootLoaderHidden(false);
});
// The overlay covers the real title's own position while showing, so it needs its own handler
// on that same top-left corner to close — otherwise there'd be no way to dismiss it at all.
byId('bootTopbar').addEventListener('click', closeTitlePreview);

// Tapping the boot-knob mirrors the real knob's tap-to-start/stop: the knob itself never
// spins (see .boot-knob in index.html), only the beat circle does, and only while "playing."
document.querySelector('.boot-knob')?.addEventListener('click', () => {
  bootLoader?.classList.toggle('boot-playing');
});
