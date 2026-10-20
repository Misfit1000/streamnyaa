import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { calculateRanking } from '../api/_shared/publishingData.ts';
import { validateEditorial } from '../api/_shared/publishing.ts';
import blog from '../api/blog.ts';
import sitemap from '../api/blog-sitemap.ts';
import archive from '../api/blog-archive.ts';
import { publicCalendar } from '../api/_shared/publicCalendar.ts';
import { RequestUsage } from '../api/_shared/requestReuse.ts';

test('PostgreSQL leases fence old workers, deduplicate topics and isolate service storage',async()=>{
  const db=await PGlite.create();
  try{
    await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;');
    const sql=await readFile(new URL('../supabase/site-publishing.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
    const run=(await db.query<{id:string}>("INSERT INTO blog_generation_runs(idempotency_key,kind) VALUES('daily:fixture','daily') RETURNING id")).rows[0].id;
    const one='00000000-0000-0000-0000-000000000001',two='00000000-0000-0000-0000-000000000002';
    const claims=await Promise.all([db.query('SELECT * FROM claim_blog_run($1,$2)',[run,one]),db.query('SELECT * FROM claim_blog_run($1,$2)',[run,two])]);assert.equal(claims.reduce((sum,result)=>sum+result.rows.length,0),1);
    assert.equal((await db.query<any>('SELECT save_blog_run($1,$2,\'published\',\'{}\',null) AS saved',[run,two])).rows[0].saved,false);
    assert.equal((await db.query<any>("SELECT claim_blog_topic('topic', $1, 'article', $2) AS claimed",[run,one])).rows[0].claimed,true);
    await db.exec(`UPDATE blog_generation_runs SET lease_until=now()-interval '1 second' WHERE id='${run}'`);
    assert.equal((await db.query('SELECT * FROM claim_blog_run($1,$2)',[run,two])).rows.length,1);
    assert.equal((await db.query<any>("SELECT save_blog_run($1,$2,'published','{}',null) AS saved",[run,one])).rows[0].saved,false);
    const other=(await db.query<{id:string}>("INSERT INTO blog_generation_runs(idempotency_key,kind) VALUES('weekly:fixture','weekly') RETURNING id")).rows[0].id;
    await db.query('SELECT * FROM claim_blog_run($1,$2)',[other,one]);
    assert.equal((await db.query<any>("SELECT claim_blog_topic('topic',$1,'different',$2) AS claimed",[other,one])).rows[0].claimed,false);
    const records=(id:number)=>JSON.stringify([{scheduleId:`anilist:${id}:episode-1:original`,scheduleProvider:'animeschedule',scheduleFetchedAt:Date.now(),scheduleStatus:'delayed'}]);
    await Promise.all([db.query("SELECT merge_calendar_snapshot('week',$1::jsonb)",[records(1)]),db.query("SELECT merge_calendar_snapshot('week',$1::jsonb)",[records(2)])]);
    assert.equal((await db.query<any>("SELECT payload FROM site_public_snapshots WHERE key='week'")).rows[0].payload.length,2);
    await db.exec("SELECT put_site_snapshot('age','{\"v\":1}',now(),900);SELECT put_site_snapshot('age','{\"v\":0}',now()-interval '1 day',900);");
    assert.equal((await db.query<any>("SELECT payload FROM site_public_snapshots WHERE key='age'")).rows[0].payload.v,1);
    await db.exec('SET ROLE authenticated;');
    await assert.rejects(db.query('SELECT * FROM blog_generation_runs'),/permission denied/);
    await assert.rejects(db.query("SELECT claim_blog_run($1,$2)",[run,two]),/permission denied/);
    await db.exec('RESET ROLE;SET ROLE anon;');
    await assert.rejects(db.query("INSERT INTO site_public_snapshots VALUES('evil','{}',now(),now())"),/permission denied/);
  }finally{await db.close();}
});
test('weekly activity uses recorded days, stable ties and explicit missing coverage',()=>{
  const start=Date.UTC(2026,9,12),end=start+7*86400_000,rows:any[]=[];
  for(let id=1;id<=14;id++)for(let day=0;day<(id===14?3:4);day++)rows.push({mediaId:id,date:(start+day*86400_000)/1000,trending:id<=2?100:id,popularity:id===1?20:10,media:{title:{romaji:`Series ${id}`}}});
  rows.push({mediaId:1,date:end/1000,trending:99999});
  const result=calculateRanking(rows,{start,end});assert.equal(result.eligibleCount,13);assert.equal(result.rows[0].id,1);assert.equal(result.rows[1].id,2);assert.equal(result.rows[0].mean,100);assert.equal(result.rows[0].days,4);assert.equal(result.honorableMentions.length,3);assert.match(result.coverage,/bounded AniList/);assert.equal(result.rows[0].movement,undefined);
});
test('editorial gate rejects fabricated figures, sensitive claims and missing attribution',()=>{
  const brief:any={kind:'news',subject:'Fixture Series',headline:'A headline is only a discovery lead',facts:[],sources:[{id:'official',primary:true,text:'Fixture Series will return in 2026. The official announcement gives no date and no statement about staff changes.'}],items:[]};
  const draft:any={headline:'Fixture Series confirms its next season',excerpt:'A careful account of what the official announcement confirms and what it leaves unresolved.',paragraphs:[{text:'Fixture Series has 9000 worldwide viewers and its actor died.',sourceIds:[]},{text:'Fans are buzzing and only time will tell how the series develops.',sourceIds:['unknown']}],sections:[]};
  const errors=validateEditorial(draft,brief);assert.ok(errors.some(error=>/9000/.test(error)));assert.ok(errors.some(error=>/sensitive/.test(error)));assert.ok(errors.some(error=>/attribution/.test(error)));assert.ok(errors.some(error=>/filler/.test(error)));
});
test('public Blog, archive and sitemap reads make no model calls or storage mutations',async()=>{
  const original=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;const requests:any[]=[];
  process.env.SUPABASE_URL='https://fixture.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture-secret';
  const post={slug:'anime-trending-news-today',articleSlug:'saved-fixture',generatedAt:'2026-10-18T00:00:00Z',article:{headline:'A durably saved article'},items:[]};
  globalThis.fetch=(async(input:any,init:any)=>{requests.push({url:String(input),method:init?.method||'GET'});return new Response(JSON.stringify(String(input).includes('select=slug')?[{slug:'saved-fixture',updated_at:'2026-10-18T00:00:00Z'}]:[{content:post}]),{headers:{'Content-Type':'application/json'}});}) as any;
  const res=()=>({statusCode:200,body:null as any,headers:{} as any,setHeader(key:string,value:string){this.headers[key]=value;},status(code:number){this.statusCode=code;return this;},json(value:any){this.body=value;return this;},send(value:any){this.body=value;return this;},end(){return this;}});
  try{const one=res();await blog({method:'GET',query:{slug:post.slug},headers:{}},one);assert.equal(one.statusCode,200);
    const two=res();await sitemap({method:'GET'},two);assert.match(two.body,/saved-fixture/);
    const three=res();await archive({method:'GET',query:{migrate:'1'},headers:{}},three);assert.equal(three.statusCode,405);
    assert.ok(requests.length>=2);assert.ok(requests.every(request=>request.method==='GET'&&!/generativelanguage|\/api\/blog/.test(request.url)));
  }finally{globalThis.fetch=original;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;}
});

test('Calendar reuses week/page requests, links only verified IDs and retains a postponement during outage',async()=>{
  const original=globalThis.fetch,clock=Date.now,keys=['SUPABASE_URL','SUPABASE_SECRET_KEY','ANIMESCHEDULE_TOKEN'] as const,env=keys.map(key=>process.env[key]);
  process.env.SUPABASE_URL='https://calendar-fixture.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture';process.env.ANIMESCHEDULE_TOKEN='fixture';
  const start=Math.floor(clock()/86400_000)*86400,end=start+7*86400,saved=new Map<string,any>(),calls:string[]=[];let outage=false;
  globalThis.fetch=(async(input:any,init:any={})=>{
    const url=new URL(String(input)),body=init.body?JSON.parse(init.body):{};
    const response=(value:any,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
    if(url.hostname==='calendar-fixture.supabase.co'){
      if(url.pathname.endsWith('/claim_site_snapshot'))return response(true);
      if(url.pathname.endsWith('/put_site_snapshot')){saved.set(body.p_key,{payload:body.p_payload,fetched_at:body.p_fetched_at});return response(null);}
      if(url.pathname.endsWith('/merge_calendar_snapshot')){saved.set(body.p_key,{payload:body.p_rows,fetched_at:new Date(Date.now()).toISOString()});return response(body.p_rows);}
      if(init.method==='DELETE')return response(null);
      const item=saved.get((url.searchParams.get('key')||'').replace(/^eq\./,''));return response(item?[item]:[]);
    }
    calls.push(url.pathname);
    if(outage)return response({error:'outage'},503);
    if(url.hostname==='graphql.anilist.co')return response({data:{Page:{pageInfo:{hasNextPage:false},airingSchedules:[{episode:2,airingAt:start+3600,media:{id:777,idMal:778,title:{english:'Fixture Series'},coverImage:{large:'https://image.test/poster.jpg'}}}]}}});
    if(url.pathname.includes('/anime/'))return response({route:'fixture-series',websites:{anilist:'https://anilist.co/anime/777',mal:'https://myanimelist.net/anime/778'}});
    return response([{route:'fixture-series',episodeNumber:2,airType:'dub',airingStatus:'delayed-air',episodeDate:new Date((start+3600)*1000).toISOString(),delayedUntil:'0001-01-01T00:00:00Z',delayedText:'Dub delayed'}]);
  }) as any;
  try{
    const request={query:{start,end}},initial=await publicCalendar(request,new RequestUsage(request,'calendar'));
    assert.ok(initial.cursor);assert.ok(!calls.some(path=>path.includes('/anime/')));
    const next={query:{start,end,cursor:initial.cursor}},first=await publicCalendar(next,new RequestUsage(next,'calendar'));
    assert.equal(first.data.length,2);assert.equal(first.data.find(row=>row.releaseTrack==='dub')?.airingAt,0);
    assert.ok(first.data.every(row=>row.canonicalId==='anilist:777'));const total=calls.length;
    await publicCalendar(request,new RequestUsage(request,'calendar'));assert.equal(calls.length,total);
    outage=true;Date.now=()=>clock()+20*60_000;
    const stale=await publicCalendar(request,new RequestUsage(request,'calendar'));
    assert.equal(stale.stale,true);assert.equal(stale.data.find(row=>row.releaseTrack==='dub')?.scheduleStatus,'delayed');assert.equal(stale.complete,false);
  }finally{globalThis.fetch=original;Date.now=clock;keys.forEach((key,index)=>{if(env[index]===undefined)delete process.env[key];else process.env[key]=env[index];});}
});
