import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {EditorialTransport,parseEvidenceDocument,calculateRanking,type EvidenceBrief} from '../api/_shared/publishingData.ts';
import {guideBriefV4,verifiedNewsBriefV4,prepareEditorialV4,editorialPromptV4,validateEditorialV4,discoverNewsV4,discoverGuidesV4,type EditorialDiscoveryV4} from '../api/_shared/editorialV4.ts';
import {validateEditorial,runGeneration} from '../api/_shared/publishing.ts';
import {publicArticleContent} from '../src/lib/editorialPresentation.ts';

const now=Date.now(),recentDate=new Date(now-4*86400_000).toISOString();
const item=(id=940001)=>({id,idMal:id+1,title:{english:'Fixture Horizon',romaji:'Fixture no Horizon',native:'フィクスチャーホライゾン'},format:'MOVIE',status:'NOT_YET_RELEASED',episodes:1,startDate:{year:null,month:null,day:null},studios:{nodes:[{name:'Fixture Studio'}]},relations:{edges:[{relationType:'PREQUEL',node:{id:9,type:'ANIME',title:{english:'Fixture Origin'},format:'TV'}}]},externalLinks:[{site:'Official Site',url:`https://official.test/${id}`}],coverImage:{large:'/fixture.jpg'}});
const official=(id=940001)=>({url:`https://official.test/${id}`,text:'Fixture Horizon is the next animated film in this project. The production information identifies Fixture Studio and introduces the returning cast and the new setting. The official pages separate the film project from the television series and direct readers to the announcement and staff pages for confirmed details. Distribution information is discussed through the project website; a worldwide streaming launch is not stated. Readers can check these pages for changes without assuming a specific platform or territory.',links:[],retrievedAt:new Date(now).toISOString()});
function guide(id=940001){return guideBriefV4(item(id),official(id),new Date(now).toISOString())!;}
function draft(subject='Fixture Horizon'){
  return{headline:`${subject}: how the film connects to the earlier series`,excerpt:'The official project pages and the catalog describe different parts of this installment. This guide separates the announced film information from the recorded franchise connection, without assuming a worldwide streaming release.',
    paragraphs:[{text:'The project website presents Fixture Horizon as an animated film and identifies the production studio. That is a format distinction, rather than an announcement of another television season. Readers looking for distribution details should consult the official information instead of treating a catalog status as a promise about access in their country.',sourceIds:['official']},
      {text:'AniList links the installment to Fixture Origin through an explicit prequel relation. That connection supplies context for someone deciding which entry they are looking at, but it does not establish an exhaustive viewing order or prove that a particular streaming service carries either title. The guide therefore keeps the catalog relationship separate from official distribution claims.',sourceIds:['catalog']}],sections:[]};
}
const envKeys=['SUPABASE_URL','SUPABASE_SECRET_KEY','GEMINI_API_KEY'] as const;
async function fixture<T>(action:()=>Promise<T>,fetcher:typeof fetch=async()=>Response.json([])){
  const saved=envKeys.map(k=>process.env[k]),old=globalThis.fetch;process.env.SUPABASE_URL='https://editorial-v4.test';process.env.SUPABASE_SECRET_KEY='fixture';process.env.GEMINI_API_KEY='fixture';globalThis.fetch=fetcher;
  try{return await action();}finally{globalThis.fetch=old;envKeys.forEach((k,i)=>saved[i]===undefined?delete process.env[k]:process.env[k]=saved[i]);}
}

