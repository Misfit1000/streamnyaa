import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { groupScheduleEpisodes, scheduleArtworkCandidates } from '../../src/lib/desktopSchedulePresentation';
import { applyScheduleAlertState, readScheduleAlertState, startScheduleAlertBridge } from '../../src/lib/desktopScheduleAlerts';
import { exportDesktopSettingsBackup } from '../../src/lib/desktop';
import DesktopScheduleArtwork from '../../src/components/DesktopScheduleArtwork';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('groups the same episode while retaining independent release times and delivery identities',()=>{
  const common={anilist_id:1,mal_id:10,title:'Series',airingEpisode:9};
  const rows=[{...common,releaseTrack:'original',airingAt:100,scheduleStatus:'delayed'},
    {...common,releaseTrack:'sub',airingAt:120,scheduleStatus:'rescheduled'},
    {...common,releaseTrack:'dub',airingAt:200,scheduleStatus:'scheduled'},
    {...common,airingEpisode:10,releaseTrack:'original'}];
  const groups=groupScheduleEpisodes(rows);
  expect(groups).toHaveLength(2);expect(groups[0].tracks).toEqual(rows.slice(0,3));
  expect(rows[1].airingAt).toBe(120);
  expect(groupScheduleEpisodes([{...common,anilist_id:10,mal_id:99},{...common}])).toHaveLength(2);
  expect(groupScheduleEpisodes([{...common},{...common,mal_id:99}])).toHaveLength(2);
});
it('deduplicates only the same track and chooses its newest evidence',()=>{
  const row={anilist_id:1,airingEpisode:2,releaseTrack:'sub'};
  expect(groupScheduleEpisodes([{...row,scheduleFetchedAt:200,airingAt:0},{...row,scheduleFetchedAt:100,airingAt:500}])[0].tracks).toEqual([{...row,scheduleFetchedAt:200,airingAt:0}]);
});
it('uses image_url and provider covers, tries another image and shows an accessible placeholder',()=>{
  const row={title:'Chiikawa',image:'https://img.animeschedule.net/cover.jpg',images:{jpg:{image_url:'https://cdn.test/cover.jpg'}}};
  expect(scheduleArtworkCandidates(row)).toEqual(['https://cdn.test/cover.jpg',row.image]);
  const view=render(<DesktopScheduleArtwork anime={row}/>);
  fireEvent.error(view.container.querySelector('img')!);expect(view.container.querySelector('img')?.src).toBe(row.image);
  fireEvent.error(view.container.querySelector('img')!);expect(screen.getByRole('img',{name:'Artwork unavailable for Chiikawa'})).toBeTruthy();
});
it('keeps native persistence authoritative under browser quota failure and exports the live snapshot',()=>{
  const writes=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Quota','QuotaExceededError');});
  const state={version:1,tracks:[{anilist_id:1,airingEpisode:383,title:'Chiikawa'}],changes:[]};
  applyScheduleAlertState(state);expect(writes).not.toHaveBeenCalled();expect(readScheduleAlertState().persistenceError).toBeUndefined();
  const backup=JSON.parse(exportDesktopSettingsBackup());
  expect(JSON.parse(backup.keys['streamnyaa.desktop.schedule-alert-state.v1']).tracks).toEqual(state.tracks);
  applyScheduleAlertState({...state,persistenceError:'Native storage denied'});expect(readScheduleAlertState().persistenceError).toBe('Native storage denied');
  applyScheduleAlertState(state);expect(readScheduleAlertState().persistenceError).toBeUndefined();
});
it('migrates the legacy browser snapshot before an early native publication can remove it',async()=>{
  const legacy={version:1,tracks:[{canonicalId:'anilist:1',anilist_id:1,airingEpisode:1}],changes:[]};
  localStorage.setItem('streamnyaa.desktop.schedule-alert-state.v1',JSON.stringify(legacy));
  const invoke=vi.fn().mockImplementation(async(command,args)=>command==='configure_desktop_schedule_alerts'?args.imported:{version:1,tracks:[],changes:[]});
  window.__TAURI__={core:{invoke},event:{listen:async(_event:any,listener:any)=>{listener({payload:{version:1,tracks:[],changes:[]}});return()=>{};}}} as any;
  try {
    const stop=await startScheduleAlertBridge();
    expect(invoke).toHaveBeenCalledWith('configure_desktop_schedule_alerts',expect.objectContaining({imported:legacy}));
    expect(readScheduleAlertState().tracks).toEqual(legacy.tracks);stop();
  }finally{delete window.__TAURI__;}
});
