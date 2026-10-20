import React from 'react';
import {render,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,expect,it,vi} from 'vitest';
const calls=vi.hoisted(()=>[] as string[]);
vi.mock('../../src/api/jikan',()=>Object.fromEntries(['fetchSeasonalAnime','fetchRecentEpisodes','fetchUpcomingAnime','fetchSchedule'].map(name=>[name,vi.fn(async()=>{calls.push(name);return {data:[]};})])));
vi.mock('../../src/components/AnimeCard',()=>({default:()=>null}));
vi.mock('../../src/components/Spotlight',()=>({default:()=>null}));
vi.mock('../../src/components/Seo',()=>({default:()=>null}));
vi.mock('../../src/components/AdSenseAd',()=>({default:()=>null}));
import Home from '../../src/pages/Home';
afterEach(()=>{cleanup();calls.length=0;vi.unstubAllGlobals();});
it('keeps independent offscreen Home data dormant until it approaches the viewport',async()=>{
 let near!:IntersectionObserverCallback;
 vi.stubGlobal('IntersectionObserver',class{constructor(callback:IntersectionObserverCallback){near=callback;}observe(){}disconnect(){}});
 render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Home/></QueryClientProvider></MemoryRouter>);
 await vi.waitFor(()=>expect(calls).toHaveLength(3));
 expect(calls).not.toContain('fetchUpcomingAnime');
 near([{isIntersecting:true}] as IntersectionObserverEntry[],{} as IntersectionObserver);
 await vi.waitFor(()=>expect(calls).toContain('fetchUpcomingAnime'));
});
it('loads immediately when viewport observation is unavailable',async()=>{
 vi.stubGlobal('IntersectionObserver',undefined);
 render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Home/></QueryClientProvider></MemoryRouter>);
 await vi.waitFor(()=>expect(calls).toHaveLength(4));
});
