import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {QueryClient,QueryClientProvider,focusManager} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
const transport=vi.hoisted(()=>vi.fn());
vi.mock('../../src/api/calendar',()=>({fetchPublicCalendar:transport}));
vi.mock('../../src/components/AnimeCard',()=>({default:({anime}:any)=><p>{anime.title}</p>}));
vi.mock('../../src/components/Seo',()=>({default:()=>null}));vi.mock('../../src/components/AdSenseAd',()=>({default:()=>null}));
import Schedule from '../../src/pages/Schedule';
const clients:QueryClient[]=[];
afterEach(()=>{cleanup();clients.forEach(client=>client.clear());vi.useRealTimers();transport.mockReset();focusManager.setFocused(undefined);});
function setup(){vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);render(<QueryClientProvider client={client}><MemoryRouter><Schedule/></MemoryRouter></QueryClientProvider>);}
const page=(start:number,cursor?:string)=>({version:1,data:[{canonicalId:'anilist:1',anilist_id:1,title:'Saved calendar fixture',airingEpisode:1,airingAt:start+3600,releaseTrack:'original',scheduleStatus:'scheduled',scheduleFetchedAt:Date.now(),scheduleProvider:'anilist',scheduleId:'anilist:1:episode-1:original'}],complete:false,stale:false,fetchedAt:Date.now(),providers:{anilist:{fetchedAt:Date.now(),stale:false}},cursor});
it('bounds automatic continuation and does not restart the whole walk on focus',async()=>{
 transport.mockImplementation(async(start:number,_end:number,cursor?:string)=>page(start,`${Number(cursor||0)+1}`));setup();
 for(let i=0;i<12;i++)await act(async()=>{await vi.advanceTimersByTimeAsync(600);});
 expect(transport).toHaveBeenCalledTimes(9);expect(screen.getByText('Saved calendar fixture')).toBeTruthy();expect(screen.queryByText(/Updating release information/)).toBeNull();
 await act(async()=>{focusManager.setFocused(false);focusManager.setFocused(true);await vi.advanceTimersByTimeAsync(1000);});expect(transport).toHaveBeenCalledTimes(9);
});
it('honors a provider deadline without falsely warning that an initial saved snapshot failed',async()=>{
 transport.mockImplementation(async(start:number)=>({...page(start,'1'),stale:true,initialSnapshot:true,retryAt:Date.now()+60000}));setup();
 await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});expect(transport).toHaveBeenCalledTimes(1);expect(screen.getByText('Saved calendar fixture')).toBeTruthy();expect(screen.queryByText(/temporarily unavailable/)).toBeNull();
 const retry=screen.getByRole('button',{name:/Retry in/});expect(retry).toHaveProperty('disabled',true);fireEvent.click(retry);expect(transport).toHaveBeenCalledTimes(1);
});
