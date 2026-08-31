import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aggregateLoadingProgress, clampLoadingPercent } from '../../src/lib/desktopLoading';
import { completeDesktopBoot, updateDesktopBoot } from '../../src/lib/desktopBoot';

describe('desktop loading progress', () => {
  it('aggregates weighted real task progress', () => {
    expect(aggregateLoadingProgress([
      { id: 'cache', weight: 2, complete: true },
      { id: 'network', weight: 1, progress: 40 },
    ])).toEqual({ percent: 80, completed: 1, total: 2 });
  });

  it('clamps invalid and out-of-range values', () => {
    expect(clampLoadingPercent(Number.NaN)).toBe(0);
    expect(clampLoadingPercent(-20)).toBe(0);
    expect(clampLoadingPercent(118)).toBe(100);
  });
});

describe('desktop boot milestones', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="streamnyaa-desktop-boot" data-progress="8">
        <div class="sn-boot__bar"></div>
        <span class="sn-boot__status-label"></span>
        <span class="sn-boot__value"></span>
      </div>`;
  });

  it('never moves backwards when concurrent startup work reports late', () => {
    updateDesktopBoot({ percent: 64, label: 'Restoring session' });
    updateDesktopBoot({ percent: 22, label: 'Late cache task' });
    expect(document.querySelector<HTMLElement>('.sn-boot__bar')?.style.width).toBe('64%');
    expect(document.querySelector('.sn-boot__value')?.textContent).toBe('64%');
  });

  it('reaches 100 before dismissing the pre-React screen', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    completeDesktopBoot();
    expect(document.querySelector('.sn-boot__value')?.textContent).toBe('100%');
    expect(document.getElementById('streamnyaa-desktop-boot')?.classList.contains('sn-boot--leaving')).toBe(true);
    vi.runAllTimers();
    expect(document.getElementById('streamnyaa-desktop-boot')).toBeNull();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});

