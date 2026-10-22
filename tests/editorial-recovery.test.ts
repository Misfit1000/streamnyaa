import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorialTransport,rankingBrief } from '../api/_shared/publishingData.ts';
import { publicSnapshot,writePublicSnapshot } from '../api/_shared/publicSnapshots.ts';
import { enqueueGeneration,validateEditorial } from '../api/_shared/publishing.ts';

test('daily activity uses genuine per-title history and resumes completed batches after a provider failure',async()=>{
 const original=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY,store=new Map<string,any>();
 process.env.SUPABASE_URL='https://editorial-fixture.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture';
 globalThis.fetch=(async(input:any,init:any={})=>{const url=new URL(String(input)),body=init.body?JSON.parse(init.body):{},reply=(value:any)=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  if(url.pathname.endsWith('/claim_site_snapshot'))return reply(true);
  if(url.pathname.endsWith('/put_site_snapshot')){store.set(body.p_key,{payload:body.p_payload,fetched_at:body.p_fetched_at});return reply(true);}
  if(init.method==='DELETE')return reply(null);
  const row=store.get((url.searchParams.get('key')||'').replace(/^eq\./,''));return reply(row?[row]:[]);
 }) as any;
 const now=Date.UTC(2026,9,17),end=now,start=end-7*86400_000,calls:string[]=[];let fail=true;
 class FixtureTransport extends EditorialTransport {async graph(query:string){calls.push(query);
  if(query.includes('EditorialActivityCandidates'))return {data:{Page:{media:Array.from({length:13},(_,i)=>({id:i+2001}))}}};
  const data:any={};for(const match of query.matchAll(/m(\d+):Media\(id:(\d+),type:ANIME\)/g)){
   const id=Number(match[2]);if(fail&&id===2006)throw Object.assign(Error('Controlled activity outage'),{status:503,provider:'graphql.anilist.co'});
   data[`m${match[1]}`]={id,idMal:id+100,type:'ANIME',title:{english:`Series ${id}`},coverImage:{large:'/fixture.svg'},trends:{nodes:Array.from({length:7},(_,day)=>({mediaId:id,date:(start+day*86400_000)/1000,trending:id+day,popularity:id*10}))}};
  }return {data};
 }}
 try{
  await assert.rejects(rankingBrief(new FixtureTransport(),'weekly-ranking',now),(error:any)=>error.status===503);
  assert.equal(calls.length,3);fail=false;calls.length=0;
  const result=await rankingBrief(new FixtureTransport(),'weekly-ranking',now);assert.ok(result);assert.equal(calls.length,2);assert.ok(calls.every(query=>query.includes('trends(perPage:21')));assert.ok(calls.every(query=>!query.includes('mediaTrends(')));
  assert.equal(result.ranking?.rows.length,10);assert.equal(result.ranking?.honorableMentions.length,3);assert.equal(result.ranking?.candidateCount,13);assert.equal(result.ranking?.rows[0].days,7);assert.match(result.ranking!.coverage,/not the instantaneous/);
  const total=calls.length;await rankingBrief(new FixtureTransport(),'data-report',now);assert.equal(calls.length,total);
  await writePublicSnapshot('editorial:fixture-stale',{value:'saved'},Date.now()-7200000,60);
  const stale=await publicSnapshot('editorial:fixture-stale',60,async()=>{throw Object.assign(Error('Provider denied'),{status:429,provider:'fixture',retryAfter:'120'});});
  assert.equal(stale.stale,true);assert.equal((stale.refreshError as any).status,429);assert.deepEqual(stale.value,{value:'saved'});
 }finally{globalThis.fetch=original;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;}
});

test('Generate reactivates a paused daily job but preserves a future provider deadline and discovery checkpoint',async()=>{
 const original=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;process.env.SUPABASE_URL='https://manual-fixture.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture';let run:any;
 globalThis.fetch=(async(input:any,init:any={})=>{const path=new URL(String(input)).pathname,body=init.body?JSON.parse(init.body):{};let result:any;
  if(path.endsWith('blog_publication_settings'))result=[{automatic_enabled:false}];else if(init.method==='POST')result=[];else if(init.method==='PATCH'){run={...run,...body};result=[run];}else result=[run];return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
 }) as any;
 try{for(const future of [false,true]){run={id:'00000000-0000-0000-0000-000000000003',status:'pending',checkpoint:{resumeRequired:true,retryAt:future?Date.now()+120000:Date.now()-1,discovery:{feedIndex:2},published:[]}};
  const result=await enqueueGeneration('daily',1,Date.now(),'review');assert.equal(result.checkpoint.resumeRequired,future);assert.equal(result.checkpoint.discovery.feedIndex,2);assert.equal(result.publication_mode,'review');}
 }finally{globalThis.fetch=original;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;}
});

