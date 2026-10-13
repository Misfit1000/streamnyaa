import { useSyncExternalStore } from 'react';
import { desktopDownloadStore } from './desktopDownloadStore';

export function useDesktopDownloads() {
  const snapshot = useSyncExternalStore(desktopDownloadStore.subscribe, desktopDownloadStore.getSnapshot, desktopDownloadStore.getSnapshot);
  return { ...snapshot, refresh: desktopDownloadStore.refresh };
}
