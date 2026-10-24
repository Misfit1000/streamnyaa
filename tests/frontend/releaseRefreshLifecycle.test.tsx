import {act,cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const transport=vi.hoisted(()=>vi.fn());
vi.mock('../../src/api/recentReleases',async original=>({...await original<any>(),fetchRecentReleases:transport}));
import {useRecentReleaseFeed} from '../../src/lib/useRecentReleaseFeed';
import RecentReleaseStatus from '../../src/components/RecentReleaseStatus';
const clients:QueryClient[]=[];
afterEach(()=>{cleanup();clients.forEach(client=>client.clear());vi.useRealTimers();transport.mockReset();});
function Feed(){const feed=useRecentReleaseFeed({track:'sub',adult:false});return <><p>{feed.items.map(item=>item.title).join(',')}</p><output>{feed.before}</output></>;}
it('crosses a release boundary once without restarting an in-flight refresh from old saved data',async()=>{
 vi.useFakeTimers();vi.setSystemTime(1800000000000);let finish:(value:any)=>void=()=>{};
 const page=(request:any)=>({version:1,before:request.before,track:'sub',page:1,data:[{canonicalId:'anilist:1',title:'Saved fixture',releaseEpisode:1}],complete:true,stale:false,fetchedAt:Date.now(),nextBoundaryAt:Date.now()+1000});
 transport.mockImplementationOnce(async request=>page(request)).mockImplementation(request=>new Promise(resolve=>{finish=()=>resolve({...page(request),nextBoundaryAt:undefined});}));
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);render(<QueryClientProvider client={client}><Feed/></QueryClientProvider>);
 await act(async()=>{await vi.advanceTimersByTimeAsync(50);});expect(screen.getByText('Saved fixture')).toBeTruthy();
 await act(async()=>{await vi.advanceTimersByTimeAsync(2100);});expect(transport).toHaveBeenCalledTimes(2);
 await act(async()=>{await vi.advanceTimersByTimeAsync(20000);});expect(transport).toHaveBeenCalledTimes(2);expect(screen.getByText('Saved fixture')).toBeTruthy();
 await act(async()=>{finish(undefined);await vi.advanceTimersByTimeAsync(20);});expect(transport).toHaveBeenCalledTimes(2);
});
it('does not display duplicate checking activity for a saved snapshot and keeps real failures actionable',()=>{
 const page={version:1,before:1,track:'sub',page:1,data:[],complete:false,stale:true,initialSnapshot:true,fetchedAt:Date.now()} as any;
 const view=render(<RecentReleaseStatus page={page} fetching retry={()=>{}}/>);expect(screen.getByText('Showing saved release times.')).toBeTruthy();expect(screen.queryByText('Checking…')).toBeNull();
 view.rerender(<RecentReleaseStatus page={{...page,initialSnapshot:false}} fetching={false} retry={()=>{}}/>);expect(screen.getByRole('button',{name:'Retry'})).toBeTruthy();
});
