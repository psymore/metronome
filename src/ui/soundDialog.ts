import type { AudioEngine } from '../engine/audioEngine';
import { format, t } from '../i18n/i18n';
import { importSoundFile } from '../sounds/importSound';
import { SOUND_PRESETS } from '../sounds/presets';
import type { SoundLibrary } from '../sounds/soundLibrary';
import type { SoundMeta, SoundStore } from '../sounds/soundStore';
import { BUILTIN_SOUNDS } from '../sounds/synth';
import { type BeatLevel, DEFAULT_SETTINGS, type Settings } from '../state/settings';
import type { Store } from '../state/store';
import { drawNode } from '../viz/drawNode';
import { readTheme } from '../viz/vizController';
import { builtinOptionGroups } from './builtinOptions';
import { byId, closeOnBackdropClick, updateRangeFill } from './dom';
import { mountIntegerInput } from './numericInput';
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
  const soundLevelIcons = Array.from(
    dialog.querySelectorAll<HTMLCanvasElement>('[data-sound-level-icon]'),
  );
  const selects: Record<SlotKey, HTMLSelectElement> = {
    accentSoundId: byId<HTMLSelectElement>('accentSelect'),
    normalSoundId: byId<HTMLSelectElement>('normalSelect'),
  };
  mountSoundPicker(
    selects.accentSoundId,
    byId<HTMLButtonElement>('accentSelectTrigger'),
    'accent.label',
    previewSound,
  );
  mountSoundPicker(
    selects.normalSoundId,
    byId<HTMLButtonElement>('normalSelectTrigger'),
    'otherBeats.label',
    previewSound,
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

  const presetButtons = SOUND_PRESETS.map((preset) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sound-preset';
    const name = document.createElement('span');
    name.className = 'sound-preset-name';
    name.dataset.i18n = `soundPreset.${preset.id}`;
    name.textContent = t(name.dataset.i18n);
    const pair = document.createElement('span');
    pair.className = 'sound-preset-pair';
    pair.textContent = `${BUILTIN_SOUNDS[preset.accentSoundId]?.name} / ${BUILTIN_SOUNDS[preset.normalSoundId]?.name}`;
    button.append(name, pair);
    button.addEventListener('click', () => {
      store.set({ accentSoundId: preset.accentSoundId, normalSoundId: preset.normalSoundId });
    });
    return { button, preset };
  });
  byId('soundPresets').replaceChildren(...presetButtons.map(({ button }) => button));

  function renderPresets(s: Settings): void {
    for (const { button, preset } of presetButtons) {
      button.setAttribute(
        'aria-pressed',
        String(
          s.accentSoundId === preset.accentSoundId && s.normalSoundId === preset.normalSoundId,
        ),
      );
    }
  }
  renderPresets(store.get());

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
    const groups: HTMLElement[] = builtinOptionGroups();
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
    if (document.activeElement !== valueInput) valueInput.value = String(percent);
    updateRangeFill(input);
  }

  /** A level whose gain is 0% is silent, so its phase object in the showcase row gets a mute badge.
   *  Master Volume at 0% silences every level, so all three get one, drawn in red (.is-master-muted)
   *  to show the master is the cause. The Mute item itself is always silent and never needs one. */
  const silentByLevel: Partial<Record<BeatLevel, (s: Settings) => number>> = {
    accent: (s) => s.accentGain,
    medium: (s) => s.mediumGain,
    normal: (s) => s.normalGain,
  };
  function renderSilentBadges(s: Settings): void {
    const masterMuted = s.volume === 0;
    for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-preview-level]')) {
      const gain = silentByLevel[button.dataset.previewLevel as BeatLevel];
      if (!gain) continue;
      button.classList.toggle('is-silent', masterMuted || gain(s) === 0);
      button.classList.toggle('is-master-muted', masterMuted);
    }
  }

  function renderGains(s: Settings): void {
    renderGain(accentGainInput, accentGainValue, s.accentGain);
    renderGain(mediumGainInput, mediumGainValue, s.mediumGain);
    renderGain(normalGainInput, normalGainValue, s.normalGain);
    renderSilentBadges(s);
  }

  function render(s: Settings): void {
    fillSelect(selects.accentSoundId, s.accentSoundId);
    fillSelect(selects.normalSoundId, s.normalSoundId);
    renderGains(s);
    renderList();
    renderPresets(s);
  }

  function renderSoundLevelIcon(
    canvas: HTMLCanvasElement,
    level: BeatLevel,
    glow: number,
    s: Settings,
  ): void {
    const theme = readTheme(document.documentElement);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = canvas.closest('.sound-level-item') ? 128 : 32;
    const pixelSize = Math.round(size * dpr);
    if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
      canvas.width = pixelSize;
      canvas.height = pixelSize;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawNode(ctx, size / 2, size / 2, 11, level, glow, theme, s.nodeStyle);
  }

  function renderSoundLevelIcons(s: Settings): void {
    for (const canvas of soundLevelIcons) {
      const level = canvas.dataset.soundLevelIcon;
      if (level === 'accent' || level === 'medium' || level === 'normal' || level === 'mute')
        renderSoundLevelIcon(canvas, level, 0, s);
    }
  }

  const phaseAnimations = new Map<
    HTMLButtonElement,
    { frame: number; timer: number; idlePixels: ImageData }
  >();
  function cancelPhaseAnimations(s: Settings): void {
    for (const [button, animation] of phaseAnimations) {
      cancelAnimationFrame(animation.frame);
      window.clearTimeout(animation.timer);
      const canvas = button.querySelector<HTMLCanvasElement>('[data-sound-level-icon]');
      const level = button.dataset.previewLevel;
      if (
        canvas &&
        (level === 'accent' || level === 'medium' || level === 'normal' || level === 'mute')
      ) {
        renderSoundLevelIcon(canvas, level, 0, s);
      }
    }
    phaseAnimations.clear();
  }

  function animateSoundLevel(button: HTMLButtonElement, level: BeatLevel): void {
    const canvas = button.querySelector<HTMLCanvasElement>('[data-sound-level-icon]');
    if (!canvas) return;
    const previousAnimation = phaseAnimations.get(button);
    if (previousAnimation) {
      cancelAnimationFrame(previousAnimation.frame);
      window.clearTimeout(previousAnimation.timer);
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.putImageData(previousAnimation.idlePixels, 0, 0);
    }
    renderSoundLevelIcon(canvas, level, 0, store.get());
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const idlePixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const startedAt = performance.now();
    const duration = 360;
    let frame = 0;
    const timer = window.setTimeout(() => {
      cancelAnimationFrame(frame);
      ctx.putImageData(idlePixels, 0, 0);
      phaseAnimations.delete(button);
    }, duration + 20);
    const drawFrame = (now: number): void => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const glow = progress < 0.14 ? progress / 0.14 : ((1 - progress) / 0.86) ** 1.7;
      renderSoundLevelIcon(canvas, level, glow, store.get());
      if (progress < 1) {
        frame = requestAnimationFrame(drawFrame);
        phaseAnimations.set(button, { frame, timer, idlePixels });
      } else {
        window.clearTimeout(timer);
        ctx.putImageData(idlePixels, 0, 0);
        phaseAnimations.delete(button);
      }
    };
    frame = requestAnimationFrame(drawFrame);
    phaseAnimations.set(button, { frame, timer, idlePixels });
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

  /** Wires a 0-100% range+number pair to one gain field, same pattern as the Volume slider
   *  above and Visual sync offset in the side menu. */
  function mountGainSlider(
    input: HTMLInputElement,
    valueInput: HTMLInputElement,
    key: 'accentGain' | 'mediumGain' | 'normalGain',
  ): void {
    input.addEventListener('input', () => {
      valueInput.value = input.value;
      store.set({ [key]: Number(input.value) / 100 });
      updateRangeFill(input);
    });
    mountIntegerInput(
      valueInput,
      (percent) => {
        input.value = String(percent);
        updateRangeFill(input);
        store.set({ [key]: percent / 100 });
      },
      { min: 0, max: 100, maxDigits: 3 },
    );
  }
  mountGainSlider(accentGainInput, accentGainValue, 'accentGain');
  mountGainSlider(mediumGainInput, mediumGainValue, 'mediumGain');
  mountGainSlider(normalGainInput, normalGainValue, 'normalGain');

  const volumeInput = byId<HTMLInputElement>('volumeInput');
  const volumeValue = byId<HTMLInputElement>('volumeValue');
  const hapticsToggle = byId<HTMLButtonElement>('hapticsToggle');
  volumeInput.addEventListener('input', () => {
    volumeValue.value = volumeInput.value;
    store.set({ volume: Number(volumeInput.value) / 100 });
    updateRangeFill(volumeInput);
  });
  mountIntegerInput(
    volumeValue,
    (percent) => {
      volumeInput.value = String(percent);
      updateRangeFill(volumeInput);
      store.set({ volume: percent / 100 });
    },
    { min: 0, max: 100, maxDigits: 3 },
  );
  hapticsToggle.addEventListener('click', () => {
    store.set({ haptics: !store.get().haptics });
  });
  const renderVolumeAndHaptics = (s: Settings): void => {
    const percent = Math.round(s.volume * 100);
    volumeInput.value = String(percent);
    if (document.activeElement !== volumeValue) volumeValue.value = String(percent);
    updateRangeFill(volumeInput);
    hapticsToggle.setAttribute('aria-checked', String(s.haptics));
  };
  renderVolumeAndHaptics(store.get());
  store.subscribe(renderVolumeAndHaptics);

  for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-preview]')) {
    button.addEventListener('click', () => {
      const key = button.dataset.preview as SlotKey;
      void previewSound(store.get()[key]);
    });
  }
  for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-preview-level]')) {
    button.addEventListener('click', () => {
      const level = button.dataset.previewLevel;
      if (level === 'accent' || level === 'medium') {
        const s = store.get();
        void previewSound(s.accentSoundId, level === 'accent' ? s.accentGain : s.mediumGain);
      } else if (level === 'normal') {
        const s = store.get();
        void previewSound(s.normalSoundId, s.normalGain);
      }
      if (level === 'accent' || level === 'medium' || level === 'normal' || level === 'mute') {
        animateSoundLevel(button, level);
      }
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
    if (s.nodeStyle !== prev.nodeStyle || s.theme !== prev.theme) {
      cancelPhaseAnimations(s);
      renderSoundLevelIcons(s);
    }
    if (s.volume !== prev.volume) renderSilentBadges(s);
    if (s.accentSoundId !== prev.accentSoundId || s.normalSoundId !== prev.normalSoundId) render(s);
    else if (
      s.accentGain !== prev.accentGain ||
      s.mediumGain !== prev.mediumGain ||
      s.normalGain !== prev.normalGain
    )
      renderGains(s);
  });
  renderSoundLevelIcons(store.get());
}
