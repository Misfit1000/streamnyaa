import React from 'react';
import { act,cleanup,fireEvent,render,screen,within } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter,Routes,Route,useLocation } from 'react-router-dom';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const api=vi.hoisted(()=>({graph:vi.fn(),details:vi.fn(),releases:vi.fn()}));
vi.mock('../../src/api/recentReleases',async original=>({...await original<any>(),fetchRecentReleases:api.releases}));
vi.mock('../../src/api/jikan',()=>({fetchAniList:api.graph,fetchAnimeDetails:api.details,fetchSchedule:async()=>({data:[]}),fetchGenres:async()=>({data:[]}),mapAnilistToJikan:(media:any)=>({anilist_id:media.id,mal_id:media.idMal,title:media.title.english,status:media.status,type:'TV',genres:[],images:{jpg:{image_url:'/logo.svg'}}})}));
vi.mock('../../src/context/AuthContext',()=>({useAuth:()=>({user:null,isAdmin:false})}));
vi.mock('../../src/components/AnimeCard',()=>({default:({anime}:any)=><p>{anime.title}</p>}));
vi.mock('../../src/components/Seo',()=>({default:()=>null}));vi.mock('../../src/components/Spotlight',()=>({default:()=>null}));vi.mock('../../src/components/AdSenseAd',()=>({default:()=>null}));
import Home from '../../src/pages/Home';import Search from '../../src/pages/Search';import Compare from '../../src/pages/AnimeCompare';import Navbar from '../../src/components/Navbar';
import {useStore} from '../../src/store/useStore';
function Path(){return <p data-testid="path">{useLocation().search}</p>;}
const mount=(child:React.ReactNode,path='/')=>render(<MemoryRouter initialEntries={[path]}><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{child}</QueryClientProvider></MemoryRouter>);
beforeEach(()=>{
 useStore.setState({nsfwMode:false,hideChineseAnime:true});
 localStorage.clear();api.graph.mockReset();api.details.mockReset();api.releases.mockReset();
 api.releases.mockImplementation(async(request:any,param:any={})=>{const id=param.cursor?2:1;return{version:1,before:request.before,track:request.track,page:id,complete:true,stale:false,fetchedAt:Date.now(),nextCursor:id===1?'next':undefined,data:[{canonicalId:`anilist:${id}`,anilist_id:id,mal_id:id+100,title:`Fixture ${id}`,releaseEpisode:id,releaseAt:(request.before-10)*1000,releaseTrack:'sub',timingBasis:'confirmed-sub',releasePolicyVersion:1,airingEpisode:id}]};});
 api.graph.mockImplementation(async(body:any)=>{const page=body.variables.page,id=page,media={id,idMal:id+100,title:{english:`Fixture ${id}`},status:body.variables.status||'RELEASING',genres:[]};return new Response(JSON.stringify({data:{Page:{pageInfo:{currentPage:page,hasNextPage:page===1},media:[media],airingSchedules:[{id,episode:page,airingAt:Math.floor(Date.now()/1000)-60,media}]}}}));});
 api.details.mockImplementation(async(id:string)=>({data:{mal_id:Number(id),title:`Full title ${id}`,metadataProvider:'anilist',popularityKind:'list-count',popularity:5000,score:8.2,episodes:12,status:'FINISHED',genres:[{name:'Adventure'}],images:{jpg:{image_url:'/logo.svg'}}}}));
});
it('retains visible recent cards during NSFW refresh and filters Chinese locally without restarting pagination',async()=>{
 let complete:(value:any)=>void=()=>{};
 const cutoff=Math.floor(Date.now()/1000),row=(id:number,extra:any={})=>({canonicalId:`anilist:${id}`,anilist_id:id,title:`Content fixture ${id}`,releaseEpisode:1,releaseAt:(cutoff-10)*1000,releaseTrack:'sub',timingBasis:'confirmed-sub',releasePolicyVersion:1,airingEpisode:1,...extra});
 const page={version:1,before:cutoff,track:'sub',page:1,complete:true,stale:false,fetchedAt:Date.now(),data:[row(1,{genres:['Ecchi'],isAdult:true}),row(2,{countryOfOrigin:'CN'}),row(3,{genres:['Hentai'],isAdult:true})]};
 api.releases.mockImplementation((request:any)=>request.adult?new Promise(resolve=>{complete=resolve;}):Promise.resolve({...page,before:request.before,data:page.data.slice(0,2)}));
 mount(<Search/>,`/search?sort=recent&before=${cutoff}`);await screen.findByText('Content fixture 1');expect(screen.queryByText('Content fixture 2')).toBeNull();const count=api.releases.mock.calls.length;
 act(()=>useStore.getState().toggleChineseAnime());expect(screen.getByText('Content fixture 2')).toBeTruthy();expect(api.releases.mock.calls).toHaveLength(count);
 act(()=>useStore.getState().toggleNsfwMode());expect(screen.getByText('Content fixture 1')).toBeTruthy();expect(screen.queryByText('Loading anime…')).toBeNull();
 await act(async()=>complete(page));await screen.findByText('Content fixture 3');act(()=>useStore.getState().toggleNsfwMode());expect(screen.queryByText('Content fixture 3')).toBeNull();expect(screen.getByText('Content fixture 1')).toBeTruthy();
});
it('does not advertise provider-building as an unsolicited next-page load',async()=>{
 const cutoff=Math.floor(Date.now()/1000);let finish:(value:any)=>void=()=>{};
 const page={version:1,before:cutoff,track:'sub',page:1,complete:false,stale:false,fetchedAt:Date.now(),buildCursor:'2:0',data:[{canonicalId:'anilist:1',title:'Building fixture',releaseEpisode:1}]};
 api.releases.mockImplementation((_request:any,param:any={})=>param.build?new Promise(resolve=>{finish=resolve;}):Promise.resolve(page));
 mount(<Search/>,`/search?sort=recent&before=${cutoff}`);await screen.findByText('Building fixture');await vi.waitFor(()=>expect(api.releases).toHaveBeenCalledTimes(2));
 expect(screen.queryByRole('button',{name:'Loading…'})).toBeNull();expect(screen.getByText('Building fixture')).toBeTruthy();
 await act(async()=>finish({...page,complete:true,buildCursor:undefined,nextCursor:'actual-next-page'}));expect(await screen.findByRole('button',{name:'Load More'})).toHaveProperty('disabled',false);
});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('View All reuses the Home recent page, then appends genuinely new results',async()=>{
 mount(<Routes><Route path="/" element={<Home/>}/><Route path="/search" element={<Search/>}/></Routes>);
 await vi.waitFor(()=>expect(api.releases.mock.calls.length>0).toBe(true));
 await screen.findAllByText('Fixture 1');const count=api.releases.mock.calls.length;
 fireEvent.click(screen.getAllByRole('link',{name:/View All/i})[0]);await screen.findByRole('heading',{name:'Recently updated'});
 expect(api.releases.mock.calls).toHaveLength(count);
 fireEvent.click(await screen.findByRole('button',{name:'Load More'}));await screen.findByText('Fixture 2');expect(screen.getByText('Fixture 1')).toBeTruthy();
});
it('debounces Search input and keeps Enter immediate',async()=>{
 mount(<Search/>,'/search');await screen.findByText('Fixture 1');const count=api.graph.mock.calls.length;vi.useFakeTimers();
 const input=screen.getByPlaceholderText('Search for anime...');fireEvent.change(input,{target:{value:'fri'}});await act(async()=>vi.advanceTimersByTime(200));fireEvent.change(input,{target:{value:'frieren'}});await act(async()=>vi.advanceTimersByTime(299));expect(api.graph).toHaveBeenCalledTimes(count);
 fireEvent.submit(input.closest('form')!);vi.useRealTimers();await vi.waitFor(()=>expect(api.graph.mock.calls.at(-1)[0].variables.search).toBe('frieren'));
});
it('Compare keyboard selection, sharing state, swap and clear work without repeating detail requests',async()=>{
 mount(<><Compare/><Path/></>,'/compare');const inputs=screen.getAllByRole('combobox');
 for(let i=0;i<2;i++){fireEvent.focus(inputs[i]);fireEvent.change(inputs[i],{target:{value:i?'other':'fixture'}});await screen.findByRole('listbox');await vi.waitFor(()=>expect(screen.getAllByRole('option')).toHaveLength(1));fireEvent.keyDown(inputs[i],{key:'ArrowDown'});fireEvent.keyDown(inputs[i],{key:'Enter'});}
 await screen.findByRole('table');expect(screen.getByTestId('path').textContent).toContain('mal%3A101');expect(screen.getAllByText(/users with this title/)).toHaveLength(2);
 const count=api.details.mock.calls.length;fireEvent.click(screen.getByRole('button',{name:'Swap'}));expect(api.details).toHaveBeenCalledTimes(count);
 fireEvent.click(screen.getByRole('button',{name:'Clear first title'}));expect(screen.queryByRole('table')).toBeNull();
});
it('navigation dismisses after route changes and Escape restores button focus',()=>{
 mount(<><Navbar/><Routes><Route path="*" element={<p>Page</p>}/></Routes></>);
 fireEvent.click(screen.getByRole('button',{name:'Open navigation menu'}));fireEvent.click(screen.getAllByRole('link',{name:'Compare'}).at(-1)!);expect(screen.getByRole('button',{name:'Open navigation menu'}).getAttribute('aria-expanded')).toBe('false');
 fireEvent.click(screen.getByRole('button',{name:'Open navigation menu'}));fireEvent.keyDown(document,{key:'Escape'});expect(document.activeElement).toBe(screen.getByRole('button',{name:'Open navigation menu'}));
});
it('navigation closes for the current page and same-query search, without dismissing mobile filters',()=>{
 mount(<Navbar/>,'/');
 fireEvent.click(screen.getByRole('button',{name:'Open navigation menu'}));
 fireEvent.click(within(screen.getByRole('region',{name:'Mobile navigation'})).getByRole('link',{name:'Home'}));
 expect(screen.queryByRole('region',{name:'Mobile navigation'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Open navigation menu'}));
 let menu=screen.getByRole('region',{name:'Mobile navigation'});
 fireEvent.click(within(menu).getByRole('button',{name:'Filters'}));
 const type=within(menu).getByLabelText('Type');fireEvent.mouseDown(type);fireEvent.change(type,{target:{value:'movie'}});
 expect(within(menu).getByLabelText('Type')).toHaveProperty('value','movie');
 fireEvent.submit(within(menu).getByPlaceholderText('Search anime...').closest('form')!);
 expect(screen.queryByRole('region',{name:'Mobile navigation'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Open navigation menu'}));menu=screen.getByRole('region',{name:'Mobile navigation'});
 fireEvent.submit(within(menu).getByPlaceholderText('Search anime...').closest('form')!);
 expect(screen.queryByRole('region',{name:'Mobile navigation'})).toBeNull();
});
