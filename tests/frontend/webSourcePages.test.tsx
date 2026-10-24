import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,Route,Routes,useLocation} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
vi.mock('../../src/context/AuthContext',()=>({useAuth:()=>({session:null,user:null})}));
vi.mock('../../src/components/Seo',()=>({default:()=>null}));
vi.mock('../../src/lib/desktop',()=>({isDesktopApp:()=>false,openLocalSourceNow:vi.fn()}));
vi.mock('../../src/lib/activity',()=>({saveDownloadHistory:vi.fn()}));
vi.mock('../../src/api/jikan',()=>({fetchAnimeDetails:vi.fn(),fetchAnimeEpisodes:vi.fn(),searchAnime:vi.fn()}));
vi.mock('../../src/api/nyaa',async original=>({...await original<typeof import('../../src/api/nyaa')>(),searchNyaa:vi.fn()}));
import {fetchAnimeDetails,fetchAnimeEpisodes,searchAnime} from '../../src/api/jikan';
import {searchNyaa,type NyaaItem} from '../../src/api/nyaa';
import {saveDownloadHistory} from '../../src/lib/activity';
import AnimeDownloads from '../../src/pages/AnimeDownloads';
import NyaaSearchPage from '../../src/pages/NyaaSearchPage';
import {useStore} from '../../src/store/useStore';
const anime={mal_id:1,title:'Example Anime',type:'TV',status:'RELEASING',episodes:12,nextAiringEpisode:{episode:2,airingAt:2000000000},images:{jpg:{image_url:'https://example.test/poster.jpg'}}};
const source=(title:string,id:number):NyaaItem=>({title,infoHash:String(id).padStart(40,'a'),magnet:'magnet:?xt=urn:btih:'+String(id).padStart(40,'a'),link:`https://nyaa.si/view/${id}`,size:'1 GiB',rawSize:1e9,seeders:'10',rawSeeders:10,leechers:'0',category:'Anime',categoryId:'1_2',pubDate:''});
function RemountingSearchRoute(){const location=useLocation();return <NyaaSearchPage key={location.key}/>;}
function setup(url:string,page:'title'|'search',batchOnly=false){
 vi.mocked(fetchAnimeDetails).mockResolvedValue({data:anime} as any);vi.mocked(fetchAnimeEpisodes).mockResolvedValue({data:[]} as any);vi.mocked(searchAnime).mockResolvedValue({data:[anime]} as any);
 vi.mocked(searchNyaa).mockImplementation(async(_q,_c,_f,_p,options)=>Object.assign([
   source(!batchOnly&&options?.intent?.scope==='episode'?'Example Anime - 02 [720p] [Dual Audio]':'Example Anime 01-10 Batch [720p]',!batchOnly&&options?.intent?.scope==='episode'?1:2)
 ],{complete:true,fetchedAt:Date.now(),stale:false}));
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><Routes><Route path="/anime/:id/downloads" element={<AnimeDownloads/>}/><Route path="/nyaa" element={<RemountingSearchRoute/>}/></Routes></MemoryRouter></QueryClientProvider>);
 return client;
}
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();useStore.setState({nsfwMode:false});});
it('keeps raw downloads usable without artwork, isolates Hentai searches and clears them when NSFW turns off',async()=>{
 useStore.setState({nsfwMode:true});setup('/nyaa?q=Fixture%20release','search');
 vi.mocked(searchAnime).mockResolvedValue({data:[]} as any);
 await screen.findByText('Batch releases found');fireEvent.click(screen.getByRole('button',{name:/Batch downloads/}));await screen.findByRole('link',{name:'Open batch in torrent client'});fireEvent.click(screen.getByRole('button',{name:'Hentai · 18+'}));
 await screen.findByRole('heading',{name:'Hentai Download Search'});
 await waitFor(()=>expect(vi.mocked(searchNyaa).mock.calls.some(call=>call[4]?.provider==='sukebei'&&call[1]==='1_1')).toBe(true));
 expect(screen.getByText(/No catalogue match or artwork is required/)).toBeTruthy();
 const count=vi.mocked(searchNyaa).mock.calls.length;
 useStore.setState({nsfwMode:false});await screen.findByRole('heading',{name:'Anime Download Search'});expect(screen.getByRole('button',{name:'Hentai · 18+'})).toHaveProperty('disabled',true);
 await waitFor(()=>expect(vi.mocked(searchNyaa).mock.calls.slice(count).every(call=>call[4]?.provider!=='sukebei')).toBe(true));
});
it.each(['title','search'] as const)('identifies batch-only coverage on the %s page without a false no-sources warning',async page=>{
 setup(page==='title'?'/anime/1/downloads?ep=2':'/nyaa?q=Example%20Anime&ep=2&match=mal%3A1',page,true);
 await screen.findByText('Batch releases found');
 expect(screen.queryByText('No matching sources in the pages checked yet')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:/Batch downloads/}));
 await screen.findByText('Example Anime 01-10 Batch [720p]');
});
it('allows an episode beyond provider metadata and changes quality/audio without more requests',async()=>{
 setup('/anime/1/downloads?ep=2','title');
 await screen.findByText('Example Anime - 02 [720p] [Dual Audio]');
 expect(screen.getByRole('option',{name:'Episode 2 — metadata pending'})).toBeTruthy();
 await waitFor(()=>expect(screen.queryByText('Checking title aliases and remaining source pages…')).toBeNull());
 const calls=vi.mocked(searchNyaa).mock.calls.length;
 fireEvent.click(screen.getAllByRole('button',{name:'720p'})[0]);fireEvent.click(screen.getByRole('button',{name:'Dub'}));
 await waitFor(()=>expect(screen.getByText('Example Anime - 02 [720p] [Dual Audio]')).toBeTruthy());
 expect(searchNyaa).toHaveBeenCalledTimes(calls);
});
it('opens packs on demand, records no episode for a whole pack and reports clipboard failures',async()=>{
 setup('/anime/1/downloads?ep=2','title');await screen.findByText('Example Anime - 02 [720p] [Dual Audio]');
 expect(screen.queryByRole('link',{name:'Download .torrent'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:/Batch downloads/}));
 await screen.findByRole('link',{name:'Download .torrent'});
 expect(screen.getByText(/Web does not verify/)).toBeTruthy();
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn().mockResolvedValue(undefined)}});
 fireEvent.click(screen.getByRole('button',{name:'Copy batch magnet'}));
 await waitFor(()=>expect(saveDownloadHistory).toHaveBeenCalledWith(expect.objectContaining({episode:null,action:'copy'}),null));
 vi.mocked(saveDownloadHistory).mockClear();vi.mocked(navigator.clipboard.writeText).mockRejectedValue(Error('Denied'));
 fireEvent.click(screen.getByRole('button',{name:'Copy batch magnet'}));await screen.findByText(/Copy failed/);expect(saveDownloadHistory).not.toHaveBeenCalled();
});
it('does not classify a free search using the first automatic anime suggestion without confirmation',async()=>{
 setup('/nyaa?q=Example%20Anime%20-%2002','search');
 await screen.findByRole('button',{name:'Match this anime'});
 expect(fetchAnimeDetails).not.toHaveBeenCalled();
 expect(screen.getByRole('textbox')).toHaveProperty('value','Example Anime - 02');
 fireEvent.click(screen.getByRole('button',{name:'Match this anime'}));
 await waitFor(()=>expect(fetchAnimeDetails).toHaveBeenCalledWith('1',expect.objectContaining({signal:expect.any(AbortSignal)})));
 expect(screen.getByRole('button',{name:'Return to free-text search'})).toBeTruthy();
});

