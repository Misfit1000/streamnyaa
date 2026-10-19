import type { DesktopWatchProgressRecord, LocalPlaybackSource } from './desktop';

export type HistoryEpisode = {
  identity: string; animeId: string; title: string; poster?: string; episode: string;
  positionSeconds: number; durationSeconds?: number; progressPercent?: number;
  watchedCoverage?: DesktopWatchProgressRecord['watchedCoverage']; completed?: boolean;
  firstPlayedAt?: number; lastPlayedAt: number; updatedAt: number; epoch: number;
  source?: LocalPlaybackSource | null;
};
export type TrackingMarker = { episode: string; watched: boolean; epoch: number; updatedAt: number };
export type AnimeTrackingSummary = {
  identity: string; metadata: { animeId?: string; title?: string; poster?: string; totalEpisodes?: number; latestAired?: number; finished?: boolean };
  explicitStatus?: string | null; status: string; caughtUp: boolean; markers: TrackingMarker[];
  lastPlayedAt: number; revision: number; resume?: HistoryEpisode | null;
};
export type HistoryPage<T> = { items: T[]; total: number; nextOffset: number | null };
export type HistoryOperation = { sequence: number; operationId: string; identity: string; kind: string; [key: string]: unknown };
const EVENT = 'streamnyaa:history-archive';
let owner = '', initialized = false, epoch = 0;
let writes = Promise.resolve();
let recent: HistoryEpisode[] = [];
const titles = new Map<string, AnimeTrackingSummary>();
const hydrated = new Map<string,HistoryEpisode>();
let failure = '';
function invoke() { return typeof window === 'undefined' ? undefined : window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke; }
export function historyArchiveReady() { return initialized; }
export function historyArchiveOwner() { return owner; }
export function historyArchiveError() { return failure; }
function publish() {
  window.dispatchEvent(new Event(EVENT));
  window.dispatchEvent(new Event('streamnyaa:local-playback-history'));
  window.dispatchEvent(new Event('streamnyaa:desktop-watch-progress'));
}
export function subscribeHistoryArchive(listener: () => void) {
  window.addEventListener(EVENT, listener); return () => window.removeEventListener(EVENT, listener);
}
export function historyIdentity(value: any): string {
  if (typeof value?.identity === 'string' && /^(mal|anilist|legacy):/.test(value.identity)) return value.identity;
  if (Number(value?.mal_id) > 0) return `mal:${value.mal_id}`;
  if (Number(value?.anilist_id) > 0) return `anilist:${value.anilist_id}`;
  // An unqualified old ID is retained as legacy, never guessed to be AniList/MAL.
  const key = String(value?.animeId ?? value?.id ?? value?.animeTitle ?? value?.title ?? '').trim();
  return /^(mal|anilist|legacy):/.test(key) ? key : `legacy:${key}`;
}
export function historyAnime(value:Partial<LocalPlaybackSource>) {
  const id=historyIdentity(value),title=value.animeTitle || value.title;
  return id.startsWith('anilist:')?{anilist_id:id.slice(8),title}:id.startsWith('mal:')?{mal_id:id.slice(4),title}:{mal_id:value.animeId,title};
}
export async function historyRequest<T>(action: string, request: Record<string, unknown> = {}): Promise<T> {
  const bridge = invoke(); if (!bridge) throw new Error('The local history archive requires StreamNyaa Desktop.');
  return bridge<T>('history_store', { action, request: { ...request, owner } });
}
export function historySource(record: HistoryEpisode): LocalPlaybackSource {
  return { ...(record.source || { magnet: '', title: record.title }), identity: record.identity,
    animeId: record.animeId, animeTitle: record.title, poster: record.poster, episode: record.episode,
    resumeSeconds: record.positionSeconds, durationSeconds: record.durationSeconds,
    progressPercent: record.progressPercent, watchedCoverage: record.watchedCoverage, completed: record.completed,
    savedAt: record.lastPlayedAt, progressUpdatedAt: record.updatedAt, trackingEpoch: record.epoch };
}
export function historyProgress(record: HistoryEpisode): DesktopWatchProgressRecord {
  return { ...record, trackingEpoch: record.epoch };
}
export function archiveRecentSources() { return recent.map(historySource); }
export function archiveProgress() { return [...new Map([...recent,...hydrated.values()].map(r=>[`${r.identity}:${r.episode}`,r])).values()].map(historyProgress); }
export function archiveTitles() { return [...titles.values()]; }
export function archiveTitle(value: any) { return titles.get(historyIdentity(value)); }
export function archiveEpoch(value: any, episode: string | number) {
  const t = archiveTitle(value); return Math.max(0, ...(t?.markers || []).filter(m => m.episode === '*' || m.episode === String(episode)).map(m => m.epoch));
}
function remember(records: HistoryEpisode[]) {
  const current = new Map(recent.map(record => [`${record.identity}::${record.episode}`, record]));
  for (const r of records) current.set(`${r.identity}::${r.episode}`, r);
  recent = [...current.values()].sort((a,b) => b.lastPlayedAt-a.lastPlayedAt).slice(0,200);
}
export async function refreshHistoryProjection() {
  if (!initialized) return;
  const ticket = epoch;
  const page = await historyRequest<HistoryPage<HistoryEpisode>>('page', { limit: 100 });
  if (ticket !== epoch) return;
  recent = page.items;
  const keys=[...titles.keys()],episodes=[...hydrated.values()];
  if(keys.length || episodes.length){
    const models=await historyRequest<any[]>('readModel',{requests:[...keys.map(identity=>({action:'title',identity})),...episodes.map(v=>({action:'episode',identity:v.identity,episode:v.episode}))]});
    if(ticket!==epoch)return;
    keys.forEach((id,index)=>{if(models[index])titles.set(id,models[index]);else titles.delete(id);});
    hydrated.clear();for(const result of models.slice(keys.length))if(result?.record)hydrated.set(`${result.record.identity}:${result.record.episode}`,result.record);
  }
  publish();
}
export async function hydrateHistoryTitle(anime: any) {
  if (!initialized) return;
  await flushHistoryWrites();
  const ticket=epoch, identity=historyIdentity(anime);
  const t = await historyRequest<AnimeTrackingSummary | null>('title', {identity});
  if (ticket!==epoch || !t) return;
  titles.set(identity,t); if(titles.size>200) titles.delete(titles.keys().next().value!);
  if(t.resume) remember([t.resume]); publish();
}
export async function hydrateHistoryEpisode(anime: any, episode: string | number) {
  if (!initialized) return;
  await flushHistoryWrites();
  const ticket=epoch;
  const r = await historyRequest<{record: HistoryEpisode | null}>('episode',{identity:historyIdentity(anime),episode:String(episode)});
  if(ticket===epoch && r.record) { const key=`${r.record.identity}:${r.record.episode}`;hydrated.set(key,r.record);if(hydrated.size>200)hydrated.delete(hydrated.keys().next().value!);publish(); }
}
export function toHistoryEpisode(value: DesktopWatchProgressRecord | LocalPlaybackSource): HistoryEpisode {
  const source = 'magnet' in value ? value : null;
  const v = value as DesktopWatchProgressRecord & LocalPlaybackSource;
  return { identity: historyIdentity(value), animeId: String(v.animeId || v.animeTitle || v.title), title: source ? v.animeTitle || v.title : v.title,
    poster: v.poster || v.image, episode: String(v.episode || 1), positionSeconds: Math.max(0,Number(source ? v.resumeSeconds || 0 : v.positionSeconds || 0)),
    durationSeconds:v.durationSeconds, progressPercent:v.progressPercent, completed:v.completed, watchedCoverage:v.watchedCoverage,
    updatedAt: Number(source ? v.progressUpdatedAt || v.savedAt || 0 : v.updatedAt || 0), lastPlayedAt:Number(v.lastPlayedAt || (source ? v.progressUpdatedAt || v.savedAt || 0 : v.updatedAt || 0)),
    epoch: v.trackingEpoch ?? archiveEpoch(value,v.episode || 1), source };
}
const pending = new Map<string, {action:string;request:Record<string,unknown>;owner:string}>();
let retry: ReturnType<typeof setTimeout> | undefined;
export function queueHistoryWrite(action: string, request: Record<string, unknown>, key: string = crypto.randomUUID()): void {
  pending.set(`${owner}:${key}`, {action,request,owner});
  writes = writes.then(async () => {
    for (const [id, op] of pending) {
      if (op.owner !== owner) continue;
      try {
        await historyRequest(op.action,op.request);
        if(pending.get(id)===op) pending.delete(id);
        failure='';
      } catch(error) { failure=String(error instanceof Error ? error.message : error); publish(); break; }
    }
    if ([...pending.values()].some(op=>op.owner===owner) && !retry) retry=setTimeout(()=>{retry=undefined;queueHistoryWrite('migrationState',{},'retry');},5000);
  }).catch(error=>{failure=String(error);publish();});
}
export async function flushHistoryWrites() { await writes; if(failure) throw new Error(failure); }
export function saveArchiveEpisode(value: DesktopWatchProgressRecord | LocalPlaybackSource) {
  if((value.trackingEpoch || 0)<archiveEpoch(value,value.episode || 1))return;
  const r=toHistoryEpisode(value); remember([r]);
  queueHistoryWrite('upsert',{records:[r]},`episode:${r.identity}:${r.episode}`);
  publish();
}
export async function initializeHistoryArchive(nextOwner: string,projectionSnapshot?:string|null) {
  if (!invoke()) return;
  await writes;
  const ticket=++epoch; owner=nextOwner; initialized=false; recent=[];titles.clear();hydrated.clear();
  await invoke()!('set_playback_progress_owner',{owner});
  const read=(key:string) => { try {const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[];}catch{return [];} };
  const projection=projectionSnapshot===undefined?localStorage.getItem('streamnyaa.desktop.accountProjectionOwner.v1'):projectionSnapshot;
  const projectionOwner=projection==='__guest__'?'':projection;
  const records:HistoryEpisode[]=[];
  // Only the owner of the old projection may import it. Guest data never silently changes accounts.
  if(projectionOwner===owner || projectionOwner==null && owner==='') {
    records.push(...read('streamnyaa.localPlaybackHistory').map(toHistoryEpisode));
    records.push(...read('streamnyaa.desktop.watchProgress.v1').map(toHistoryEpisode));
    const tracking=read('streamnyaa.desktop.watchedSeries.v1').map(v=>({identity:historyIdentity(v),metadata:{animeId:String(v.animeId),title:v.title,poster:v.poster},lastPlayedAt:Number(v.updatedAt)||0}));
    const organization=JSON.parse(localStorage.getItem('streamnyaa.desktop.libraryOrganization.v1')||'{}');
    const scopedOrganization=`streamnyaa.desktop.libraryOrganization.v1:${owner || '__guest__'}`;
    if(localStorage.getItem(scopedOrganization)===null)localStorage.setItem(scopedOrganization,JSON.stringify(organization));
    for(const [id,value] of Object.entries(organization.entries || {}) as [string,any][]){
      const previous=tracking.find(t=>t.identity===id || t.identity===`legacy:${id.split(':').slice(1).join(':')}`);
      if(previous) Object.assign(previous,{explicitStatus:value.status});
      else tracking.push({identity:id.startsWith('title:')?`legacy:${id}`:id,metadata:{animeId:id.split(':').slice(1).join(':'),title:id,poster:undefined},lastPlayedAt:0,explicitStatus:value.status} as any);
    }
    await historyRequest('importTracking',{records:tracking});
  }
  try {
    const journal=JSON.parse(localStorage.getItem(`streamnyaa.desktop.accountSync.v2.${owner || '__guest__'}`)||'{}');
    for(const v of Object.values(journal.watchHistory || {}) as any[]) if(!v.deletedAt && v.animeTitle && v.episode!=null) records.push(toHistoryEpisode({animeId:v.animeId || v.animeTitle,title:v.animeTitle,episode:v.episode,poster:v.poster,positionSeconds:v.positionSeconds,durationSeconds:v.durationSeconds,progressPercent:v.watchedPercent,completed:v.completed,watchedCoverage:v.watchedCoverage,updatedAt:Date.parse(v.updatedAt)||0}));
  } catch { /* The original journal remains intact. */ }
  records.sort((a,b)=>a.updatedAt-b.updatedAt);
  for(let offset=0;offset<records.length;offset+=500) {
    const batch=records.slice(offset,offset+500);
    const result=await historyRequest<{saved:number}>('import',{records:batch,migration:`legacy-v1:${offset}`});
    if(result.saved!==batch.length) throw new Error('History migration could not verify the imported records.');
  }
  const snapshot=await invoke()!<{records:any[]}>('get_playback_checkpoints',{owner});
  const checkpoints=(snapshot?.records || []).filter(r=>r.context?.owner===owner).map(r=>toHistoryEpisode({identity:r.context.identity || undefined,animeId:r.context.animeId,title:r.context.title,episode:r.context.episode,poster:r.context.poster,positionSeconds:r.coverage.lastPosition,durationSeconds:r.coverage.duration,watchedCoverage:r.coverage,completed:r.completed,updatedAt:r.updatedAt,trackingEpoch:r.context.trackingEpoch || 0}));
  for(let offset=0;offset<checkpoints.length;offset+=500) await historyRequest('import',{records:checkpoints.slice(offset,offset+500)});
  const currentOrganization=JSON.parse(localStorage.getItem(`streamnyaa.desktop.libraryOrganization.v1:${owner || '__guest__'}`)||'{}');
  for(const [id,entry]of Object.entries(currentOrganization.entries || {}) as [string,any][])if(entry?.revision && ['Bookmarked','Watching','Completed','On hold','Dropped'].includes(entry.status))await historyRequest('status',{identity:id.startsWith('title:')?`legacy:${id}`:id,status:entry.status,revision:entry.revision});
  const removedStatuses=JSON.parse(localStorage.getItem(`streamnyaa.desktop.libraryOrganization.v1:${owner || '__guest__'}:removed`)||'{}');
  for(const [id,revision]of Object.entries(removedStatuses))if(!currentOrganization.entries?.[id])await historyRequest('status',{identity:id.startsWith('title:')?`legacy:${id}`:id,status:'',revision});
  if(ticket!==epoch)return;
  const page=await historyRequest<HistoryPage<HistoryEpisode>>('page',{limit:100});
  if(!Array.isArray(page?.items))throw new Error('The native history archive returned an incomplete snapshot.');
  recent=page.items;initialized=true;failure='';publish();
  window.dispatchEvent(new Event('streamnyaa:history-ready'));
  // Bounded legacy projections remain available to older backup readers; archive rows are authoritative.
}
let initialization: {owner:string;promise:Promise<void>} | undefined;
export function ensureHistoryArchive(nextOwner:string):Promise<void> {
  if(initialized && owner===nextOwner)return Promise.resolve();
  if(initialization?.owner===nextOwner)return initialization.promise;
  const previous=initialization?.promise.catch(()=>undefined) || Promise.resolve();
  const projection=localStorage.getItem('streamnyaa.desktop.accountProjectionOwner.v1');
  const promise=previous.then(()=>initializeHistoryArchive(nextOwner,projection));
  initialization={owner:nextOwner,promise};
  void promise.finally(()=>{if(initialization?.promise===promise)initialization=undefined;}).catch(()=>undefined);
  return promise;
}

