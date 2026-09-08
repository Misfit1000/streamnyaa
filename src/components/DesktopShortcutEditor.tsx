import { useEffect, useState } from 'react';
import { defaultShortcutConfig, shortcutActions, validateShortcutConfig, type ShortcutConfig } from '../lib/desktopShortcutConfig';

export default function DesktopShortcutEditor() {
  const [draft, setDraft] = useState<ShortcutConfig>({ ...defaultShortcutConfig });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  useEffect(() => {
    let active = true;
    if (!invoke) { setNotice('Available in the desktop app.'); return; }
    invoke<ShortcutConfig>('get_player_shortcuts').then(value => {
      if (active) { setDraft(validateShortcutConfig(value)); setReady(true); }
    }).catch(() => { if (active) setNotice('Could not read shortcut settings. Reopen Settings to retry.'); });
    return () => { active = false; };
  }, [invoke]);
  let error = '';
  try { validateShortcutConfig(draft); } catch (issue) { error = (issue as Error).message; }
  const save = async () => {
    if (!invoke || saving) return;
    setSaving(true);
    try {
      const config = validateShortcutConfig(draft);
      await invoke('save_player_shortcuts', { config });
      setDraft(config); setNotice('Saved. Applies when you next open the player.');
    } catch (issue) { setNotice(issue instanceof Error ? issue.message : 'Shortcuts could not be saved.'); }
    finally { setSaving(false); }
  };
  return <div className="mt-5 border-t border-white/10 pt-4">
    <h3 className="text-sm font-semibold">Customize primary keys</h3>
    <p className="mt-1 text-xs text-white/60">Use a letter, Space, F1–F12, Ctrl+letter or Alt+letter. Alternate shortcuts such as K and navigation keys remain available.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {shortcutActions.map(action => <label key={action.id} className="flex items-center justify-between gap-3 text-sm">
        {action.label}<input aria-label={`${action.label} shortcut`} disabled={!ready || saving} value={draft[action.id]} maxLength={12}
          onChange={event => { setDraft(value => ({ ...value, [action.id]: event.target.value })); setNotice(''); }}
          className="w-28 rounded-md border border-white/15 bg-black/30 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary" />
      </label>)}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-white/70">{notice}</p>}
    <div className="mt-4 flex gap-2">
      <button disabled={!ready || saving || !!error} onClick={() => void save()} className="sn-primary-action px-4 py-2 disabled:opacity-50">{saving ? 'Saving…' : 'Save shortcuts'}</button>
      <button disabled={!ready || saving} onClick={() => { setDraft({ ...defaultShortcutConfig }); setNotice('Defaults restored in the editor. Save to apply.'); }} className="sn-secondary-action px-4 py-2">Restore defaults</button>
    </div>
  </div>;
}
