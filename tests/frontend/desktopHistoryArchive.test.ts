import { beforeEach, afterEach, expect, it, vi } from 'vitest';
beforeEach(()=>{vi.resetModules();localStorage.clear();delete window.__TAURI__;});
afterEach(()=>{vi.useRealTimers();delete window.__TAURI__;});
function native(){
 const records=new Map<string,any>();const calls:any[]=[];
 const invoke=vi.fn(async(command:string,args:any)=>{
  calls.push([command,args]);
  if(command==='get_playback_checkpoints')return{records:[],activeSessionIds:[]};
  if(command!=='history_store')return;
  const {action,request:q}=args;
  if(action==='import'||action==='upsert'){for(const r of q.records)records.set(`${q.owner}:${r.identity}:${r.episode}`,r);return{saved:q.records.length};}
  if(action==='page')return{items:[...records.entries()].filter(([key])=>key.startsWith(`${q.owner}:`)).map(([,v])=>v).slice(0,100),total:records.size,nextOffset:null};
  if(action==='episode')return{record:records.get(`${q.owner}:${q.identity}:${q.episode}`)||null,epoch:0};
  if(action==='title')return null;
  if(action==='readModel')return q.requests.map(()=>null);
  return true;
 });
 window.__TAURI__={core:{invoke}};return{records,invoke,calls};
}
it('migrates all surviving rows before enabling the bounded read model',async()=>{
 const db=native();localStorage.setItem('streamnyaa.desktop.accountProjectionOwner.v1','a');
 localStorage.setItem('streamnyaa.desktop.watchProgress.v1',JSON.stringify(Array.from({length:850},(_,i)=>({animeId:String(i),title:`Anime ${i}`,episode:1,positionSeconds:5,updatedAt:i+1}))));
 const archive=await import('../../src/lib/desktopHistoryArchive');await archive.ensureHistoryArchive('a');
 expect(db.records.size).toBe(850);expect(archive.archiveProgress()).toHaveLength(100);expect(archive.historyArchiveReady()).toBe(true);
 expect(db.calls.filter(([name,args])=>name==='history_store'&&args.action==='import').flatMap(([,args])=>args.request.records)).toHaveLength(850);
});
it('keeps account namespaces separate and preserves source-less resume records',async()=>{
 const db=native();localStorage.setItem('streamnyaa.desktop.accountProjectionOwner.v1','a');localStorage.setItem('streamnyaa.desktop.watchProgress.v1',JSON.stringify([{animeId:'42',title:'Anime',episode:3,positionSeconds:80,updatedAt:5}]));
 const archive=await import('../../src/lib/desktopHistoryArchive');await archive.ensureHistoryArchive('a');expect(archive.archiveRecentSources()[0].magnet).toBe('');
 await archive.ensureHistoryArchive('b');expect(archive.archiveProgress()).toEqual([]);expect(db.records.size).toBe(1);
});
it('retains a backward resume position independently of watched coverage',async()=>{
 native();const a=await import('../../src/lib/desktopHistoryArchive');await a.ensureHistoryArchive('');
 a.saveArchiveEpisode({animeId:'mal:4',identity:'mal:4',title:'Anime',episode:1,positionSeconds:20,watchedCoverage:{version:2,intervals:[[0,80]],furthest:80,lastPosition:20,duration:100},updatedAt:100});
 await a.flushHistoryWrites();expect(a.archiveProgress()[0].positionSeconds).toBe(20);expect(a.archiveProgress()[0].watchedCoverage?.furthest).toBe(80);
});
it('does not acknowledge failed native initialization',async()=>{
 window.__TAURI__={core:{invoke:vi.fn(async()=>{throw new Error('disk full');})}};
 const a=await import('../../src/lib/desktopHistoryArchive');await expect(a.ensureHistoryArchive('a')).rejects.toThrow('disk full');expect(a.historyArchiveReady()).toBe(false);
});
