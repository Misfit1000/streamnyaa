import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { batchTitleIdentity, buildSourceIdentity, classifySourceIdentity, isBatchRelease } from '../../src/lib/desktopSourceIdentity';
import { batchResolutionKey, inspectDesktopBatch } from '../../src/lib/desktopBatchSources';
import { sourceSearchPlan } from '../../src/lib/desktopSourceDiscovery';
import { selectSourceMode,visibleSeededSources,visibleSourcesForMode } from '../../src/lib/desktopSourceSelection';
import picturedSources from '../fixtures/source-modes-cyberpunk.json';
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
  it('keeps the numeric sequel before the pictured spaced tilde pack range',()=>{
    const sequel=buildSourceIdentity({mal_id:2,title:'Cyberpunk: Edgerunners 2',type:'ONA',relations:[{relation:'Prequel',entry:[{name:'Cyberpunk: Edgerunners'}]}]});
    for(const format of ['1080p NF WEB-DL HEVC EAC3','720p NF WEB-DL AVC EAC3','1080p NF WEB-DL AVC EAC3'])expect(batchTitleIdentity(`[Erai-raws] Cyberpunk: Edgerunners 2 - 01 ~ 10 [${format}][MultiSub] [BATCH]`,sequel)).toBe(true);
    expect(batchTitleIdentity('Cyberpunk: Edgerunners - 01 ~ 10 [BATCH]',sequel)).toBe(false);
  });
  it('keeps seeded uncertain and conflicting releases selectable for explicit file review',()=>{
    const values=[{rawSeeders:300,matchTier:'broad',manualOnly:true},{rawSeeders:12,matchTier:'rejected',manualOnly:false},{rawSeeders:0,matchTier:'exact'}];
    expect(visibleSeededSources(values)).toEqual([values[0],{...values[1],matchTier:'broad',manualOnly:true}]);
  });
  it('does not erase a listing when its peer count is unknown',()=>{
    expect(visibleSeededSources([{rawSeeders:0,seedersKnown:false,matchTier:'broad',manualOnly:true}])).toHaveLength(1);
    expect(visibleSeededSources([{rawSeeders:0,seedersKnown:true,matchTier:'exact'}])).toHaveLength(0);
  });
  it('can display a batch candidate without claiming its files are verified',()=>{
    const candidate={title:'Example Anime Batch',matchTier:'likely',playable:false,batchCandidate:true};
    expect(selectSourceMode([candidate],'strict','sub',()=>1,()=>false)).toEqual([candidate]);
    expect(candidate.playable).toBe(false);
    expect(batchResolutionKey(identity,{infoHash:'ABC'},2)).not.toBe(batchResolutionKey(identity,{infoHash:'ABC'},3));
  });
  it('keeps wrong-season and unresolved batch releases in Broad only, including after cached manifest misses',()=>{
    const rows=visibleSeededSources([
      {title:'Season 2 - 02',rawSeeders:2,matchTier:'exact',playable:true},
      {title:'Season 2 Batch',rawSeeders:2,matchTier:'likely',playable:false,batchCandidate:true},
      {title:'Season 1 Batch',rawSeeders:400,matchTier:'broad',playable:false,manualOnly:true,batchCandidate:true},
      {title:'Season 1 - 02',rawSeeders:400,matchTier:'rejected',playable:false},
      {title:'Season 2 Batch missing episode',rawSeeders:400,matchTier:'rejected',playable:false,batchCandidate:true},
      {title:'Dead release',rawSeeders:0,matchTier:'exact',playable:true},
    ]);
    for(const mode of ['strict','balanced'] as const){
      expect(visibleSourcesForMode(rows,mode,'sub').map(x=>x.title)).toEqual(['Season 2 - 02','Season 2 Batch']);
      expect(selectSourceMode(rows,mode,'sub',()=>90,()=>false).map(x=>x.title)).toEqual(['Season 2 - 02','Season 2 Batch']);
    }
    expect(visibleSourcesForMode(rows,'broad','sub')).toHaveLength(5);
    expect(rows).toHaveLength(5);
  });
  it.each(picturedSources.cases)('classifies the pictured season source: $title',entry=>{
    expect(classifySourceIdentity(entry.title,picturedSources.identity,entry.episode).evidence).toBe(entry.evidence);
    expect(isBatchRelease(entry.title)).toBe(entry.batch);
    if(entry.batchIdentity!==undefined)expect(batchTitleIdentity(entry.title,picturedSources.identity)).toBe(entry.batchIdentity);
  });
  it('keeps the pictured current-season pack and episode in Strict and Balanced, while Broad retains seeded Season 1 releases',()=>{
    const rows=visibleSeededSources(picturedSources.cases.map(entry=>{
      const pack=isBatchRelease(entry.title),verifiedPack=pack&&batchTitleIdentity(entry.title,picturedSources.identity);
      const exact=classifySourceIdentity(entry.title,picturedSources.identity,entry.episode).evidence==='exact';
      return {title:entry.title,rawSeeders:400,playable:exact,matchTier:exact?'exact':verifiedPack?'likely':'broad',manualOnly:!exact&&!verifiedPack,batchCandidate:pack};
    }));
    for(const mode of ['strict','balanced'] as const){
      const visible=visibleSourcesForMode(rows,mode,'sub');
      expect(visible.map(x=>x.title)).toEqual([picturedSources.cases[0].title,picturedSources.cases[7].title,picturedSources.cases[8].title]);
      expect(visible.some(x=>/S01|Season 1/i.test(x.title))).toBe(false);
    }
    expect(visibleSourcesForMode(rows,'broad','sub')).toHaveLength(rows.length);
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