it('retains explicit canonical matching through episode URL changes and route remounts',async()=>{
 setup('/nyaa?q=Example%20Anime','search');
 fireEvent.click(await screen.findByRole('button',{name:'Match this anime'}));
 await screen.findByRole('button',{name:'Return to free-text search'});
 fireEvent.change(screen.getByRole('spinbutton',{name:'Jump to episode'}),{target:{value:'2'}});
 fireEvent.click(screen.getByRole('button',{name:'Go'}));
 await screen.findByText('Example Anime - 02 [720p] [Dual Audio]');
 expect(screen.getByRole('button',{name:'Return to free-text search'})).toBeTruthy();
 expect(screen.queryByText('Search result; verify the title, installment and file list.')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Return to free-text search'}));
 await screen.findByRole('button',{name:'Match this anime'});
});

it('lets a deliberate source search proceed when upcoming metadata is behind',async()=>{
 setup('/anime/1/downloads?ep=2','title');
 await screen.findByText('Example Anime - 02 [720p] [Dual Audio]');
 const calls=vi.mocked(searchNyaa).mock.calls.length;
 // A new canonical title retains the explicit opt-in rather than inheriting it.
 cleanup();vi.mocked(fetchAnimeDetails).mockResolvedValue({data:{...anime,status:'NOT_YET_RELEASED'}} as any);
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/anime/1/downloads?ep=2']}><Routes><Route path="/anime/:id/downloads" element={<AnimeDownloads/>}/></Routes></MemoryRouter></QueryClientProvider>);
 await screen.findByRole('button',{name:'Search source listings'});expect(searchNyaa).toHaveBeenCalledTimes(calls);
 fireEvent.click(screen.getByRole('button',{name:'Search source listings'}));await screen.findByText('Example Anime - 02 [720p] [Dual Audio]');expect(vi.mocked(searchNyaa).mock.calls.length).toBeGreaterThan(calls);
});
