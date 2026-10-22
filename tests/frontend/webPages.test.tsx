import React from 'react';
import { act,cleanup,fireEvent,render,screen,within } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter,Routes,Route,useLocation } from 'react-router-dom';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const api=vi.hoisted(()=>({graph:vi.fn(),details:vi.fn()}));
vi.mock('../../src/api/jikan',()=>({fetchAniList:api.graph,fetchAnimeDetails:api.details,fetchSchedule:async()=>({data:[]}),fetchGenres:async()=>({data:[]}),mapAnilistToJikan:(media:any)=>({anilist_id:media.id,mal_id:media.idMal,title:media.title.english,status:media.status,type:'TV',genres:[],images:{jpg:{image_url:'/logo.svg'}}})}));
vi.mock('../../src/context/AuthContext',()=>({useAuth:()=>({user:null,isAdmin:false})}));
vi.mock('../../src/components/AnimeCard',()=>({default:({anime}:any)=><p>{anime.title}</p>}));
vi.mock('../../src/components/Seo',()=>({default:()=>null}));vi.mock('../../src/components/Spotlight',()=>({default:()=>null}));vi.mock('../../src/components/AdSenseAd',()=>({default:()=>null}));
import Home from '../../src/pages/Home';import Search from '../../src/pages/Search';import Compare from '../../src/pages/AnimeCompare';import Navbar from '../../src/components/Navbar';
function Path(){return <p data-testid="path">{useLocation().search}</p>;}
const mount=(child:React.ReactNode,path='/')=>render(<MemoryRouter initialEntries={[path]}><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{child}</QueryClientProvider></MemoryRouter>);
beforeEach(()=>{
 localStorage.clear();api.graph.mockReset();api.details.mockReset();
 api.graph.mockImplementation(async(body:any)=>{const page=body.variables.page,id=page,media={id,idMal:id+100,title:{english:`Fixture ${id}`},status:body.variables.status||'RELEASING',genres:[]};return new Response(JSON.stringify({data:{Page:{pageInfo:{currentPage:page,hasNextPage:page===1},media:[media],airingSchedules:[{id,episode:page,airingAt:Math.floor(Date.now()/1000)-60,media}]}}}));});
 api.details.mockImplementation(async(id:string)=>({data:{mal_id:Number(id),title:`Full title ${id}`,metadataProvider:'anilist',popularityKind:'list-count',popularity:5000,score:8.2,episodes:12,status:'FINISHED',genres:[{name:'Adventure'}],images:{jpg:{image_url:'/logo.svg'}}}}));
});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('View All reuses the Home recent page, then appends genuinely new results',async()=>{
 mount(<Routes><Route path="/" element={<Home/>}/><Route path="/search" element={<Search/>}/></Routes>);
 await vi.waitFor(()=>expect(api.graph.mock.calls.some(([body])=>body.query.includes('query Recent'))).toBe(true));
 await screen.findAllByText('Fixture 1');const count=api.graph.mock.calls.filter(([body])=>body.query.includes('query Recent')).length;
 fireEvent.click(screen.getAllByRole('link',{name:/View All/i})[0]);await screen.findByRole('heading',{name:'Recently updated'});
 expect(api.graph.mock.calls.filter(([body])=>body.query.includes('query Recent'))).toHaveLength(count);
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
