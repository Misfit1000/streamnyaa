import {describe,it,expect} from 'vitest';
import {recentReleaseCandidates,isRecentReleasePage,releaseTimingLabel} from '../../src/lib/recentReleases';
import {releaseFeedItems} from '../../src/lib/useRecentReleaseFeed';
import {episodeNavigation} from '../../src/lib/animeEpisodes';
import type {CalendarRecord} from '../../src/lib/calendarModel';
const before=Math.floor(Date.now()/1000),now=before*1000;
const row=(episode=1,track='original',at=now-3600000,id=1):CalendarRecord=>({canonicalId:`anilist:${id}`,anilist_id:id,title:`Title ${id}`,airingEpisode:episode,airingAt:at,releaseTrack:track as any,scheduleStatus:'scheduled',scheduleFetchedAt:now,scheduleId:`anilist:${id}:episode-${episode}:${track}`,scheduleProvider:track==='original'?'anilist':'animeschedule',type:'TV'});
describe('Sub-timed episode eligibility',()=>{
 it('uses exactly the 45 minute boundary and labels the estimate',()=>{
  const original=row(1,'original',now-45*60000);expect(recentReleaseCandidates([original],before-1).data).toHaveLength(0);
  const result=recentReleaseCandidates([original],before).data[0];expect(result.releaseAt).toBe(now);expect(result.timingBasis).toBe('estimated-sub');expect(releaseTimingLabel(result)).toBe('Estimated Sub window');
 });
 it('waits for confirmed Sub even when original and estimate have passed',()=>{
  const values=[row(),row(1,'sub',now+3600000)];expect(recentReleaseCandidates(values,before).data).toHaveLength(0);expect(recentReleaseCandidates(values,before).nextBoundaryAt).toBe(now+3600000);
 });
 it('selects the latest due Sub episode, preserving original broadcast counts and dates',()=>{
  const values=[row(2),row(2,'sub',now-1800000),row(3),row(3,'sub',now+100000)];
  const item=recentReleaseCandidates(values,before).data[0];expect(item.releaseEpisode).toBe(2);expect(item.broadcastLatestEpisode).toBe(3);expect(item.airingAt).toBe(values[0].airingAt);
 });
 it('never estimates Dub, unpublished coverage, or explicitly blocked Sub',()=>{
  expect(recentReleaseCandidates([row()],before,'dub').data).toHaveLength(0);expect(recentReleaseCandidates([row()],before,'sub',false).data).toHaveLength(0);
  for(const status of ['delayed','postponed','cancelled','on_break','suspended'])expect(recentReleaseCandidates([row(),{...row(1,'sub',0),scheduleStatus:status}],before).data).toHaveLength(0);
 });
 it('accepts valid revised times and later Sub for an older original, excluding stale unrelated rows',()=>{
  const original=row(1,'original',now-8*86400000),sub={...row(1,'sub',now-1000),previousAiringAt:now-86400000,scheduleStatus:'delayed'};
  expect(recentReleaseCandidates([original,sub],before).data[0].releaseEpisode).toBe(1);
  expect(recentReleaseCandidates([row(1,'original',now-9*86400000)],before).data).toHaveLength(0);
 });
 it('retains confirmed time through a failed refresh and rejects unresolved/conflicting identities',()=>{
  const confirmed=row(1,'sub',now+3600000);expect(recentReleaseCandidates([row(),confirmed,{...confirmed,airingAt:0,scheduleFetchedAt:now+1}],before).data).toHaveLength(0);
  expect(recentReleaseCandidates([{...row(),anilist_id:undefined,canonicalId:'animeschedule:unknown'}],before).data).toHaveLength(0);
 });
 it('deduplicates a title and replaces partial build pages without mixing snapshot order',()=>{
  const a=recentReleaseCandidates([row(),row(2)],before).data,base={version:1,before,track:'sub',complete:false,stale:false,fetchedAt:now,page:1} as const;
  expect(a).toHaveLength(1);expect(releaseFeedItems([{...base,data:a},{...base,data:[]},{...base,page:2,data:a}])).toEqual(a);
  expect(isRecentReleasePage({...base,data:a})).toBe(true);expect(isRecentReleasePage({...base,data:[{...a[0],releaseAt:now+1}]})).toBe(false);
 });
});
describe('canonical episode navigation',()=>{
 it('caps a movie with unpublished titles at one, including invalid URLs and batch contamination',()=>{
  for(const total of [null,1])expect(episodeNavigation({format:'MOVIE',episodes:total},null,12,[2,10])).toMatchObject({selected:1,count:1,limit:1,singlePart:true,hasNext:false,sourceEpisodes:[]});
 });
 it('preserves confirmed multi-part movies and incomplete ongoing series navigation',()=>{
  expect(episodeNavigation({type:'MOVIE',episodes:3},null,2,[4])).toMatchObject({count:3,selected:2,hasNext:true});
  expect(episodeNavigation({type:'TV',status:'RELEASING'},null,99,[100])).toMatchObject({count:100,selected:99,limit:null});
  expect(episodeNavigation({type:'TV',status:'FINISHED',episodes:12},null,80,[30])).toMatchObject({count:12,selected:12,hasNext:false});
 });
});
