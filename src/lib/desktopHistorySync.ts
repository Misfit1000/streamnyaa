import { accountHistoryV3, fetchLegacyHistoryRows } from './accountSync';
import type { AuthSession } from './supabaseAuth';
import { flushHistoryWrites, historyRequest, refreshHistoryProjection, toHistoryEpisode, type HistoryEpisode, type HistoryOperation } from './desktopHistoryArchive';

export function historySyncDeviceId() {
  const key='streamnyaa.historySync.device.v3';let id=localStorage.getItem(key);
  if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}return id;
}
export async function syncDesktopHistory(session:AuthSession,isCurrent:()=>boolean) {
  await flushHistoryWrites();if(!isCurrent())return;
  const deviceId=historySyncDeviceId();
  let cursor=await historyRequest<number>('cursor');
  let response=await accountHistoryV3(session,{action:'read',cursor});
  if(!isCurrent())return;
  if(response?.version!==3)throw new Error('Cloud history is waiting for the version 3 database update. Full history remains on this device.');
  if(!response.migrated){
    const archivedFingerprint=response.legacyFingerprint;
    const rows=await fetchLegacyHistoryRows(session);if(!isCurrent())return;
    for(let offset=0;offset<rows.length;offset+=500){
      const batch=rows.slice(offset,offset+500);
      const saved=await historyRequest<{saved:number}>('archiveRaw',{key:`cloud-legacy:${offset}`,rows:batch});
      if(saved.saved!==batch.length)throw new Error('Cloud history was not fully archived. Its retention has not changed.');
      if(!isCurrent())return;
      const records:HistoryEpisode[]=batch.filter(r=>!r.deleted_at && r.anime_title && r.episode!=null).map(r=>toHistoryEpisode({animeId:r.anime_id || r.anime_title,title:r.anime_title,episode:r.episode,poster:r.poster_url,positionSeconds:Number(r.resume_seconds)||0,durationSeconds:Number(r.duration_seconds)||0,progressPercent:Number(r.progress_percent)||0,completed:Boolean(r.completed),watchedCoverage:r.source?.watchedCoverage,updatedAt:Date.parse(r.updated_at)||0}));
      await historyRequest('import',{records});if(!isCurrent())return;
    }
    response=await accountHistoryV3(session,{action:'migrate',archivedCount:rows.length,archivedFingerprint,cursor});
    if(!isCurrent())return;
  }
  await historyRequest('bootstrap');
  if(!isCurrent())return;
  // Persist acknowledgements and remote changes together. Never clear an unsent operation.
  let pass=0;
  while(pass++<50){
    const operations=await historyRequest<HistoryOperation[]>('outbox',{deviceId});
    if(!isCurrent())return;
    if(!operations.length)break;
    response=await accountHistoryV3(session,{action:'apply',deviceId,operations,cursor});
    if(!isCurrent())return;
    await historyRequest('cloudApply',{...response,through:response.acknowledgedThrough});
    cursor=await historyRequest<number>('cursor');
  }
  // A pending local edit can deliberately hold the cursor behind a remote page.
  // Bound this pass and retry later rather than refetching that page forever.
  let pullPass=0;
  do {
    if(!isCurrent())return;
    const previousCursor=cursor;
    await historyRequest('cloudApply',response);
    cursor=await historyRequest<number>('cursor');
    if(!response.hasMore)break;
    if(cursor<=previousCursor || ++pullPass>=50)throw new Error('History sync has more saved changes to reconcile. It will continue on the next pass.');
    response=await accountHistoryV3(session,{action:'read',cursor});
  }while(isCurrent());
  if(isCurrent()){await historyRequest('cloudApplied');await refreshHistoryProjection();}
}
