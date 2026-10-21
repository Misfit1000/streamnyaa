import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { batchTitleIdentity, buildSourceIdentity, isBatchRelease } from '../../src/lib/desktopSourceIdentity';
import { batchResolutionKey, inspectDesktopBatch } from '../../src/lib/desktopBatchSources';
import { sourceSearchPlan } from '../../src/lib/desktopSourceDiscovery';
import { selectSourceMode } from '../../src/lib/desktopSourceSelection';
import DesktopBatchPicker from '../../src/components/DesktopBatchPicker';
afterEach(()=>{cleanup();delete window.__TAURI__;});
const identity=buildSourceIdentity({mal_id:1,title:'Example Anime',type:'TV'});
describe('batch verification and explicit file choice',()=>{
  it('finds packs within the same search plan without an episode filter',()=>{
    const jobs=sourceSearchPlan(identity,2);expect(jobs.slice(0,3).some(job=>job.scope==='title'&&job.query==='Example Anime')).toBe(true);
    expect(jobs.filter(job=>job.scope==='title').every(job=>job.episode===undefined)).toBe(true);
    for(const title of ['[Group] Example Anime 01-10 Batch [1080p]','Example Anime - 01-10 (Complete)','Example Anime Complete Season'])expect(batchTitleIdentity(title,identity)).toBe(true);
    expect(batchTitleIdentity('Different Anime 01-10 Batch',identity)).toBe(false);
    expect(isBatchRelease('Example Anime 01 – 10')).toBe(true);
    const sequel=buildSourceIdentity({mal_id:2,title:'Example Anime Season 2',type:'TV'});expect(batchTitleIdentity('Example Anime Season 1 Batch',sequel)).toBe(false);
  });
  it('can display a batch candidate without claiming its files are verified',()=>{
    const candidate={title:'Example Anime Batch',matchTier:'likely',playable:false,batchCandidate:true};
    expect(selectSourceMode([candidate],'strict','sub',()=>1,()=>false)).toEqual([candidate]);
    expect(candidate.playable).toBe(false);
    expect(batchResolutionKey(identity,{infoHash:'ABC'},2)).not.toBe(batchResolutionKey(identity,{infoHash:'ABC'},3));
  });
  it('opens an accessible picker and dispatches exactly the chosen file',()=>{
    const choose=vi.fn(),close=vi.fn();render(<DesktopBatchPicker open episode={2} files={[{index:4,name:'02 [1080p].mkv',bytes:100},{index:7,name:'02 [720p].mkv',bytes:80}]} onChoose={choose} onClose={close}/>);
    expect(screen.getByRole('dialog',{name:'Choose episode file'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:/02 \[720p\]/}));expect(choose).toHaveBeenCalledWith(expect.objectContaining({index:7}));expect(choose).toHaveBeenCalledOnce();fireEvent.keyDown(document,{key:'Escape'});expect(close).toHaveBeenCalledOnce();
  });
  it('cancels inspection and discards a late result',async()=>{
    let finish!:(value:unknown)=>void;const invoke=vi.fn((name:string)=>name==='inspect_batch_release'?new Promise(resolve=>{finish=resolve;}):Promise.resolve());window.__TAURI__={core:{invoke}} as any;
    const abort=new AbortController(),pending=inspectDesktopBatch({title:'Example Anime Batch',magnet:'magnet:?xt=urn:btih:'+('a'.repeat(40))},identity,2,abort.signal);
    abort.abort();finish({state:'matched',files:[],availableEpisodes:[2]});await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(invoke).toHaveBeenCalledWith('cancel_batch_inspection',expect.objectContaining({requestId:expect.stringMatching(/^batch-/)}));
  });
});
