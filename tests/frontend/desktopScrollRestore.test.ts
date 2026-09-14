import { afterEach, describe, expect, it, vi } from 'vitest';
import { restoreDesktopScroll } from '../../src/lib/desktopScrollRestore';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function fixture() {
  vi.useFakeTimers();
  let changed = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal('MutationObserver', class {
    constructor(callback: () => void) { changed = callback; }
    observe() {}
    disconnect = disconnect;
  });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const element = document.createElement('main');
  let maximum = 0;
  let position = 0;
  Object.defineProperty(element, 'scrollTop', {
    get: () => position,
    set: (value: number) => { position = Math.min(maximum, value); },
  });
  return { element, disconnect, hydrate: () => { maximum = 2000; changed(); } };
}

describe('desktop browsing position', () => {
  it('waits for suspended content then restores the saved position once', () => {
    const f = fixture();
    restoreDesktopScroll(f.element, 800);
    vi.advanceTimersByTime(30);
    expect(f.element.scrollTop).toBe(0);
    f.hydrate();
    vi.advanceTimersByTime(30);
    expect(f.element.scrollTop).toBe(800);
    expect(f.disconnect).toHaveBeenCalledOnce();
  });
  it('never jumps after the user starts scrolling', () => {
    const f = fixture();
    restoreDesktopScroll(f.element, 800);
    f.element.dispatchEvent(new Event('wheel'));
    f.hydrate();
    vi.advanceTimersByTime(100);
    expect(f.element.scrollTop).toBe(0);
  });
  it('stops observing unavailable content after a bounded deadline', () => {
    const f = fixture();
    const stop = restoreDesktopScroll(f.element, 800);
    vi.advanceTimersByTime(10_001);
    expect(f.disconnect).toHaveBeenCalledOnce();
    stop();
    f.hydrate();
    vi.advanceTimersByTime(30);
    expect(f.element.scrollTop).toBe(0);
  });
});
