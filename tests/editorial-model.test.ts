import test from 'node:test';
import assert from 'node:assert/strict';
import {requestEditorialModel,type ModelRequestState} from '../api/_shared/editorialModel.ts';
import {authorBrief,runGeneration,type AuthorWork} from '../api/_shared/publishing.ts';
const reply=(value:any,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json',...headers}});
const brief:any={kind:'data-report',fingerprint:'controlled-model-brief',subject:'Recorded activity',headline:'A recorded activity comparison',sources:[{id:'source',primary:true,text:'The sample concerns recorded catalog activity.'}],facts:[],items:[]};
const draft={headline:'Reading the limits of recorded anime activity',excerpt:'The inspected catalog records support a limited comparison, while missing days and uninspected titles remain outside its scope.',paragraphs:[{text:'The supplied catalog records describe activity within the inspected sample. They do not establish streaming audiences, revenue, or the number of people who watched an episode. Readers should understand the named metric before comparing titles or interpreting a chart as a broader audience ranking.',sourceIds:['source']},{text:'Coverage also limits the comparison. An absent daily record is a gap rather than evidence of no interest, and titles outside the inspected collection are not ranked by this report. Keeping these boundaries visible helps readers assess which conclusions the recorded information actually supports.',sourceIds:['source']}],sections:[]};
const generated=(article=draft,finishReason='STOP')=>({candidates:[{finishReason,content:{parts:[{text:JSON.stringify(article)}]}}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:200,thoughtsTokenCount:80}});

test('a single Gemini 503 recovers inside the same bounded job and retains the 2.5 model',async()=>{
 const previous=globalThis.fetch,oldModel=process.env.GEMINI_MODEL;delete process.env.GEMINI_MODEL;
 let now=100000,calls=0;const waits:number[]=[],saved:any[]=[],bodies:any[]=[];const state:ModelRequestState={};
 globalThis.fetch=(async(_url:any,init:any)=>{calls++;bodies.push(JSON.parse(init.body));return calls===1?reply({error:{status:'UNAVAILABLE',message:'Temporarily overloaded'}},503):reply(generated());}) as any;
 try{
  const result=await requestEditorialModel('Verified brief',now+240000,state,async()=>{saved.push(structuredClone(state));},{requests:0,limit:3},{now:()=>now,sleep:async ms=>{waits.push(ms);now+=ms;}});
  assert.equal(result.candidates[0].finishReason,'STOP');assert.equal(calls,2);assert.deepEqual(waits,[30000]);assert.equal(state.model,'gemini-2.5-flash');assert.equal(state.lastStatus,200);assert.equal(state.failures,0);assert.equal(state.retryAt,undefined);
  assert.equal(saved[1].lastStatus,503);assert.equal(saved[1].retryAt,130000);assert.equal(bodies[0].generationConfig.thinkingConfig.thinkingBudget,2048);assert.ok(bodies[0].generationConfig.responseSchema);
 }finally{globalThis.fetch=previous;if(oldModel===undefined)delete process.env.GEMINI_MODEL;else process.env.GEMINI_MODEL=oldModel;}
});

test('persistent overload has a shared three-request cap and increasing durable backoff',async()=>{
 const previous=globalThis.fetch;let now=100000,calls=0;const waits:number[]=[],state:ModelRequestState={model:'gemini-2.5-flash'};
 globalThis.fetch=(async()=>{calls++;return reply({error:{status:'UNAVAILABLE',message:'Busy'}},503);}) as any;
 const time={now:()=>now,sleep:async(ms:number)=>{waits.push(ms);now+=ms;}};
 try{
  await assert.rejects(requestEditorialModel('brief',now+240000,state,async()=>{},{requests:0,limit:3},time),(error:any)=>error.status===503&&error.retryAt===310000);
  assert.equal(calls,3);assert.deepEqual(waits,[30000,60000]);assert.equal(state.failures,3);
  await assert.rejects(requestEditorialModel('brief',now+240000,state,async()=>{},{requests:0,limit:3},time),(error:any)=>error.retryAt===610000);
  assert.equal(calls,4);assert.equal(state.failures,4);assert.equal(waits.at(-1),120000);
 }finally{globalThis.fetch=previous;}
});

test('provider deadlines, denied access and throttling never become immediate retry loops',async()=>{
 const previous=globalThis.fetch,oldKey=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='fixture-secret';
 try{for(const status of [403,429,503]){let calls=0,slept=false;const state:ModelRequestState={model:'gemini-2.5-flash'};
  globalThis.fetch=(async()=>{calls++;return reply({error:{status:'UPSTREAM',message:'fixture-secret https://example.test/?key=fixture-secret'}},status,{'Retry-After':'180'});}) as any;
  await assert.rejects(requestEditorialModel('brief',240000,state,async()=>{},{requests:0,limit:3},{now:()=>0,sleep:async()=>{slept=true;}}),(error:any)=>error.status===status&&!error.message.includes('fixture-secret'));
  assert.equal(calls,1);assert.equal(slept,false);if(status!==403)assert.ok(state.retryAt!>=180000);
 }}finally{globalThis.fetch=previous;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;}
});

test('a saved first draft and validation feedback survive a worker interruption without rewriting that draft',async()=>{
 const previous=globalThis.fetch,oldKey=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='fixture';let calls=0;const prompts:string[]=[],work:AuthorWork={};
 globalThis.fetch=(async(_url:any,init:any)=>{calls++;prompts.push(JSON.parse(init.body).contents[0].parts[0].text);return reply(generated(calls===1?{...draft,excerpt:'Too short'}:draft));}) as any;
 try{
  await assert.rejects(authorBrief(brief,[],Date.now()+240000,work,async()=>{if(work.revision===1)throw Error('Controlled worker interruption');}),/Controlled worker/);
  assert.equal(work.revision,1);assert.equal(work.draft.excerpt,'Too short');assert.equal(calls,1);
  const result=await authorBrief(brief,[],Date.now()+240000,work);assert.deepEqual(result.errors,[]);assert.equal(calls,2);assert.match(prompts[1],/Repair these validation failures once/);
  await authorBrief(brief,[],Date.now()+240000,work);assert.equal(calls,2);assert.equal(work.request?.usage?.thinking,80);
 }finally{globalThis.fetch=previous;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;}
});

test('truncated output is retained as a failed draft and never accepted as a completed article',async()=>{
 const previous=globalThis.fetch,oldKey=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='fixture';let calls=0;const work:AuthorWork={};
 globalThis.fetch=(async()=>{calls++;return reply(generated(draft,'MAX_TOKENS'));}) as any;
 try{const result=await authorBrief(brief,[],Date.now()+240000,work);assert.equal(calls,2);assert.match(result.errors[0],/incomplete.*MAX_TOKENS/);assert.equal(work.draft.headline,draft.headline);}
 finally{globalThis.fetch=previous;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;}
});

test('the actual worker saves the generated article privately and keeps automatic publication disabled',async()=>{
 const previous=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY,oldModelKey=process.env.GEMINI_API_KEY;
 process.env.SUPABASE_URL='https://writer-fixture.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture';process.env.GEMINI_API_KEY='fixture';
 let generatedCount=0,publishedWrites=0;const saves:any[]=[],run:any={id:'00000000-0000-0000-0000-000000000005',kind:'daily',publication_mode:'review',created_at:new Date().toISOString(),checkpoint:{briefs:[brief],published:[],next:0,limit:1}};
 globalThis.fetch=(async(input:any,init:any={})=>{const url=new URL(String(input)),body=init.body?JSON.parse(init.body):{};
  if(url.hostname==='generativelanguage.googleapis.com'){generatedCount++;return reply(generated());}
  if(url.pathname.endsWith('/claim_blog_run'))return reply([run]);
  if(url.pathname.endsWith('/save_blog_run')){saves.push(body);return reply(true);}
  if(url.pathname.endsWith('/claim_blog_topic'))return reply(true);
  if(url.pathname.endsWith('/blog_publication_settings'))return reply([{automatic_enabled:false}]);
  if(url.pathname.endsWith('/blog_articles')&&init.method==='POST')publishedWrites++;
  return reply([]);
 }) as any;
 try{await runGeneration(run.id);assert.equal(generatedCount,1);assert.equal(publishedWrites,0);assert.equal(saves.at(-1).p_status,'awaiting_review');assert.equal(saves.at(-1).p_checkpoint.draft.draft.headline,draft.headline);assert.ok(saves.some(save=>save.p_checkpoint.modelWork?.revision===1));}
 finally{globalThis.fetch=previous;for(const [name,value]of Object.entries({SUPABASE_URL:oldUrl,SUPABASE_SECRET_KEY:oldKey,GEMINI_API_KEY:oldModelKey})){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
});
