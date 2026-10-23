import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
vi.mock('../../src/context/AuthContext',()=>({useAuth:()=>({session:null,user:null})}));
vi.mock('../../src/components/Seo',()=>({default:()=>null}));
vi.mock('../../src/lib/desktopSeriesTimeline',()=>({loadSeriesTimeline:vi.fn(async()=>({items:[],complete:true}))}));
vi.mock('../../src/api/jikan',async original=>({...await original<typeof import('../../src/api/jikan')>(),fetchAnimeDetails:vi.fn(),fetchAnimeEpisodeWindow:vi.fn(),fetchAnimeInstallments:vi.fn(async()=>({data:[]}))}));
vi.mock('../../src/api/nyaa',async original=>({...await original<typeof import('../../src/api/nyaa')>(),searchNyaa:vi.fn()}));
vi.mock('../../src/lib/desktop',async original=>({...await original<typeof import('../../src/lib/desktop')>(),isDesktopApp:()=>false,loadDesktopAutoOpenBestSource:()=>false,openLocalSourceNow:vi.fn(),syncDesktopPlayerPreferencesToPlayer:vi.fn(async()=>({ok:true,failed:[]})),getLocalPlaybackProgress:vi.fn(async()=>({ok:true,state:'playing',current_seconds:1}))}));
vi.mock('../../src/lib/desktopBatchSources',async original=>({...await original<typeof import('../../src/lib/desktopBatchSources')>(),inspectDesktopBatch:vi.fn()}));
import {fetchAnimeDetails,fetchAnimeEpisodeWindow} from '../../src/api/jikan';
import {searchNyaa,type NyaaItem} from '../../src/api/nyaa';
import {inspectDesktopBatch} from '../../src/lib/desktopBatchSources';
import {openLocalSourceNow} from '../../src/lib/desktop';
import DesktopWatch from '../../src/pages/DesktopWatch';
const pack='Cyberpunk Edgerunners S02 Season 2 1080p NF WEBRip Dual Audio AAC5.1 10bits x265';
const wrong='Cyberpunk Edgerunners S01E02 [1080p]';
const anime={mal_id:2,title:'Cyberpunk: Edgerunners 2',type:'ONA',status:'FINISHED',episodes:10,latestEpisode:10,relations:[{relation:'Prequel',entry:[{mal_id:1,name:'Cyberpunk: Edgerunners',type:'anime'}]}],images:{jpg:{image_url:'https://example.test/poster.jpg'}}};
const source=(title:string,id:number):NyaaItem=>({title,infoHash:String(id).padStart(40,'a'),magnet:'magnet:?xt=urn:btih:'+String(id).padStart(40,'a'),link:`https://nyaa.si/view/${id}`,size:'1 GiB',rawSize:1e9,seeders:'10',rawSeeders:10,leechers:'0',category:'Anime',categoryId:'1_2',pubDate:''});
function setup(titles=[pack,wrong]){
  HTMLElement.prototype.scrollIntoView=vi.fn();
  vi.mocked(fetchAnimeDetails).mockResolvedValue({data:anime} as any);
  vi.mocked(fetchAnimeEpisodeWindow).mockResolvedValue({data:[],latestPage:1,latestPageResolved:true,streamnyaa:{status:'success',fetchedAt:Date.now()}} as any);
  vi.mocked(searchNyaa).mockImplementation(async()=>Object.assign(titles.map((title,index)=>source(title,index+1)),{complete:true,stale:false,fetchedAt:Date.now()}));
  vi.mocked(openLocalSourceNow).mockResolvedValue({ok:true,state:'started',title:'Fixture',torrent_id:'fixture'} as any);
  const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/watch/2?ep=2&type=sub']}><Routes><Route path="/watch/:id" element={<DesktopWatch/>}/></Routes></MemoryRouter></QueryClientProvider>);
  return client;
}
afterEach(()=>{cleanup();vi.clearAllMocks();localStorage.clear();});
it('filters actual Watch rows in Balanced and Strict; Broad exposes the manual conflict',async()=>{
  setup();await screen.findByRole('button',{name:`Use source: ${pack}`});expect(screen.queryByRole('button',{name:`Use source: ${wrong}`})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Open playback options'}));fireEvent.change(screen.getByRole('combobox',{name:'Match mode'}),{target:{value:'strict'}});
  expect(screen.queryByRole('button',{name:`Use source: ${wrong}`})).toBeNull();
  fireEvent.change(screen.getByRole('combobox',{name:'Match mode'}),{target:{value:'broad'}});
  expect(await screen.findByRole('button',{name:`Use source: ${wrong}`})).toBeTruthy();expect(screen.getByText('Different installment/episode')).toBeTruthy();
});
it('Use continues the actual Watch file picker into exactly one playback request',async()=>{
  vi.mocked(inspectDesktopBatch).mockResolvedValue({state:'choose-file',infoHash:'a'.repeat(40),manifestId:'fixture',reason:'Choose encode',files:[{index:1,name:'Season 2/02 [1080p].mkv',bytes:100}],availableEpisodes:[],selection:null});
  setup();const use=await screen.findByRole('button',{name:`Use source: ${pack}`});fireEvent.click(use);fireEvent.click(use);
  const file=await screen.findByRole('button',{name:/02 \[1080p\]/});expect(openLocalSourceNow).not.toHaveBeenCalled();fireEvent.click(file);
  await waitFor(()=>expect(openLocalSourceNow).toHaveBeenCalledOnce());expect(inspectDesktopBatch).toHaveBeenCalledOnce();
  expect(openLocalSourceNow).toHaveBeenCalledWith(expect.objectContaining({episode:2,batchSelection:expect.objectContaining({fileIndex:1,episode:2})}));
});


it('a unique-title release with ambiguous engine files opens the picker and continues without another Play click',async()=>{
 const title='Cyberpunk Edgerunners S02E02 [1080p HEVC]';setup([title]);
 vi.mocked(openLocalSourceNow).mockResolvedValueOnce({ok:false,state:'failed',title:'Fixture',message:'Choose file',requires_file_choice:true} as any);
 vi.mocked(inspectDesktopBatch).mockResolvedValue({state:'choose-file',infoHash:'a'.repeat(40),manifestId:'fixture',reason:'Several encodes',files:[{index:1,name:'Episode 2 1080p.mkv',bytes:100}],availableEpisodes:[],selection:null});
 fireEvent.click(await screen.findByRole('button',{name:`Use source: ${title}`}));
 fireEvent.click(await screen.findByRole('button',{name:/Episode 2 1080p/}));
 await waitFor(()=>expect(openLocalSourceNow).toHaveBeenCalledTimes(2));
 expect(openLocalSourceNow).toHaveBeenLastCalledWith(expect.objectContaining({episode:2,batchSelection:expect.objectContaining({fileIndex:1})}));
});
it('cancelling the real Watch picker never starts playback',async()=>{
 vi.mocked(inspectDesktopBatch).mockResolvedValue({state:'choose-file',infoHash:'a'.repeat(40),manifestId:'fixture',reason:'Several encodes',files:[{index:1,name:'Episode 2.mkv',bytes:100}],availableEpisodes:[],selection:null});
 setup();fireEvent.click(await screen.findByRole('button',{name:`Use source: ${pack}`}));await screen.findByRole('dialog',{name:'Choose episode file'});
 await waitFor(()=>expect(document.activeElement?.getAttribute('aria-label')).toBe('Close Choose episode file'));fireEvent.keyDown(document.activeElement!,{key:'Escape'});await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Choose episode file'})).toBeNull());expect(openLocalSourceNow).not.toHaveBeenCalled();
});
