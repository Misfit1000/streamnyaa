import { afterEach, expect, it, vi } from 'vitest';
import { loadDesktopPlayerPreferences, saveDesktopPlayerSetting, syncDesktopPlayerPreferencesToPlayer } from '../../src/lib/desktop';
afterEach(() => { delete window.__TAURI__; localStorage.clear(); });
it('stops a stale preference batch after a newer native setting arrives', async () => {
  let release!: (value: unknown) => void;
  const invoke = vi.fn().mockImplementationOnce(() => new Promise(r => { release = r; })).mockResolvedValue({});
  window.__TAURI__ = {core:{invoke}};
  const work = syncDesktopPlayerPreferencesToPlayer(loadDesktopPlayerPreferences());
  saveDesktopPlayerSetting('autoSkipIntro', true);
  release({});
  await work;
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(loadDesktopPlayerPreferences().autoSkipIntro).toBe(true);
});
