import { clampBpm } from '../engine/timing';
import { format } from '../i18n/i18n';
import { cycleBeatLevel, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { TapTempo } from '../state/tapTempo';
import { tempoMarking } from '../state/tempoMarking';
import { byId } from './dom';

export interface ControlsDeps {
  store: Store<Settings>;
  toggle: () => Promise<void>;
}

export function mountControls({ store, toggle }: ControlsDeps): void {
  const tempoMarkingEl = byId('tempoMarking');
  const beatRow = byId('beatRow');
  const sigTop = byId('sigTop');
  const sigBottom = byId('sigBottom');
  const sigPolyA = byId('sigPolyA');
  const sigPolyB = byId('sigPolyB');
  const signatureBtn = byId('signatureBtn');
  const tapBtn = byId<HTMLButtonElement>('tapBtn');
  const tapper = new TapTempo();

  const setBpm = (bpm: number) => {
    const next = clampBpm(bpm);
    if (next !== store.get().bpm) store.set({ bpm: next });
  };
  const nudge = (delta: number) => setBpm(store.get().bpm + delta);

  byId('bpmUp').addEventListener('click', () => nudge(1));
  byId('bpmDown').addEventListener('click', () => nudge(-1));

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
      b.setAttribute(
        'aria-label',
        format('beat.ariaLabel', { n: i + 1, level: format(`beatLevel.${level}`, {}) }),
      );
    });
  }

  function render(s: Settings): void {
    tempoMarkingEl.textContent = tempoMarking(s.bpm);
    sigTop.textContent = String(s.beatsPerBar);
    sigBottom.textContent = String(s.beatUnit);
    sigPolyA.textContent = String(s.polyrhythm.a);
    sigPolyB.textContent = String(s.polyrhythm.b);
    signatureBtn.classList.toggle('is-polyrhythm', s.polyrhythm.enabled);
    renderBeatsInto(beatRow, s);
  }
  render(store.get());
  store.subscribe((s) => render(s));

  // Mobile-first app: the only keyboard affordance kept is Space to start/stop, for anyone
  // driving it from a physical keyboard (e.g. the Tauri desktop build).
  const ignoreKeys = (e: KeyboardEvent): boolean => {
    if (e.ctrlKey || e.metaKey || e.altKey) return true;
    const target = e.target instanceof HTMLElement ? e.target : null;
    return (
      !!target && (!!target.closest('dialog') || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))
    );
  };
  document.addEventListener('keydown', (e) => {
    if (e.key !== ' ' || ignoreKeys(e)) return;
    e.preventDefault();
    if (!e.repeat) void toggle();
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
