import { createStore, del, get, set, type UseStore, values } from 'idb-keyval';

export interface StoredSound {
  id: string;
  name: string;
  /** Original file bytes, decoded on demand. */
  bytes: ArrayBuffer;
  addedAt: number;
}

export interface SoundMeta {
  id: string;
  name: string;
  addedAt: number;
}

export class SoundStore {
  constructor(
    private readonly db: UseStore = createStore('metronome', 'sounds'),
    private readonly now: () => number = Date.now,
  ) {}

  async add(name: string, bytes: ArrayBuffer): Promise<StoredSound> {
    const sound: StoredSound = {
      id: `user:${crypto.randomUUID()}`,
      name,
      bytes,
      addedAt: this.now(),
    };
    await set(sound.id, sound, this.db);
    return sound;
  }

  get(id: string): Promise<StoredSound | undefined> {
    return get<StoredSound>(id, this.db);
  }

  async list(): Promise<SoundMeta[]> {
    const all = await values<StoredSound>(this.db);
    return all
      .map(({ id, name, addedAt }) => ({ id, name, addedAt }))
      .sort((a, b) => a.addedAt - b.addedAt);
  }

  remove(id: string): Promise<void> {
    return del(id, this.db);
  }
}
