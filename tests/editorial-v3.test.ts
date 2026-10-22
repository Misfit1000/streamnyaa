import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {calculateRanking,type EvidenceBrief} from '../api/_shared/publishingData.ts';
import {prepareEditorialBrief,periodLabel,reportNovelty} from '../api/_shared/editorialPolicy.ts';
import {validateEditorial,enqueueManualGeneration,runGeneration} from '../api/_shared/publishing.ts';
import {publicActivityEvidence} from '../src/lib/activityEvidence.ts';
import {articleFromEditorialDraft,publicArticleContent} from '../src/lib/editorialPresentation.ts';
import blog from '../api/blog.ts';

function report(start=Date.UTC(2026,9,15)){
  const records=Array.from({length:6},(_,i)=>Array.from({length:7},(_,day)=>({mediaId:i+1,date:(start+day*86400_000)/1000,trending:100-i*10+day,popularity:1000-i,media:{title:{english:`Fixture Series ${i+1}`}}}))).flat();
  const ranking=calculateRanking(records,{start,end:start+7*86400_000});
  const brief:EvidenceBrief={kind:'data-report',subject:'Activity',headline:'Old generic title',fingerprint:`report:${start}`,sources:[{id:'anilist-activity',title:'Metric definition',url:'https://docs.anilist.co/reference/object/mediatrend',primary:true,text:JSON.stringify(ranking),retrievedAt:'2026-10-22T00:05:00Z'}],facts:[],items:[],ranking,
    activityEvidence:{version:1,calculationVersion:1,provider:'anilist',retrievedAt:'2026-10-22T00:05:00Z',start:ranking.start,endExclusive:ranking.end,candidateIds:ranking.candidateIds,titles:records.filter((_,i)=>i%7===0).map(row=>({id:row.mediaId,title:row.media.title.english})),observations:records.map(row=>({mediaId:row.mediaId,date:row.date,activity:row.trending,popularity:row.popularity}))}};
  prepareEditorialBrief(brief);return brief;
}
function draft(brief:EvidenceBrief){return{headline:brief.headline,excerpt:'The captured AniList observations describe engagement within an inspected sample. They cannot establish streaming audiences or explain the cause of the observed pattern.',paragraphs:[{text:'The daily comparison checks the two titles on dates both were observed. It describes the pattern in these records without attributing it to a trailer, an episode release or a particular audience response.',sourceIds:['anilist-activity'],findingIds:['sample-leader']}],sections:[]};}

test('new manual requests are independent, idempotent and serialized without changing legacy drafts',async()=>{
  const db=await PGlite.create();
  try{
    await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;');
    for(const file of ['site-publishing.sql','site-publishing-review.sql'])await db.exec(await readFile(new URL(`../supabase/${file}`,import.meta.url),'utf8'));
    const legacy=(await db.query<any>("INSERT INTO blog_generation_runs(idempotency_key,kind,status,checkpoint) VALUES('daily:2026-10-22','daily','published','{\"published\":[\"existing\"],\"draft\":{\"headline\":\"Keep this draft\"}}') RETURNING *")).rows[0];
    const migration=await readFile(new URL('../supabase/site-publishing-v3.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
    const enqueue=async(key:string,limit=1,origin='manual')=>(await db.query<any>('SELECT * FROM enqueue_blog_generation($1,$2,$3,$4)',[key,'daily',limit,origin])).rows[0];
    const first=await enqueue('manual:owner:request-1',2);assert.equal(first.editorial_version,3);assert.equal(first.origin,'manual');assert.equal(first.checkpoint.limit,2);assert.equal(first.publication_mode,'review');
    assert.equal((await enqueue('manual:owner:request-1',2)).id,first.id);
    const token='00000000-0000-0000-0000-000000000001';
    assert.equal((await db.query('SELECT * FROM claim_blog_run($1,$2)',[first.id,token])).rows.length,1);
    assert.equal((await enqueue('manual:owner:request-2')).id,first.id);
    await db.query("SELECT save_blog_run($1,$2,'awaiting_review','{}',null)",[first.id,token]);
    // A lost response reuses its mapped job, even after that worker has stopped.
    assert.equal((await enqueue('manual:owner:request-2')).id,first.id);
    const next=await enqueue('manual:owner:request-3');assert.notEqual(next.id,first.id);assert.equal(next.checkpoint.limit,1);
    const scheduled=await enqueue('daily:2026-10-23',2,'scheduled');assert.notEqual(scheduled.id,next.id);assert.equal((await enqueue('daily:2026-10-23',2,'scheduled')).id,scheduled.id);
    const claims=await Promise.all([db.query('SELECT * FROM claim_blog_run($1,$2)',[next.id,token]),db.query('SELECT * FROM claim_blog_run($1,$2)',[scheduled.id,token])]);assert.equal(claims.reduce((sum,r)=>sum+r.rows.length,0),1);
    const saved=(await db.query<any>('SELECT * FROM blog_generation_runs WHERE id=$1',[legacy.id])).rows[0];assert.deepEqual(saved.checkpoint,legacy.checkpoint);assert.equal(saved.editorial_version,2);assert.equal(saved.origin,null);
    assert.equal((await db.query<any>('SELECT automatic_enabled FROM blog_publication_settings')).rows[0].automatic_enabled,false);
    for(const role of ['anon','authenticated']){await db.exec(`SET ROLE ${role}`);await assert.rejects(db.query('SELECT * FROM blog_manual_requests'),/permission denied/);await assert.rejects(enqueue('manual:not-allowed'),/permission denied/);await db.exec('RESET ROLE');}
  }finally{await db.close();}
});

test('manual identities are qualified by authenticated owner and valid request IDs',async()=>{
  const original=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SECRET_KEY'] as const,old=keys.map(k=>process.env[k]);process.env.SUPABASE_URL='https://manual.test';process.env.SUPABASE_SECRET_KEY='fixture';const bodies:any[]=[];
  globalThis.fetch=(async(input:any,init:any={})=>{const url=String(input);if(url.includes('blog_publication_settings'))return Response.json([{automatic_enabled:true}]);const body=JSON.parse(init.body);bodies.push(body);return Response.json([{id:body.p_key,origin:'manual',publication_mode:'review'}]);}) as any;
  try{const id='00000000-0000-0000-0000-000000000123';assert.equal((await enqueueManualGeneration('owner-a',id)).id,(await enqueueManualGeneration('owner-a',id)).id);assert.notEqual((await enqueueManualGeneration('owner-a',id)).id,(await enqueueManualGeneration('owner-b',id)).id);await assert.rejects(enqueueManualGeneration('owner','invalid'),/request ID/);assert.ok(bodies.every(b=>b.p_origin==='manual'));}
  finally{globalThis.fetch=original;keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]);}
});

