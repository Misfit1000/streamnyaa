import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import metadata from '../api/stream-sources.ts';
import { publicCalendar } from '../api/_shared/publicCalendar.ts';
import { RequestUsage } from '../api/_shared/requestReuse.ts';
const response=()=>({code:0,headers:{} as Record<string,string>,body:undefined as any,setHeader(k:string,v:string){this.headers[k.toLowerCase()]=v;},status(code:number){this.code=code;return this;},json(body:any){this.body=body;return this;},end(){return this;}});
test('AniList HTTP statuses and Retry-After survive the gateway, including non-JSON denial',async()=>{
 const saved=globalThis.fetch;
 try {
  for(const status of [403,429,503]){
   globalThis.fetch=(async()=>new Response(status===403?'Forbidden':JSON.stringify({errors:[{message:'Unavailable'}]}),{status,headers:{'Retry-After':'90'}})) as any;
   const result=response();await metadata({method:'POST',headers:{},query:{provider:'anilist'},body:{query:`query Audit${status}{Media(id:${status}){id}}`}},result);
   assert.equal(result.code,status);assert.equal(result.headers['retry-after'],'90');assert.equal(result.body.provider,'anilist');
  }
 }finally{globalThis.fetch=saved;}
});
test('durable Calendar reconciliation removes superseded aliases without removing episodes, tracks or conflicts',async()=>{
 const db=await PGlite.create();
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  await db.exec(await readFile(new URL('../supabase/site-publishing.sql',import.meta.url),'utf8'));
  const repair=await readFile(new URL('../supabase/site-calendar-repair.sql',import.meta.url),'utf8');await db.exec(repair);await db.exec(repair);
  const row={canonicalId:'animeschedule:fixture',scheduleId:'animeschedule:fixture:episode-4:dub',sourceRoute:'fixture',airingEpisode:4,releaseTrack:'dub',scheduleFetchedAt:Date.now(),scheduleProvider:'animeschedule',scheduleStatus:'delayed',airingAt:0};
  await db.query('select merge_calendar_snapshot($1,$2)', ['calendar-fixture',JSON.stringify([row,{...row,airingEpisode:3,scheduleId:'animeschedule:fixture:episode-3:dub'}])]);
  const linked={...row,canonicalId:'anilist:12',anilist_id:12,mal_id:13,scheduleId:'anilist:12:episode-4:dub'};
  const result=await db.query<any>('select merge_calendar_snapshot($1,$2) as rows',['calendar-fixture',JSON.stringify([linked])]);
  assert.equal(result.rows[0].rows.length,2);assert.ok(!result.rows[0].rows.some((value:any)=>value.scheduleId===row.scheduleId));
  const conflict={...linked,anilist_id:99,canonicalId:'anilist:99',scheduleId:'anilist:99:episode-4:dub'};
  const conflicting=await db.query<any>('select merge_calendar_snapshot($1,$2) as rows',['calendar-fixture',JSON.stringify([conflict])]);assert.equal(conflicting.rows[0].rows.length,3);
  await db.exec('SET ROLE authenticated;');await assert.rejects(db.query('select merge_calendar_snapshot($1,$2)',['blocked','[]']),/permission denied/);
 }finally{await db.close();}
});

test('progressive Calendar paints saved rows before providers and reuses more than 200 verified mappings',async()=>{
 const original=globalThis.fetch,old=Object.fromEntries(['SUPABASE_URL','SUPABASE_SECRET_KEY','ANIMESCHEDULE_TOKEN'].map(k=>[k,process.env[k]]));
 process.env.SUPABASE_URL='https://progressive-fixture.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture';process.env.ANIMESCHEDULE_TOKEN='fixture';
 const start=Math.floor(Date.now()/86400_000)*86400,end=start+7*86400,from=Math.floor(start/86400)*86400,until=Math.ceil(end/86400)*86400,store=new Map<string,any>(),calls:string[]=[];let active=0,maxActive=0;
 const rows=Array.from({length:230},(_,i)=>({route:`audit-${i}`,episodeNumber:4,airType:'sub',airingStatus:'unaired',episodeDate:new Date((start+3600)*1000).toISOString()}));
 store.set(`calendar-records:${from}:${until}`,{payload:[{canonicalId:'anilist:8000',anilist_id:8000,scheduleId:'anilist:8000:episode-4:original',airingEpisode:4,releaseTrack:'original',airingAt:start+3600,title:'Saved',previousAiringAt:(start+3600)*1000,scheduleStatus:'rescheduled',scheduleProvider:'anilist',scheduleFetchedAt:Date.now()}],fetched_at:new Date().toISOString()});
 for(let i=0;i<230;i++)store.set(`animeschedule:anime:audit-${i}`,{payload:{route:`audit-${i}`,websites:{anilist:`https://anilist.co/anime/${8000+i}`}},fetched_at:'2025-01-01T00:00:00Z'});
 globalThis.fetch=(async(input:any,init:any={})=>{
  const url=new URL(String(input)),body=init.body?JSON.parse(init.body):{},reply=(value:any)=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  if(url.hostname==='progressive-fixture.supabase.co'){
   if(url.pathname.endsWith('/claim_site_snapshot'))return reply(true);
   if(url.pathname.endsWith('/put_site_snapshot')){store.set(body.p_key,{payload:body.p_payload,fetched_at:body.p_fetched_at});return reply(null);}
   if(url.pathname.endsWith('/merge_calendar_snapshot'))return reply(body.p_rows);
   if(init.method==='DELETE')return reply(null);
   const key=url.searchParams.get('key')||'';
   if(key.startsWith('in.(')){active++;maxActive=Math.max(active,maxActive);await new Promise(resolve=>setTimeout(resolve,1));active--;return reply(key.slice(4,-1).split(',').flatMap(key=>store.has(key)?[{key,...store.get(key)}]:[]));}
   const item=store.get(key.replace(/^eq\./,''));return reply(item?[item]:[]);
  }
  calls.push(url.pathname);
  if(url.hostname==='graphql.anilist.co')return reply({data:{Page:{pageInfo:{hasNextPage:false},airingSchedules:[]}}});
  if(url.pathname.includes('/anime/'))throw Error('Cached identity must not be rediscovered');
  return reply(rows);
 }) as any;
 try{
  const request={query:{start,end,progressive:'1'}},initial=await publicCalendar(request,new RequestUsage(request,'calendar'));
  assert.equal(initial.initialSnapshot,true);assert.equal(calls.length,0);assert.equal(initial.data[0].title,'Saved');assert.equal(initial.data[0].scheduleStatus,'scheduled');assert.equal(initial.data[0].previousAiringAt,undefined);
  const next={query:{...request.query,cursor:initial.cursor}},result=await publicCalendar(next,new RequestUsage(next,'calendar'));
  assert.equal(result.pendingIdentities,0);assert.equal(result.continuation?.identitiesComplete,true);assert.equal(result.cursor,undefined);assert.equal(result.complete,true);assert.equal(result.data.length,231);
  assert.ok(!calls.some(path=>path.includes('/anime/')));assert.ok(maxActive<=3);
 }finally{globalThis.fetch=original;for(const [key,value] of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
