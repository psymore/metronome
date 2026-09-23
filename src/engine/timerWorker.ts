// Wakes the scheduler. Worker timers are throttled far less than main-thread timers in
// background tabs. The tick only *wakes* the scheduler; it never decides when a click sounds.
const TICK_MS = 25;
let timer: ReturnType<typeof setInterval> | undefined;

self.onmessage = (e: MessageEvent<'start' | 'stop'>) => {
  if (e.data === 'start' && timer === undefined) {
    timer = setInterval(() => self.postMessage('tick'), TICK_MS);
  } else if (e.data === 'stop' && timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
};

export {};
