import { exportDesktopSettingsBackup, importDesktopSettingsBackup } from './desktop';
import { useStore } from '../store/useStore';
import { validateShortcutConfig } from './desktopShortcutConfig';
import { initializeDesktopAppearance } from './desktopAppearance';
import { flushHistoryWrites, historyArchiveOwner, historyArchiveReady, historyRequest, refreshHistoryProjection, toHistoryEpisode } from './desktopHistoryArchive';
import { readLibraryOrganization, libraryOrganizationStorageKey } from './desktopLibraryOrganization';
const extraKeys = ['streamnyaa.desktop.libraryOrganization.v1','streamnyaa-desktop-explore-presets-v1','streamnyaa-desktop-explore-presets-v2','streamnyaa.desktop.interfaceScale','streamnyaa.desktop.design.v1','streamnyaa.desktop.homeLayout.v1','streamnyaa.desktop.homeShowChineseAnimation.v1','streamnyaa.desktop.hideEpisodeSpoilers'] as const;
function bridge() { const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke; if (!invoke) throw new Error('Personal backup requires the desktop app.'); return invoke; }
async function importLegacyArchive(keys:Record<string,string>) {
  if(!historyArchiveReady())return;
  const records=[];
  for(const key of ['streamnyaa.localPlaybackHistory','streamnyaa.desktop.watchProgress.v1']){
    const values=JSON.parse(keys[key] || '[]');if(!Array.isArray(values))throw new Error('Invalid history in backup.');
    records.push(...values.map(toHistoryEpisode));
  }
  for(let offset=0;offset<records.length;offset+=500)await historyRequest('import',{records:records.slice(offset,offset+500)});
  const organization=readLibraryOrganization();
  for(const [identity,entry]of Object.entries(organization.entries))await historyRequest('status',{identity:identity.startsWith('title:')?`legacy:${identity}`:identity,status:entry.status,revision:entry.revision});
  await refreshHistoryProjection();
}
export async function exportPersonalBackup() {
  const state = useStore.getState();
  const shortcuts = validateShortcutConfig(await bridge()('get_player_shortcuts'));
  return JSON.stringify({ app:'StreamNyaa Desktop', version:2, exportedAt:new Date().toISOString(), settings:JSON.parse(exportDesktopSettingsBackup()),
    library: { myList:state.myList, likedAnimes:state.likedAnimes, likes:state.likes },
    extras:Object.fromEntries(extraKeys.map(key => [key,key === 'streamnyaa.desktop.libraryOrganization.v1'?JSON.stringify(readLibraryOrganization()):key === 'streamnyaa.desktop.design.v1' ? 'revamped' : localStorage.getItem(key)]).filter(([,value]) => value !== null)), shortcuts }, null, 2);
}
export async function importPersonalBackup(text: string, importHistory=true) {
  if (text.length > 10_000_000) throw new Error('Backup exceeds 10 MB.');
  const value = JSON.parse(text);
  if (value.app !== 'StreamNyaa Desktop' || ![1,2].includes(value.version)) throw new Error('Unsupported StreamNyaa backup.');
  if (value.version === 1) { const imported = importDesktopSettingsBackup(text); if(importHistory)await importLegacyArchive(value.keys); initializeDesktopAppearance(); return imported; }
  const listValid = (items: any) => Array.isArray(items) && items.length <= 10000 && items.every(item => item && typeof item === 'object' && typeof item.title === 'string' && item.title.length <= 1000 && (Number(item.mal_id) > 0 || Number(item.id) > 0 || Number(item.anilist_id) > 0));
  if (!listValid(value.library?.myList) || !listValid(value.library?.likedAnimes) || !Array.isArray(value.library?.likes) || value.library.likes.length > 10000 || !value.library.likes.every((id: unknown) => ['number','string'].includes(typeof id))) throw new Error('Invalid Library in backup.');
  if (!value.settings?.keys || typeof value.settings.keys !== 'object' || Array.isArray(value.settings.keys) || !Object.values(value.settings.keys).every(entry => typeof entry === 'string')) throw new Error('Invalid settings in backup.');
  const extras = value.extras || {};
  for (const key of extraKeys) { if (extras[key] !== undefined) { if(typeof extras[key] !== 'string' || extras[key].length > 2_000_000) throw new Error('Invalid preference in backup.'); if(!['streamnyaa.desktop.design.v1'].includes(key)) JSON.parse(extras[key]); } }
  const shortcuts = validateShortcutConfig(value.shortcuts);
  const invoke = bridge(); const oldShortcuts = await invoke('get_player_shortcuts');
  const oldStore = useStore.getState();
  const oldSettings = JSON.parse(exportDesktopSettingsBackup());
  const touched = new Set([...Object.keys(oldSettings.keys),...Object.keys(value.settings.keys).filter(key => key.startsWith('streamnyaa.')), ...extraKeys, libraryOrganizationStorageKey(), 'shanks-storage']);
  const before = new Map([...touched].map(key => [key,localStorage.getItem(key)]));
  try {
    await invoke('save_player_shortcuts', {config:shortcuts});
    const imported = importDesktopSettingsBackup(JSON.stringify(value.settings));
    if (extras['streamnyaa-desktop-explore-presets-v1'] && !extras['streamnyaa-desktop-explore-presets-v2']) localStorage.removeItem('streamnyaa-desktop-explore-presets-v2');
    for (const key of extraKeys) if (typeof extras[key] === 'string') localStorage.setItem(key,key === 'streamnyaa.desktop.design.v1' ? 'revamped' : extras[key]);
    if(extras['streamnyaa.desktop.libraryOrganization.v1'])localStorage.setItem(libraryOrganizationStorageKey(),extras['streamnyaa.desktop.libraryOrganization.v1']);
    initializeDesktopAppearance();
    useStore.setState({ myList:value.library.myList, likedAnimes:value.library.likedAnimes, likes:value.library.likes });
    if(importHistory)await importLegacyArchive(value.settings.keys);
    for (const name of ['streamnyaa-library-organization','streamnyaa-interface-scale-changed','streamnyaa-design-changed','streamnyaa-spoilers-changed','streamnyaa:home-browsing-preference']) window.dispatchEvent(new Event(name));
    return imported + 3 + Object.keys(extras).filter(key => (extraKeys as readonly string[]).includes(key)).length;
  } catch (error) {
    let rollbackFailed = false;
    try { for(const [key,value] of before) { if(value === null) localStorage.removeItem(key); else localStorage.setItem(key,value); } useStore.setState({myList:oldStore.myList,likedAnimes:oldStore.likedAnimes,likes:oldStore.likes}); await invoke('save_player_shortcuts',{config:oldShortcuts}); } catch { rollbackFailed = true; }
    throw new Error(rollbackFailed ? 'Import failed and rollback was incomplete. Keep your backup and free storage before retrying.' : `Import cancelled; prior data restored. ${error instanceof Error ? error.message : ''}`);
  }
}

