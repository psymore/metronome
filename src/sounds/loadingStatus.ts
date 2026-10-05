/**
 * Which sounds are being fetched or decoded right now, so the sound pickers can show a spinner
 * beside them while a first-use download is in flight. Module state rather than a store: the
 * library reports, the pickers subscribe, and nothing else needs the set.
 */
const loading = new Set<string>();
const listeners = new Set<() => void>();

export function setSoundLoading(id: string, isLoading: boolean): void {
  if (isLoading === loading.has(id)) return;
  if (isLoading) loading.add(id);
  else loading.delete(id);
  for (const listener of listeners) listener();
}

export function isSoundLoading(id: string): boolean {
  return loading.has(id);
}

/** Called on every change; returns the unsubscribe function. */
export function subscribeSoundLoading(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
