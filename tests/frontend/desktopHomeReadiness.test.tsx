import { cleanup, renderHook, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/api/nyaa', () => ({ searchNyaa: vi.fn(async () => Object.assign([], { complete: true, fetchedAt: Date.now() })) }));
vi.mock('../../src/lib/desktopDownloads', () => ({ getDownloadQueue: vi.fn(async () => ({ items: [] })), getOfflineFiles: vi.fn(async () => []), listenDownloadsChanged: vi.fn(async () => () => {}) }));
import { searchNyaa } from '../../src/api/nyaa';
import { getDownloadQueue, getOfflineFiles } from '../../src/lib/desktopDownloads';
import { homeReadyEpisodes, sourceAvailabilityEvidence, chooseReadyEpisode, useDesktopHomeReadiness, homeHistoryAnime, revalidateHomeSourceEvidence, mergeHomeReadinessCandidates } from '../../src/lib/desktopHomeReadiness';
import { recordDesktopAvailability, readDesktopAvailabilityRecords } from '../../src/lib/desktopAvailability';
import { buildSourceIdentity, sourceIdentitySignature } from '../../src/lib/desktopSourceIdentity';
import { desktopWatchPath } from '../../src/lib/desktopAnimeRoute';
import { selectSourceMode } from '../../src/lib/desktopSourceSelection';
const anime = { anilist_id: 123, mal_id: 456, title: 'Example Season 2', type: 'TV' };
const source = { infoHash: 'a'.repeat(40), title: '[Group] Example S02E03 [1080p]', nativeEvidence: 'exact', rawSeeders: 5 } as any;
beforeEach(() => {
 localStorage.clear(); vi.clearAllMocks(); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
 vi.mocked(searchNyaa).mockImplementation(async () => Object.assign([], {complete:true,fetchedAt:Date.now()}) as any);
 vi.mocked(getDownloadQueue).mockResolvedValue({items:[]} as any);
 vi.mocked(getOfflineFiles).mockResolvedValue([]);
});
afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); });
describe('positive Home readiness', () => {
 it('keeps qualified provider identities and the selected episode in history routes', () => {
  const saved={magnet:'magnet',title:'Release',animeTitle:'Example',episode:3};
  expect(homeHistoryAnime({...saved,animeId:'mal:456'}).mal_id).toBe(456);
  expect(homeHistoryAnime({...saved,animeId:456}).mal_id).toBe(456);
  const identity=homeHistoryAnime({...saved,animeId:'anilist:123'});
  expect(identity.anilist_id).toBe(123);expect(identity.mal_id).toBeUndefined();
  expect(desktopWatchPath(identity,{ep:3})).toContain('ep=3');
  expect(homeHistoryAnime({...saved,animeId:'unrelated title'}).mal_id).toBeUndefined();
 });
 it('rejects legacy metadata, stale evidence, wrong identities and upcoming entries', () => {
  const record = sourceAvailabilityEvidence(anime, source, 3, Date.now());
  expect(homeReadyEpisodes(anime, [record], 'sub')).toEqual([3]);
  for (const patch of [{ sourceHash: undefined }, { classifierVersion: 1 }, { expiresAt: Date.now()-1 }, { identitySignature: 'other' }, { status:'unknown' as const }]) expect(homeReadyEpisodes(anime, [{...record,...patch}], 'sub')).toEqual([]);
  expect(homeReadyEpisodes({...anime,status:'NOT_YET_AIRED'}, [record], 'sub')).toEqual([]);
  expect(homeReadyEpisodes({...anime,anilist_id:124,mal_id:457}, [record], 'sub')).toEqual([]);
  expect(homeReadyEpisodes(anime, [record], 'dub')).toEqual([]);
 });
 it('prefers a ready resume, otherwise the lowest available episode', () => {
  expect(chooseReadyEpisode([1,3,5],3)).toBe(3); expect(chooseReadyEpisode([1,3,5],4)).toBe(1);
  expect(chooseReadyEpisode([],4)).toBeUndefined();
 });
 it('limits one shared pass to sixteen requests and does not overlap requests', async () => {
  let active=0,maximum=0;
  vi.mocked(searchNyaa).mockImplementation(async () => { active++;maximum=Math.max(maximum,active);await Promise.resolve();active--;return Object.assign([],{complete:true,fetchedAt:Date.now()}) as any; });
  const candidates=Array.from({length:20},(_,i)=>({mal_id:10000+i,title:`Fixture ${i}`}));
  const hook=renderHook(()=>useDesktopHomeReadiness(candidates,'sub-preferred'));
  await waitFor(()=>expect(searchNyaa).toHaveBeenCalledTimes(16));
  await waitFor(()=>expect(hook.result.current.checking).toBe(false));expect(maximum).toBe(1);
  expect(hook.result.current.visible(candidates[0])).toBe(false);
 });
 it('checks an advertised episode even when another episode is already available', async () => {
  vi.mocked(searchNyaa).mockResolvedValue(Object.assign([source],{complete:true,fetchedAt:Date.now()}) as any);
  const candidates=[{...anime,homeRequiredEpisode:4}];
  const hook=renderHook(()=>useDesktopHomeReadiness(candidates,'sub-preferred'));
  await waitFor(()=>expect(searchNyaa).toHaveBeenCalled());
  expect(vi.mocked(searchNyaa).mock.calls[0][4]?.intent).toEqual({scope:'episode',episode:4});
  await waitFor(()=>expect(hook.result.current.checking).toBe(false));
  expect(hook.result.current.episodesFor(anime)).toEqual([]);
 });
 it('requires native existing-file verification for offline readiness', async () => {
  vi.mocked(getDownloadQueue).mockResolvedValue({items:[{id:'download',state:'completed',episodeLinks:{'episode.mkv':{animeId:'mal:456',episode:3}}}]} as any);
  vi.mocked(getOfflineFiles).mockResolvedValue([]);
  const candidates:any[]=[];const hook=renderHook(()=>useDesktopHomeReadiness(candidates,'sub-preferred'));
  await waitFor(()=>expect(getOfflineFiles).toHaveBeenCalled());expect(hook.result.current.episodesFor(anime)).toEqual([]);
  vi.mocked(getOfflineFiles).mockResolvedValue(['episode.mkv']);act(()=>window.dispatchEvent(new Event('focus')));
  await waitFor(()=>expect(hook.result.current.episodesFor(anime)).toEqual([3]));
 });
 it('continues beyond the first eight titles and rotates across bounded passes', async () => {
  vi.useFakeTimers();
  const candidates=Array.from({length:24},(_,i)=>({mal_id:20000+i,title:`Rotation Fixture ${i} Series`}));
  const hook=renderHook(()=>useDesktopHomeReadiness(candidates,'sub-preferred'));
  await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
  expect(searchNyaa).toHaveBeenCalledTimes(16);
  expect(hook.result.current.checking).toBe(false);
  await act(async()=>{await vi.advanceTimersByTimeAsync(59_999);});
  expect(searchNyaa).toHaveBeenCalledTimes(16);
  await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
  expect(searchNyaa).toHaveBeenCalledTimes(32);
  const queries=new Set(vi.mocked(searchNyaa).mock.calls.map(call=>call[0]));
  expect(queries.size).toBe(24);
  expect(hook.result.current.pendingTitles).toBe(24);
 });
 it('keeps an in-flight check alive when another shelf or candidate becomes visible', async () => {
  let finish!: (value:any)=>void;
  vi.mocked(searchNyaa).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const first={mal_id:30001,title:'Stable Shelf Example'};
  const hook=renderHook(({candidates})=>useDesktopHomeReadiness(candidates,'sub-preferred'),{initialProps:{candidates:[first]}});
  await waitFor(()=>expect(searchNyaa).toHaveBeenCalledTimes(1));
  const signal=vi.mocked(searchNyaa).mock.calls[0][4]!.signal!;
  hook.rerender({candidates:[first,{mal_id:30002,title:'Later Shelf Example'}]});
  expect(signal.aborted).toBe(false);
  await act(async()=>{finish(Object.assign([],{complete:true,fetchedAt:Date.now()}));});
  await waitFor(()=>expect(hook.result.current.checking).toBe(false));
  expect(vi.mocked(searchNyaa).mock.calls.some(call=>call[0]==='Later Shelf Example')).toBe(true);
 });
 it('reuses Watch evidence after local identity revalidation without refreshing its timestamp', async () => {
  const checkedAt=Date.now()-180_000;
  const watchAnime={...anime,synonyms:['Example Second Season']};
  recordDesktopAvailability(sourceAvailabilityEvidence(watchAnime,source,3,checkedAt),false);
  const hook=renderHook(()=>useDesktopHomeReadiness([anime],'sub-preferred'));
  await waitFor(()=>expect(hook.result.current.episodesFor(anime)).toEqual([3]));
  expect(searchNyaa).not.toHaveBeenCalled();
  const saved=readDesktopAvailabilityRecords()[0];
  expect(saved.checkedAt).toBe(checkedAt);
  expect(saved.expiresAt).toBe(checkedAt+20*60_000);
  expect(saved.identitySignature).toBe(sourceIdentitySignature(buildSourceIdentity(anime)));
 });
 it('shares readiness between rich catalog cards and sparse recent/history cards for the same entry', async () => {
  const rich={...anime,mal_id:50001,anilist_id:50002,synonyms:['Example Second Season']};
  const sparse={mal_id:50001,anilist_id:50002,title:anime.title,homeRequiredEpisode:3};
  recordDesktopAvailability(sourceAvailabilityEvidence(rich,source,3,Date.now()),false);
  const candidates=[rich,sparse];
  const merged=mergeHomeReadinessCandidates(candidates);
  expect(merged.unique).toHaveLength(2);
  expect(sourceIdentitySignature(buildSourceIdentity(merged.unique[0]))).toBe(sourceIdentitySignature(buildSourceIdentity(merged.unique[1])));
  const hook=renderHook(()=>useDesktopHomeReadiness(candidates,'sub-preferred'));
  await waitFor(()=>expect(hook.result.current.episodesFor(rich)).toEqual([3]));
  expect(hook.result.current.episodesFor(sparse)).toEqual([3]);
  expect(searchNyaa).not.toHaveBeenCalled();
 });
 it('revalidates explicit provider equivalents but rejects conflicting mappings and old installments', async () => {
  const checkedAt=Date.now()-60_000;
  const malOnly={mal_id:456,title:anime.title,type:'TV'};
  const old=sourceAvailabilityEvidence(malOnly,source,3,checkedAt);
  recordDesktopAvailability(old,false);
  await revalidateHomeSourceEvidence(anime,readDesktopAvailabilityRecords());
  expect(homeReadyEpisodes(anime,readDesktopAvailabilityRecords(),'sub')).toEqual([3]);
  localStorage.clear();
  recordDesktopAvailability({...old,anilistId:999},false);
  await revalidateHomeSourceEvidence(anime,readDesktopAvailabilityRecords());
  expect(homeReadyEpisodes(anime,readDesktopAvailabilityRecords(),'sub')).toEqual([]);
  localStorage.clear();
  recordDesktopAvailability({...old,key:'anilist:999:episode-3',animeId:'anilist:999'},false);
  await revalidateHomeSourceEvidence(anime,readDesktopAvailabilityRecords());
  expect(homeReadyEpisodes(anime,readDesktopAvailabilityRecords(),'sub')).toEqual([]);
  localStorage.clear();
  const wrongSource={...source,title:'[Group] Example S01E03 [1080p]'};
  recordDesktopAvailability(sourceAvailabilityEvidence({...anime,title:'Example Season 1'},wrongSource,3,checkedAt),false);
  await revalidateHomeSourceEvidence(anime,readDesktopAvailabilityRecords());
  expect(homeReadyEpisodes(anime,readDesktopAvailabilityRecords(),'sub')).toEqual([]);
 });
 it('accepts a safe positive from a fresh partial response without treating it as an exhaustive search', async () => {
  const partialAnime={mal_id:40001,title:'Partial Result Example',type:'TV'};
  const result={...source,title:'[Group] Partial Result Example - 03 [1080p]'};
  vi.mocked(searchNyaa).mockResolvedValue(Object.assign([result],{complete:false,stale:false,fetchedAt:Date.now()}) as any);
  const hook=renderHook(()=>useDesktopHomeReadiness([partialAnime],'sub-preferred'));
  await waitFor(()=>expect(hook.result.current.episodesFor(partialAnime)).toEqual([3]));
  await waitFor(()=>expect(hook.result.current.checking).toBe(false));
  expect(searchNyaa).toHaveBeenCalledTimes(1);
 });
 it('does not promote stale source results or metadata-only positives', async () => {
  const staleAnime={mal_id:40002,title:'Stale Result Example',type:'TV'};
  const checkedAt=Date.now()-30_000;
  const record=sourceAvailabilityEvidence(staleAnime,{...source,title:'Stale Result Example - 03'},3,checkedAt);
  recordDesktopAvailability({...record,sourceHash:undefined,identitySignature:'older'},false);
  await revalidateHomeSourceEvidence(staleAnime,readDesktopAvailabilityRecords());
  vi.mocked(searchNyaa).mockResolvedValue(Object.assign([{...source,title:'Stale Result Example - 03'}],{complete:false,stale:true,fetchedAt:checkedAt}) as any);
  const hook=renderHook(()=>useDesktopHomeReadiness([staleAnime],'sub-preferred'));
  await waitFor(()=>expect(searchNyaa).toHaveBeenCalled());
  await waitFor(()=>expect(hook.result.current.checking).toBe(false));
  expect(hook.result.current.episodesFor(staleAnime)).toEqual([]);
 });
 it('does not turn route cancellation into a provider cooldown', async () => {
  const candidate={mal_id:40003,title:'Interrupted Check Example'};
  vi.mocked(searchNyaa).mockImplementationOnce((_q,_c,_f,_p,options)=>new Promise((_resolve,reject)=>{
   options!.signal!.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});
  }));
  const first=renderHook(()=>useDesktopHomeReadiness([candidate],'sub-preferred'));
  await waitFor(()=>expect(searchNyaa).toHaveBeenCalledTimes(1));
  first.unmount();
  await act(async()=>{await Promise.resolve();});
  const second=renderHook(()=>useDesktopHomeReadiness([candidate],'sub-preferred'));
  await waitFor(()=>expect(vi.mocked(searchNyaa).mock.calls.length).toBeGreaterThan(1));
  await waitFor(()=>expect(second.result.current.checking).toBe(false));
  expect(vi.mocked(searchNyaa).mock.calls[1][0]).toBe('Interrupted Check Example');
 });
});
it('widens source coverage without promoting uncertain identity or ignoring audio',()=>{
 const rows=[{id:'strong',title:'Show 01',matchTier:'exact',playable:true,score:90}, {id:'safe',title:'Show 01',matchTier:'exact',playable:true,score:55}, {id:'uncertain',title:'Show 01',matchTier:'broad',playable:false,manualOnly:true,score:99}, {id:'failed',title:'Show 01',matchTier:'exact',playable:true,score:90}, {id:'dub',title:'Show 01 English Dub',matchTier:'exact',playable:true,score:90}, {id:'conflict',title:'Show S01E01',matchTier:'rejected',playable:false,score:99}];
 const select=(mode:'strict'|'balanced'|'broad')=>selectSourceMode(rows,mode,'sub',row=>row.score,row=>row.id==='failed');
 expect(select('strict').map(x=>x.id)).toEqual(['strong']);expect(select('balanced').map(x=>x.id)).toEqual(['strong','safe']);
 expect(select('broad').map(x=>x.id)).toEqual(['strong','safe','uncertain','failed']);
 expect(select('broad').filter(x=>x.playable&&!x.manualOnly&&x.id!=='failed').map(x=>x.id)).toEqual(['strong','safe']);
});
