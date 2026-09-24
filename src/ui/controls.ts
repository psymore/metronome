import { clampBpm } from '../engine/timing';
import { cycleBeatLevel, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { TapTempo } from '../state/tapTempo';
import { angleDelta, bpmAfterRotation, DEGREES_PER_BPM } from './dialMath';
import { byId } from './dom';

export interface ControlsDeps {
  store: Store<Settings>;
  toggle: () => Promise<void>;
}

export function mountControls({ store, toggle }: ControlsDeps): void {
  const dial = byId('dial');
  const dialRing = byId('dialRing');
  const bpmValue = byId('bpmValue');
  const beatRow = byId('beatRow');
  const mainBeatRow = byId('mainBeatRow');
  const sigTop = byId('sigTop');
  const sigBottom = byId('sigBottom');
  const tapBtn = byId<HTMLButtonElement>('tapBtn');
  const tapper = new TapTempo();

  const setBpm = (bpm: number) => {
    const next = clampBpm(bpm);
    if (next !== store.get().bpm) store.set({ bpm: next });
  };
  const nudge = (delta: number) => setBpm(store.get().bpm + delta);

  byId('bpmUp').addEventListener('click', () => nudge(1));
  byId('bpmDown').addEventListener('click', () => nudge(-1));

  dial.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const step = e.shiftKey ? 5 : 1;
      nudge(e.deltaY < 0 ? step : -step);
    },
    { passive: false },
  );

  dial.addEventListener('pointerdown', (e) => {
    dial.setPointerCapture(e.pointerId);
    const rect = dial.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let previous = Math.atan2(e.clientY - cy, e.clientX - cx);
    let total = 0;
    const startBpm = store.get().bpm;
    const onMove = (ev: PointerEvent) => {
      const angle = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      total += angleDelta(previous, angle);
      previous = angle;
      setBpm(bpmAfterRotation(startBpm, total));
    };
    const onUp = () => {
      dial.removeEventListener('pointermove', onMove);
      dial.removeEventListener('pointerup', onUp);
      dial.removeEventListener('pointercancel', onUp);
    };
    dial.addEventListener('pointermove', onMove);
    dial.addEventListener('pointerup', onUp);
    dial.addEventListener('pointercancel', onUp);
  });

  function tap(): void {
    const bpm = tapper.tap(performance.now());
    if (bpm !== null) setBpm(bpm);
    tapBtn.classList.add('flash');
    setTimeout(() => tapBtn.classList.remove('flash'), 120);
  }
  // pointerdown instead of click: lower latency, and it doesn't steal focus.
  tapBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    tap();
  });
  tapBtn.addEventListener('click', (e) => {
    if (e.detail === 0) tap(); // keyboard activation (Enter)
  });

  const onBeatRowClick = (e: Event) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('.beat');
    if (!button) return;
    const index = Number(button.dataset.index);
    store.set({ levels: cycleBeatLevel(store.get().levels, index) });
  };
  beatRow.addEventListener('click', onBeatRowClick);
  mainBeatRow.addEventListener('click', onBeatRowClick);

  function renderBeatsInto(container: HTMLElement, s: Settings): void {
    if (container.childElementCount !== s.beatsPerBar) {
      container.replaceChildren(
        ...Array.from({ length: s.beatsPerBar }, (_, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.dataset.index = String(i);
          b.textContent = String(i + 1);
          return b;
        }),
      );
    }
    s.levels.forEach((level, i) => {
      const b = container.children[i];
      if (!(b instanceof HTMLButtonElement)) return;
      b.className = `beat level-${level}`;
      b.setAttribute('aria-label', `Beat ${i + 1}: ${level}. Click to change.`);
    });
  }

  function renderBeats(s: Settings): void {
    renderBeatsInto(beatRow, s);
    renderBeatsInto(mainBeatRow, s);
    mainBeatRow.hidden = !s.beatsClickable;
  }

  function render(s: Settings): void {
    bpmValue.textContent = String(s.bpm);
    dial.setAttribute('aria-valuenow', String(s.bpm));
    dialRing.style.setProperty('--rotation', `${s.bpm * DEGREES_PER_BPM}deg`);
    sigTop.textContent = String(s.beatsPerBar);
    sigBottom.textContent = String(s.beatUnit);
    renderBeats(s);
  }
  render(store.get());
  store.subscribe((s) => render(s));

  const ignoreKeys = (e: KeyboardEvent): boolean => {
    if (e.ctrlKey || e.metaKey || e.altKey) return true;
    const target = e.target instanceof HTMLElement ? e.target : null;
    return (
      !!target && (!!target.closest('dialog') || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))
    );
  };

  document.addEventListener('keydown', (e) => {
    if (ignoreKeys(e)) return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (!e.repeat) void toggle();
        break;
      case 'ArrowUp':
      case 'ArrowRight':
        e.preventDefault();
        nudge(e.shiftKey ? 5 : 1);
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        e.preventDefault();
        nudge(e.shiftKey ? -5 : -1);
        break;
      case 'PageUp':
        e.preventDefault();
        nudge(10);
        break;
      case 'PageDown':
        e.preventDefault();
        nudge(-10);
        break;
      case 't':
      case 'T':
        if (!e.repeat) tap();
        break;
      case 'v':
      case 'V':
        store.set({ visualizer: store.get().visualizer === 'circular' ? 'linear' : 'circular' });
        break;
    }
  });
  // Space on a focused button would also "click" it on keyup; our keydown already toggled.
  document.addEventListener(
    'keyup',
    (e) => {
      if (e.key === ' ' && !ignoreKeys(e) && e.target instanceof HTMLButtonElement)
        e.preventDefault();
    },
    true,
  );
}