test('numeric evidence accepts thousands separators without accepting a substring as a different statistic',()=>{
 const brief:any={kind:'data-report',subject:'Daily activity',headline:'Recorded daily activity',facts:[],sources:[{id:'activity',primary:true,text:'{"activity":1295}'}]};
 const first='The inspected title recorded 1,295 daily activity units in the supplied provider snapshot. This measure describes activity recorded by the named catalog service and does not establish streaming totals, revenue, or the number of people who watched an episode. The report keeps that distinction visible when explaining the data.';
 const second='The candidate sample limits the scope of the comparison. Titles outside that inspected collection may have substantial activity, and an absent daily record is a gap rather than evidence of zero interest. Readers can use the recorded period and coverage statement to understand what the chart actually compares.';
 const draft={headline:'A careful reading of recorded anime activity',excerpt:'The supplied provider snapshot supports a limited activity comparison with explicit coverage and meaningful uncertainty.',paragraphs:[{text:first,sourceIds:['activity']},{text:second,sourceIds:['activity']}],sections:[]};
 assert.ok(!validateEditorial(draft,brief).some(error=>/Unsupported numeric/.test(error)));
 assert.ok(validateEditorial({...draft,paragraphs:[{text:first.replace('1,295','129'),sourceIds:['activity']},draft.paragraphs[1]]},brief).some(error=>/Unsupported numeric claim: 129/.test(error)));
});

test('an interrupted activity fallback retries discovery instead of treating its empty news list as final',async()=>{
 const original=globalThis.fetch,originalGraph=EditorialTransport.prototype.graph,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://activity-resume-fixture.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture';
 const created=Date.UTC(2026,9,14),start=created-7*86400_000,store=new Map<string,any>();let fail=true,calls=0;
 let run:any={id:'00000000-0000-0000-0000-000000000008',kind:'daily',publication_mode:'review',created_at:new Date(created).toISOString(),checkpoint:{briefs:[],stage:'Activity report discovery',published:[],discovery:{feedIndex:6}}};
 globalThis.fetch=(async(input:any,init:any={})=>{const url=new URL(String(input)),body=init.body?JSON.parse(init.body):{};let value:any=[];
  if(url.pathname.endsWith('/claim_blog_run'))value=[run];
  else if(url.pathname.endsWith('/save_blog_run')){run={...run,status:body.p_status,checkpoint:body.p_checkpoint,reason:body.p_reason};value=true;}
  else if(url.pathname.endsWith('/claim_blog_topic'))value=false;
  else if(url.pathname.endsWith('/claim_site_snapshot'))value=true;
  else if(url.pathname.endsWith('/put_site_snapshot')){store.set(body.p_key,{payload:body.p_payload,fetched_at:body.p_fetched_at});value=true;}
  else if(url.pathname.endsWith('/site_public_snapshots')){const row=store.get((url.searchParams.get('key')||'').replace(/^eq\./,''));value=row?[row]:[];}
  return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
 }) as any;
 EditorialTransport.prototype.graph=async function(query:string){calls++;if(fail)throw Object.assign(Error('Controlled history outage'),{status:503,provider:'graphql.anilist.co'});
  if(query.includes('EditorialActivityCandidates'))return{data:{Page:{media:Array.from({length:5},(_,i)=>({id:3001+i}))}}};
  const data:any={};for(const match of query.matchAll(/m(\d+):Media\(id:(\d+),type:ANIME\)/g)){const id=Number(match[2]);data[`m${match[1]}`]={id,idMal:id+100,type:'ANIME',title:{english:`Series ${id}`},trends:{nodes:Array.from({length:7},(_,i)=>({mediaId:id,date:(start+i*86400_000)/1000,trending:id,popularity:id}))}};}return{data};
 };
 try{
  const {runGeneration}=await import('../api/_shared/publishing.ts');await runGeneration(run.id);
  assert.equal(run.status,'pending');assert.equal(run.checkpoint.activityPending,true);assert.equal(run.checkpoint.lastFailure.status,503);
  delete run.checkpoint.retryAt;fail=false;calls=0;await runGeneration(run.id);
  assert.equal(calls,2);assert.equal(run.checkpoint.activityPending,undefined);assert.equal(run.checkpoint.briefs[0].kind,'data-report');assert.equal(run.checkpoint.discovery.feedIndex,6);
 }finally{globalThis.fetch=original;EditorialTransport.prototype.graph=originalGraph;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;}
});
