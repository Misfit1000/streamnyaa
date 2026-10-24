import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {manageBlogs} from '../api/_shared/adminBlogs.ts';
import {readPublishedArticle,listArchivedBlogPostSummaryPage,publishedBlogSitemap,archiveBlogPost} from '../api/blogArchive.js';
import {quotationErrors} from '../api/_shared/editorialQuotations.ts';

test('recoverable blog trash is revision fenced, preserves content and dates, blocks active jobs and remains service-only',async()=>{
 const db=await PGlite.create();try{
  await db.exec('create role anon;create role authenticated;create role service_role;create table blog_articles(slug text primary key,content jsonb,title text,updated_at timestamptz default now());');
  await db.exec(await readFile(new URL('../supabase/site-publishing.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/site-publishing-review.sql',import.meta.url),'utf8'));
  const sql=await readFile(new URL('../supabase/blog-management.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
  await db.exec(`insert into blog_articles(slug,content,title,updated_at) values('fixture','{"saved":"original"}','Fixture','2026-10-20T00:00:00Z');`);
  const act=async(kind:string,id:string,revision:number,trash:boolean)=>(await db.query<any>("select manage_blog_entry($1,$2,$3,$4,'admin') as ok",[kind,id,revision,trash])).rows[0].ok;
  assert.equal(await act('article','fixture',0,true),true);assert.equal(await act('article','fixture',0,true),false);assert.equal(await act('article','fixture',0,false),false);assert.equal(await act('article','fixture',1,false),true);
  const article=(await db.query<any>('select * from blog_articles')).rows[0];assert.deepEqual(article.content,{saved:'original'});assert.equal(new Date(article.updated_at).toISOString(),'2026-10-20T00:00:00.000Z');
  await db.exec('grant select on blog_articles to anon;create policy fixture_public_read on blog_articles for select to anon using(true);');
  await db.exec('set role anon');assert.equal((await db.query('select * from blog_articles')).rows.length,1);await db.exec('reset role');
  assert.equal(await act('article','fixture',2,true),true);await db.exec('set role anon');assert.equal((await db.query('select * from blog_articles')).rows.length,0);await db.exec('reset role');
  const job=(await db.query<any>(`insert into blog_generation_runs(idempotency_key,kind,status,checkpoint) values('fixture','daily','running','{"draft":{"headline":"Saved"}}') returning id`)).rows[0].id;
  assert.equal(await act('draft',job,0,true),false);await db.query("update blog_generation_runs set status='awaiting_review' where id=$1",[job]);assert.equal(await act('draft',job,0,true),true);
  assert.equal((await db.query('select * from claim_blog_run($1,$2)',[job,'00000000-0000-0000-0000-000000000002'])).rows.length,0);
  assert.equal(await act('draft',job,1,false),true);const restored=(await db.query<any>('select * from blog_generation_runs where id=$1',[job])).rows[0];assert.equal(restored.status,'awaiting_review');assert.deepEqual(restored.checkpoint,{draft:{headline:'Saved'}});
  assert.equal((await db.query<any>('select automatic_enabled from blog_publication_settings')).rows[0].automatic_enabled,false);
  for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(act('article','fixture',3,false),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});
const recorder=()=>{const r:any={code:200,body:null,headers:{},setHeader(k:string,v:string){this.headers[k]=v},status(n:number){this.code=n;return this},json(value:any){this.body=value;return this}};return r;};
test('Admin list is authenticated, bounded, private and rejects forged cursors or stale mutations',async()=>{
 const original=fetch,keys=['SUPABASE_URL','SUPABASE_SECRET_KEY','ADMIN_EMAILS'] as const,saved=keys.map(key=>process.env[key]);Object.assign(process.env,{SUPABASE_URL:'https://manage.test',SUPABASE_SECRET_KEY:'fixture',ADMIN_EMAILS:'admin@example.test'});
 const calls:URL[]=[];globalThis.fetch=(async(input:any)=>{const url=new URL(String(input));calls.push(url);if(url.pathname.endsWith('/user'))return Response.json({id:'admin',email:'admin@example.test',email_confirmed_at:'2026-10-20'});if(url.pathname.includes('/rpc/'))return Response.json(false);return Response.json(Array.from({length:21},(_,i)=>({slug:`fixture-${i}`,title:`Fixture ${i}`,admin_revision:0,updated_at:'2026-10-24T00:00:00+00:00'})));}) as any;
 try{
  const unauth=recorder();await manageBlogs({method:'GET',headers:{},query:{}},unauth);assert.equal(unauth.code,401);assert.equal(calls.length,0);
  const headers={authorization:'Bearer fixture'},res=recorder();await manageBlogs({method:'GET',headers,query:{view:'published'}},res);assert.equal(res.code,200);assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(res.body.entries.length,20);assert.ok(res.body.nextCursor);assert.equal(calls.at(-1)?.searchParams.get('limit'),'21');assert.ok(!calls.at(-1)?.searchParams.get('select')?.includes('content,'));
  const invalid=recorder();await manageBlogs({method:'GET',headers,query:{view:'drafts',cursor:res.body.nextCursor}},invalid);assert.equal(invalid.code,400);
  const stale=recorder();await manageBlogs({method:'POST',headers,body:{kind:'article',id:'fixture',revision:0,action:'trash'}},stale);assert.equal(stale.code,409);
 }finally{globalThis.fetch=original;keys.forEach((key,i)=>saved[i]===undefined?delete process.env[key]:process.env[key]=saved[i]);}
});
test('trashed articles never return through public reads, sitemap or fallback during a primary outage',async()=>{
 const original=fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;process.env.SUPABASE_URL='https://trash.test';process.env.SUPABASE_SECRET_KEY='fixture';let fail=false;const calls:string[]=[];
 globalThis.fetch=(async(input:any)=>{const url=new URL(String(input));calls.push(url.hostname);assert.equal(url.hostname,'trash.test');if(fail)return Response.json({message:'offline'},{status:503});if(url.searchParams.get('admin_deleted_at')==='is.null')return Response.json([],{headers:{'content-range':'*/0'}});return Response.json([{content:{articleSlug:'hidden'},admin_deleted_at:'2026-10-24T00:00:00Z'}]);}) as any;
 try{assert.equal(await readPublishedArticle('hidden'),null);assert.deepEqual((await listArchivedBlogPostSummaryPage()).posts,[]);assert.deepEqual(await publishedBlogSitemap(),[]);fail=true;await assert.rejects(readPublishedArticle('hidden'),/temporarily unavailable/);await assert.rejects(listArchivedBlogPostSummaryPage(),/temporarily unavailable/);assert.ok(calls.length>=5);}
 finally{globalThis.fetch=original;oldUrl===undefined?delete process.env.SUPABASE_URL:process.env.SUPABASE_URL=oldUrl;oldKey===undefined?delete process.env.SUPABASE_SECRET_KEY:process.env.SUPABASE_SECRET_KEY=oldKey;}
});
test('quotation gate recognizes exact verified titles and typography without admitting invented quotations',()=>{
 const brief:any={subject:'An Official Film – The Return',items:[],sources:[{text:'The project’s release is confirmed.'}]};
 assert.deepEqual(quotationErrors('The film “An Official Film — The Return” has an official page.',brief),[]);
 assert.deepEqual(quotationErrors('The source says “The project\'s release is confirmed.”',brief),[]);
  assert.deepEqual(quotationErrors('The series "Fixture" has several recorded installments in different formats. A second entry "Fixture II" contains additional chapters.',brief),[]);
  assert.deepEqual(quotationErrors('Empty pairs “”, "" and a short "name" do not capture surrounding prose.',brief),[]);
 assert.equal(quotationErrors('The producer says “Everyone will love this worldwide release.”',brief).length,1);
});
