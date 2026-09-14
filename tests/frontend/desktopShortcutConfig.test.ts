import { describe, expect, it } from 'vitest';
import { defaultShortcutConfig, normalizeShortcutKey, validateShortcutConfig } from '../../src/lib/desktopShortcutConfig';
describe('player shortcut validation', () => {
  it('accepts defaults and normalizes modifier spelling', () => {
    expect(validateShortcutConfig(defaultShortcutConfig)).toEqual(defaultShortcutConfig);
    expect(normalizeShortcutKey(' ctrl+F ')).toBe('Ctrl+f');
  });
  it('allows swaps but prevents duplicate commands', () => {
    expect(validateShortcutConfig({ ...defaultShortcutConfig, fullscreen: 'm', mute: 'f' }).mute).toBe('f');
    expect(() => validateShortcutConfig({ ...defaultShortcutConfig, mute: 'f' })).toThrow('already assigned');
  });
  it('protects existing navigation and rejects command injection', () => {
    for (const key of ['ESC', 'k', 'Ctrl+q', 'mouse_btn0', 'f; quit', '\nquit', 'Alt+F4']) {
      expect(() => validateShortcutConfig({ ...defaultShortcutConfig, pause: key })).toThrow();
    }
  });
});