export async function exportPersonalBackupFile():Promise<{path:string;bytes:number}> {
  if(!historyArchiveReady())throw new Error('Wait for the local history archive to finish opening before exporting.');
  await flushHistoryWrites();
  return bridge()('history_backup',{action:'export',request:{owner:historyArchiveOwner(),manifest:JSON.parse(await exportPersonalBackup())}});
}
export async function importPersonalBackupFile(file:File) {
  if(!file.name.toLowerCase().endsWith('.streamnyaa'))return importPersonalBackup(await file.text());
  if(!historyArchiveReady())throw new Error('Wait for the local history archive to finish opening before importing.');
  await flushHistoryWrites();
  const token=crypto.randomUUID(),owner=historyArchiveOwner(),invoke=bridge();
  const call=<T>(action:string,request:Record<string,unknown>={})=>invoke<T>('history_backup',{action,request:{owner,token,...request}});
  let previous:string|undefined;
  try {
    for(let offset=0;offset<file.size;offset+=131072){
      const bytes=Array.from(new Uint8Array(await file.slice(offset,offset+131072).arrayBuffer()));
      const result=await call<{received:number}>('upload',{offset,bytes,final:offset+bytes.length===file.size});
      if(result.received!==offset+bytes.length)throw new Error('Backup upload was interrupted.');
    }
    const manifest=await call<{settings:unknown}>('inspect');
    previous=await exportPersonalBackup();
    const count=await importPersonalBackup(JSON.stringify(manifest.settings),false);
    await call('restore');
    localStorage.setItem('streamnyaa.historySync.device.v3',crypto.randomUUID());
    await refreshHistoryProjection();
    window.dispatchEvent(new Event('streamnyaa:history-sync-now'));
    return count+1;
  } catch(error) {
    if(previous)await importPersonalBackup(previous,false);
    throw error;
  } finally {await call('cancel').catch(()=>undefined);}
}
