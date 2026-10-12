import { cleanup, renderHook, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../src/api/nyaa', () => ({ searchNyaa: vi.fn(async () => Object.assign([], { complete: true, fetchedAt: Date.now() })) }));
vi.mock('../../src/lib/desktopDownloads', () => ({ getDownloadQueue: vi.fn(async () => ({ items: [] })), getOfflineFiles: vi.fn(async () => []), listenDownloadsChanged: vi.fn(async () => () => {}) }));
import { searchNyaa } from '../../src/api/nyaa';
import { getDownloadQueue, getOfflineFiles } from '../../src/lib/desktopDownloads';
import { homeReadyEpisodes, sourceAvailabilityEvidence, chooseReadyEpisode, useDesktopHomeReadiness } from '../../src/lib/desktopHomeReadiness';
import { selectSourceMode } from '../../src/lib/desktopSourceSelection';
const anime = { anilist_id: 123, mal_id: 456, title: 'Example Season 2', type: 'TV' };
const source = { infoHash: 'a'.repeat(40), title: '[Group] Example S02E03 [1080p]', nativeEvidence: 'exact', rawSeeders: 5 } as any;
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false); });
afterEach(() => { cleanup(); localStorage.clear(); });
describe('positive Home readiness', () => {
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
});
it('widens source coverage without promoting uncertain identity or ignoring audio',()=>{
 const rows=[{id:'strong',title:'Show 01',matchTier:'exact',playable:true,score:90}, {id:'safe',title:'Show 01',matchTier:'exact',playable:true,score:55}, {id:'uncertain',title:'Show 01',matchTier:'broad',playable:false,manualOnly:true,score:99}, {id:'failed',title:'Show 01',matchTier:'exact',playable:true,score:90}, {id:'dub',title:'Show 01 English Dub',matchTier:'exact',playable:true,score:90}, {id:'conflict',title:'Show S01E01',matchTier:'rejected',playable:false,score:99}];
 const select=(mode:'strict'|'balanced'|'broad')=>selectSourceMode(rows,mode,'sub',row=>row.score,row=>row.id==='failed');
 expect(select('strict').map(x=>x.id)).toEqual(['strong']);expect(select('balanced').map(x=>x.id)).toEqual(['strong','safe']);
 expect(select('broad').map(x=>x.id)).toEqual(['strong','safe','uncertain','failed']);
 expect(select('broad').filter(x=>x.playable&&!x.manualOnly&&x.id!=='failed').map(x=>x.id)).toEqual(['strong','safe']);
});
