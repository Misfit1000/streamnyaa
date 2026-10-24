import test from 'node:test';
import assert from 'node:assert/strict';
import {recentReleases} from '../api/_shared/recentReleases.ts';
import {RequestUsage} from '../api/_shared/requestReuse.ts';
test('release pagination uses a frozen snapshot across filter requests, validates cursors and makes zero provider calls',async()=>{
 const original=globalThis.fetch,priorUrl=process.env.SUPABASE_URL,priorKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://release-fixture.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture';
 const before=Math.floor(Date.now()/1000)-123,base=`recent-releases:v1:${before}:sub`,store=new Map<string,any>();let reads=0;
 const snapshot={version:1,before,track:'sub',fetchedAt:Date.now(),rows:Array.from({length:35},(_,i)=>({canonicalId:`anilist:${i+1}`,anilist_id:i+1,title:`Release ${i}`,airingEpisode:2,airingAt:(before-4000)*1000,releaseTrack:'sub',scheduleStatus:'scheduled',scheduleFetchedAt:Date.now(),scheduleProvider:'animeschedule',scheduleId:`anilist:${i+1}:episode-2:sub`,releaseEpisode:2,releaseAt:(before-i-1)*1000,timingBasis:'confirmed-sub',releasePolicyVersion:1,type:'TV'}))};
 store.set(`${base}:latest`,snapshot);
 const jsonb=(value:any):any=>Array.isArray(value)?value.map(jsonb):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().reverse().map(key=>[key,jsonb(value[key])])):value;
 globalThis.fetch=(async(input:any,init:any)=>{const url=new URL(String(input));assert.equal(url.hostname,'release-fixture.supabase.co','pagination cannot call providers');if(url.pathname.endsWith('/rpc/put_site_snapshot')){const body=JSON.parse(init.body);store.set(body.p_key,jsonb(body.p_payload));return new Response('null');}reads++;const key=(url.searchParams.get('key')||'').replace(/^eq\./,'');const value=store.get(key);return new Response(JSON.stringify(value?[{payload:jsonb(value),fetched_at:new Date(snapshot.fetchedAt).toISOString()}]:[]));}) as any;
 const req=(extra:any={})=>({query:{before,track:'sub',...extra}});
 try{
  const first=await recentReleases(req(),new RequestUsage(req(),'releases'));assert.equal(first.data.length,24);assert.ok(first.nextCursor);assert.equal(first.data[0].releaseEpisode,2);
  assert.ok(store.has(`${base}:${first.snapshot}`),'the API must persist the exact cursor target without a test repairing it');
  const again=await recentReleases(req(),new RequestUsage(req(),'releases'));assert.equal(again.nextCursor,first.nextCursor,'JSONB property order cannot change cursor identity');
  store.set(`${base}:latest`,{...snapshot,rows:[]});
  const next=await recentReleases(req({cursor:first.nextCursor}),new RequestUsage(req(),'releases'));assert.equal(next.data.length,11);assert.equal(next.nextCursor,undefined);assert.equal(next.data[0].canonicalId,'anilist:25');
  await assert.rejects(recentReleases(req({cursor:first.nextCursor,type:'MOVIE'}),new RequestUsage(req(),'releases')),/Invalid release cursor/);
  assert.equal(reads,3);assert.equal(new Set([...first.data,...next.data].map(row=>row.canonicalId)).size,35);
  store.set(`${base}:latest`,{...snapshot,snapshotId:first.snapshot,complete:false,stale:true,retryAt:Date.now()+60000,createdAt:Date.now()});
  const partial=await recentReleases(req(),new RequestUsage(req(),'releases'));assert.equal(partial.complete,false);assert.equal(partial.stale,true);assert.ok(partial.nextCursor,'incomplete provider coverage cannot hide additional confirmed cards');
 }finally{globalThis.fetch=original;if(priorUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=priorUrl;if(priorKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=priorKey;}
});
