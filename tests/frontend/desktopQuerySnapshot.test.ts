import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installDesktopQuerySnapshot,
  isPublicDesktopQuery,
  restoreDesktopQuerySnapshot,
} from '../../src/lib/desktopQuerySnapshot';

describe('desktop public query snapshots', () => {
  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it('allows public anime data and excludes account data', () => {
    expect(isPublicDesktopQuery({ queryKey: ['anime', 'frieren'] } as never)).toBe(true);
    expect(isPublicDesktopQuery({ queryKey: ['desktop-home-seasonal'] } as never)).toBe(true);
    expect(isPublicDesktopQuery({ queryKey: ['account-library', 'private-user'] } as never)).toBe(false);
  });

  it('restores verified public data without persisting private queries', () => {
    vi.useFakeTimers();
    const first = new QueryClient();
    const uninstall = installDesktopQuerySnapshot(first);
    first.setQueryData(['anime', '1'], { title: 'Frieren' });
    first.setQueryData(['account-library', 'private-user'], { token: 'must-not-persist' });
    vi.advanceTimersByTime(1_000);
    uninstall();

    const second = new QueryClient();
    expect(restoreDesktopQuerySnapshot(second)).toBe(true);
    expect(second.getQueryData(['anime', '1'])).toEqual({ title: 'Frieren' });
    expect(second.getQueryData(['account-library', 'private-user'])).toBeUndefined();
  });
});
