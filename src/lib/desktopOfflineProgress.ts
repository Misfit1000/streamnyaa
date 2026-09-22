import { loadStoredSession } from './supabaseAuth';
import {coveragePercent} from './desktopCoverage';
import { saveDesktopWatchProgress, saveLocalPlaybackHistoryItem, findLocalPlaybackHistoryItem, loadDesktopWatchProgress } from './desktop';
import type { DesktopDownloadQueue } from './desktopDownloads';

// Only an explicit file-to-episode link may enter account/history progress.
export function synchronizeOfflineProgress(queue: DesktopDownloadQueue) {
  const owner=loadStoredSession()?.user?.id || '';
  const key = `streamnyaa.desktop.offlineProgressSync.v1:${owner}`;
  let applied: Record<string, number> = {};
  try { const saved = JSON.parse(localStorage.getItem(key) || localStorage.getItem('streamnyaa.desktop.offlineProgressSync.v1') || '{}'); if (saved && typeof saved === 'object' && !Array.isArray(saved)) applied = saved; } catch { /* Retry synchronization from durable native data. */ }
  for (const item of queue.items) for (const [file, progress] of Object.entries(item.progress || {})) {
    if(progress.owner!==undefined && progress.owner!==owner)continue;
    const link = item.episodeLinks?.[file];
    if (!link || !link.animeId || !link.title || !Number.isSafeInteger(link.episode) || link.episode < 1
      || !Number.isFinite(progress.seconds) || progress.seconds < 0 || !Number.isFinite(progress.duration) || progress.duration <= 0
      || !Number.isFinite(progress.updatedAt) || progress.updatedAt <= 0) continue;
    const identity = JSON.stringify([item.id, file, link.animeId, link.episode]);
    const updatedAt = progress.updatedAt * 1000;
    if (applied[identity] >= updatedAt) continue;
    const record = { animeId: link.animeId, title: link.title, poster: link.poster, episode: link.episode,
      watchedCoverage:progress.watchedCoverage, positionSeconds: progress.seconds, durationSeconds: progress.duration,
      progressPercent: progress.watchedCoverage ? coveragePercent(progress.watchedCoverage,progress.duration) : Math.min(100, progress.seconds / progress.duration * 100), completed: progress.completed,
      updatedAt };
    saveDesktopWatchProgress(record);
    const existing = findLocalPlaybackHistoryItem({ animeId:link.animeId, episode:link.episode });
    if (item.magnet && (!existing || Number(existing.progressUpdatedAt || existing.savedAt || 0) < updatedAt)) {
      saveLocalPlaybackHistoryItem({ magnet:item.magnet, infoHash:item.id, title:link.title, animeTitle:link.title,
        animeId:link.animeId, episode:link.episode, poster:link.poster, image:link.poster,
        watchedCoverage:progress.watchedCoverage, offlineDownloadId:item.id, offlineFile:file, resumeSeconds:progress.seconds, durationSeconds:progress.duration,
        progressPercent:record.progressPercent, completed:progress.completed, savedAt:updatedAt, progressUpdatedAt:updatedAt });
    }
    if (loadDesktopWatchProgress().some(value => String(value.animeId) === link.animeId && Number(value.episode) === link.episode && value.updatedAt >= updatedAt)) applied[identity] = updatedAt;
  }
  try { localStorage.setItem(key, JSON.stringify(Object.fromEntries(Object.entries(applied).sort((a,b) => b[1]-a[1]).slice(0,5000)))); } catch { /* Native progress remains durable. */ }
}
