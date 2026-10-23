import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { boundedJson, readBoundedResponse, readJsonBody } from '../api/_shared/boundedHttp.ts';
import { publicMetadataQuery, publicProviderPath, publicTmdbPath } from '../api/_shared/publicMetadataQuery.ts';
import handler from '../api/stream-sources.ts';
import torrent from '../api/torrent.ts';
import { RequestCache } from '../api/_shared/requestReuse.ts';
import { requireAdmin } from '../api/_shared/adminAuth.js';
import { requireAdmin as requireAdminTyped } from '../api/_shared/adminAuth.ts';
import sources from '../api/nyaa.ts';
import { publicSnapshot } from '../api/_shared/publicSnapshots.ts';

function response() { return { code: 200, body: undefined as any, headers: {} as Record<string,string>, setHeader(k:string,v:string) { this.headers[k.toLowerCase()]=v; }, status(code:number){this.code=code;return this;}, json(body:any){this.body=body;return this;}, send(body:any){this.body=body;return this;}, end(){return this;} }; }
const request=(body:any)=>({method:'POST',headers:{},query:{provider:'anilist'},body});

test('public catalogue queries are read-only, bounded after fragment expansion, and canonicalized',()=>{
 const query='query Lookup($id:Int,$page:Int){Page(page:$page,perPage:24){media(id:$id){id title{english}}}}';
 assert.deepEqual(publicMetadataQuery({query,variables:{id:7,page:1},ignored:'x'}),publicMetadataQuery({query:query.replaceAll('{','{ '),variables:{page:1,id:7}}));
 for(const query of ['mutation{SaveMediaListEntry(mediaId:7){id}}','subscription{Media{id}}','{Viewer{id email}}','{__schema{types{name}}}','query A{Media{id}} query B{Media{id}}','{...Loop} fragment Loop on Query{...Loop}',`{${Array.from({length:9},(_,i)=>`m${i}:Media(id:7){id}`).join(' ')}}`,`{Media{${'relations{edges{node{'.repeat(5)}id${'}}}'.repeat(5)}}}`]) assert.throws(()=>publicMetadataQuery({query}));
 assert.throws(()=>publicMetadataQuery({query,variables:{id:7,page:1001}}));
 assert.throws(()=>publicMetadataQuery({query:'query($count:Int=500){Page(perPage:$count){media{id}}}'}));
 assert.throws(()=>publicMetadataQuery({query:'{Page(perPage:50){media{id}}}',variables:{ids:Array(257).fill(7)}}));
});

test('invalid or oversized request bodies are rejected before contacting any provider',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=(async()=>{calls++;throw Error('Unexpected upstream');}) as any;
 try{
  for(const [body,status] of [['{bad',400],[{query:'{Media{id}}',padding:'a'.repeat(40_000)},413],[{query:'mutation{Media{id}}'},400],[[],400]]){
   const res=response();await handler(request(body),res);assert.equal(res.code,status);assert.equal(res.headers['cache-control'],'no-store');
  }
  assert.equal(calls,0);
  await assert.rejects(readJsonBody({headers:{},async *[Symbol.asyncIterator](){yield Buffer.alloc(20_000);yield Buffer.alloc(20_000);}}),{status:413});
 }finally{globalThis.fetch=old;}
});

test('chunked and declared oversized upstream data are cancelled while reading',async()=>{
 let cancelled=false;
 const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(20));},cancel(){cancelled=true;}});
 await assert.rejects(readBoundedResponse(new Response(stream),30),{status:502});assert.equal(cancelled,true);
 let pulled=0;const declared=new Response(new ReadableStream({pull(controller){pulled++;controller.enqueue(new Uint8Array(2));}}),{headers:{'content-length':'1000'}});
 await assert.rejects(readBoundedResponse(declared,30),{status:502});assert.ok(pulled<=1);
 assert.deepEqual(await boundedJson(new Response('{"data":[]}')), {data:[]});
});

test('provider paths exclude encoded traversal and credential-bearing unrelated endpoints',async()=>{
 for(const path of ['//host/path','/tv/%2e%2e/account','/tv/%2Faccount','/tv/1\\account','/tv/1#secret']) assert.throws(()=>publicProviderPath(path));
 assert.equal(publicProviderPath('/search/tv?query=Fate%2Fstay+night'),'/search/tv?query=Fate%2Fstay+night');
 for(const path of ['/movie/1?append_to_response=account_states','/movie/1?session_id=private','/account/1','/search/tv?query=a&page=99999'])assert.throws(()=>publicTmdbPath(path));
 assert.equal(publicTmdbPath('/movie/1?language=en&append_to_response=images&api_key=ignored'),'/movie/1?append_to_response=images&language=en');
 const old=globalThis.fetch;let calls=0;globalThis.fetch=(async()=>{calls++;throw Error('Unexpected upstream');}) as any;
 try{const res=response();await handler({method:'GET',headers:{},query:{provider:'tmdb',path:'/account/1'}},res);assert.equal(res.code,400);assert.equal(calls,0);}finally{globalThis.fetch=old;}
});

test('equivalent requests share upstream work and cannot refresh the saved retrieval timestamp',async()=>{
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=(async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,10));return new Response('{"data":{"Media":{"id":917301}}}');}) as any;
 try{
  const a=response(),b=response(),c=response();
  await Promise.all([handler(request({query:'query Cache($id:Int){Media(id:$id){id}}',variables:{id:917301}}),a),handler(request({variables:{id:917301},query:'query Cache($id: Int) { Media(id: $id) { id } }',ignored:true}),b)]);
  await handler(request({query:'query Cache($id:Int){Media(id:$id){id}}',variables:{id:917301}}),c);
  assert.equal(calls,1);assert.equal(c.headers['x-streamnyaa-fetched-at'],a.headers['x-streamnyaa-fetched-at']);assert.equal(b.headers['x-streamnyaa-metadata-cache'],'COALESCED');
 }finally{globalThis.fetch=old;}
});

