export type DownloadState = 'queued' | 'downloading' | 'verifying' | 'paused' | 'failed' | 'cancelled' | 'completed';
export interface OfflineEpisodeIdentity { animeId: string; title: string; episode: number; poster?: string }
export interface DesktopDownload { id: string; speedBps?: number; magnet?: string; title: string; state: DownloadState; downloaded: number; total: number; error?: string; chooseFiles?: boolean; files?: { index:number; name:string; bytes:number }[]; selectedFiles?: number[]; relocatedFolder?: string; storageRoot?: string; episodeLinks?: Record<string, OfflineEpisodeIdentity>; progress?: Record<string, { owner?: string | null; watchedCoverage?: import('./desktopCoverage').WatchedCoverage; seconds:number; duration:number; updatedAt:number; completed:boolean }> }
export const linkOfflineEpisode = (id: string, file: string, identity: OfflineEpisodeIdentity | null) => queueCommand('link_offline_episode', { id, file, identity });
export interface DesktopDownloadQueue { version: 1; limitBps: number; items: DesktopDownload[]; downloadDirectory?: string }
function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const bridge = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!bridge) return Promise.reject(new Error('Downloads are available in the desktop app.'));
  return bridge<T>(command, args);
}
const snapshots = new Set<(queue: DesktopDownloadQueue) => void>();
let pendingQueue: Promise<DesktopDownloadQueue> | undefined;
let commandRevision = 0;
let commandQueue: DesktopDownloadQueue | undefined;
let mutationChain: Promise<unknown> = Promise.resolve();
function publishQueue(queue: DesktopDownloadQueue) { snapshots.forEach(listener => { try { listener(queue); } catch { /* A UI observer cannot fail a completed native command. */ } }); }
export function subscribeDownloadSnapshots(listener: (queue: DesktopDownloadQueue) => void) {
  snapshots.add(listener); return () => { snapshots.delete(listener); };
}
/** Concurrent consumers share one read. An older read cannot undo a completed action. */
export function getDownloadQueue(): Promise<DesktopDownloadQueue> {
  if (pendingQueue) return pendingQueue;
  const revision = commandRevision;
  const request = invoke<DesktopDownloadQueue>('get_download_queue').then(queue => {
    const current = revision !== commandRevision && commandQueue ? commandQueue : queue;
    publishQueue(current); return current;
  }).finally(() => { if (pendingQueue === request) pendingQueue = undefined; });
  pendingQueue = request; return request;
}
function queueCommand(command: string, args?: Record<string, unknown>): Promise<DesktopDownloadQueue> {
  // Native Pause returns after shutting down the transfer. Keep mutations in
  // user order so its delayed snapshot cannot undo a subsequent Resume.
  const request = mutationChain.then(() => invoke<DesktopDownloadQueue>(command, args)).then(queue => {
    commandRevision++; commandQueue = queue; publishQueue(queue); return queue;
  });
  mutationChain = request.catch(() => {});
  return request;
}
export const openDownloadManager = () => window.dispatchEvent(new Event('streamnyaa-open-download-manager'));
export async function chooseDownloadDirectory() {
  const queue = await invoke<DesktopDownloadQueue | null>('choose_download_directory');
  // An open chooser must not block transfer controls. Reconcile its successful
  // result behind pending mutations instead of publishing an older snapshot.
  return queue ? queueCommand('get_download_queue') : null;
}
async function enqueue(command: string, title: string, magnet: string) {
  const queue = await queueCommand(command, { title, magnet });
  window.dispatchEvent(new Event("streamnyaa-refresh-downloads"));
  return queue;
}
export const enqueueDownload = (title: string, magnet: string) => enqueue('enqueue_download', title, magnet);
export const enqueueDownloadSelection = (title: string, magnet: string) => enqueue('enqueue_download_selection', title, magnet);
export const selectDownloadFiles = (id: string, indices:number[]) => queueCommand('select_download_files', { id, indices });
export const relinkOfflineFolder = (id: string, directory:string) => queueCommand('relink_offline_folder', { id, directory });
export const controlDownloads = (ids: string[], action: 'pause' | 'resume' | 'cancel' | 'retry') => queueCommand('control_downloads', { ids, action });
export const setDownloadLimit = (limitBps: number) => queueCommand('set_download_limit', { limitBps });
export const removeDownload = (id: string) => queueCommand('remove_download', { id });
export const getOfflineFiles = (id: string) => invoke<string[]>('get_offline_files', { id });
export const playOfflineFile = (id: string, file: string, resume = false) => invoke<void>('play_offline_file', { id, file, resume });

export interface DesktopDownloadsChanged { version: 1; transfers?: {id:string; speedBps?:number; downloaded:number; total:number}[] }
const changedListeners = new Set<() => void>();
let nativeStop: (() => void) | undefined, attaching: Promise<void> | undefined, listenerGeneration = 0;
let changedWhileHidden = false;
function notifyChanges() {
  if (document.hidden) { changedWhileHidden = true; return; }
  changedWhileHidden = false;
  changedListeners.forEach(listener => { try { listener(); } catch { /* Other UI consumers must still receive the update. */ } });
}
function restoreChanges() { if (!document.hidden && changedWhileHidden) notifyChanges(); }
export async function listenDownloadsChanged(callback: () => void): Promise<() => void> {
  const listen = window.__TAURI__?.event?.listen;
  if (!listen) return () => {};
  changedListeners.add(callback);
  if (!nativeStop && !attaching) {
    const generation = ++listenerGeneration;
    document.addEventListener('visibilitychange', restoreChanges);
    attaching = Promise.resolve().then(() => listen<DesktopDownloadsChanged>('streamnyaa-downloads-changed', event => {
      if (event.payload.version === 1) notifyChanges();
    })).then(stop => { if (generation === listenerGeneration && changedListeners.size) nativeStop = stop; else stop(); })
      .finally(() => { if (generation === listenerGeneration) attaching = undefined; });
  }
  try { await attaching; } catch (error) {
    changedListeners.delete(callback);
    if (!changedListeners.size) document.removeEventListener('visibilitychange', restoreChanges);
    throw error;
  }
  return () => {
    changedListeners.delete(callback);
    if (!changedListeners.size) {
      listenerGeneration++; nativeStop?.(); nativeStop = undefined; attaching = undefined; changedWhileHidden = false;
      document.removeEventListener('visibilitychange', restoreChanges);
    }
  };
}

export const forgetDownload = (id:string)=>queueCommand('forget_download',{id});
export const openDownloadDestination = (id:string)=>invoke<void>('open_download_destination',{id});
