import { format, t } from '../i18n/i18n';
import { isSoundLoading, subscribeSoundLoading } from '../sounds/loadingStatus';
import { byId, closeOnBackdropClick } from './dom';
import { groupIconMarkup } from './groupIcons';
import type { PreviewSound } from './soundPreview';

interface PickerState {
  dialog: HTMLDialogElement;
  title: HTMLElement;
  list: HTMLElement;
  activeSelect: HTMLSelectElement | null;
}

let shared: PickerState | null = null;

function getShared(): PickerState {
  if (shared) return shared;
  const dialog = byId<HTMLDialogElement>('soundPickerDialog');
  closeOnBackdropClick(dialog);
  shared = {
    dialog,
    title: byId('soundPickerTitle'),
    list: byId('soundPickerList'),
    activeSelect: null,
  };
  const state = shared;
  subscribeSoundLoading(() => {
    for (const row of state.list.querySelectorAll<HTMLElement>('.sound-picker-row')) {
      row.classList.toggle('is-loading', isSoundLoading(row.dataset.soundId ?? ''));
    }
  });
  return shared;
}

/** A collapsible group: tapping the heading shows or hides its rows. */
function groupSection(
  label: string,
  iconKey: string,
  open: boolean,
  rows: HTMLElement[],
): HTMLElement {
  const section = document.createElement('div');
  section.className = 'sound-picker-section';
  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'sound-picker-group';
  header.setAttribute('aria-expanded', String(open));
  const title = document.createElement('span');
  title.className = 'sound-picker-group-title';
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('aria-hidden', 'true');
  icon.classList.add('sound-picker-group-icon');
  icon.innerHTML = groupIconMarkup(iconKey);
  const text = document.createElement('span');
  text.textContent = label;
  title.append(icon, text);
  header.append(title, chevron());
  // Animated with grid-template-rows 0fr → 1fr, so the height eases without measuring rows.
  const body = document.createElement('div');
  body.className = 'sound-picker-section-body';
  const inner = document.createElement('div');
  inner.className = 'sound-picker-section-inner';
  inner.append(...rows);
  body.append(inner);
  body.classList.toggle('is-open', open);
  header.addEventListener('click', () => {
    const next = !body.classList.contains('is-open');
    body.classList.toggle('is-open', next);
    header.setAttribute('aria-expanded', String(next));
  });
  section.append(header, body);
  return section;
}

function chevron(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('sound-picker-chevron');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M2.5 4.5L6 8L9.5 4.5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.8');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

function optionRow(
  state: PickerState,
  id: string,
  name: string,
  selected: boolean,
  previewSound: PreviewSound,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'sound-picker-row';
  row.dataset.soundId = id;
  row.classList.toggle('is-loading', isSoundLoading(id));
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sound-picker-choice';
  button.setAttribute('aria-pressed', String(selected));
  const radio = document.createElement('span');
  radio.className = 'sound-picker-radio';
  const nameEl = document.createElement('span');
  nameEl.className = 'sound-picker-name';
  nameEl.textContent = name;
  const spinner = document.createElement('span');
  spinner.className = 'sound-picker-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  button.append(radio, nameEl, spinner);
  button.addEventListener('click', () => {
    const select = state.activeSelect;
    if (!select) return;
    if (select.value !== id) {
      select.value = id;
      select.dispatchEvent(new Event('change'));
    }
    state.dialog.close();
  });
  const preview = document.createElement('button');
  preview.type = 'button';
  preview.className = 'small-btn sound-preview-btn';
  preview.textContent = '▶';
  preview.setAttribute('aria-label', format('sound.previewNamed', { name }));
  preview.addEventListener('click', async () => {
    preview.disabled = true;
    try {
      await previewSound(id);
    } finally {
      preview.disabled = false;
    }
  });
  row.append(button, preview);
  return row;
}

/** Each opening starts with only the group holding the current sound expanded. */
function buildRows(
  state: PickerState,
  select: HTMLSelectElement,
  previewSound: PreviewSound,
): void {
  const yoursLabel = t('soundGroup.yours');
  const sections: HTMLElement[] = [];
  let sawYours = false;
  for (const group of Array.from(select.querySelectorAll('optgroup'))) {
    const options = Array.from(group.querySelectorAll('option'));
    const holdsCurrent = options.some((option) => option.value === select.value);
    const rows = options.map((option) =>
      optionRow(
        state,
        option.value,
        option.textContent ?? '',
        option.value === select.value,
        previewSound,
      ),
    );
    const isYours = group.label === yoursLabel;
    if (isYours) sawYours = true;
    const iconKey = group.dataset.group ?? (isYours ? 'yours' : '');
    sections.push(groupSection(group.label, iconKey, holdsCurrent, rows));
  }
  if (!sawYours) {
    const empty = document.createElement('div');
    empty.className = 'sound-picker-empty';
    empty.textContent = t('soundList.empty');
    sections.push(groupSection(yoursLabel, 'yours', true, [empty]));
  }
  state.list.replaceChildren(...sections);
}

function updateTriggerLabel(select: HTMLSelectElement, trigger: HTMLButtonElement): void {
  const label = trigger.querySelector<HTMLElement>('.sound-trigger-value');
  if (label) label.textContent = select.selectedOptions[0]?.textContent ?? '';
}

/**
 * Wraps a hidden <select> (already kept up to date by its own fillSelect/change wiring) with a
 * themed trigger button that opens a shared popover dialog instead of the OS's native option
 * list. Reads groups/options straight off the select so no list data is duplicated; writes the
 * choice back via select.value + a dispatched 'change' event so existing store.set listeners on
 * the select keep working unmodified.
 */
export function mountSoundPicker(
  select: HTMLSelectElement,
  trigger: HTMLButtonElement,
  titleKey: string,
  previewSound: PreviewSound,
): void {
  const state = getShared();
  const refresh = () => {
    updateTriggerLabel(select, trigger);
    trigger.classList.toggle('is-loading', isSoundLoading(select.value));
  };
  refresh();
  new MutationObserver(refresh).observe(select, { childList: true });
  select.addEventListener('change', refresh);
  subscribeSoundLoading(refresh);
  trigger.addEventListener('click', () => {
    state.activeSelect = select;
    state.title.textContent = t(titleKey);
    buildRows(state, select, previewSound);
    state.dialog.showModal();
  });
}
