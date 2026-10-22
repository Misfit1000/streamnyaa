import React from 'react';
import {render,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,expect,it,vi} from 'vitest';
const calls=vi.hoisted(()=>[] as string[]);
vi.mock('../../src/api/jikan',()=>({fetchSchedule:vi.fn(async()=>{calls.push('schedule');return {data:[]};}),mapAnilistToJikan:(value:any)=>value,
 fetchAniList:vi.fn(async(body:any)=>{calls.push(body.query.includes('query Recent')?'recent':body.query.includes('SCORE_DESC')?'score':body.variables.status==='NOT_YET_RELEASED'?'upcoming':'trending');return new Response(JSON.stringify({data:{Page:{pageInfo:{currentPage:1,hasNextPage:false},media:[],airingSchedules:[]}}}));})}));
vi.mock('../../src/components/AnimeCard',()=>({default:()=>null}));
vi.mock('../../src/components/Spotlight',()=>({default:()=>null}));
vi.mock('../../src/components/Seo',()=>({default:()=>null}));
vi.mock('../../src/components/AdSenseAd',()=>({default:()=>null}));
import Home from '../../src/pages/Home';
afterEach(()=>{cleanup();calls.length=0;vi.unstubAllGlobals();});
it('keeps independent offscreen Home data dormant until it approaches the viewport',async()=>{
 const near:IntersectionObserverCallback[]=[];
 vi.stubGlobal('IntersectionObserver',class{constructor(callback:IntersectionObserverCallback){near.push(callback);}observe(){}disconnect(){}});
 render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Home/></QueryClientProvider></MemoryRouter>);
 await vi.waitFor(()=>expect(calls).toHaveLength(3));
 expect(calls).not.toContain('upcoming');
 near.forEach(callback=>callback([{isIntersecting:true}] as IntersectionObserverEntry[],{} as IntersectionObserver));
 await vi.waitFor(()=>expect(calls).toContain('upcoming'));
});
it('loads immediately when viewport observation is unavailable',async()=>{
 vi.stubGlobal('IntersectionObserver',undefined);
 render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Home/></QueryClientProvider></MemoryRouter>);
 await vi.waitFor(()=>expect(calls).toHaveLength(5));
});
