import { describe, expect, it, vi } from 'vitest';
import {
  createWakeLock,
  type WakeLockDeps,
  type WakeLockSentinelLike,
} from '../../src/ui/wakeLock';

function makeDeps(overrides: Partial<WakeLockDeps> = {}): WakeLockDeps {
  return {
    request: vi.fn(() => new Promise<WakeLockSentinelLike>(() => {})),
    isHidden: () => false,
    onVisibilityChange: () => {},
    ...overrides,
  };
}

describe('createWakeLock', () => {
  it('does not start a second request while one is already pending', () => {
    const request = vi.fn(() => new Promise<WakeLockSentinelLike>(() => {}));
    const wakeLock = createWakeLock(makeDeps({ request }));

    wakeLock.setActive(true);
    wakeLock.setActive(true); // a second caller (e.g. rapid stop/start) before the first resolves

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('releases the lock once it resolves, if setActive(false) already happened', async () => {
    const release = vi.fn(async () => {});
    let resolveLock!: (lock: WakeLockSentinelLike) => void;
    const request = vi.fn(
      () => new Promise<WakeLockSentinelLike>((resolve) => (resolveLock = resolve)),
    );
    const wakeLock = createWakeLock(makeDeps({ request }));

    wakeLock.setActive(true);
    wakeLock.setActive(false);
    resolveLock({ release });
    await Promise.resolve();
    await Promise.resolve();

    expect(release).toHaveBeenCalledTimes(1);
  });
});
