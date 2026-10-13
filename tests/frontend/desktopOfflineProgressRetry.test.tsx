import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../src/context/AuthContext',()=>({useAuth:()=>({user:null})}));
import DesktopDownloadManager from '../../src/components/DesktopDownloadManager';
import { DESKTOP_WATCH_PROGRESS_KEY, loadDesktopWatchProgress, loadLocalPlaybackHistory } from '../../src/lib/desktop';
import type { DesktopDownloadQueue } from '../../src/lib/desktopDownloads';
const queue:DesktopDownloadQueue={version:1,limitBps:0,items:[{id:'a'.repeat(40),title:'Offline fixture',state:'completed',downloaded:1,total:1,
 magnet:`magnet:?xt=urn:btih:${'a'.repeat(40)}`,episodeLinks:{'1.mkv':{animeId:'anilist:42',episode:1,title:'Example'}},
 progress:{'1.mkv':{seconds:20,duration:100,updatedAt:100,completed:false}}}]};
const native=vi.fn(async()=>queue);
beforeEach(()=>{
 localStorage.clear();vi.useFakeTimers();vi.clearAllMocks();vi.spyOn(document,'hidden','get').mockReturnValue(false);
 HTMLDialogElement.prototype.showModal=function(){this.open=true;};HTMLDialogElement.prototype.close=function(){this.open=false;};
 Object.defineProperty(window,'__TAURI__',{configurable:true,value:{core:{invoke:native},event:{listen:vi.fn(async()=>()=>{})}}});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();localStorage.clear();Object.defineProperty(window,'__TAURI__',{configurable:true,value:undefined});});
it('retries a failed offline save with an unchanged queue, without another native read or user action',async()=>{
 const original=Storage.prototype.setItem;
 const blocked=vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(key,value){
  if(key===DESKTOP_WATCH_PROGRESS_KEY)throw new DOMException('Full','QuotaExceededError');
  return original.call(this,key,value);
 });
 render(<MemoryRouter><DesktopDownloadManager/></MemoryRouter>);
 await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
 expect(loadDesktopWatchProgress()).toEqual([]);expect(native).toHaveBeenCalledTimes(1);
 blocked.mockRestore();await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
 expect(loadDesktopWatchProgress()[0].positionSeconds).toBe(20);
 expect(loadLocalPlaybackHistory()[0].offlineFile).toBe('1.mkv');expect(native).toHaveBeenCalledTimes(1);
 const writes=vi.spyOn(Storage.prototype,'setItem');await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
 expect(writes).not.toHaveBeenCalled();cleanup();expect(vi.getTimerCount()).toBe(0);
});
it('cleans pending offline persistence retries on unmount',async()=>{
 const original=Storage.prototype.setItem;
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(key,value){
  if(key===DESKTOP_WATCH_PROGRESS_KEY)throw new DOMException('Full','QuotaExceededError');
  return original.call(this,key,value);
 });
 const view=render(<MemoryRouter><DesktopDownloadManager/></MemoryRouter>);
 await act(async()=>{await vi.advanceTimersByTimeAsync(0);});view.unmount();
 expect(vi.getTimerCount()).toBe(0);await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
 expect(native).toHaveBeenCalledTimes(1);
});