export async function setArchiveEpisodeWatched(anime:any,episode:number,watched:boolean) {
  await historyRequest('watch',{identity:historyIdentity(anime),episode:String(episode),watched,metadata:{title:anime.title,animeId:String(anime.mal_id || anime.anilist_id || anime.id || ''),poster:anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url}});
  recent=recent.filter(r=>!(r.identity===historyIdentity(anime)&&r.episode===String(episode)));
  await hydrateHistoryTitle(anime); publish();window.dispatchEvent(new Event('streamnyaa:history-sync-now'));
}
export function updateArchiveMetadata(anime:any,latestAired?:number) {
  if(!initialized || !anime)return;
  const identity=historyIdentity(anime);
  const aliases=[anime.mal_id,anime.anilist_id].filter(Boolean);
  for(const id of aliases) queueHistoryWrite('alias',{identity,from:`legacy:${id}`,titles:[anime.title,anime.title_english,anime.title_romaji,anime.title_japanese,...(anime.title_synonyms || [])].filter(v=>typeof v==='string')},`alias:${id}`);
  if(anime.mal_id && anime.anilist_id)queueHistoryWrite('alias',{identity,from:`anilist:${anime.anilist_id}`,providerVerified:true,titles:[anime.title,anime.title_english,anime.title_romaji,anime.title_japanese,...(anime.title_synonyms || [])].filter(v=>typeof v==='string')},`provider-alias:${anime.anilist_id}`);
  const metadata={animeId:String(anime.mal_id || anime.anilist_id || anime.id || ''),title:anime.title || anime.title_english || anime.title_romaji,poster:anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || anime.coverImage?.extraLarge,totalEpisodes:Number(anime.episodes)||undefined,latestAired:latestAired || undefined,finished:['Finished Airing','FINISHED'].includes(anime.status)};
  queueHistoryWrite('metadata',{identity,metadata},`metadata:${identity}`);
}
export async function resetArchiveTracking(value:any) {
  await flushHistoryWrites();
  await historyRequest('reset',{identity:historyIdentity(value),metadata:{title:value.animeTitle || value.title,animeId:String(value.animeId || '')}});
  hydrated.clear();await refreshHistoryProjection();await hydrateHistoryTitle(value);
  window.dispatchEvent(new Event('streamnyaa:history-sync-now'));
}
export async function clearArchiveHistory(request:Record<string,unknown>={}) {
  await flushHistoryWrites(); await historyRequest('clear',request); await refreshHistoryProjection();window.dispatchEvent(new Event('streamnyaa:history-sync-now'));
}
