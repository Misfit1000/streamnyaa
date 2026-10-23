import { createElement } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import Spotlight from '../../src/components/Spotlight';

vi.mock('motion/react',()=>({ AnimatePresence:({children}:any)=>children,
  motion:new Proxy({}, {get:(_target,tag:string)=>({children}:any)=>createElement(tag,null,children)}) }));
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});

it('does not rotate artwork or wake carousel timers in a hidden web tab, and resumes normally',()=>{
 vi.useFakeTimers();const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
 const animeList=['First title','Second title','Third title'].map((title,index)=>({mal_id:index+1,title,synopsis:'Fixture',images:{jpg:{large_image_url:`https://images.example/${index}.jpg`}},genres:[],score:8,type:'TV'}));
 render(<MemoryRouter><Spotlight animeList={animeList}/></MemoryRouter>);
 expect(screen.getByRole('heading',{level:1}).textContent).toBe('First title');
 act(()=>vi.advanceTimersByTime(5200));expect(screen.getByRole('heading',{level:1}).textContent).toBe('Second title');
 act(()=>{visibility.mockReturnValue('hidden');document.dispatchEvent(new Event('visibilitychange'));});
 expect(vi.getTimerCount()).toBe(0);act(()=>vi.advanceTimersByTime(60_000));expect(screen.getByRole('heading',{level:1}).textContent).toBe('Second title');
 act(()=>{visibility.mockReturnValue('visible');document.dispatchEvent(new Event('visibilitychange'));vi.advanceTimersByTime(5200);});
 expect(screen.getByRole('heading',{level:1}).textContent).toBe('Third title');
 cleanup();expect(vi.getTimerCount()).toBe(0);
});
