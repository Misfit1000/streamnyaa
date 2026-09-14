import { exportDesktopSettingsBackup, importDesktopSettingsBackup } from './desktop';
import { useStore } from '../store/useStore';
import { validateShortcutConfig } from './desktopShortcutConfig';
const extraKeys = ['streamnyaa.desktop.libraryOrganization.v1','streamnyaa-desktop-explore-presets-v1','streamnyaa.desktop.interfaceScale','streamnyaa.desktop.design.v1','streamnyaa.desktop.homeLayout.v1','streamnyaa.desktop.hideEpisodeSpoilers'] as const;
function bridge() { const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke; if (!invoke) throw new Error('Personal backup requires the desktop app.'); return invoke; }
export async function exportPersonalBackup() {
  const state = useStore.getState();
  const shortcuts = validateShortcutConfig(await bridge()('get_player_shortcuts'));
  return JSON.stringify({ app:'StreamNyaa Desktop', version:2, exportedAt:new Date().toISOString(), settings:JSON.parse(exportDesktopSettingsBackup()),
    library: { myList:state.myList, likedAnimes:state.likedAnimes, likes:state.likes },
    extras:Object.fromEntries(extraKeys.map(key => [key,localStorage.getItem(key)]).filter(([,value]) => value !== null)), shortcuts }, null, 2);
}
export async function importPersonalBackup(text: string) {
  if (text.length > 10_000_000) throw new Error('Backup exceeds 10 MB.');
  const value = JSON.parse(text);
  if (value.app !== 'StreamNyaa Desktop' || ![1,2].includes(value.version)) throw new Error('Unsupported StreamNyaa backup.');
  if (value.version === 1) return importDesktopSettingsBackup(text);
  const listValid = (items: any) => Array.isArray(items) && items.length <= 10000 && items.every(item => item && typeof item === 'object' && typeof item.title === 'string' && item.title.length <= 1000 && (Number(item.mal_id) > 0 || Number(item.id) > 0 || Number(item.anilist_id) > 0));
  if (!listValid(value.library?.myList) || !listValid(value.library?.likedAnimes) || !Array.isArray(value.library?.likes) || value.library.likes.length > 10000 || !value.library.likes.every((id: unknown) => ['number','string'].includes(typeof id))) throw new Error('Invalid Library in backup.');
  if (!value.settings?.keys || typeof value.settings.keys !== 'object' || Array.isArray(value.settings.keys) || !Object.values(value.settings.keys).every(entry => typeof entry === 'string')) throw new Error('Invalid settings in backup.');
  const extras = value.extras || {};
  for (const key of extraKeys) { if (extras[key] !== undefined) { if(typeof extras[key] !== 'string' || extras[key].length > 2_000_000) throw new Error('Invalid preference in backup.'); if(!['streamnyaa.desktop.design.v1'].includes(key)) JSON.parse(extras[key]); } }
  const shortcuts = validateShortcutConfig(value.shortcuts);
  const invoke = bridge(); const oldShortcuts = await invoke('get_player_shortcuts');
  const oldStore = useStore.getState();
  const oldSettings = JSON.parse(exportDesktopSettingsBackup());
  const touched = new Set([...Object.keys(oldSettings.keys),...Object.keys(value.settings.keys).filter(key => key.startsWith('streamnyaa.')), ...extraKeys, 'shanks-storage']);
  const before = new Map([...touched].map(key => [key,localStorage.getItem(key)]));
  try {
    await invoke('save_player_shortcuts', {config:shortcuts});
    const imported = importDesktopSettingsBackup(JSON.stringify(value.settings));
    for (const key of extraKeys) if (typeof extras[key] === 'string') localStorage.setItem(key,extras[key]);
    useStore.setState({ myList:value.library.myList, likedAnimes:value.library.likedAnimes, likes:value.library.likes });
    for (const name of ['streamnyaa-library-organization','streamnyaa-interface-scale-changed','streamnyaa-design-changed','streamnyaa-spoilers-changed']) window.dispatchEvent(new Event(name));
    return imported + 3 + Object.keys(extras).filter(key => (extraKeys as readonly string[]).includes(key)).length;
  } catch (error) {
    let rollbackFailed = false;
    try { for(const [key,value] of before) { if(value === null) localStorage.removeItem(key); else localStorage.setItem(key,value); } useStore.setState({myList:oldStore.myList,likedAnimes:oldStore.likedAnimes,likes:oldStore.likes}); await invoke('save_player_shortcuts',{config:oldShortcuts}); } catch { rollbackFailed = true; }
    throw new Error(rollbackFailed ? 'Import failed and rollback was incomplete. Keep your backup and free storage before retrying.' : `Import cancelled; prior data restored. ${error instanceof Error ? error.message : ''}`);
  }
}
