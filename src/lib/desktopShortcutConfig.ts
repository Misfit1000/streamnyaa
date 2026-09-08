export const shortcutActions = [
  { id: 'pause', label: 'Play / pause', defaultKey: 'SPACE' },
  { id: 'fullscreen', label: 'Fullscreen', defaultKey: 'f' },
  { id: 'mute', label: 'Mute', defaultKey: 'm' },
  { id: 'back', label: 'Seek backward by selected step', defaultKey: 'j' },
  { id: 'forward', label: 'Seek forward by selected step', defaultKey: 'l' },
  { id: 'settings', label: 'Player settings', defaultKey: 's' },
] as const;
export type ShortcutAction = typeof shortcutActions[number]['id'];
export type ShortcutConfig = Record<ShortcutAction, string>;
export const defaultShortcutConfig = Object.fromEntries(shortcutActions.map(a => [a.id, a.defaultKey])) as ShortcutConfig;
// Leave navigation, numeric seeking, subtitle/audio controls and OS shortcuts alone.
const reserved = new Set(['k', 'a', 'c', 'i', 'o', 'p', 'x', 'z', 'n', 'ESC', 'TAB', 'ENTER', 'LEFT', 'RIGHT', 'UP', 'DOWN', 'HOME', 'END']);
export function normalizeShortcutKey(value: string) {
  const input = value.trim();
  if (/^space$/i.test(input)) return 'SPACE';
  if (/^F(?:[1-9]|1[0-2])$/i.test(input)) return input.toUpperCase();
  if (/^[a-z]$/i.test(input)) return input.toLowerCase();
  if (/^(ctrl|alt)\+[a-z]$/i.test(input)) {
    const [modifier, key] = input.split('+');
    return `${modifier.toLowerCase() === 'ctrl' ? 'Ctrl' : 'Alt'}+${key.toLowerCase()}`;
  }
  throw new Error('Use a letter, Space, F1–F12, Ctrl+letter or Alt+letter.');
}
export function validateShortcutConfig(input: unknown): ShortcutConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid shortcut settings.');
  const result = {} as ShortcutConfig;
  const assigned = new Map<string, string>();
  for (const action of shortcutActions) {
    const raw = (input as Record<string, unknown>)[action.id];
    if (typeof raw !== 'string') throw new Error(`Choose a key for ${action.label}.`);
    const key = normalizeShortcutKey(raw);
    if (reserved.has(key) || ['Ctrl+q', 'Ctrl+w', 'Alt+f'].includes(key)) throw new Error(`${key} is reserved for another control.`);
    const existing = assigned.get(key);
    if (existing) throw new Error(`${key} is already assigned to ${existing}.`);
    assigned.set(key, action.label);
    result[action.id] = key;
  }
  return result;
}
