vi.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ isAdmin: false }) }));
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const releases=vi.hoisted(()=>vi.fn());
vi.mock('../../src/api/recentReleases',async original=>({...await original<any>(),fetchRecentReleases:releases}));
vi.mock('../../src/api/desktopExplore', () => ({ fetchExplorePage: vi.fn() }));
import { fetchExplorePage } from '../../src/api/desktopExplore';
import DesktopExplore from '../../src/pages/DesktopExplore';
import { updateLibraryOrganization } from '../../src/lib/desktopLibraryOrganization';
const clients: QueryClient[] = [];
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); releases.mockReset();
 releases.mockImplementation(async(request:any,param:any={})=>({version:1,before:request.before,track:request.track,page:param.cursor?2:1,complete:true,stale:false,fetchedAt:Date.now(),nextCursor:param.cursor?undefined:'next',data:[{canonicalId:`anilist:${param.cursor?26:1}`,anilist_id:param.cursor?26:1,title:`anilist title ${param.cursor?26:1}`,releaseEpisode:2,airingEpisode:2,releaseTrack:request.track,releaseAt:request.before*1000-1,timingBasis:'confirmed-sub',releasePolicyVersion:1}]})); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; });
function mount(route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}><DesktopExplore /></MemoryRouter></QueryClientProvider>);
}
function page(request: any, number: number) {
  return { paginationVersion: 2 as const, page: number, service: request.service, fetchedAt: Date.now(), hasNextPage: true,
    data: Array.from({ length: 25 }, (_, i) => ({ mal_id: (number - 1) * 25 + i + 1,
      title: `${request.service} title ${(number - 1) * 25 + i + 1}`, score: 9, rankingScore: request.service === 'mal' ? 9 : 90,
      status: 'Finished Airing', episodes: 12, type: 'TV', genres: [{ name: 'Fantasy' }] })) };
}
describe('Explore ranked page navigation', () => {
  it('opens the default page on the fallback-capable Popular feed', async () => {
    vi.mocked(fetchExplorePage).mockImplementation(async (request, number) => ({ ...page(request, number), hasNextPage: false }));
    mount('/search');
    await screen.findByRole('heading', { name: 'anilist title 1', exact: true });
    expect(vi.mocked(fetchExplorePage).mock.calls[0][0]).toMatchObject({ mode: 'popular', service: 'anilist', allowFallback: true });
  });
  it('loads four underlying pages, then moves to 101–200 without mixing services', async () => {
    vi.mocked(fetchExplorePage).mockImplementation(async (request, number) => page(request, number));
    mount('/search?mode=ranking&ranking=mal');
    // Four serial mocked pages plus 100 jsdom cards; this is a behavior test,
    // not the real-network latency benchmark. Allow CPU contention in full CI.
    await screen.findByText('#100', {}, { timeout: 4000 });
    expect(fetchExplorePage).toHaveBeenCalledTimes(4);
    fireEvent.click(screen.getByRole('button', { name: 'Next 100' }));
    await screen.findByText('#200', {}, { timeout: 4000 });
    expect(screen.queryByText('#1')).toBeNull();
    expect(screen.getByText('#101')).toBeTruthy();
    expect(vi.mocked(fetchExplorePage).mock.calls.slice(4).map(call => call[1])).toEqual([5, 6, 7, 8]);
    expect(screen.queryByRole('button',{name:'AniList',exact:true})).toBeNull();
    expect(screen.queryByRole('button',{name:'MyAnimeList',exact:true})).toBeNull();
  });
  it('retains earlier cards when a later page fails and does not invent the next hundred', async () => {
    vi.mocked(fetchExplorePage).mockImplementation(async (request, number) => {
      if (number === 2) throw new Error('Offline');
      return page(request, number);
    });
    mount('/search?mode=ranking&ranking=mal&status=Completed');
    await screen.findByText('#25');
    await waitFor(() => expect(fetchExplorePage).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('heading', { name: 'anilist title 1', exact: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next 100' }).hasAttribute('disabled')).toBe(true);
  });
  it('hides completed titles without renumbering the ranking', async () => {
    updateLibraryOrganization(['mal:1'], { status: 'Completed' });
    vi.mocked(fetchExplorePage).mockImplementation(async (request, number) => ({ ...page(request, number), hasNextPage: false }));
    mount('/search?mode=ranking&ranking=mal&hideCompleted=1');
    await screen.findByText('#2');
    expect(screen.queryByText('#1')).toBeNull();
    expect(screen.getByRole('heading', { name: 'anilist title 2', exact: true })).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Hide marked completed'));
    await screen.findByText('#1');
  });
});

it('keeps release snapshot cutoffs stable across paging and retries', async () => {
 let clock=1700000000000;const now=vi.spyOn(Date,'now').mockImplementation(()=>clock);
 vi.mocked(fetchExplorePage).mockImplementation(async(request,number)=>({...page(request,number),before:request.before,hasNextPage:number===1}));
 try {
  mount('/search?mode=new');await screen.findByRole('heading',{name:'anilist title 1',exact:true});
  const before=releases.mock.calls[0][0].before;
  clock+=86400_000;
  fireEvent.click(screen.getByRole('button',{name:'Load more'}));await screen.findByRole('heading',{name:'anilist title 26',exact:true});
  expect(releases.mock.calls[1][0].before).toBe(before);
  await clients[0].refetchQueries();
  expect(releases.mock.calls[2][0].before).toBe(before);
  expect(releases.mock.calls[3][0].before).toBe(before);
 } finally {now.mockRestore();}
});

it('removes saved filters and retains the last episode snapshot when refresh fails', async () => {
 releases.mockResolvedValueOnce({version:1,before:Math.floor(Date.now()/60000)*60,track:'sub',page:1,complete:true,stale:false,fetchedAt:1700000000000,data:[{canonicalId:'mal:42',mal_id:42,title:'Verified episode',releaseEpisode:7,airingEpisode:7,timingBasis:'confirmed-sub'}]}).mockRejectedValue(new Error('HTTP 400 internal provider detail'));
 mount('/search?mode=new');await screen.findByRole('heading',{name:'Verified episode',exact:true});
 expect(screen.queryByText('Saved filters')).toBeNull();
 await clients[0].refetchQueries();
 await screen.findByText(/Updates are temporarily unavailable/);
 expect(screen.queryByText(/HTTP 400 internal/)).toBeNull();
 expect(screen.getByRole('heading',{name:'Verified episode',exact:true})).toBeTruthy();
 expect(screen.getByText(/Last updated/).textContent).toContain(new Date(1700000000000).toLocaleString());
});

it.each([
 ['/search','Genre','genre','Fantasy'],
 ['/search','Format','format','Movie'],
 ['/search','Status','status','Airing'],
 ['/search','Sort','sort','score'],
 ['/search','Premiere window','releasedAfter','7'],
 ['/search?mode=year&year=2026','Year','year','2025'],
 ['/search?mode=ranking','Ranking year','year','2025'],
 ['/search?mode=seasonal','Year','year','2025'],
 ['/search?mode=seasonal','Season','season','WINTER'],
 ['/search?mode=new','Genre','genre','Fantasy'],
])('applies %s %s to the catalog request',async(route,label,key,value)=>{
 vi.mocked(fetchExplorePage).mockImplementation(async(request,number)=>({...page(request,number),hasNextPage:false}));
 mount(route);await screen.findByRole('heading',{name:'anilist title 1',exact:true});
 const select=screen.getByRole('combobox',{name:label,exact:true});
 fireEvent.change(select,{target:{value}});
 await waitFor(()=>expect((route.includes('mode=new')?releases:vi.mocked(fetchExplorePage)).mock.calls.at(-1)?.[0]?.[key]).toEqual(key==='releasedAfter'?expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/):key==='year'?2025:value));
 expect((select as HTMLSelectElement).value).toBe(value);
});
