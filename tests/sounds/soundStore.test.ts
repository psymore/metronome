import 'fake-indexeddb/auto';
import { createStore } from 'idb-keyval';
import { describe, expect, it } from 'vitest';
import { SoundStore } from '../../src/sounds/soundStore';

let dbCounter = 0;
const freshStore = (now?: () => number) =>
  new SoundStore(createStore(`test-${dbCounter++}`, 'sounds'), now);

describe('SoundStore', () => {
  it('adds a sound and reads its bytes back', async () => {
    const store = freshStore();
    const added = await store.add('Kick', Uint8Array.from([1, 2, 3]).buffer);
    expect(added.id).toMatch(/^user:/);
    const got = await store.get(added.id);
    expect(got?.name).toBe('Kick');
    expect(Array.from(new Uint8Array(got?.bytes ?? new ArrayBuffer(0)))).toEqual([1, 2, 3]);
  });

  it('lists metadata oldest first without the bytes', async () => {
    let clock = 2;
    const store = freshStore(() => clock--); // B gets 2, A gets 1
    await store.add('B', new ArrayBuffer(1));
    await store.add('A', new ArrayBuffer(1));
    const list = await store.list();
    expect(list.map((s) => s.name)).toEqual(['A', 'B']);
    expect(list[0]).not.toHaveProperty('bytes');
  });

  it('removes sounds', async () => {
    const store = freshStore();
    const added = await store.add('Kick', new ArrayBuffer(1));
    await store.remove(added.id);
    expect(await store.get(added.id)).toBeUndefined();
    expect(await store.list()).toEqual([]);
  });
});
