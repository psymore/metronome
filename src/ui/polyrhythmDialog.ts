import { t } from '../i18n/i18n';
import type { SoundStore } from '../sounds/soundStore';
import { BUILTIN_SOUNDS } from '../sounds/synth';
import { clampPolyCount, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { byId } from './dom';
import { mountHoldRepeat } from './holdRepeat';
import type { PreviewSound } from './soundPreview';

export interface PolyrhythmControlsDeps {
  store: Store<Settings>;
  sounds: SoundStore;
  previewSound: PreviewSound;
}

/** Lives inside the existing #signatureDialog sheet (see signatureDialog.ts) — a separate
 *  module purely to keep each file focused on one concern within the shared dialog. */
export function mountPolyrhythmControls({
  store,
  sounds,
  previewSound,
}: PolyrhythmControlsDeps): void {
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
  mountHoldRepeat(byId('polyADown'), () => setA(store.get().polyrhythm.a - 1));
  mountHoldRepeat(byId('polyAUp'), () => setA(store.get().polyrhythm.a + 1));
  mountHoldRepeat(byId('polyBDown'), () => setB(store.get().polyrhythm.b - 1));
  mountHoldRepeat(byId('polyBUp'), () => setB(store.get().polyrhythm.b + 1));

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
  byId('polyPreviewA').addEventListener(
    'click',
    () => void previewSound(store.get().polyrhythm.soundIdA),
  );
  byId('polyPreviewB').addEventListener(
    'click',
    () => void previewSound(store.get().polyrhythm.soundIdB),
  );

  const refreshSoundSelects = async (): Promise<void> => {
    await Promise.all([
      fillSoundSelect(soundASelect, store.get().polyrhythm.soundIdA),
      fillSoundSelect(soundBSelect, store.get().polyrhythm.soundIdB),
    ]);
  };

  // A sound may have been uploaded or deleted (via the Sound dialog) since these selects were
  // last populated — re-list on every open so the options stay current, same as soundDialog.ts.
  byId('signatureBtn').addEventListener('click', () => void refreshSoundSelects());

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

  void refreshSoundSelects().then(() => render(store.get()));
  render(store.get());
  store.subscribe(render);
}
