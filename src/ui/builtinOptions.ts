import { t } from '../i18n/i18n';
import { BUILTIN_GROUPS, BUILTIN_SOUNDS, type BuiltinGroup } from '../sounds/synth';

/** One <optgroup> per built-in category, so the sound pickers show them under headings. */
export function builtinOptionGroups(): HTMLOptGroupElement[] {
  const groups = new Map<BuiltinGroup, HTMLOptGroupElement>();
  for (const group of BUILTIN_GROUPS) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = t(group === 'builtin' ? 'soundGroup.builtin' : `soundGroup.${group}`);
    optgroup.dataset.group = group;
    groups.set(group, optgroup);
  }
  for (const [id, sound] of Object.entries(BUILTIN_SOUNDS)) {
    groups.get(sound.group)?.append(new Option(sound.name, id));
  }
  return [...groups.values()].filter((g) => g.children.length > 0);
}
