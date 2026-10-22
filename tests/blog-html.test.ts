import test from 'node:test';
import assert from 'node:assert/strict';
import { articleHtml, scriptJson } from '../api/_shared/blogHtml.ts';
import { BLOG_POSTS } from '../src/api/blogShared.ts';
import blog from '../api/blog.ts';
import {load} from 'cheerio';

const post:any={...BLOG_POSTS[0],articleSlug:'confirmed-release-fixture',qualityVersion:2,articleStatus:'published',
  generatedAt:'2026-10-19T12:00:00Z',updatedAt:'2026-10-19T12:00:00Z',items:[],
  article:{headline:'A confirmed release moves to a new date',excerpt:'The publisher has confirmed a revised release date; this report explains the affected track and what remains unknown.',paragraphs:['The confirmed article body is present before any JavaScript runs.','The publisher has not announced a replacement broadcast time.'],sections:[],faq:[],takeaways:[]},
  sources:[{id:'official',title:'Publisher announcement',url:'https://example.com/announcement',primary:true,retrievedAt:'2026-10-19T12:00:00Z'}]};
const response=()=>({statusCode:200,body:'' as any,headers:{} as Record<string,string>,setHeader(k:string,v:string){this.headers[k]=v;},status(code:number){this.statusCode=code;return this;},json(body:any){this.body=body;return this;},send(body:any){this.body=body;return this;},end(){return this;}});

test('every reader receives the full article, existing shell, sources and unique metadata in first HTML',()=>{
  const html=articleHtml(post,'/blog/confirmed-release-fixture');
  assert.match(html,/<h1[^>]*>A confirmed release moves to a new date<\/h1>/);
  assert.match(html,/The confirmed article body is present before any JavaScript runs/);
  assert.match(html,/Publisher announcement/);assert.match(html,/AI-assisted reporting/);
  assert.match(html,/<title>A confirmed release moves to a new date \| StreamNyaa<\/title>/);
  assert.equal((html.match(/<link rel="canonical"/g)||[]).length,1);
  assert.match(html,/https:\/\/www.streamnyaa.xyz\/blog\/confirmed-release-fixture/);
  assert.match(html,/"datePublished":"2026-10-19T12:00:00Z"/);
  assert.doesNotMatch(html,/By StreamNyaa Editorial|No current entries are available|<div id="root"><\/div>/);
  assert.match(html,/\/assets\/[^" ]+\.js/);
  assert.equal(JSON.parse(html.match(/id="streamnyaa-article" type="application\/json">([^<]+)</)![1]).post.articleSlug,post.articleSlug);
});

test('embedded JSON and head metadata cannot terminate scripts or inject tags',()=>{
  const hostile={...post,article:{...post.article,headline:'</title><script>alert(1)</script>',excerpt:'</script><img src=x onerror=alert(1)>'}};
  const html=articleHtml(hostile,'/blog/confirmed-release-fixture');
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>|<img src=x/);
  assert.equal(JSON.parse(scriptJson({v:'</script>\u2028'})).v,'</script>\u2028');
});
test('future articles have one visible headline/summary and omit raw observations from normal bootstrap',()=>{
  const future={...post,qualityVersion:3,activityEvidence:{observations:[{privateFixtureMarker:'raw-observations-live-at-evidence-endpoint'}]},items:[{id:1,mal_id:1,title:'Fixture Anime',image:'https://image.test/fixture.jpg',genres:[],studios:[]}]};
  const html=articleHtml(future as any,'/blog/'+future.articleSlug),$=load(html),root=$('#root');
  assert.equal(root.find('h1').length,1);assert.equal(root.find('h2').filter((_,el)=>$(el).text()===post.article.headline).length,0);
  assert.equal(root.text().split(post.article.excerpt).length-1,1);assert.match(root.text(),/The confirmed article body/);assert.doesNotMatch(html,/raw-observations-live-at-evidence-endpoint/);
  const bootstrap=JSON.parse($('#streamnyaa-article').text());assert.equal(bootstrap.post.hasActivityEvidence,true);assert.equal(bootstrap.post.activityEvidence,undefined);
  const legacy=load(articleHtml({...future,qualityVersion:2} as any,'/blog/'+future.articleSlug));assert.equal(legacy('#root h2').filter((_,el)=>legacy(el).text()===post.article.headline).length,1);
});

test('HTML reads are GET-only and distinguish outage, absence and canonical redirects without generation',async()=>{
  const original=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SECRET_KEY'],saved=keys.map(key=>process.env[key]);
  process.env.SUPABASE_URL='https://html-fixture.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture';
  let mode='found';const calls:{url:string;method:string}[]=[];
  globalThis.fetch=(async(input:any,init:any={})=>{
    calls.push({url:String(input),method:init.method||'GET'});
    if(mode==='outage')return new Response('{}',{status:503});
    if(String(input).includes('api.github.com'))return new Response('{}',{status:404});
    return new Response(JSON.stringify(mode==='missing'?[]:[{content:post}]),{headers:{'Content-Type':'application/json'}});
  }) as any;
  try{
    const okay=response();await blog({method:'GET',query:{render:'1',slug:post.articleSlug}},okay);assert.equal(okay.statusCode,200);assert.equal(okay.headers['X-Robots-Tag'],undefined);
    mode='missing';const absent=response();await blog({method:'GET',query:{render:'1',slug:'missing-fixture'}},absent);assert.equal(absent.statusCode,404);
    mode='outage';const unavailable=response();await blog({method:'GET',query:{render:'1',slug:'outage-fixture'}},unavailable);assert.equal(unavailable.statusCode,503);assert.equal(unavailable.headers['Cache-Control'],'no-store');
    mode='found';const redirect=response();await blog({method:'GET',query:{render:'1',slug:post.slug}},redirect);assert.equal(redirect.statusCode,308);assert.equal(redirect.headers.Location,'/blog/'+post.articleSlug);
    const mutation=response();await blog({method:'POST',query:{render:'1',slug:post.articleSlug}},mutation);assert.equal(mutation.statusCode,405);
    assert.ok(calls.every(call=>call.method==='GET'&&!/generativelanguage|\/api\/blog/.test(call.url)));
  }finally{globalThis.fetch=original;keys.forEach((key,i)=>saved[i]===undefined?delete process.env[key]:process.env[key]=saved[i]);}
});
