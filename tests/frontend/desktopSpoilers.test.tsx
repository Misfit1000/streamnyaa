import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, renderHook, act } from '@testing-library/react';
import { readHideEpisodeSpoilers, saveHideEpisodeSpoilers, useHideEpisodeSpoilers } from '../../src/lib/desktopSpoilers';
afterEach(() => { cleanup(); localStorage.clear(); });
describe('episode spoiler preference', () => {
  it('preserves the existing default and updates mounted screens immediately', () => {
    expect(readHideEpisodeSpoilers()).toBe(false);
    const { result } = renderHook(useHideEpisodeSpoilers);
    act(() => saveHideEpisodeSpoilers(true));
    expect(result.current).toBe(true);
    expect(readHideEpisodeSpoilers()).toBe(true);
    act(() => saveHideEpisodeSpoilers(false));
    expect(result.current).toBe(false);
  });
});
