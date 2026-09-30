import type { AudioEngine } from '../engine/audioEngine';
import { format, t } from '../i18n/i18n';
import { importSoundFile } from '../sounds/importSound';
import type { SoundLibrary } from '../sounds/soundLibrary';
import type { SoundMeta, SoundStore } from '../sounds/soundStore';
import { BUILTIN_SOUNDS } from '../sounds/synth';
import { DEFAULT_SETTINGS, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { byId, closeOnBackdropClick, updateRangeFill } from './dom';
import { mountSoundPicker } from './soundPicker';
import type { PreviewSound } from './soundPreview';
import type { Toast } from './toast';

type SlotKey = 'accentSoundId' | 'normalSoundId';

export interface SoundDialogDeps {
  store: Store<Settings>;
  engine: AudioEngine;
  sounds: SoundStore;
  library: SoundLibrary;
  previewSound: PreviewSound;
  toast: Toast;
}

export function mountSoundDialog({
  store,
  engine,
  sounds,
  library,
  previewSound,
  toast,
}: SoundDialogDeps): void {
  const dialog = byId<HTMLDialogElement>('soundDialog');
  const selects: Record<SlotKey, HTMLSelectElement> = {
    accentSoundId: byId<HTMLSelectElement>('accentSelect'),
    normalSoundId: byId<HTMLSelectElement>('normalSelect'),
  };
  mountSoundPicker(
    selects.accentSoundId,
    byId<HTMLButtonElement>('accentSelectTrigger'),
    'accent.label',
  );
  mountSoundPicker(
    selects.normalSoundId,
    byId<HTMLButtonElement>('normalSelectTrigger'),
    'otherBeats.label',
  );
  const accentGainInput = byId<HTMLInputElement>('accentGainInput');
  const accentGainValue = byId<HTMLInputElement>('accentGainValue');
  const mediumGainInput = byId<HTMLInputElement>('mediumGainInput');
  const mediumGainValue = byId<HTMLInputElement>('mediumGainValue');
  const normalGainInput = byId<HTMLInputElement>('normalGainInput');
  const normalGainValue = byId<HTMLInputElement>('normalGainValue');
  const fileInput = byId<HTMLInputElement>('soundFile');
  const dropZone = byId('dropZone');
  const list = byId('userSounds');
  let userSounds: SoundMeta[] = [];

  async function refresh(): Promise<void> {
    try {
      userSounds = await sounds.list();
    } catch {
      userSounds = [];
      toast(t('toast.storageUnavailable'));
    }
    render(store.get());
  }

  function fillSelect(select: HTMLSelectElement, current: string): void {
    const builtin = document.createElement('optgroup');
    builtin.label = t('soundGroup.builtin');
    for (const [id, sound] of Object.entries(BUILTIN_SOUNDS))
      builtin.append(new Option(sound.name, id));
    const groups: HTMLElement[] = [builtin];
    if (userSounds.length > 0) {
      const mine = document.createElement('optgroup');
      mine.label = t('soundGroup.yours');
      for (const sound of userSounds) mine.append(new Option(sound.name, sound.id));
      groups.push(mine);
    }
    select.replaceChildren(...groups);
    select.value = current;
  }

  function smallButton(text: string, label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'small-btn';
    b.textContent = text;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick);
    return b;
  }

  function renderList(): void {
    if (userSounds.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = t('soundList.empty');
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(
      ...userSounds.map((sound) => {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = sound.name;
        name.title = sound.name;
        li.append(
          name,
          smallButton(
            '▶',
            format('sound.previewNamed', { name: sound.name }),
            () => void previewSound(sound.id),
          ),
          smallButton(
            '✕',
            format('sound.deleteNamed', { name: sound.name }),
            () => void remove(sound),
          ),
        );
        return li;
      }),
    );
  }

  function renderGain(input: HTMLInputElement, valueInput: HTMLInputElement, gain: number): void {
    const percent = Math.round(gain * 100);
    input.value = String(percent);
    valueInput.value = String(percent);
    updateRangeFill(input);
  }

  function renderGains(s: Settings): void {
    renderGain(accentGainInput, accentGainValue, s.accentGain);
    renderGain(mediumGainInput, mediumGainValue, s.mediumGain);
    renderGain(normalGainInput, normalGainValue, s.normalGain);
  }

  function render(s: Settings): void {
    fillSelect(selects.accentSoundId, s.accentSoundId);
    fillSelect(selects.normalSoundId, s.normalSoundId);
    renderGains(s);
    renderList();
  }

  async function remove(sound: SoundMeta): Promise<void> {
    try {
      await sounds.remove(sound.id);
    } catch {
      toast(format('toast.deleteError', { name: sound.name }));
      return;
    }
    library.forget(sound.id);
    const current = store.get();
    const patch: Partial<Settings> = {};
    if (current.accentSoundId === sound.id) patch.accentSoundId = DEFAULT_SETTINGS.accentSoundId;
    if (current.normalSoundId === sound.id) patch.normalSoundId = DEFAULT_SETTINGS.normalSoundId;
    if (Object.keys(patch).length > 0) store.set(patch);
    await refresh();
  }

  async function addFiles(files: Iterable<File>): Promise<void> {
    const errors: string[] = [];
    const added: string[] = [];
    for (const file of files) {
      const result = await importSoundFile(file, {
        decode: (bytes) => engine.decode(bytes),
        save: (name, bytes) => sounds.add(name, bytes),
      });
      if (result.ok) added.push(result.name);
      else errors.push(result.reason);
    }
    if (added.length > 0) await refresh();
    if (errors.length > 0) {
      toast(errors.length === 1 ? (errors[0] ?? '') : `${errors[0]} (+${errors.length - 1} more)`);
    } else if (added.length === 1) {
      toast(format('toast.addedOne', { name: added[0] ?? '' }));
    } else if (added.length > 1) {
      toast(format('toast.addedMany', { count: added.length }));
    }
  }

  for (const key of Object.keys(selects) as SlotKey[]) {
    selects[key].addEventListener('change', () => {
      store.set({ [key]: selects[key].value } as Partial<Settings>);
    });
  }

  /** Wires a 0-100% range+number pair to one gain field, same pattern the app already uses for
   *  Volume/Visual sync offset in the Settings dialog. */
  function mountGainSlider(
    input: HTMLInputElement,
    valueInput: HTMLInputElement,
    key: 'accentGain' | 'mediumGain' | 'normalGain',
  ): void {
    input.addEventListener('input', () => {
      store.set({ [key]: Number(input.value) / 100 });
      updateRangeFill(input);
    });
    valueInput.addEventListener('input', () => {
      if (valueInput.value === '') return;
      const percent = Math.min(100, Math.max(0, Number(valueInput.value)));
      store.set({ [key]: percent / 100 });
    });
  }
  mountGainSlider(accentGainInput, accentGainValue, 'accentGain');
  mountGainSlider(mediumGainInput, mediumGainValue, 'mediumGain');
  mountGainSlider(normalGainInput, normalGainValue, 'normalGain');
  for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-preview]')) {
    button.addEventListener('click', () => {
      const key = button.dataset.preview as SlotKey;
      void previewSound(store.get()[key]);
    });
  }

  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files ?? []);
    fileInput.value = '';
    void addFiles(files);
  });

  // Keep a stray drop anywhere from navigating the page to the audio file.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('over');
    void addFiles(Array.from(e.dataTransfer?.files ?? []));
  });

  byId('soundBtn').addEventListener('click', () => {
    render(store.get());
    dialog.showModal();
    void refresh();
  });
  closeOnBackdropClick(dialog);

  store.subscribe((s, prev) => {
    if (s.accentSoundId !== prev.accentSoundId || s.normalSoundId !== prev.normalSoundId) render(s);
    else if (
      s.accentGain !== prev.accentGain ||
      s.mediumGain !== prev.mediumGain ||
      s.normalGain !== prev.normalGain
    )
      renderGains(s);
  });
}
