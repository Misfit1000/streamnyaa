import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../src/context/AuthContext',()=>({useAuth:()=>({user:{id:'owner'},loading:false})}));
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
  Object.defineProperty(window,'__TAURI__',{configurable:true,value:{core:{invoke:vi.fn(async(command:string)=>command==='get_playback_checkpoints'?{records:[],activeSessionIds:[]}:undefined)},
    event:{listen:vi.fn(async(_name:string,callback:typeof event)=>{event=callback;return()=>{};})}}});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();localStorage.clear();Object.defineProperty(window,'__TAURI__',{configurable:true,value:undefined});});
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
