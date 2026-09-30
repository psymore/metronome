import { t } from '../i18n/i18n';
import { byId, closeOnBackdropClick } from './dom';

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
  return shared;
}

function groupLabelRow(text: string): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'sound-picker-group';
  div.textContent = text;
  return div;
}

function optionRow(
  state: PickerState,
  id: string,
  name: string,
  selected: boolean,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sound-picker-row';
  button.setAttribute('role', 'option');
  button.setAttribute('aria-selected', String(selected));
  const radio = document.createElement('span');
  radio.className = 'sound-picker-radio';
  const nameEl = document.createElement('span');
  nameEl.className = 'sound-picker-name';
  nameEl.textContent = name;
  button.append(radio, nameEl);
  button.addEventListener('click', () => {
    const select = state.activeSelect;
    if (!select) return;
    if (select.value !== id) {
      select.value = id;
      select.dispatchEvent(new Event('change'));
    }
    state.dialog.close();
  });
  return button;
}

function buildRows(state: PickerState, select: HTMLSelectElement): void {
  const yoursLabel = t('soundGroup.yours');
  const nodes: HTMLElement[] = [];
  let sawYours = false;
  for (const group of Array.from(select.querySelectorAll('optgroup'))) {
    nodes.push(groupLabelRow(group.label));
    if (group.label === yoursLabel) sawYours = true;
    for (const option of Array.from(group.querySelectorAll('option'))) {
      nodes.push(
        optionRow(state, option.value, option.textContent ?? '', option.value === select.value),
      );
    }
  }
  if (!sawYours) {
    nodes.push(groupLabelRow(yoursLabel));
    const empty = document.createElement('div');
    empty.className = 'sound-picker-empty';
    empty.textContent = t('soundList.empty');
    nodes.push(empty);
  }
  state.list.replaceChildren(...nodes);
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
): void {
  const state = getShared();
  updateTriggerLabel(select, trigger);
  new MutationObserver(() => updateTriggerLabel(select, trigger)).observe(select, {
    childList: true,
  });
  select.addEventListener('change', () => updateTriggerLabel(select, trigger));
  trigger.addEventListener('click', () => {
    state.activeSelect = select;
    state.title.textContent = t(titleKey);
    buildRows(state, select);
    state.dialog.showModal();
  });
}
