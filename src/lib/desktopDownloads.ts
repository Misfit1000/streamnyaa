export type DownloadState = 'queued' | 'downloading' | 'verifying' | 'paused' | 'failed' | 'cancelled' | 'completed';
export interface OfflineEpisodeIdentity { animeId: string; title: string; episode: number; poster?: string }
export interface DesktopDownload { id: string; speedBps?: number; magnet?: string; title: string; state: DownloadState; downloaded: number; total: number; error?: string; chooseFiles?: boolean; files?: { index:number; name:string; bytes:number }[]; selectedFiles?: number[]; relocatedFolder?: string; storageRoot?: string; episodeLinks?: Record<string, OfflineEpisodeIdentity>; progress?: Record<string, { owner?: string; watchedCoverage?: import('./desktopCoverage').WatchedCoverage; seconds:number; duration:number; updatedAt:number; completed:boolean }> }
export const linkOfflineEpisode = (id: string, file: string, identity: OfflineEpisodeIdentity | null) => invoke<DesktopDownloadQueue>('link_offline_episode', { id, file, identity });
export interface DesktopDownloadQueue { version: 1; limitBps: number; items: DesktopDownload[]; downloadDirectory?: string }
function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const bridge = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!bridge) return Promise.reject(new Error('Downloads are available in the desktop app.'));
  return bridge<T>(command, args);
}
export const getDownloadQueue = () => invoke<DesktopDownloadQueue>('get_download_queue');
export const openDownloadManager = () => window.dispatchEvent(new Event('streamnyaa-open-download-manager'));
export const chooseDownloadDirectory = () => invoke<DesktopDownloadQueue | null>('choose_download_directory');
async function enqueue(command: string, title: string, magnet: string) {
  const queue = await invoke<DesktopDownloadQueue>(command, { title, magnet });
  window.dispatchEvent(new Event("streamnyaa-refresh-downloads"));
  return queue;
}
export const enqueueDownload = (title: string, magnet: string) => enqueue('enqueue_download', title, magnet);
export const enqueueDownloadSelection = (title: string, magnet: string) => enqueue('enqueue_download_selection', title, magnet);
export const selectDownloadFiles = (id: string, indices:number[]) => invoke<DesktopDownloadQueue>('select_download_files', { id, indices });
export const relinkOfflineFolder = (id: string, directory:string) => invoke<DesktopDownloadQueue>('relink_offline_folder', { id, directory });
export const controlDownloads = (ids: string[], action: 'pause' | 'resume' | 'cancel' | 'retry') => invoke<DesktopDownloadQueue>('control_downloads', { ids, action });
export const setDownloadLimit = (limitBps: number) => invoke<DesktopDownloadQueue>('set_download_limit', { limitBps });
export const removeDownload = (id: string) => invoke<DesktopDownloadQueue>('remove_download', { id });
export const getOfflineFiles = (id: string) => invoke<string[]>('get_offline_files', { id });
export const playOfflineFile = (id: string, file: string, resume = false) => invoke<void>('play_offline_file', { id, file, resume });

export interface DesktopDownloadsChanged { version: 1; transfers?: {id:string; speedBps?:number; downloaded:number; total:number}[] }
export async function listenDownloadsChanged(callback: () => void): Promise<() => void> {
  const listen = window.__TAURI__?.event?.listen;
  if (!listen) return () => {};
  return listen<DesktopDownloadsChanged>('streamnyaa-downloads-changed', event => {
    if (event.payload.version === 1) callback();
  });
}

export const forgetDownload = (id:string)=>invoke<DesktopDownloadQueue>('forget_download',{id});
export const openDownloadDestination = (id:string)=>invoke<void>('open_download_destination',{id});
