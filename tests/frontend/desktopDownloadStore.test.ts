import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesktopDownloadStore } from '../../src/lib/desktopDownloadStore';
import { getDownloadQueue, controlDownloads, chooseDownloadDirectory, listenDownloadsChanged, subscribeDownloadSnapshots, type DesktopDownloadQueue } from '../../src/lib/desktopDownloads';

const queue = (state = 'downloading', downloaded = 1): DesktopDownloadQueue => ({version:1,limitBps:0,
  items:[{id:'one',title:'Example',state:state as any,downloaded,total:100}]});
let hidden = false;
beforeEach(() => { vi.useFakeTimers(); hidden=false; vi.spyOn(document,'hidden','get').mockImplementation(()=>hidden); });
afterEach(() => { vi.useRealTimers(); Object.defineProperty(window,'__TAURI__',{configurable:true,value:undefined}); });
function fixture(initial = queue()) {
  let value=initial, changed=()=>{}, published=(_queue:DesktopDownloadQueue)=>{};
  const unlisten=vi.fn(), unsnap=vi.fn();
  const fetch=vi.fn(async()=>value), listen=vi.fn(async(fn:()=>void)=>{changed=fn;return unlisten;});
  const snapshots=vi.fn((fn:(queue:DesktopDownloadQueue)=>void)=>{published=fn;return unsnap;});
  const store=createDesktopDownloadStore({fetch,listen,snapshots});
  return {store,fetch,listen,unlisten,unsnap,change:()=>changed(),publish:(next:DesktopDownloadQueue)=>published(next),set:(next:DesktopDownloadQueue)=>{value=next;}};
}
describe('shared download observation',()=>{
  it('shares reads/listeners and avoids redraws for identical snapshots',async()=>{
    const f=fixture(),a=vi.fn(),b=vi.fn(),stopA=f.store.subscribe(a),stopB=f.store.subscribe(b);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.fetch).toHaveBeenCalledTimes(1);expect(f.listen).toHaveBeenCalledTimes(1);
    const first=f.store.getSnapshot();a.mockClear();b.mockClear();
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.fetch).toHaveBeenCalledTimes(2);expect(f.store.getSnapshot()).toBe(first);expect(a).not.toHaveBeenCalled();expect(b).not.toHaveBeenCalled();
    stopA();expect(f.unlisten).not.toHaveBeenCalled();stopB();expect(f.unlisten).toHaveBeenCalledTimes(1);expect(f.unsnap).toHaveBeenCalledTimes(1);
  });
  it('stops hidden UI work and catches up immediately without controlling native transfers',async()=>{
    const f=fixture(),stop=f.store.subscribe(vi.fn());await vi.advanceTimersByTimeAsync(0);
    hidden=true;document.dispatchEvent(new Event('visibilitychange'));
    f.set(queue('completed',100));for(let i=0;i<20;i++)f.change();
    await vi.advanceTimersByTimeAsync(60_000);expect(f.fetch).toHaveBeenCalledTimes(1);
    hidden=false;document.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(0);
    expect(f.fetch).toHaveBeenCalledTimes(2);expect(f.store.getSnapshot().queue?.items[0].state).toBe('completed');stop();
  });
  it('does not fetch while initially hidden',async()=>{
    hidden=true;const f=fixture(),stop=f.store.subscribe(vi.fn());await vi.advanceTimersByTimeAsync(60_000);
    expect(f.fetch).not.toHaveBeenCalled();hidden=false;document.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(0);
    expect(f.fetch).toHaveBeenCalledTimes(1);stop();
  });
  it('flushes a hidden command snapshot on resume even if the native read is identical',async()=>{
    const f=fixture(),observer=vi.fn(),stop=f.store.subscribe(observer);await vi.advanceTimersByTimeAsync(0);observer.mockClear();
    hidden=true;document.dispatchEvent(new Event('visibilitychange'));
    const completed=queue('completed',100);f.set(completed);f.publish(completed);expect(observer).not.toHaveBeenCalled();
    hidden=false;document.dispatchEvent(new Event('visibilitychange'));expect(observer).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);expect(observer).toHaveBeenCalledTimes(1);expect(f.store.getSnapshot().queue?.items[0].state).toBe('completed');stop();
  });
  it('coalesces event bursts and rechecks a change arriving during a read',async()=>{
    const f=fixture();let complete!:(value:DesktopDownloadQueue)=>void;
    f.fetch.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
    const stop=f.store.subscribe(vi.fn());await vi.advanceTimersByTimeAsync(0);
    for(let i=0;i<20;i++)f.change();f.set(queue('paused',10));complete(queue());
    await vi.advanceTimersByTimeAsync(249);expect(f.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);expect(f.fetch).toHaveBeenCalledTimes(2);expect(f.store.getSnapshot().queue?.items[0].state).toBe('paused');stop();
  });
  it('retains usable content on failure and recovers automatically',async()=>{
    const f=fixture(),stop=f.store.subscribe(vi.fn());await vi.advanceTimersByTimeAsync(0);
    f.fetch.mockRejectedValueOnce(new Error('Connection interrupted'));await vi.advanceTimersByTimeAsync(2000);
    expect(f.store.getSnapshot().queue?.items[0].id).toBe('one');expect(f.store.getSnapshot().error).toContain('interrupted');
    f.set(queue('completed',100));await vi.advanceTimersByTimeAsync(5000);expect(f.store.getSnapshot().error).toBe('');expect(f.store.getSnapshot().queue?.items[0].state).toBe('completed');stop();
  });
  it('publishes returned command state immediately and cleans all UI timers on unmount',async()=>{
    const f=fixture(),stop=f.store.subscribe(vi.fn());await vi.advanceTimersByTimeAsync(0);
    f.publish(queue('paused',20));expect(f.store.getSnapshot().queue?.items[0].state).toBe('paused');expect(f.fetch).toHaveBeenCalledTimes(1);
    stop();await vi.advanceTimersByTimeAsync(60_000);expect(f.fetch).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
  });
  it('switches to active fallback cadence after Resume even if native events are missing',async()=>{
    const f=fixture(queue('paused')),stop=f.store.subscribe(vi.fn());await vi.advanceTimersByTimeAsync(0);
    f.set(queue('downloading',20));f.publish(queue('downloading',20));
    await vi.advanceTimersByTimeAsync(2000);expect(f.fetch).toHaveBeenCalledTimes(2);stop();
  });
  it('keeps a fast idle fallback when native event attachment fails',async()=>{
    const f=fixture({version:1,limitBps:0,items:[]});f.listen.mockRejectedValueOnce(new Error('Events unavailable'));
    const stop=f.store.subscribe(vi.fn());await vi.advanceTimersByTimeAsync(0);
    f.set(queue());await vi.advanceTimersByTimeAsync(2000);
    expect(f.fetch).toHaveBeenCalledTimes(2);expect(f.store.getSnapshot().queue?.items[0].state).toBe('downloading');stop();
  });
  it('unsubscribes a delayed native listener instead of resurrecting an unmounted store',async()=>{
    const f=fixture();let attach!:(stop:()=>void)=>void;
    f.listen.mockImplementationOnce(()=>new Promise(resolve=>{attach=resolve;}));
    const stop=f.store.subscribe(vi.fn());stop();attach(f.unlisten);await vi.advanceTimersByTimeAsync(0);
    expect(f.unlisten).toHaveBeenCalledTimes(1);expect(f.store.getSnapshot().queue).toBeUndefined();
  });
});
describe('native queue coordination',()=>{
  function bridge(invoke:any,listen:any=vi.fn(async()=>()=>{})) { Object.defineProperty(window,'__TAURI__',{configurable:true,value:{core:{invoke},event:{listen}}}); }
  it('serializes delayed Pause and Resume without regressing the returned snapshot',async()=>{
    let finishPause!:(value:DesktopDownloadQueue)=>void;
    const native=vi.fn((_command:string,args:any)=>args.action==='pause'?new Promise(resolve=>{finishPause=resolve;}):Promise.resolve(queue('downloading',30)));
    bridge(native);const states:string[]=[],stop=subscribeDownloadSnapshots(value=>states.push(value.items[0].state));
    const pause=controlDownloads(['one'],'pause'),resume=controlDownloads(['one'],'resume');
    await vi.advanceTimersByTimeAsync(0);expect(native).toHaveBeenCalledTimes(1);
    finishPause(queue('paused',30));await Promise.all([pause,resume]);
    expect(native).toHaveBeenCalledTimes(2);expect(states).toEqual(['paused','downloading']);stop();
  });
  it('continues controls after a failed mutation and reconciles a chooser without blocking controls',async()=>{
    let finishChooser!:(value:DesktopDownloadQueue|null)=>void;
    const native=vi.fn((command:string,args:any)=>{
      if(command==='choose_download_directory')return new Promise(resolve=>{finishChooser=resolve;});
      if(args?.action==='pause')return Promise.reject(new Error('Pause failed'));
      return Promise.resolve(queue('downloading',40));
    });
    bridge(native);const chooser=chooseDownloadDirectory(),states:string[]=[],stop=subscribeDownloadSnapshots(value=>states.push(value.items[0].state));
    await expect(controlDownloads(['one'],'pause')).rejects.toThrow('Pause failed');
    await controlDownloads(['one'],'resume');expect(states).toEqual(['downloading']);
    finishChooser(queue('paused',1));expect((await chooser)?.items[0].state).toBe('downloading');
    expect(native.mock.calls.at(-1)?.[0]).toBe('get_download_queue');expect(states).toEqual(['downloading','downloading']);stop();
  });
  it('coalesces concurrent callers and prevents an old read from overwriting a completed action',async()=>{
    let finish!:(value:DesktopDownloadQueue)=>void;
    const native=vi.fn((command:string)=>command==='get_download_queue'?new Promise(resolve=>{finish=resolve;}):Promise.resolve(queue('paused',30)));
    bridge(native);const snapshots=vi.fn(),stop=subscribeDownloadSnapshots(snapshots);
    const a=getDownloadQueue(),b=getDownloadQueue();expect(native).toHaveBeenCalledTimes(1);
    await controlDownloads(['one'],'pause');finish(queue());
    expect((await a).items[0].state).toBe('paused');expect(await b).toEqual(await a);
    expect(snapshots.mock.calls.every(([value])=>value.items[0].state==='paused')).toBe(true);stop();
  });
  it('shares one native listener across legacy and store consumers, suppresses hidden updates, and cleans up',async()=>{
    let event!:(payload:any)=>void;const nativeStop=vi.fn(),listen=vi.fn(async(_name:string,callback:any)=>{event=callback;return nativeStop;});
    bridge(vi.fn(),listen);const a=vi.fn(),b=vi.fn();const [stopA,stopB]=await Promise.all([listenDownloadsChanged(a),listenDownloadsChanged(b)]);
    expect(listen).toHaveBeenCalledTimes(1);event({payload:{version:1}});expect(a).toHaveBeenCalledTimes(1);expect(b).toHaveBeenCalledTimes(1);
    hidden=true;event({payload:{version:1}});expect(a).toHaveBeenCalledTimes(1);
    hidden=false;document.dispatchEvent(new Event('visibilitychange'));expect(a).toHaveBeenCalledTimes(2);expect(b).toHaveBeenCalledTimes(2);
    stopA();expect(nativeStop).not.toHaveBeenCalled();stopB();expect(nativeStop).toHaveBeenCalledTimes(1);
  });
  it('does not publish cancellation and isolates a failing UI observer from native command success',async()=>{
    bridge(vi.fn(async(command:string)=>command==='choose_download_directory'?null:queue('paused')));
    const observer=vi.fn(),stopA=subscribeDownloadSnapshots(()=>{throw new Error('UI observer failed');}),stopB=subscribeDownloadSnapshots(observer);
    expect(await chooseDownloadDirectory()).toBeNull();expect(observer).not.toHaveBeenCalled();
    expect((await controlDownloads(['one'],'pause')).items[0].state).toBe('paused');expect(observer).toHaveBeenCalledTimes(1);stopA();stopB();
  });
});
