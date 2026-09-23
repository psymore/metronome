import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../../src/state/store';

describe('createStore', () => {
  it('merges patches and notifies with the previous state', () => {
    const store = createStore({ a: 1, b: 2 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ b: 3 });
    expect(store.get()).toEqual({ a: 1, b: 3 });
    expect(listener).toHaveBeenCalledWith({ a: 1, b: 3 }, { a: 1, b: 2 });
  });

  it('stops notifying after unsubscribe', () => {
    const store = createStore({ a: 1 });
    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.set({ a: 2 });
    expect(listener).not.toHaveBeenCalled();
  });
});
