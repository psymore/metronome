import type { AudioEngine } from '../engine/audioEngine';
import { importSoundFile } from '../sounds/importSound';
import type { SoundLibrary } from '../sounds/soundLibrary';
import type { SoundMeta, SoundStore } from '../sounds/soundStore';
import { BUILTIN_SOUNDS } from '../sounds/synth';
import { DEFAULT_SETTINGS, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { byId, closeOnBackdropClick } from './dom';
import type { Toast } from './toast';

type SlotKey = 'accentSoundId' | 'normalSoundId';

export interface SoundDialogDeps {
  store: Store<Settings>;
  engine: AudioEngine;
  sounds: SoundStore;
  library: SoundLibrary;
  toast: Toast;
}

export function mountSoundDialog({ store, engine, sounds, library, toast }: SoundDialogDeps): void {
  const dialog = byId<HTMLDialogElement>('soundDialog');
  const selects: Record<SlotKey, HTMLSelectElement> = {
    accentSoundId: byId<HTMLSelectElement>('accentSelect'),
    normalSoundId: byId<HTMLSelectElement>('normalSelect'),
  };
  const fileInput = byId<HTMLInputElement>('soundFile');
  const dropZone = byId('dropZone');
  const list = byId('userSounds');
  let userSounds: SoundMeta[] = [];

  async function refresh(): Promise<void> {
    try {
      userSounds = await sounds.list();
    } catch {
      userSounds = [];
      toast('Saved sounds are unavailable: browser storage is blocked.');
    }
    render(store.get());
  }

  function fillSelect(select: HTMLSelectElement, current: string): void {
    const builtin = document.createElement('optgroup');
    builtin.label = 'Built-in';
    for (const [id, sound] of Object.entries(BUILTIN_SOUNDS))
      builtin.append(new Option(sound.name, id));
    const groups: HTMLElement[] = [builtin];
    if (userSounds.length > 0) {
      const mine = document.createElement('optgroup');
      mine.label = 'Your sounds';
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
      empty.textContent = 'No sounds added yet.';
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
          smallButton('▶', `Preview ${sound.name}`, () => void preview(sound.id)),
          smallButton('✕', `Delete ${sound.name}`, () => void remove(sound)),
        );
        return li;
      }),
    );
  }

  function render(s: Settings): void {
    fillSelect(selects.accentSoundId, s.accentSoundId);
    fillSelect(selects.normalSoundId, s.normalSoundId);
    renderList();
  }

  async function preview(id: string): Promise<void> {
    const result = await library.resolve(id, DEFAULT_SETTINGS.normalSoundId);
    if (result.error) toast(`Couldn't play that sound (${result.error}).`);
    else await engine.preview(result.pcm);
  }

  async function remove(sound: SoundMeta): Promise<void> {
    try {
      await sounds.remove(sound.id);
    } catch {
      toast(`Could not delete "${sound.name}".`);
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
      toast(`Added "${added[0]}". Choose it for Accent or Other beats.`);
    } else if (added.length > 1) {
      toast(`Added ${added.length} sounds.`);
    }
  }

  for (const key of Object.keys(selects) as SlotKey[]) {
    selects[key].addEventListener('change', () => {
      store.set({ [key]: selects[key].value } as Partial<Settings>);
    });
  }
  for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-preview]')) {
    button.addEventListener('click', () => {
      const key = button.dataset.preview as SlotKey;
      void preview(store.get()[key]);
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
  });
}