test('v3 uses the inclusive period, verified entity/value pairs and a single results presentation',()=>{
  const brief=report(),raw=draft(brief);assert.equal(periodLabel(brief.ranking!),'2026-10-15–2026-10-21 UTC');assert.match(raw.headline,/Fixture Series 1 leads.*2026-10-21/);assert.deepEqual(validateEditorial(raw,brief),[]);
  const first=JSON.stringify(brief);prepareEditorialBrief(brief);assert.equal(JSON.stringify(brief),first);
  assert.ok(validateEditorial({...raw,paragraphs:[{...raw.paragraphs[0],text:'Fixture Series 2 recorded 103 daily activity in the sample, which was the value associated with the other title.'}]},brief).some(e=>/statistical claims/.test(e)));
  const wrong=structuredClone(brief);wrong.ranking!.rows[0].mean++;assert.ok(validateEditorial(raw,wrong).some(e=>/captured observations/.test(e)));
  assert.ok(validateEditorial({...raw,headline:'AniList Activity Report: October 15–22, 2026',sections:[{heading:'Repeated list',body:'Here are * **Fixture Series 1**: 103 points and **Fixture Series 2**: 93 points all over again.',sourceIds:['anilist-activity']}]},brief).some(e=>/Markdown/.test(e)));
  assert.ok(validateEditorial({...raw,paragraphs:[raw.paragraphs[0],raw.paragraphs[0]]},brief).some(e=>/repeat/i.test(e)));
  const article=articleFromEditorialDraft(raw,brief.findings);assert.equal(article.paragraphs.length,brief.findings!.length+1);assert.equal(article.sections.length,0);
});

test('activity reports skip shifted windows, unchanged comparable rankings and already covered periods',()=>{
  const brief=report(),prior={contentKind:'data-report',ranking:brief.ranking,activityEvidence:brief.activityEvidence};assert.equal(reportNovelty(brief,[]),undefined);assert.match(reportNovelty(brief,[prior])!,/already been covered/);
  const shifted=report(Date.UTC(2026,9,16));assert.match(reportNovelty(shifted,[prior])!,/not comparable/);
  const next=report(Date.UTC(2026,9,22));assert.match(reportNovelty(next,[prior])!,/unchanged/);
  [next.ranking!.rows[0],next.ranking!.rows[1]]=[next.ranking!.rows[1],next.ranking!.rows[0]];assert.equal(reportNovelty(next,[prior]),undefined);
  next.ranking!.rows[0].days=4;assert.match(reportNovelty(next,[prior])!,/not comparable/);
});