test('publication dates include JSON-LD and ignore modification and footer timestamps',()=>{
  const body=official().text;
  const parsed=parseEvidenceDocument(`<script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","datePublished":"${recentDate}","dateModified":"2026-10-23"}]}</script><article>${body}</article><footer><time datetime="2030-01-01">Footer</time></footer>`,'https://official.test/story');
  assert.equal(parsed.publishedAt,recentDate);assert.ok(!parsed.text.includes('Footer'));
  assert.equal(parseEvidenceDocument(`<meta property="article:modified_time" content="${recentDate}"><article>${body}</article><footer><time datetime="${recentDate}">Footer</time></footer>`,'https://official.test/story').publishedAt,undefined);
});
test('official page titles retain identity when the body uses an image logo, without making an empty page sufficient',()=>{
  const doc=parseEvidenceDocument(`<title>Official anime: Fixture Horizon</title><header><img alt="Fixture Horizon"></header><main>${official().text.replaceAll('Fixture Horizon','The animated project')}</main>`,official().url);
  assert.ok(guideBriefV4(item(),{...doc,retrievedAt:recentDate},recentDate));
  assert.throws(()=>parseEvidenceDocument('<title>Fixture Horizon</title><main>Only navigation.</main>',official().url),/insufficient/);
  const sequel={...item(),title:{english:'Fixture Horizon Season 2'}};
  assert.equal(guideBriefV4(sequel,{...doc,retrievedAt:recentDate},recentDate),undefined);
  assert.ok(guideBriefV4({...item(),title:{english:'Fixture: Horizon'}},{...doc,retrievedAt:recentDate},recentDate));
});
test('a dated linked report can corroborate an undated official statement without inventing its date',()=>{
  const doc=official(),report={url:'https://www.animenewsnetwork.com/news/fixture',publishedAt:recentDate,retrievedAt:recentDate,text:'The official site confirms Fixture Horizon as an animated film.',links:[doc.url]};
  const brief=verifiedNewsBriefV4(item(),{title:'Fixture Horizon confirms its movie format',url:report.url,date:recentDate},report,doc,false,now)!;
  assert.equal(brief.newsDate,recentDate);assert.equal(brief.sources[0].publishedAt,undefined);assert.equal(brief.sources[1].primary,false);
  const newer=verifiedNewsBriefV4(item(),{title:'A differently worded headline',url:report.url}, {...report,publishedAt:new Date(now-86400_000).toISOString()},doc,false,now)!;
  assert.equal(newer.fingerprint,brief.fingerprint);
  assert.equal(verifiedNewsBriefV4(item(),{title:'Lead',url:report.url}, {...report,links:[]},doc,false,now),undefined);
  assert.equal(verifiedNewsBriefV4(item(),{title:'Lead',url:report.url,date:recentDate}, {...report,publishedAt:undefined},doc,false,now),undefined);
  assert.equal(verifiedNewsBriefV4(item(),{title:'Lead',url:report.url}, {...report,publishedAt:'2030-01-01'},doc,false,now),undefined);
});
test('guides require title-specific official information and do not use changing scores as novelty',()=>{
  const one=guide();assert.equal(one.kind,'guide');assert.ok(one.readerQuestion?.includes('franchise'));assert.equal(one.sources[1].id,'catalog');
  const changed={...item(),popularity:999999,averageScore:99,nextAiringEpisode:{episode:9}};
  assert.equal(guideBriefV4(changed,{...official(),retrievedAt:'2030-01-01'},'2030-01-01')!.fingerprint,one.fingerprint);
  assert.equal(guideBriefV4(item(),{...official(),text:'Too little evidence.'},recentDate),undefined);
  assert.equal(guideBriefV4(item(),{...official(),text:'An unrelated corporate website. '.repeat(30)},recentDate),undefined);
  assert.equal(guideBriefV4({...item(),format:null},official(),recentDate),undefined);
});
test('a useful researched guide passes without being forced to pretend it is breaking news',()=>{
  const brief=guide(),raw=draft();prepareEditorialV4(brief);assert.deepEqual(validateEditorial(raw,brief),[]);
  const prompt=editorialPromptV4(brief,[],undefined);assert.match(prompt,/researched guide/i);assert.match(prompt,/without any new announcement/);assert.match(prompt,/No fixed section count/);assert.ok(!prompt.includes('EDITORIAL POLICY 3'));
  assert.ok(validateEditorial({...raw,headline:'Fixture Horizon review: a masterpiece'},brief).some(reason=>/viewing experience/.test(reason)));
  assert.ok(validateEditorial({...raw,paragraphs:[{...raw.paragraphs[0],text:'**Fixture Horizon** has a fabricated extra detail that is not confirmed in the supplied official source.'},raw.paragraphs[1]]},brief).some(reason=>/Markdown/.test(reason)));
  assert.ok(validateEditorial({...raw,paragraphs:[{...raw.paragraphs[0],text:raw.paragraphs[0].text+' The director died.'},raw.paragraphs[1]]},brief).some(reason=>/sensitive claim/.test(reason)));
  assert.ok(validateEditorial(raw,{...brief,sources:brief.sources.filter(s=>s.id==='catalog')}).some(reason=>/official source/.test(reason)));
});
test('concise confirmed updates no longer require an invented consequence or extra context sentence',()=>{
  const brief:EvidenceBrief={...guide(),kind:'news',headline:'Fixture Horizon confirms its film format',newsDate:recentDate,context:[],readerQuestion:undefined};prepareEditorialV4(brief);
  const raw=draft();raw.headline='Fixture no Horizon confirms its film format';assert.deepEqual(validateEditorial(raw,brief),[]);
  assert.ok(validateEditorial({...raw,paragraphs:[{...raw.paragraphs[0],sourceIds:['fabricated']},raw.paragraphs[1]]},brief).some(reason=>/attribution/.test(reason)));
});
test('foreign-language wordplay cannot become a literal percentage or borrow support from another citation',()=>{
  const brief=guide(),raw=draft();brief.sources[0].text+=' 作者は小説版と漫画版で内容が99割程度違うと冗談を述べています。';
  raw.paragraphs[0].text+=' The author says the versions are 99 percent different.';
  assert.ok(validateEditorialV4(raw,brief).some(reason=>/exact percentage/.test(reason)));
  brief.sources[1].text+=' A separate record mentions 99 percent.';
  assert.ok(validateEditorialV4(raw,brief).some(reason=>/exact percentage/.test(reason)));
  brief.sources[0].text+=' A documented survey reports 99% for this metric.';
  assert.ok(!validateEditorialV4(raw,brief).some(reason=>/exact percentage/.test(reason)));
  raw.paragraphs[0].text=raw.paragraphs[0].text.replace('99 percent','99.5 percent');
  assert.ok(validateEditorialV4(raw,brief).some(reason=>/exact percentage/.test(reason)));
  assert.match(editorialPromptV4(brief,[],undefined),/jokes, idioms and promotional hyperbole are not literal statistics/);
});
test('a researched guide selects relevant credits instead of treating a full roster as depth',()=>{
  const brief=guide(),raw=draft();raw.sections=[{heading:'Production credits',sourceIds:['official'],body:'The production lists a director and series composition, character designer and chief animation director. It also credits gag and sub-character design, another animation director, monster design and action animation direction. The main animator appears alongside color design, art direction, art design, prop design and special effects. A separate director is responsible for photography. Editing, music, sound direction and sound effects are also listed. The animation producer and the production committee round out the credits, with every credited person introduced as another name rather than explaining how any of those names resolves the reader question.'}];
  assert.ok(validateEditorialV4(raw,brief).some(reason=>/exhaustive credits/.test(reason)));
  raw.sections[0].body='The official site identifies the animation studio and director. Those credits establish who is making this entry; they do not establish distribution rights or an unannounced release date.';
  assert.deepEqual(validateEditorialV4(raw,brief),[]);
});
test('version four retains calculated-data safeguards and hides raw observations from normal public reads',()=>{
  const end=Math.floor(now/86400_000)*86400_000,start=end-7*86400_000;
  const records=Array.from({length:5},(_,i)=>Array.from({length:7},(_,day)=>({mediaId:i+1,date:(start+day*86400_000)/1000,trending:100-i*10+day,popularity:1000-i,media:{title:{english:`Fixture Series ${i+1}`}}}))).flat();
  const ranking=calculateRanking(records,{start,end});
  const brief:EvidenceBrief={kind:'data-report',subject:'AniList activity',headline:'Initial',fingerprint:'v4-data',sources:[{id:'anilist-activity',title:'Recorded activity',url:'https://docs.anilist.co/reference/object/mediatrend',primary:true,text:JSON.stringify(ranking),retrievedAt:recentDate}],facts:[],items:[],ranking,
    activityEvidence:{version:1,calculationVersion:1,provider:'anilist',retrievedAt:recentDate,start:ranking.start,endExclusive:ranking.end,candidateIds:ranking.candidateIds,titles:records.filter((_,i)=>i%7===0).map(row=>({id:row.mediaId,title:row.media.title.english})),observations:records.map(row=>({mediaId:row.mediaId,date:row.date,activity:row.trending,popularity:row.popularity}))}};
  prepareEditorialV4(brief);assert.equal(brief.editorialVersion,4);
  const raw={headline:brief.headline,excerpt:'The captured observations describe activity within a bounded AniList sample. They do not establish streaming audiences or explain a cause for the observed pattern.',paragraphs:[{text:'These observations describe engagement on the catalog service. They cannot identify a viewing platform or show whether an announcement caused a change in the recorded pattern, so those questions remain outside the available evidence.',sourceIds:['anilist-activity'],findingIds:['sample-leader']}],sections:[]};
  assert.deepEqual(validateEditorial(raw,brief),[]);
  assert.ok(validateEditorial({...raw,paragraphs:[{...raw.paragraphs[0],text:'Fixture Series 2 had 103 mean activity, the number attributed to the wrong title.'}]},brief).some(reason=>/statistical claims/.test(reason)));
  const projected=publicArticleContent({qualityVersion:4,activityEvidence:brief.activityEvidence} as any);assert.equal(projected.activityEvidence,undefined);assert.equal(projected.hasActivityEvidence,true);
});
test('provider denial is retained without repeated requests to that host or blocking other hosts',async()=>{
  let calls=0;await fixture(async()=>{const t=new EditorialTransport();await assert.rejects(t.fetch('https://denied.test/a',{},0),(e:any)=>e.status===429&&e.retryAfter==='600');await assert.rejects(t.fetch('https://denied.test/b',{},0),(e:any)=>e.status===429);assert.equal(calls,1);await t.fetch('https://healthy.test/a',{},0);assert.equal(calls,2);},(async input=>{calls++;return String(input).includes('denied.test')?new Response('limited',{status:429,headers:{'Retry-After':'600'}}):Response.json({ok:true});}) as typeof fetch);
});
test('seven-day news discovery accepts a four-day lead and preserves checkpoint progress',async()=>{
  const media=item(940010),state:EditorialDiscoveryV4={media:[media],catalogRetrievedAt:recentDate},saves:any[]=[];
  class Transport extends EditorialTransport{async fetch(){return Response.json({data:[{title:'Fixture Horizon confirms movie release plans',url:'https://www.animenewsnetwork.com/news/v4-fixture',date:recentDate}]});}async document(url:string){return url.includes('animenewsnetwork')?{url,text:'Fixture Horizon confirmation and documented official source. '.repeat(5),links:[official(media.id).url],publishedAt:recentDate}:official(media.id);}}
  await fixture(async()=>{const briefs=await discoverNewsV4(new Transport(),state,async()=>{saves.push(structuredClone(state));},[],now);assert.equal(briefs.length,1);assert.equal(state.feedIndex,1);assert.equal(state.leadIndex,1);assert.ok(saves.length>=2);});
});
test('an unavailable news feed still permits a separately verified guide',async()=>{
  const media=item(940020),state:EditorialDiscoveryV4={media:[media],catalogRetrievedAt:recentDate};
  class Transport extends EditorialTransport{async fetch():Promise<Response>{throw Object.assign(Error('News provider unavailable'),{status:503,provider:'api.tenrai.org'});}async document(url:string){return official(media.id);}}
  await fixture(async()=>{const t=new Transport();assert.equal((await discoverNewsV4(t,state,async()=>{},[],now)).length,0);assert.equal(state.unavailable?.[0].provider,'api.tenrai.org');const guides=await discoverGuidesV4(t,state,async()=>{},[],now);assert.equal(guides.length,1);assert.equal(guides[0].kind,'guide');});
});
test('guide discovery can continue past already reserved packs of candidates without re-fetching the catalog',async()=>{
  const media=Array.from({length:5},(_,i)=>item(940030+i)),state:EditorialDiscoveryV4={media,catalogRetrievedAt:recentDate};let reads=0;
  class Transport extends EditorialTransport{async document(url:string){reads++;return official(Number(new URL(url).pathname.slice(1)));}}
  await fixture(async()=>{const t=new Transport();assert.equal((await discoverGuidesV4(t,state,async()=>{},[],now,3)).length,3);assert.equal(state.guideIndex,3);assert.equal((await discoverGuidesV4(t,state,async()=>{},[],now,6)).length,5);assert.equal(state.guideIndex,5);assert.equal(reads,5);});
});
test('guide research upgrades known HTTP official links to HTTPS and checkpoints alternate-site progress',async()=>{
  const media={...item(940050),externalLinks:[{site:'Official Site',url:'http://official.test/unrelated'},{site:'Official Site',url:'https://official.test/940050'}]},state:EditorialDiscoveryV4={media:[media],catalogRetrievedAt:recentDate},urls:string[]=[];
  let interrupted=true;
  class Transport extends EditorialTransport{async document(url:string){urls.push(url);if(url.endsWith('/unrelated'))return{...official(media.id),url,text:'Unrelated corporate information. '.repeat(20)};if(interrupted)throw Error('Publishing request/time budget reached; retry this run.');return official(media.id);}}
  await fixture(async()=>{const t=new Transport();await assert.rejects(discoverGuidesV4(t,state,async()=>{},[],now),/budget/);assert.equal(state.guideLinks?.[media.id],1);assert.equal(state.guideIndex,0);interrupted=false;assert.equal((await discoverGuidesV4(t,state,async()=>{},[],now)).length,1);assert.deepEqual(urls,['https://official.test/unrelated','https://official.test/940050','https://official.test/940050']);state.guideIndex=0;assert.equal((await discoverGuidesV4(t,state,async()=>{},[],now)).length,1);assert.equal(urls.length,3);});
});
test('v4 migration is repeatable, pins new jobs only and preserves private drafts and publication mode',async()=>{
  const db=await PGlite.create();try{
    await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;');
    for(const file of ['site-publishing.sql','site-publishing-review.sql','site-publishing-v3.sql'])await db.exec(await readFile(new URL(`../supabase/${file}`,import.meta.url),'utf8'));
    const legacy=(await db.query<any>("INSERT INTO blog_generation_runs(idempotency_key,kind,status,editorial_version,checkpoint) VALUES('manual:legacy-fixture','daily','awaiting_review',3,'{\"draft\":{\"headline\":\"Keep existing draft\"}}') RETURNING *")).rows[0];
    const sql=await readFile(new URL('../supabase/site-publishing-v4.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
    const saved=(await db.query<any>('SELECT * FROM blog_generation_runs WHERE id=$1',[legacy.id])).rows[0];assert.deepEqual(saved,legacy);
    const enqueue=async(key:string)=>(await db.query<any>("SELECT * FROM enqueue_blog_generation($1,'daily',2,'manual')",[key])).rows[0];
    const run=await enqueue('manual:version-four');assert.equal(run.editorial_version,4);assert.equal(run.publication_mode,'review');assert.equal(run.checkpoint.limit,2);assert.equal((await enqueue('manual:version-four')).id,run.id);
    assert.equal((await db.query<any>('SELECT automatic_enabled FROM blog_publication_settings')).rows[0].automatic_enabled,false);
    for(const role of ['anon','authenticated']){await db.exec(`SET ROLE ${role}`);await assert.rejects(enqueue('manual:unauthorized'),/permission denied/);await db.exec('RESET ROLE');}
  }finally{await db.close();}
});
test('an already-covered news candidate falls through to a private guide draft instead of ending the job',async()=>{
  const media=item(940040),covered={...guide(media.id),kind:'news',fingerprint:'covered-news',newsDate:new Date().toISOString()},saves:any[]=[];let modelCalls=0,publicWrites=0;
  const run={id:'00000000-0000-0000-0000-000000000444',kind:'daily',origin:'manual',editorial_version:4,publication_mode:'review',created_at:new Date().toISOString(),checkpoint:{briefs:[covered],limit:1,published:[],newsChecked:true,discoveryV4:{media:[media],catalogRetrievedAt:recentDate}}};
  const oldDocument=EditorialTransport.prototype.document;EditorialTransport.prototype.document=async()=>official(media.id);
  try{await fixture(async()=>{await runGeneration(run.id);assert.equal(modelCalls,1);assert.equal(publicWrites,0);assert.equal(saves.at(-1).p_status,'awaiting_review');assert.equal(saves.at(-1).p_checkpoint.briefs[1].kind,'guide');assert.equal(saves.at(-1).p_checkpoint.modelWork.request.editorialVersion,4);},(async(input:any,init:any={})=>{
    const url=new URL(String(input)),body=init.body?JSON.parse(init.body):{};
    if(url.hostname==='generativelanguage.googleapis.com'){modelCalls++;assert.match(body.contents[0].parts[0].text,/EDITORIAL POLICY 4/);return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(draft())}]}}]});}
    assert.equal(url.hostname,'editorial-v4.test');
    if(url.pathname.endsWith('/claim_blog_run'))return Response.json([run]);
    if(url.pathname.endsWith('/save_blog_run')){saves.push(body);return Response.json(true);}
    if(url.pathname.endsWith('/claim_blog_topic'))return Response.json(body.p_fingerprint!=='covered-news');
    if(url.pathname.endsWith('/claim_site_snapshot')||url.pathname.endsWith('/put_site_snapshot'))return Response.json(true);
    if(url.pathname.endsWith('/blog_publication_settings'))return Response.json([{automatic_enabled:true}]);
    if(init.method==='POST'&&url.pathname.endsWith('/blog_articles'))publicWrites++;
    return Response.json([]);
  }) as typeof fetch);}finally{EditorialTransport.prototype.document=oldDocument;}
});
test('a fresh manual job completes discovery, selects a stable catalog page and saves a private draft',async()=>{
  const media=item(940060),saves:any[]=[];let modelCalls=0,publicWrites=0,catalogReads=0;
  const run={id:'00000000-0000-0000-0000-000000000445',idempotency_key:'manual:fresh-discovery-fixture',kind:'daily',origin:'manual',editorial_version:4,publication_mode:'review',created_at:new Date().toISOString(),checkpoint:{limit:1,published:[]}};
  const old={graph:EditorialTransport.prototype.graph,fetch:EditorialTransport.prototype.fetch,document:EditorialTransport.prototype.document};
  EditorialTransport.prototype.graph=async query=>{catalogReads++;assert.match(query,/EditorialCandidates/);return{data:{active:{media:[media]},upcoming:{media:[]},established:{media:[]}}};};
  EditorialTransport.prototype.fetch=async url=>{assert.match(url,/api\.tenrai\.org/);return Response.json({data:[]});};
  EditorialTransport.prototype.document=async()=>official(media.id);
  try{await fixture(async()=>{
    await runGeneration(run.id);const final=saves.at(-1);
    assert.equal(final.p_status,'awaiting_review');assert.equal(final.p_checkpoint.briefs[0].kind,'guide');assert.equal(modelCalls,1);assert.equal(catalogReads,1);assert.equal(publicWrites,0);
    const page=final.p_checkpoint.discoveryV4.catalogPage;assert.ok(Number.isInteger(page)&&page>=1&&page<=30);assert.ok(saves.every(save=>!save.p_checkpoint.discoveryV4?.catalogPage||save.p_checkpoint.discoveryV4.catalogPage===page));
  },(async(input:any,init:any={})=>{
    const url=new URL(String(input)),body=init.body?JSON.parse(init.body):{};
    if(url.hostname==='generativelanguage.googleapis.com'){modelCalls++;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(draft())}]}}]});}
    assert.equal(url.hostname,'editorial-v4.test');
    if(url.pathname.endsWith('/claim_blog_run'))return Response.json([run]);
    if(url.pathname.endsWith('/save_blog_run')){saves.push(structuredClone(body));return Response.json(true);}
    if(url.pathname.endsWith('/claim_blog_topic')||url.pathname.endsWith('/claim_site_snapshot')||url.pathname.endsWith('/put_site_snapshot'))return Response.json(true);
    if(url.pathname.endsWith('/blog_publication_settings'))return Response.json([{automatic_enabled:true}]);
    if(init.method==='POST'&&url.pathname.endsWith('/blog_articles'))publicWrites++;
    return Response.json([]);
  }) as typeof fetch);}finally{Object.assign(EditorialTransport.prototype,old);}
});
