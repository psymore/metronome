import { t } from '../i18n/i18n';
import type { SoundStore } from '../sounds/soundStore';
import { BUILTIN_SOUNDS } from '../sounds/synth';
import { clampPolyCount, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { byId } from './dom';

export interface PolyrhythmControlsDeps {
  store: Store<Settings>;
  sounds: SoundStore;
}

/** Lives inside the existing #signatureDialog sheet (see signatureDialog.ts) — a separate
 *  module purely to keep each file focused on one concern within the shared dialog. */
export function mountPolyrhythmControls({ store, sounds }: PolyrhythmControlsDeps): void {
  const modeButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('#signatureDialog [data-sig-mode]'),
  );
  const standardBlocks = Array.from(
    document.querySelectorAll<HTMLElement>('#signatureDialog [data-standard-block]'),
  );
  const polyBlock = byId('polyBlock');
  const aValue = byId('polyAValue');
  const bValue = byId('polyBValue');
  const soundASelect = byId<HTMLSelectElement>('polySoundA');
  const soundBSelect = byId<HTMLSelectElement>('polySoundB');

  const setMode = (enabled: boolean) =>
    store.set({ polyrhythm: { ...store.get().polyrhythm, enabled } });
  for (const button of modeButtons) {
    button.addEventListener('click', () => setMode(button.dataset.sigMode === 'polyrhythm'));
  }

  const setA = (n: number) =>
    store.set({ polyrhythm: { ...store.get().polyrhythm, a: clampPolyCount(n) } });
  const setB = (n: number) =>
    store.set({ polyrhythm: { ...store.get().polyrhythm, b: clampPolyCount(n) } });
  byId('polyADown').addEventListener('click', () => setA(store.get().polyrhythm.a - 1));
  byId('polyAUp').addEventListener('click', () => setA(store.get().polyrhythm.a + 1));
  byId('polyBDown').addEventListener('click', () => setB(store.get().polyrhythm.b - 1));
  byId('polyBUp').addEventListener('click', () => setB(store.get().polyrhythm.b + 1));

  async function fillSoundSelect(select: HTMLSelectElement, current: string): Promise<void> {
    const builtin = document.createElement('optgroup');
    builtin.label = t('soundGroup.builtin');
    for (const [id, sound] of Object.entries(BUILTIN_SOUNDS)) {
      builtin.append(new Option(sound.name, id));
    }
    const groups: HTMLElement[] = [builtin];
    try {
      const userSounds = await sounds.list();
      if (userSounds.length > 0) {
        const mine = document.createElement('optgroup');
        mine.label = t('soundGroup.yours');
        for (const sound of userSounds) mine.append(new Option(sound.name, sound.id));
        groups.push(mine);
      }
    } catch {
      // User sound list unavailable (private window, etc.) — builtin sounds still work.
    }
    select.replaceChildren(...groups);
    select.value = current;
  }

  soundASelect.addEventListener('change', () =>
    store.set({ polyrhythm: { ...store.get().polyrhythm, soundIdA: soundASelect.value } }),
  );
  soundBSelect.addEventListener('change', () =>
    store.set({ polyrhythm: { ...store.get().polyrhythm, soundIdB: soundBSelect.value } }),
  );

  const render = (s: Settings) => {
    const enabled = s.polyrhythm.enabled;
    for (const button of modeButtons) {
      const isPoly = button.dataset.sigMode === 'polyrhythm';
      button.setAttribute('aria-checked', String(isPoly === enabled));
    }
    polyBlock.hidden = !enabled;
    for (const block of standardBlocks) block.hidden = enabled;
    aValue.textContent = String(s.polyrhythm.a);
    bValue.textContent = String(s.polyrhythm.b);
    if (soundASelect.value !== s.polyrhythm.soundIdA) soundASelect.value = s.polyrhythm.soundIdA;
    if (soundBSelect.value !== s.polyrhythm.soundIdB) soundBSelect.value = s.polyrhythm.soundIdB;
  };

  void Promise.all([
    fillSoundSelect(soundASelect, store.get().polyrhythm.soundIdA),
    fillSoundSelect(soundBSelect, store.get().polyrhythm.soundIdB),
  ]).then(() => render(store.get()));
  render(store.get());
  store.subscribe(render);
}
