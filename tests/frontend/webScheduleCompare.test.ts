import { expect,it } from 'vitest';
import { normalizeScheduleTrack,reconcileCalendarRecords,type CalendarRecord } from '../../src/lib/calendarModel';
import {isChineseTitle} from '../../src/lib/webSourceProvider';
import { webScheduleSections } from '../../src/lib/webSchedulePresentation';
import { comparisonFacts,comparableFacts,parseCompareIdentity } from '../../src/lib/comparisonFacts';
const now=Date.now(),start=new Date().setHours(0,0,0,0),end=start+86400_000;
const row=(extra:Partial<CalendarRecord>={}):CalendarRecord=>({canonicalId:'anilist:12',anilist_id:12,mal_id:13,title:'Fixture',airingEpisode:4,airingAt:(start+50000)/1000,releaseTrack:'original',scheduleStatus:'scheduled',scheduleFetchedAt:now,scheduleProvider:'anilist',scheduleId:'anilist:12:episode-4:original',...extra});
it('retains explicit timetable origin and genre evidence without guessing from titles',()=>{
 const raw={route:'fixture',episodeNumber:1,airType:'sub',airingStatus:'unaired',episodeDate:new Date().toISOString(),donghua:true};
 const normalized=normalizeScheduleTrack(raw,{websites:{anilist:'https://anilist.co/anime/12'},genres:[{name:'Ecchi'}]},now)!;
 expect(isChineseTitle(normalized)).toBe(true);expect(normalized.genres).toEqual(['Ecchi']);expect(isChineseTitle({title:'Chinese title',type:'ONA'})).toBe(false);
});
it('canonicalizes all aliases before deduplication in every hydration order',()=>{
 const original=row(),pending=row({canonicalId:'animeschedule:fixture',anilist_id:undefined,mal_id:undefined,sourceRoute:'fixture',scheduleProvider:'animeschedule',scheduleId:'animeschedule:fixture:episode-4:original'}),linked={...pending,canonicalId:'anilist:12',anilist_id:12,mal_id:13,scheduleId:original.scheduleId};
 for(const values of [[original,pending,linked],[linked,pending,original],[pending,original,linked]])expect(reconcileCalendarRecords([],values)).toHaveLength(1);
 expect(reconcileCalendarRecords([pending,original],[linked])).toHaveLength(1);
 expect(reconcileCalendarRecords([linked],[{...linked,anilist_id:99,canonicalId:'anilist:99'}])).toHaveLength(2);
});
it('shows a title once with different episode numbers and prioritizes relevant changes',()=>{
 const values=reconcileCalendarRecords([],[row(),row({releaseTrack:'dub',airingEpisode:1,scheduleId:'dub-1'}),row({releaseTrack:'sub',airingEpisode:4,scheduleId:'sub-4',scheduleStatus:'delayed',airingAt:0,previousAiringAt:start+60000})]);
 const sections=webScheduleSections(values,{weekStart:start,weekEnd:end+6*86400_000,dayStart:start,dayEnd:end,today:true,dayLabel:'Today',now},false);
 expect(sections).toHaveLength(1);expect(sections[0].title).toBe('Schedule changes');expect(sections[0].groups).toHaveLength(1);expect(sections[0].groups[0].tracks.map(row=>row.airingEpisode).sort()).toEqual([1,4,4]);
 const tomorrow=webScheduleSections([...values,row({airingAt:(end+30000)/1000,airingEpisode:5,scheduleId:'original-5'})],{weekStart:start,weekEnd:end+6*86400_000,dayStart:end,dayEnd:end+86400_000,today:false,dayLabel:'Tomorrow',now},false);
 expect(tomorrow[0].groups[0].tracks).toHaveLength(1);
});
it('does not render unverified listings as extra cards or mix different installments',()=>{
 const values=[row(),row({canonicalId:'animeschedule:fixture',anilist_id:undefined,mal_id:undefined}),row({canonicalId:'anilist:99',anilist_id:99,mal_id:100})];
 const result=webScheduleSections(values,{weekStart:start,weekEnd:end,dayStart:start,dayEnd:end,today:false,dayLabel:'Today',now},false);
 expect(result[0].groups).toHaveLength(2);
});
it('labels popularity by meaning and never compares unknown or incompatible metrics',()=>{
 const ani=comparisonFacts({anilist_id:1,popularity:5000,score:8.2}),mal=comparisonFacts({mal_id:2,popularity:12,score:8.2});
 expect(ani[1].value).toContain('users');expect(mal[1].value).toContain('Rank #12');expect(comparableFacts(ani[1],mal[1])).toBe(false);expect(comparableFacts(ani[0],mal[0])).toBe(false);expect(comparisonFacts({})[0]).toMatchObject({known:false,value:'Unknown'});
 expect(parseCompareIdentity('anilist:12')?.route).toBe('anilist-12');expect(parseCompareIdentity('12')).toBeUndefined();
});
it('quarantines contradictory verified identities instead of combining their release rows',async()=>{
 const {calendarIdentityCoverage}=await import('../../src/lib/calendarModel');
 const values=reconcileCalendarRecords([],[row(),row({mal_id:99,releaseTrack:'dub',scheduleId:'conflict'})]);
 expect(calendarIdentityCoverage(values).pendingCount).toBe(1);
 expect(webScheduleSections(values,{weekStart:start,weekEnd:end,dayStart:start,dayEnd:end,today:true,dayLabel:'Today',now},false)).toEqual([]);
 expect(values).toHaveLength(2);
});
