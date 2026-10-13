import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const auth=vi.hoisted(()=>({user:{id:'owner'} as {id:string}|null,loading:false}));
vi.mock('../../src/context/AuthContext',()=>({useAuth:()=>auth}));
import DesktopProgressBridge from '../../src/components/DesktopProgressBridge';
import { DESKTOP_WATCH_PROGRESS_KEY, loadDesktopWatchProgress } from '../../src/lib/desktop';
import type { NativeCheckpoint } from '../../src/lib/desktopNativeProgress';
let event!:(event:{payload:NativeCheckpoint})=>void;
const marker='streamnyaa.nativeProgress.applied.v1:owner';
const checkpoint:NativeCheckpoint={version:1,sessionId:'persist',sequence:1,generation:1,updatedAt:Date.now(),state:'playing',completed:false,
  context:{owner:'owner',animeId:'anilist:42',title:'Example',episode:'1',sourceKey:'source'},
  coverage:{version:2,duration:100,intervals:[[0,20]],lastPosition:20,furthest:20}};
beforeEach(()=>{
  localStorage.clear();
  auth.user={id:'owner'};auth.loading=false;
  Object.defineProperty(window,'__TAURI__',{configurable:true,value:{core:{invoke:vi.fn(async(command:string)=>command==='get_playback_checkpoints'?{records:[],activeSessionIds:[]}:undefined)},
    event:{listen:vi.fn(async(_name:string,callback:typeof event)=>{event=callback;return()=>{};})}}});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();localStorage.clear();Object.defineProperty(window,'__TAURI__',{configurable:true,value:undefined});});
it('retains replay eligibility after quota failure and applies the same sequence when persistence recovers',async()=>{
  render(<DesktopProgressBridge/>);await waitFor(()=>expect(event).toBeTypeOf('function'));
  const original=Storage.prototype.setItem;
  const write=vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(key,value){
    if(key===DESKTOP_WATCH_PROGRESS_KEY)throw new DOMException('Full','QuotaExceededError');
    return original.call(this,key,value);
  });
  await act(async()=>event({payload:checkpoint}));
  expect(localStorage.getItem(marker)).toBeNull();expect(loadDesktopWatchProgress()).toEqual([]);
  write.mockRestore();await act(async()=>event({payload:checkpoint}));
  expect(loadDesktopWatchProgress()[0].positionSeconds).toBe(20);expect(JSON.parse(localStorage.getItem(marker)!)).toEqual({persist:1});
  const retry=vi.spyOn(Storage.prototype,'setItem');await act(async()=>event({payload:checkpoint}));
  expect(retry).not.toHaveBeenCalled();
});

function failWrites(keyToFail:string) {
  const original=Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(key,value){
    if(key===keyToFail)throw new DOMException('Full','QuotaExceededError');
    return original.call(this,key,value);
  });
}

it('retries a failed final native event without waiting for another event',async()=>{
  render(<DesktopProgressBridge/>);await waitFor(()=>expect(event).toBeTypeOf('function'));
  vi.useFakeTimers();
  const write=failWrites(DESKTOP_WATCH_PROGRESS_KEY);
  await act(async()=>event({payload:{...checkpoint,state:'closed'}}));
  expect(localStorage.getItem(marker)).toBeNull();expect(loadDesktopWatchProgress()).toEqual([]);
  write.mockRestore();
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
  expect(loadDesktopWatchProgress()[0].positionSeconds).toBe(20);
  expect(JSON.parse(localStorage.getItem(marker)!)).toEqual({persist:1});
  const completed=vi.spyOn(Storage.prototype,'setItem');
  await act(async()=>{await vi.advanceTimersByTimeAsync(10_000);});
  expect(completed).not.toHaveBeenCalled();
});

