import test from 'node:test';import assert from 'node:assert/strict';
import handler from '../api/nyaa.ts';
const response=()=>({code:200,body:null as any,headers:{} as Record<string,string>,setHeader(k:string,v:string){this.headers[k]=v},status(n:number){this.code=n;return this},json(body:any){this.body=body;return this}});
test('Sukebei requires explicit NSFW, restricts animation category and never mixes caches or falls back to regular Nyaa',async()=>{
 const original=fetch,calls:URL[]=[];
 globalThis.fetch=(async(input:any)=>{const url=new URL(String(input));calls.push(url);const host=url.hostname,cat=host==='sukebei.nyaa.si'?'1_1':'1_2';return new Response(`<rss xmlns:nyaa="https://nyaa.si/xmlns/nyaa"><channel><item><title>Fixture Provider Integration - 01</title><link>https://${host}/view/1</link><nyaa:infoHash>${'a'.repeat(40)}</nyaa:infoHash><nyaa:seeders>10</nyaa:seeders><nyaa:categoryId>${cat}</nyaa:categoryId></item></channel></rss>`);}) as any;
 const query={q:'Fixture Provider Integration 01',deep:'0',c:'1_2'};
 try{
  const blocked=response();await handler({method:'GET',headers:{},query:{...query,provider:'sukebei'}},blocked);assert.equal(blocked.code,400);assert.equal(calls.length,0);
  const anime=response();await handler({method:'GET',headers:{},query},anime);assert.equal(anime.code,200);assert.equal(calls.at(-1)?.hostname,'nyaa.si');assert.equal(anime.body.length,1);
  const adult=response();await handler({method:'GET',headers:{},query:{...query,provider:'sukebei',nsfw:'1',c:'2_0'}},adult);assert.equal(adult.code,200);assert.equal(calls.at(-1)?.hostname,'sukebei.nyaa.si');assert.equal(calls.at(-1)?.searchParams.get('c'),'1_1');assert.ok(adult.body[0].link.startsWith('https://sukebei.nyaa.si/'));
  const count=calls.length,again=response();await handler({method:'GET',headers:{},query},again);assert.equal(calls.length,count);assert.ok(again.body[0].link.startsWith('https://nyaa.si/'));
  globalThis.fetch=(async(input:any)=>{calls.push(new URL(String(input)));return new Response('Unavailable',{status:503});}) as any;
  const fail=response();await handler({method:'GET',headers:{},query:{...query,q:'Unique unavailable provider fixture',provider:'sukebei',nsfw:'1'}},fail);assert.equal(fail.headers['X-Source-Complete'],'false');assert.deepEqual(fail.body,[]);assert.equal(calls.at(-1)?.hostname,'sukebei.nyaa.si');
 }finally{globalThis.fetch=original;}
});
