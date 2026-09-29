import { describe, expect, it, vi } from 'vitest';
import { createPwaReloadHandler, type PwaReloadDeps } from '../../src/ui/pwaReload';

function makeDeps(overrides: Partial<PwaReloadDeps> = {}) {
  const listeners: (() => void)[] = [];
  const reload = vi.fn();
  let running = false;
  let hidden = false;
  const deps: PwaReloadDeps = {
    isRunning: () => running,
    isHidden: () => hidden,
    onVisibilityChange: (listener) => listeners.push(listener),
    reload,
    ...overrides,
  };
  return {
    deps,
    reload,
    setRunning: (v: boolean) => {
      running = v;
    },
    setHidden: (v: boolean) => {
      hidden = v;
    },
    fireVisibilityChange: () => {
      for (const listener of listeners) listener();
    },
  };
}

describe('createPwaReloadHandler', () => {
  it('reloads immediately when the metronome is not running', () => {
    const { deps, reload } = makeDeps();
    const onNeedReload = createPwaReloadHandler(deps);

    onNeedReload();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload immediately while the metronome is running', () => {
    const { deps, reload, setRunning } = makeDeps();
    setRunning(true);
    const onNeedReload = createPwaReloadHandler(deps);

    onNeedReload();

    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads on the first visibilitychange where the page is hidden and playback has stopped', () => {
    const { deps, reload, setRunning, setHidden, fireVisibilityChange } = makeDeps();
    setRunning(true);
    const onNeedReload = createPwaReloadHandler(deps);
    onNeedReload();

    setRunning(false);
    setHidden(true);
    fireVisibilityChange();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload on a visibilitychange while still running, even if hidden', () => {
    const { deps, reload, setRunning, setHidden, fireVisibilityChange } = makeDeps();
    setRunning(true);
    const onNeedReload = createPwaReloadHandler(deps);
    onNeedReload();

    setHidden(true);
    fireVisibilityChange(); // still running: must not reload while in use

    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload on a visibilitychange while visible, even after playback stops', () => {
    const { deps, reload, setRunning, setHidden, fireVisibilityChange } = makeDeps();
    setRunning(true);
    const onNeedReload = createPwaReloadHandler(deps);
    onNeedReload();

    setRunning(false);
    setHidden(false);
    fireVisibilityChange(); // stopped, but still visible: never reload in view

    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads only once even if a qualifying visibilitychange fires again', () => {
    const { deps, reload, setRunning, setHidden, fireVisibilityChange } = makeDeps();
    setRunning(true);
    const onNeedReload = createPwaReloadHandler(deps);
    onNeedReload();

    setRunning(false);
    setHidden(true);
    fireVisibilityChange();
    fireVisibilityChange();

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
