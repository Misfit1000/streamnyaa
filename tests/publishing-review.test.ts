import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { draftRevision } from '../api/_shared/publicationReview.ts';
import { reviewBlog } from '../api/_shared/adminPublishing.ts';

test('review migration fences revisions, blocks cron claims and isolates private state',async()=>{
  const db=await PGlite.create();
  try{
    await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;');
    await db.exec(await readFile(new URL('../supabase/site-publishing.sql',import.meta.url),'utf8'));
    const migration=await readFile(new URL('../supabase/site-publishing-review.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
    assert.equal((await db.query<any>('SELECT automatic_enabled FROM blog_publication_settings')).rows[0].automatic_enabled,false);
    const revision='a'.repeat(64),run=(await db.query<any>("INSERT INTO blog_generation_runs(idempotency_key,kind,status,checkpoint) VALUES('review:fixture','daily','awaiting_review',$1::jsonb) RETURNING id",[JSON.stringify({reviewRevision:revision,draft:{draft:{headline:'Saved private draft'}},published:[]})])).rows[0].id;
    const token='00000000-0000-0000-0000-000000000001';
    assert.equal((await db.query('SELECT * FROM claim_blog_run($1,$2)',[run,token])).rows.length,0);
    assert.equal((await db.query<any>("SELECT review_blog_draft($1,$2,true,'admin','reviewed') AS ok",[run,'b'.repeat(64)])).rows[0].ok,false);
    const results=await Promise.all([db.query<any>("SELECT review_blog_draft($1,$2,true,'admin','Checked sources') AS ok",[run,revision]),db.query<any>("SELECT review_blog_draft($1,$2,true,'admin','duplicate click') AS ok",[run,revision])]);
    assert.equal(results.filter(result=>result.rows[0].ok).length,1);
    assert.equal((await db.query<any>('SELECT enable_blog_automatic($1) AS ok',[run])).rows[0].ok,false);
    assert.equal((await db.query('SELECT * FROM claim_blog_run($1,$2)',[run,token])).rows.length,1);
    await db.query("UPDATE blog_generation_runs SET status='published',checkpoint=checkpoint||'{\"published\":[\"saved-article\"]}'::jsonb WHERE id=$1",[run]);
    assert.equal((await db.query<any>('SELECT enable_blog_automatic($1) AS ok',[run])).rows[0].ok,true);
    const rejected=(await db.query<any>("INSERT INTO blog_generation_runs(idempotency_key,kind,status,checkpoint) VALUES('reject:fixture','daily','awaiting_review',$1::jsonb) RETURNING id",[JSON.stringify({reviewRevision:revision})])).rows[0].id;
    assert.equal((await db.query<any>("SELECT review_blog_draft($1,$2,false,'admin','Unsupported interpretation') AS ok",[rejected,revision])).rows[0].ok,true);
    assert.equal((await db.query<any>('SELECT status,checkpoint FROM blog_generation_runs WHERE id=$1',[rejected])).rows[0].status,'skipped');
    for(const role of ['anon','authenticated']){
      await db.exec(`SET ROLE ${role};`);
      await assert.rejects(db.query('SELECT * FROM blog_publication_settings'),/permission denied/);
      await assert.rejects(db.query('SELECT * FROM blog_generation_runs'),/permission denied/);
      await assert.rejects(db.query('SELECT enable_blog_automatic($1)',[run]),/permission denied/);
      await assert.rejects(db.query("SELECT review_blog_draft($1,$2,true,'evil','')",[run,revision]),/permission denied/);
      await db.exec('RESET ROLE;');
    }
  }finally{await db.close();}
});
test('review revision includes evidence and draft, rather than just its headline',()=>{
  assert.equal(draftRevision({b:2,a:1},{headline:'A story',excerpt:'Saved'}),draftRevision({a:1,b:2},{excerpt:'Saved',headline:'A story'}));
  const one=draftRevision({fingerprint:'event',sources:[{text:'Original announcement'}]},{headline:'A story',paragraphs:['Verified detail']});
  assert.notEqual(one,draftRevision({fingerprint:'event',sources:[{text:'Changed announcement'}]},{headline:'A story',paragraphs:['Verified detail']}));
  assert.notEqual(one,draftRevision({fingerprint:'event',sources:[{text:'Original announcement'}]},{headline:'A story',paragraphs:['Changed detail']}));
});
test('draft reads require authentication and remain no-store',async()=>{
  for(const method of ['GET','POST']){
    const state:any={status:0,body:null,headers:{}};const response:any={setHeader:(k:string,v:string)=>state.headers[k]=v,status:(value:number)=>{state.status=value;return response;},json:(body:any)=>{state.body=body;return response;}};
    await reviewBlog({method,headers:{},query:{jobId:'00000000-0000-0000-0000-000000000001'}},response);
    assert.equal(state.status,401);assert.equal(state.headers['Cache-Control'],'no-store');assert.equal(state.body.draft,undefined);
  }
});