test('retained cached data cannot conceal an upstream denial or throttle deadline',async()=>{
 const old=globalThis.fetch,clock=Date.now;let now=clock(),calls=0;Date.now=()=>now;
 globalThis.fetch=(async()=>++calls===1?new Response('{"data":{"Media":{"id":917302}}}'):new Response('Slow down',{status:429,headers:{'Retry-After':'90'}})) as any;
 try{
  const req={...request({query:'{Media(id:917302){id}}'}),query:{provider:'anilist',ttl:'60'}};
  const a=response();await handler(req,a);now+=61_000;const b=response();await handler(req,b);
  assert.equal(b.code,429);assert.equal(b.headers['retry-after'],'90');assert.equal(b.headers['cache-control'],'no-store');
 }finally{Date.now=clock;globalThis.fetch=old;}
});

test('cache payload accounting is byte bounded even with large metadata records',()=>{
 const cache=new RequestCache({metadata:300},1024);for(let i=0;i<300;i++)cache.set('metadata',String(i),{value:'x'.repeat(100)},Date.now()+60_000);
 assert.ok(cache.snapshot().bytes<=1024);assert.ok(cache.snapshot().entries<300);assert.equal(cache.get('metadata','0'),undefined);
});

test('torrent downloads reject oversized chunked metadata before buffering it all',async()=>{
 const old=globalThis.fetch;let cancelled=false;
 globalThis.fetch=(async()=>new Response(new ReadableStream({pull(controller){const b=new Uint8Array(1024*1024);b[0]=0x64;controller.enqueue(b);},cancel(){cancelled=true;}}))) as any;
 try{const res=response();await torrent({method:'GET',query:{id:'917303'}},res);assert.equal(res.code,502);assert.equal(cancelled,true);}finally{globalThis.fetch=old;}
});

test('security headers protect SPA, article and API routes without restricting required connections',()=>{
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 const headers=Object.fromEntries(config.headers.find((rule:any)=>rule.source==='/(.*)').headers.map((row:any)=>[row.key,row.value]));
 assert.equal(headers['X-Content-Type-Options'],'nosniff');assert.equal(headers['X-Frame-Options'],'DENY');assert.match(headers['Content-Security-Policy'],/frame-ancestors 'none'/);assert.match(headers['Content-Security-Policy'],/base-uri 'none'/);assert.ok(!headers['Content-Security-Policy'].includes('connect-src'));
 assert.ok(config.headers.some((rule:any)=>rule.source.includes('api/auth')&&rule.headers.some((h:any)=>h.key==='Referrer-Policy'&&h.value==='no-referrer')));
});

test('Admin access requires server-verified email ownership, not profile metadata',async()=>{
 const old=globalThis.fetch,env={SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_ANON_KEY:process.env.SUPABASE_ANON_KEY,ADMIN_EMAILS:process.env.ADMIN_EMAILS};
 process.env.SUPABASE_URL='https://security-fixture.supabase.co';process.env.SUPABASE_ANON_KEY='fixture';process.env.ADMIN_EMAILS='admin@example.test';
 let user:any={id:'fixture-user',email:'admin@example.test',user_metadata:{email_verified:true,is_admin:true}};
 globalThis.fetch=(async()=>new Response(JSON.stringify(user))) as any;
 try{
  for(const verify of [requireAdmin,requireAdminTyped]){
   const unverified=await verify({headers:{authorization:'Bearer fixture-token'}});assert.equal('status'in unverified&&unverified.status,403);
   user={...user,email_confirmed_at:'2026-10-01T00:00:00Z'};const verified=await verify({headers:{authorization:'Bearer fixture-token'}});assert.equal('error'in verified,false);
   user={...user,email_confirmed_at:null};
  }
 }finally{globalThis.fetch=old;for(const [key,value]of Object.entries(env)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test('invalid source search parameters do not initiate provider work',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=(async()=>{calls++;throw Error('Unexpected upstream');}) as any;
 try{for(const query of [{q:'a'.repeat(513)},{p:'-1'},{p:'1001'},{f:'invalid'},{c:'1_2&extra=1'}]){const res=response();await sources({method:'GET',headers:{},query},res);assert.equal(res.code,400);}assert.equal(calls,0);}finally{globalThis.fetch=old;}
});

test('hydrating fresh persisted snapshots cannot grow the memory cache without a limit',async()=>{
 const old=globalThis.fetch,env={SUPABASE_URL:process.env.SUPABASE_URL,SUPABASE_SECRET_KEY:process.env.SUPABASE_SECRET_KEY};
 process.env.SUPABASE_URL='https://snapshot-security-fixture.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture';
 globalThis.fetch=(async()=>new Response(JSON.stringify([{payload:{ok:true},fetched_at:new Date().toISOString()}]))) as any;
 try{
  for(let i=0;i<105;i++)await publicSnapshot(`security-audit:${i}`,60,async()=>{throw Error('A fresh snapshot must be reused');});
  globalThis.fetch=(async()=>{throw Error('Offline fixture');}) as any;
  const fresh=await publicSnapshot('security-audit:104',60,async()=>{throw Error('Should be cached');});assert.equal((fresh.value as any).ok,true);
  await assert.rejects(publicSnapshot('security-audit:0',60,async()=>{throw Error('Evicted as expected');}),/Evicted as expected/);
 }finally{globalThis.fetch=old;for(const [key,value]of Object.entries(env)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
