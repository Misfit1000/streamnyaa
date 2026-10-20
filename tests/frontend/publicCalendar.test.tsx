import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { normalizeScheduleTrack, reconcileCalendarRecords, scheduleProviderIds } from '../../src/lib/calendarModel';
import { groupScheduleEpisodes } from '../../src/lib/schedulePresentation';
import DesktopDragRail from '../../src/components/DesktopDragRail';
import ScheduleDelayBadge from '../../src/components/ScheduleDelayBadge';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const now=Date.now(),date=new Date(now).toISOString();
const row={route:'fixture',airType:'dub',episodeNumber:2,airingStatus:'delayed-air',episodeDate:date,delayedUntil:'0001-01-01T00:00:00Z',delayedText:'Dub release delayed',imageVersionRoute:'anime/jpg/fixture.jpg'};
it('retains unknown revised dates and qualifies identity from actual provider links',()=>{
  const normalized=normalizeScheduleTrack(row,{websites:{anilist:'anilist.co/anime/12',mal:'https://myanimelist.net/anime/13'}},now)!;
  expect(normalized).toMatchObject({canonicalId:'anilist:12',anilist_id:12,mal_id:13,airingAt:0,previousAiringAt:Date.parse(date),releaseTrack:'dub',scheduleStatus:'delayed'});
  expect(scheduleProviderIds({websites:{url:'https://anilist.co.evil.test/anime/12'}})).toEqual({});
  expect(scheduleProviderIds({websites:{url:'https://user:password@anilist.co/anime/12'}})).toEqual({});
  expect(normalizeScheduleTrack({...row,airingStatus:undefined,delayedText:'',status:'Delayed'},{},now)).toBeUndefined();
});
it('retains confirmed delays during partial refreshes and never lets originals resolve a dub',()=>{
  const delay=normalizeScheduleTrack(row,{websites:{anilist:'anilist.co/anime/12'}},now)!;
  const original={...delay,releaseTrack:'original' as const,scheduleId:'anilist:12:episode-2:original',scheduleProvider:'anilist' as const,scheduleStatus:'scheduled',airingAt:now/1000};
  expect(reconcileCalendarRecords([delay],[original])).toHaveLength(2);
  expect(reconcileCalendarRecords([delay],[])[0].scheduleStatus).toBe('delayed');
  const resolved=normalizeScheduleTrack({...row,airingStatus:'unaired',delayedText:'',episodeDate:new Date(now+3600000).toISOString()},{websites:{anilist:'anilist.co/anime/12'}},now+1)!;
  expect(reconcileCalendarRecords([delay],[resolved])[0]).toMatchObject({scheduleStatus:'rescheduled',previousAiringAt:Date.parse(date)});
});
it('hydrates exact provider routes without duplicate cards or losing a verified identity',()=>{
  const unresolved=normalizeScheduleTrack(row,{},now)!,linked=normalizeScheduleTrack(row,{websites:{anilist:'anilist.co/anime/12'}},now)!;
  const records=reconcileCalendarRecords([unresolved,linked],[{...unresolved,scheduleFetchedAt:now+1}]);
  expect(records).toHaveLength(1);expect(records[0].anilist_id).toBe(12);expect(groupScheduleEpisodes(records)).toHaveLength(1);
  expect(reconcileCalendarRecords([linked],[{...linked,anilist_id:99,canonicalId:'anilist:99',scheduleId:'anilist:99:episode-2:dub'}])).toHaveLength(2);
});
it('renders every update and supports the last item through keyboard scrolling',()=>{
  const view=render(<DesktopDragRail label="Recent schedule changes" compact>{Array.from({length:20},(_,i)=><div key={i}>Update {i+1}</div>)}</DesktopDragRail>);
  const rail=screen.getByRole('region',{name:'Recent schedule changes'}),scroll=vi.fn();Object.defineProperty(rail,'scrollWidth',{value:4000});Object.defineProperty(rail,'scrollTo',{value:scroll});
  expect(screen.getByText('Update 20')).toBeTruthy();fireEvent.keyDown(rail,{key:'End'});expect(scroll).toHaveBeenCalledWith({left:4000,behavior:'auto'});
  expect(view.container.querySelector('.sn-scroll-rail')).toBeNull();
});
it('keeps the selected badge actual text and outside the artwork filter',()=>{
  const view=render(<ScheduleDelayBadge label="Dub delayed"/>);expect(view.container.querySelector('.sn-schedule-artwork-delay>span')?.textContent).toBe('Dub delayed');expect(view.container.querySelector('img')).toBeNull();
});