it('cancels retries and stale event callbacks when the bridge unmounts',async()=>{
  const {unmount}=render(<DesktopProgressBridge/>);await waitFor(()=>expect(event).toBeTypeOf('function'));
  vi.useFakeTimers();
  const write=failWrites(DESKTOP_WATCH_PROGRESS_KEY);
  await act(async()=>event({payload:checkpoint}));
  write.mockRestore();
  unmount();
  const retry=vi.spyOn(Storage.prototype,'setItem');
  await act(async()=>{await vi.advanceTimersByTimeAsync(10_000);event({payload:checkpoint});});
  expect(retry).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});

it('clears owner-scoped failed records on account changes',async()=>{
  const {rerender}=render(<DesktopProgressBridge/>);await waitFor(()=>expect(event).toBeTypeOf('function'));
  vi.useFakeTimers();
  const write=failWrites(DESKTOP_WATCH_PROGRESS_KEY);
  const oldEvent=event;
  await act(async()=>oldEvent({payload:checkpoint}));
  auth.user={id:'new-owner'};
  await act(async()=>rerender(<DesktopProgressBridge/>));
  write.mockRestore();
  const retry=vi.spyOn(Storage.prototype,'setItem');
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000);oldEvent({payload:checkpoint});event({payload:checkpoint});});
  expect(retry).not.toHaveBeenCalled();expect(localStorage.getItem(marker)).toBeNull();
  await act(async()=>event({payload:{...checkpoint,context:{...checkpoint.context,owner:'new-owner'}}}));
  expect(localStorage.getItem('streamnyaa.nativeProgress.applied.v1:new-owner')).not.toBeNull();
  expect(localStorage.getItem(marker)).toBeNull();
});

it('retains only the latest failed sequence for a session',async()=>{
  render(<DesktopProgressBridge/>);await waitFor(()=>expect(event).toBeTypeOf('function'));
  vi.useFakeTimers();
  const write=failWrites(DESKTOP_WATCH_PROGRESS_KEY);
  const newer:NativeCheckpoint={...checkpoint,sequence:2,coverage:{version:2,duration:100,intervals:[[0,30]],lastPosition:30,furthest:30}};
  await act(async()=>{event({payload:checkpoint});event({payload:newer});event({payload:checkpoint});});
  write.mockRestore();
  const retry=vi.spyOn(Storage.prototype,'setItem');
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
  expect(loadDesktopWatchProgress()[0].positionSeconds).toBe(30);
  expect(JSON.parse(localStorage.getItem(marker)!)).toEqual({persist:2});
  expect(retry.mock.calls.filter(([key])=>key===DESKTOP_WATCH_PROGRESS_KEY)).toHaveLength(1);
});

it('retries a failed native acknowledgement after progress itself is durable',async()=>{
  render(<DesktopProgressBridge/>);await waitFor(()=>expect(event).toBeTypeOf('function'));
  vi.useFakeTimers();
  const write=failWrites(marker);
  await act(async()=>event({payload:checkpoint}));
  expect(loadDesktopWatchProgress()[0].positionSeconds).toBe(20);expect(localStorage.getItem(marker)).toBeNull();
  write.mockRestore();
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
  expect(JSON.parse(localStorage.getItem(marker)!)).toEqual({persist:1});
  const completed=vi.spyOn(Storage.prototype,'setItem');
  await act(async()=>{await vi.advanceTimersByTimeAsync(10_000);});
  expect(completed).not.toHaveBeenCalled();
});

it('never schedules retries for invalid or foreign-owner native records',async()=>{
  render(<DesktopProgressBridge/>);await waitFor(()=>expect(event).toBeTypeOf('function'));
  vi.useFakeTimers();
  const write=vi.spyOn(Storage.prototype,'setItem');
  await act(async()=>{
    event({payload:{...checkpoint,context:{...checkpoint.context,owner:'another-owner'}}});
    event({payload:{...checkpoint,context:{...checkpoint.context,animeId:''}}});
    event({payload:{...checkpoint,sequence:NaN}});
    event({payload:{...checkpoint,coverage:{...checkpoint.coverage,intervals:[[0,NaN]]}}});
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(write).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
