import { clampBpm } from '../engine/timing';
import { format, t } from '../i18n/i18n';
import {
  cycleBeatLevel,
  isCompoundMeter,
  isSubOn,
  patternFromSettings,
  type Settings,
  type Subdivision,
  toggleSub,
} from '../state/settings';
import type { Store } from '../state/store';
import { TapTempo } from '../state/tapTempo';
import { tempoMarking } from '../state/tempoMarking';
import { byId } from './dom';
import { mountHoldRepeat } from './holdRepeat';

export interface ControlsDeps {
  store: Store<Settings>;
  toggle: () => Promise<void>;
}

/** Badge text for each subdivision value (1 = off, never shown). */
const SUBDIVISION_BADGE: Record<Subdivision, string> = { 1: '', 2: '8', 3: '3', 4: '16' };
const SUBDIVISION_I18N_KEY: Record<Subdivision, string> = {
  1: 'subdivision.off',
  2: 'subdivision.eighths',
  3: 'subdivision.triplets',
  4: 'subdivision.sixteenths',
};

export function mountControls({ store, toggle }: ControlsDeps): void {
  const tempoMarkingEl = byId('tempoMarking');
  const beatRow = byId('beatRow');
  const sigTop = byId('sigTop');
  const sigBottom = byId('sigBottom');
  const sigPolyA = byId('sigPolyA');
  const sigPolyB = byId('sigPolyB');
  const signatureBtn = byId('signatureBtn');
  const subdivisionBadge = byId('subdivisionBadge');
  const tapBtn = byId<HTMLButtonElement>('tapBtn');
  const tapper = new TapTempo();

  const setBpm = (bpm: number) => {
    const next = clampBpm(bpm);
    if (next !== store.get().bpm) store.set({ bpm: next });
  };
  const nudge = (delta: number) => setBpm(store.get().bpm + delta);

  // A steeper ramp than the default stepper: BPM is a much larger range (20-400) than a bar
  // count or a beat count, so holding +/- should reach its 25ms floor faster to actually feel
  // like it's accelerating. The fixed 400ms initial delay (see mountHoldRepeat) is untouched, so
  // a genuine single tap still only ever fires one nudge.
  const bpmHoldInterval = (n: number): number => (n > 8 ? 25 : n > 3 ? 70 : 150);
  mountHoldRepeat(byId('bpmUp'), () => nudge(1), bpmHoldInterval);
  mountHoldRepeat(byId('bpmDown'), () => nudge(-1), bpmHoldInterval);

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
    const target = e.target as HTMLElement;
    const toggle = target.closest<HTMLButtonElement>('.sub-toggle');
    if (toggle) {
      const s = store.get();
      const sub = patternFromSettings(s).subdivision;
      store.set({
        subOff: toggleSub(
          s.subOff,
          s.beatsPerBar,
          sub,
          Number(toggle.dataset.beat),
          Number(toggle.dataset.k),
        ),
      });
      return;
    }
    const button = target.closest<HTMLButtonElement>('.beat');
    if (!button) return;
    const index = Number(button.dataset.index);
    store.set({ levels: cycleBeatLevel(store.get().levels, index) });
  };
  beatRow.addEventListener('click', onBeatRowClick);

  function renderBeatsInto(container: HTMLElement, s: Settings): void {
    const sub = patternFromSettings(s).subdivision;
    const shape = `${s.beatsPerBar}x${sub}`;
    if (container.dataset.shape !== shape) {
      const children: HTMLElement[] = [];
      for (let i = 0; i < s.beatsPerBar; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'beat';
        b.dataset.index = String(i);
        b.textContent = String(i + 1);
        if (sub <= 1) {
          children.push(b);
          continue;
        }
        const group = document.createElement('span');
        group.className = 'beat-group';
        group.appendChild(b);
        for (let k = 1; k < sub; k++) {
          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'sub-toggle';
          toggle.dataset.beat = String(i);
          toggle.dataset.k = String(k);
          group.appendChild(toggle);
        }
        children.push(group);
      }
      container.replaceChildren(...children);
      container.dataset.shape = shape;
    }
    s.levels.forEach((level, i) => {
      const b = container.querySelectorAll('.beat')[i];
      if (!(b instanceof HTMLButtonElement)) return;
      b.className = `beat level-${level}`;
      b.setAttribute(
        'aria-label',
        format('beat.ariaLabel', { n: i + 1, level: format(`beatLevel.${level}`, {}) }),
      );
    });
    if (sub > 1) {
      for (const toggle of container.querySelectorAll<HTMLButtonElement>('.sub-toggle')) {
        const beat = Number(toggle.dataset.beat);
        const k = Number(toggle.dataset.k);
        const on = isSubOn(s.subOff, sub, beat, k);
        toggle.setAttribute('aria-pressed', String(on));
        toggle.setAttribute('aria-label', format('sub.ariaLabel', { n: beat + 1, k }));
      }
    }
  }

  function render(s: Settings): void {
    tempoMarkingEl.textContent = tempoMarking(s.bpm);
    sigTop.textContent = String(s.beatsPerBar);
    sigBottom.textContent = String(s.beatUnit);
    sigPolyA.textContent = String(s.polyrhythm.a);
    sigPolyB.textContent = String(s.polyrhythm.b);
    signatureBtn.classList.toggle('is-polyrhythm', s.polyrhythm.enabled);
    const showBadge =
      !s.polyrhythm.enabled && s.subdivision !== 1 && !isCompoundMeter(s.beatsPerBar, s.beatUnit);
    subdivisionBadge.hidden = !showBadge;
    subdivisionBadge.textContent = showBadge ? SUBDIVISION_BADGE[s.subdivision] : '';
    signatureBtn.setAttribute(
      'aria-label',
      showBadge
        ? `${t('signature.ariaLabel')} (${t(SUBDIVISION_I18N_KEY[s.subdivision])})`
        : t('signature.ariaLabel'),
    );
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
