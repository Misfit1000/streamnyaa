import { markInterruptedPlayback, clearInterruptedPlayback, readInterruptedPlayback, interruptedSourceKey } from './desktopInterruptedSession';
import { loadLocalPlaybackHistory, saveDesktopWatchProgress, saveLocalPlaybackHistoryItem } from './desktop';
import { mergeCoverage, coveragePercent, type WatchedCoverage } from './desktopCoverage';
export type NativeCheckpoint = {
  version: 1; sessionId: string; generation: number; sequence: number; updatedAt: number;
  context: { owner: string; animeId: string; title: string; episode: string; sourceKey: string; poster?: string; offlineId?: string; offlineFile?: string };
  coverage: Omit<WatchedCoverage, 'version'> & {version?: 2}; completed: boolean; state: string;
};
export function applyNativeCheckpoint(record: NativeCheckpoint, owner: string) {
  if (record.version !== 1 || record.context.owner !== owner || !record.context.animeId || !record.context.episode) return;
  const {context, updatedAt} = record;
  const coverage=mergeCoverage(undefined,record.coverage,record.coverage.duration || 0,record.coverage.furthest);
  const percent=coveragePercent(coverage,coverage.duration || 0);
  saveDesktopWatchProgress({animeId:context.animeId,title:context.title,episode:context.episode,poster:context.poster,
    positionSeconds:coverage.furthest,durationSeconds:coverage.duration,watchedCoverage:coverage,progressPercent:percent,completed:percent>=92,updatedAt});
  const interrupted=readInterruptedPlayback();
  const terminal=record.state==='eof'||record.state==='closed'||percent>=92;
  if(terminal && interrupted?.animeId===context.animeId && interrupted.episode===context.episode) clearInterruptedPlayback(interrupted);
  const existing=loadLocalPlaybackHistory().find(item=>String(item.animeId || item.animeTitle)===context.animeId && String(item.episode)===context.episode);
  if(!terminal && existing && updatedAt>=Date.now()-10_000) markInterruptedPlayback(context.animeId,context.episode,interruptedSourceKey(existing),coverage.furthest,coverage.duration);
  if(existing && (!existing.progressUpdatedAt || existing.progressUpdatedAt<=updatedAt)) saveLocalPlaybackHistoryItem({...existing,
    watchedCoverage:coverage,resumeSeconds:coverage.furthest,durationSeconds:coverage.duration,progressPercent:percent,completed:percent>=92,progressUpdatedAt:updatedAt});
}

export function restoreNativeRecovery(record: NativeCheckpoint,owner:string) {
  if(record.context.owner!==owner)return;
  const source=loadLocalPlaybackHistory().find(item=>String(item.animeId||item.animeTitle)===record.context.animeId && String(item.episode)===record.context.episode);
  if(source && !['eof','closed'].includes(record.state) && !record.completed && record.coverage.furthest>0) {
    markInterruptedPlayback(record.context.animeId,record.context.episode,interruptedSourceKey(source),record.coverage.furthest,record.coverage.duration);
  }
  window.dispatchEvent(new Event('streamnyaa:native-progress-restored'));
}
