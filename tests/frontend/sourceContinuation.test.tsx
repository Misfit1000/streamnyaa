import {act,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useSourceContinuation} from '../../src/lib/useSourceContinuation';
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it('allows two visible continuations, stops after a match and respects provider failures',async()=>{
 vi.useFakeTimers();const run=vi.fn(),base={enabled:true,fetching:false,eligible:false,pending:true,run};
 const hook=renderHook(({options})=>useSourceContinuation('episode2',options),{initialProps:{options:base}});
 await act(async()=>{await vi.advanceTimersByTimeAsync(151)});expect(run).toHaveBeenCalledTimes(1);
 hook.rerender({options:{...base,fetching:true}});hook.rerender({options:base});await act(async()=>{await vi.advanceTimersByTimeAsync(151)});expect(run).toHaveBeenCalledTimes(2);
 hook.rerender({options:{...base,fetching:true}});hook.rerender({options:base});await act(async()=>{await vi.advanceTimersByTimeAsync(1000)});expect(run).toHaveBeenCalledTimes(2);hook.unmount();
 const blocked=renderHook(()=>useSourceContinuation('episode3',{...base,providerFailure:true}));await act(async()=>{await vi.advanceTimersByTimeAsync(10000)});expect(run).toHaveBeenCalledTimes(2);blocked.unmount();
 const ready=renderHook(()=>useSourceContinuation('episode4',{...base,eligible:true}));await act(async()=>{await vi.advanceTimersByTimeAsync(1000)});expect(run).toHaveBeenCalledTimes(2);ready.unmount();
});
it('waits for foreground and provider deadlines without spending an attempt while hidden',async()=>{
 vi.useFakeTimers();let visibility='hidden';vi.spyOn(document,'visibilityState','get').mockImplementation(()=>visibility as DocumentVisibilityState);
 const run=vi.fn(),deadline=Date.now()+1000,hook=renderHook(()=>useSourceContinuation('episode2',{enabled:true,fetching:false,eligible:false,pending:true,retryAt:deadline,run}));
 await act(async()=>{await vi.advanceTimersByTimeAsync(500)});expect(run).not.toHaveBeenCalled();visibility='visible';act(()=>document.dispatchEvent(new Event('visibilitychange')));
 await act(async()=>{await vi.advanceTimersByTimeAsync(499)});expect(run).not.toHaveBeenCalled();await act(async()=>{await vi.advanceTimersByTimeAsync(2)});expect(run).toHaveBeenCalledOnce();hook.unmount();
});