test('captured observations are bounded, qualified and projected without arbitrary stored fields',()=>{
  const value=report().activityEvidence!;assert.ok(publicActivityEvidence(value));assert.equal((publicActivityEvidence({...value,secret:'must not expose'}) as any).secret,undefined);
  assert.equal(publicActivityEvidence({...value,observations:[...value.observations,value.observations[0]]}),undefined);
  assert.equal(publicActivityEvidence({...value,observations:[{...value.observations[0],mediaId:999}]}),undefined);
  assert.equal(publicActivityEvidence({...value,observations:[{...value.observations[0],date:Date.parse(value.endExclusive)/1000}]}),undefined);
  const post:any={qualityVersion:3,activityEvidence:value};assert.equal(publicArticleContent(post).activityEvidence,undefined);assert.equal(publicArticleContent(post).hasActivityEvidence,true);assert.equal(post.activityEvidence,value);
});
test('a version-3 worker writes a private draft using verified findings and the shared render shape',async()=>{
  const previous=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SECRET_KEY','GEMINI_API_KEY'] as const,old=keys.map(k=>process.env[k]);process.env.SUPABASE_URL='https://v3-writer.test';process.env.SUPABASE_SECRET_KEY='fixture';process.env.GEMINI_API_KEY='fixture';
  const brief=report(),raw=draft(brief),saves:any[]=[],run={id:'00000000-0000-0000-0000-000000000876',kind:'daily',origin:'manual',editorial_version:3,publication_mode:'review',created_at:'2026-10-22T00:00:00Z',checkpoint:{briefs:[brief],limit:1,published:[]}};let modelCalls=0,publicWrites=0;
  globalThis.fetch=(async(input:any,init:any={})=>{const url=new URL(String(input)),body=init.body?JSON.parse(init.body):{};
    if(url.hostname==='generativelanguage.googleapis.com'){modelCalls++;assert.match(body.contents[0].parts[0].text,/EDITORIAL POLICY 3/);assert.ok(body.generationConfig.responseSchema.properties.paragraphs.items.properties.findingIds);assert.ok(!body.contents[0].parts[0].text.includes('"observations":'));return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(raw)}]}}]});}
    if(url.pathname.endsWith('/claim_blog_run'))return Response.json([run]);if(url.pathname.endsWith('/claim_blog_topic'))return Response.json(true);if(url.pathname.endsWith('/save_blog_run')){saves.push(body);return Response.json(true);}if(url.pathname.endsWith('/blog_publication_settings'))return Response.json([{automatic_enabled:true}]);if(init.method==='POST'&&url.pathname.endsWith('/blog_articles'))publicWrites++;return Response.json([]);
  }) as any;
  try{await runGeneration(run.id);assert.equal(modelCalls,1);assert.equal(publicWrites,0);assert.equal(saves.at(-1).p_status,'awaiting_review');assert.equal(saves.at(-1).p_checkpoint.modelWork.request.editorialVersion,3);assert.equal(saves.at(-1).p_checkpoint.draft.draft.headline,brief.headline);}
  finally{globalThis.fetch=previous;keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]);}
});

test('published evidence reads never call models/providers, mutate storage or reveal drafts',async()=>{
  const original=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SECRET_KEY'] as const,old=keys.map(k=>process.env[k]);process.env.SUPABASE_URL='https://evidence.test';process.env.SUPABASE_SECRET_KEY='fixture';const requests:any[]=[];let published=true;
  const saved={articleSlug:'evidence-fixture',qualityVersion:3,articleStatus:'published',activityEvidence:{...report().activityEvidence,privateField:'do-not-relay'}};
  globalThis.fetch=(async(input:any,init:any={})=>{requests.push({url:String(input),method:init.method||'GET'});return Response.json([{content:{...saved,articleStatus:published?'published':'awaiting_review'}}]);}) as any;
  const res=()=>({code:0,body:null as any,headers:{} as any,setHeader(k:string,v:string){this.headers[k]=v;},status(code:number){this.code=code;return this;},json(value:any){this.body=value;return this;}});
  try{const one=res();await blog({method:'GET',query:{slug:'evidence-fixture',evidence:'1'}},one);assert.equal(one.code,200);assert.equal(one.body.evidence.privateField,undefined);assert.equal(one.body.evidence.observations.length,42);published=false;const two=res();await blog({method:'GET',query:{slug:'evidence-fixture',evidence:'1'}},two);assert.equal(two.code,404);assert.ok(requests.every(r=>r.method==='GET'&&r.url.includes('evidence.test/rest/v1/blog_articles')));}
  finally{globalThis.fetch=original;keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]);}
});
