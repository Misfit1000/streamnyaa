import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
const firstPort=Number(process.env.WEB_AUDIT_PORT)||4173;
const instances = Array.from({length:8},(_,index)=>[
 ['baseline',firstPort+index*2,path.resolve(process.env.WEB_AUDIT_BASELINE || '.validation/web-audit-baseline/dist')],['candidate',firstPort+1+index*2,path.resolve(process.env.WEB_AUDIT_CANDIDATE || 'dist')]
]).flat();
const now=Date.now(),today=new Date().setHours(0,0,0,0);
// Local-only DOM evidence: CUA's read-only scope intentionally excludes browser
// performance globals. Never included in the application build or production.
const instrumentation=`<script>
(()=>{const longTasks=[];try{new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});}catch{}
let firstUsable=0,route=location.pathname,routeStart=performance.now(),routeUsable=0;
const update=()=>{if(route!==location.pathname){route=location.pathname;routeStart=performance.now();routeUsable=0;}
const main=document.querySelector('main'),ready=main&&(route==='/'?main.querySelector('h1')&&main.querySelector('img'):route==='/schedule'?main.querySelector('article'):route==='/search'?main.querySelector('a[href^="/anime/"]'):route==='/compare'?main.querySelector('input'):main.querySelector('h1'));
if(ready&&!firstUsable)firstUsable=performance.now();if(ready&&!routeUsable)routeUsable=performance.now()-routeStart;
let out=document.getElementById('audit-metrics');if(!out){out=document.createElement('output');out.id='audit-metrics';out.hidden=true;document.body.append(out);}
out.textContent=JSON.stringify({route,firstUsable,routeUsable,navigation:performance.getEntriesByType('navigation').map(e=>e.toJSON()),paint:performance.getEntriesByType('paint').map(e=>e.toJSON()),resources:performance.getEntriesByType('resource').map(e=>({name:e.name,duration:e.duration,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize,initiatorType:e.initiatorType})),longTasks});};
addEventListener('DOMContentLoaded',()=>{update();const root=document.getElementById('root');if(root)new MutationObserver(update).observe(root,{childList:true,subtree:true});setInterval(update,100);});})();</script>`;
const media=(id,origin)=>({id,idMal:id+100,title:{english:`Fixture Anime ${id}`,romaji:`Fixture Anime ${id}`},description:'Controlled local metadata for route, loading and layout verification.',episodes:12,status:'RELEASING',format:'TV',season:'FALL',seasonYear:2026,source:'MANGA',coverImage:{extraLarge:origin+'/fixture-poster.svg',large:origin+'/fixture-poster.svg',color:'#192235'},bannerImage:origin+'/fixture-banner.svg',genres:['Adventure','Fantasy'],averageScore:82,popularity:5000,nextAiringEpisode:{episode:5,airingAt:Math.floor(Date.now()/1000)+86400},isAdult:false,studios:{nodes:[{name:'Fixture Studio'}]},relations:{edges:[]},recommendations:{nodes:[]},streamingEpisodes:[]});
for(const [name,port,root] of instances){
 const log=[],cached=new Map();
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,`http://127.0.0.1:${port}`),origin=url.origin;
  if(url.pathname==='/__audit'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({name,requests:log}));}
  const entry={url:url.pathname+url.search,bytes:0,ms:0},started=performance.now();log.push(entry);res.on('finish',()=>{entry.ms=performance.now()-started;});
  const send=(value,status=200)=>{const data=JSON.stringify(value);res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('X-StreamNyaa-Fetched-At',String(now));res.setHeader('X-Source-Fetched-At',String(now));res.setHeader('X-Source-Complete','true');entry.bytes=Buffer.byteLength(data);res.end(data);};
  if(url.pathname.startsWith('/api/')){
   await new Promise(resolve=>setTimeout(resolve,60));
   if(url.pathname==='/api/auth/config')return send({supabaseUrl:'https://local-fixture.invalid',publishableKey:'local-only-fixture'});
   if(url.pathname==='/api/nyaa'&&url.searchParams.get('q')?.includes('fixture-outage')){res.setHeader('Retry-After','90');return send({error:'Controlled source outage'},503);}
   if(url.pathname==='/api/stream-sources'){
    if(url.searchParams.get('provider')==='releases'){
     const before=Number(url.searchParams.get('before'))||Math.floor(now/1000),page=1,track=url.searchParams.get('track')||'sub';
     const data=Array.from({length:12},(_,i)=>({canonicalId:`anilist:${i+1}`,anilist_id:i+1,mal_id:i+101,title:`Fixture Anime ${i+1}`,image:origin+'/fixture-poster.svg',images:{jpg:{large_image_url:origin+'/fixture-poster.svg'}},airingEpisode:4,releaseEpisode:4,releaseAt:(before-300-i*60)*1000,airingAt:before-300-i*60,releaseTrack:track,scheduleStatus:'scheduled',scheduleFetchedAt:now,scheduleProvider:'anilist',scheduleId:`anilist:${i+1}:episode-4:${track}`,timingBasis:track==='dub'?'confirmed-dub':'confirmed-sub',releasePolicyVersion:1}));
     return send({version:1,before,track,page,data,complete:true,stale:false,fetchedAt:now});
    }
    if(url.searchParams.get('provider')==='calendar'){
     const data=[];for(let id=1;id<=10;id++)for(const [index,track] of ['original','sub','dub'].entries())data.push({canonicalId:`anilist:${id}`,anilist_id:id,mal_id:id+100,title:`Fixture Anime ${id}`,image:origin+'/fixture-poster.svg',images:{jpg:{large_image_url:origin+'/fixture-poster.svg'}},airingEpisode:track==='dub'?1:4,airingAt:(today+(18*60+id*5+index*15)*60000)/1000,releaseTrack:track,scheduleStatus:'scheduled',scheduleFetchedAt:now,scheduleProvider:'animeschedule',sourceRoute:`fixture-${id}`,scheduleId:`anilist:${id}:episode-${track==='dub'?1:4}:${track}`});
     data.push({...data[0],canonicalId:'animeschedule:fixture-1',anilist_id:undefined,mal_id:undefined,scheduleId:'animeschedule:fixture-1:episode-4:original'});
     return send({version:1,data,complete:Boolean(url.searchParams.get('cursor')),stale:false,fetchedAt:now,providers:{anilist:{fetchedAt:now,stale:false},animeschedule:{fetchedAt:now,stale:false}},...(!url.searchParams.get('cursor')?{cursor:'0:0'}:{})});
    }
    if(['tenrai','jikan'].includes(url.searchParams.get('provider')))return send({data:Array.from({length:12},(_,i)=>({mal_id:i+1,title:`Episode ${i+1}`,aired:new Date(today-i*86400_000).toISOString()})),pagination:{has_next_page:false,last_visible_page:1}});
    let body='';try{for await(const chunk of req)body+=chunk;}catch{return res.destroy();}const input=JSON.parse(body||'{}'),q=input.query||'',vars=input.variables||{},page=Number(vars.page)||1;
    const items=Array.from({length:24},(_,i)=>({...media((page-1)*24+i+1,origin),status:vars.status||'RELEASING'}));
    if(q.includes('GenreCollection'))return send({data:{GenreCollection:['Adventure','Fantasy','Action']}});
    if(/\bMedia\s*\(/.test(q)){let id=Number(vars.id||1);if(q.includes('idMal:')&&id>100)id-=100;return send({data:{Media:media(id,origin)}});}
    const schedules=items.map((m,i)=>({id:(page-1)*24+i+1,episode:4,airingAt:(vars.before||vars.end||Math.floor(Date.now()/1000))-120-i*60,media:m}));
    return send({data:{Page:{pageInfo:{currentPage:page,hasNextPage:page<3,lastPage:3},media:items,airingSchedules:schedules}}});
   }
   if(url.pathname==='/api/nyaa')return send(Array.from({length:12},(_,i)=>({title:`[Fixture] Fixture Anime 1 - 04 (1080p) [Sub]`,infoHash:String(i+1).padStart(40,'0'),seeders:String(40+i),size:'1.2 GiB',link:'https://nyaa.si/view/1',magnet:`magnet:?xt=urn:btih:${String(i+1).padStart(40,'0')}`})));
   if(url.pathname==='/api/blog-archive')return send({posts:[],pagination:{page:1,limit:10,total:0,totalPages:1,hasNextPage:false,hasPreviousPage:false}});
   if(url.pathname==='/api/blog')return send({slug:'popular-anime-right-now',title:'Local article fixture',articleKind:'catalog',updatedAt:new Date(now).toISOString(),items:[],article:{headline:'Local article fixture',excerpt:'Controlled fixture.',paragraphs:['This local fixture checks rendering without generating any articles.'],sections:[],takeaways:[],faq:[]}});
   return send({error:'Unauthenticated local fixture'},401);
  }
  if(url.pathname.startsWith('/fixture-')){res.setHeader('Content-Type','image/svg+xml');const wide=url.pathname.includes('banner');return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="${wide?1200:400}" height="${wide?480:600}"><defs><linearGradient id="b"><stop stop-color="#142b46"/><stop offset="1" stop-color="#5a1531"/></linearGradient></defs><path fill="url(#b)" d="M0 0h1200v900H0z"/><text x="30" y="100" fill="#fff" font-family="sans-serif" font-size="36">Fixture artwork</text></svg>`);}
  try{
   let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)&&file!==root)throw Error('Invalid path');
   try{if(!(await stat(file)).isFile())file=path.join(root,'index.html');}catch{file=path.join(root,'index.html');}
   let payload=file.endsWith('.html')?undefined:cached.get(file);if(!payload){let raw=await readFile(file);const html=file.endsWith('.html');if(html){raw=Buffer.from(raw.toString().replace(/<script async src="https:\/\/www.googletagmanager[^>]*><\/script>/g,''));}
    if(html)raw=Buffer.from(raw.toString().replace('</head>',instrumentation+'</head>'));
    payload={body:gzipSync(raw),type:html?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'image/png'};cached.set(file,payload);}
   res.setHeader('Content-Type',payload.type);res.setHeader('Content-Encoding','gzip');res.setHeader('Cache-Control',file.endsWith('.html')?'no-cache':'public,max-age=3600');res.setHeader('Timing-Allow-Origin','*');entry.bytes=payload.body.length;res.end(payload.body);
  }catch{res.statusCode=404;res.end('Missing fixture asset');}
 });
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));console.log(`${name}: http://127.0.0.1:${port}`);
}
