import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';
import { load } from 'cheerio';
import { publicSnapshot, readPublicSnapshot, writePublicSnapshot } from './publicSnapshots.js';

export type EvidenceSource={id:string;title:string;url:string;publishedAt?:string;retrievedAt:string;text:string;primary:boolean};
export type EvidenceBrief={kind:'news'|'data-report'|'weekly-ranking';subject:string;headline:string;fingerprint:string;sources:EvidenceSource[];items:any[];facts:string[];ranking?:Ranking;charts?:any[]};
export type Ranking={start:string;end:string;method:string;candidateCount:number;candidateIds:number[];eligibleCount:number;rows:{id:number;title:string;mean:number;days:number;popularity:number;movement?:number}[];honorableMentions:any[];coverage:string};
export const fingerprint=(value:string)=>createHash('sha256').update(value.normalize('NFKC').toLowerCase()).digest('hex');
const primaryDomains=['crunchyroll.com','netflix.com','aniplex.co.jp','toei-anim.co.jp','corp.toei-anim.co.jp','kadokawa.co.jp','nhk.or.jp','tms-e.co.jp','sunrise-inc.co.jp','toho.co.jp','tohoanimation.jp','bandainamco.co.jp','avex.jp','aoni.co.jp','81produce.co.jp','nexon.com','shueisha.co.jp'];
const hostMatches=(host:string,base:string)=>host===base||host.endsWith(`.${base}`);
const publicAddress=(address:string)=>!/^127\.|^10\.|^192\.168\.|^169\.254\.|^0\.|^172\.(1[6-9]|2\d|3[01])\.|^::|^fc|^fd|^fe[89ab]|^ff|^2(?:2[4-9]|[3-5]\d)\./i.test(address);
export async function safeEvidenceUrl(input:string,allowed:string[]){
  const url=new URL(input);if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||isIP(url.hostname)||!allowed.some(host=>hostMatches(url.hostname,host)))throw Error('Unsupported evidence host.');
  const addresses=await lookup(url.hostname,{all:true});if(!addresses.length||addresses.some(row=>!publicAddress(row.address)))throw Error('Evidence host is not public.');
  return {url,addresses};
}
/** Explicit request budget, provider pacing and deadlines; never a public load test. */
export class EditorialTransport{
  requests=0;private admitted=new Map<string,number>();
  constructor(readonly deadline=Date.now()+230_000){}
  async fetch(url:string,init:RequestInit={},spacing=1000,pinned?:{address:string;family:number}[]){
    if(this.requests>=40||Date.now()>this.deadline-12_000)throw Error('Publishing request/time budget reached; retry this run.');
    const host=new URL(url).hostname,wait=(this.admitted.get(host)||0)+spacing-Date.now();
    if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));this.admitted.set(host,Date.now());this.requests++;
    const signal=AbortSignal.timeout(Math.min(10_000,Math.max(1,this.deadline-Date.now())));
    const response=pinned?await new Promise<Response>((resolve,reject)=>{
      const request=httpsRequest(url,{method:'GET',headers:init.headers as Record<string,string>,signal,
        lookup:((_host:any,options:any,callback:any)=>options?.all?callback(null,pinned):callback(null,pinned[0].address,pinned[0].family)) as any},incoming=>resolve(new Response(Readable.toWeb(incoming) as any,{status:incoming.statusCode,headers:incoming.headers as any})));
      request.on('error',reject);request.end();
    }):await fetch(url,{...init,signal});
    if(!response.ok&&!(init.redirect==='manual'&&response.status>=300&&response.status<400))throw Object.assign(Error(`Evidence provider returned ${response.status}.`),{status:response.status,retryAfter:response.headers.get('retry-after')});
    return response;
  }
  async graph(query:string,variables:any){
    const response=await this.fetch('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,variables})},2100);
    const value=await response.json();if(value.errors?.length)throw Error('AniList could not verify editorial data.');return value;
  }
  async document(input:string,allowed:string[]):Promise<{url:string;text:string;links:string[];publishedAt?:string}>{
    let vetted=await safeEvidenceUrl(input,allowed),url=vetted.url;
    for(let redirects=0;redirects<4;redirects++){
      const response=await this.fetch(url.toString(),{redirect:'manual',headers:{Accept:'text/html','User-Agent':'StreamNyaa Editorial/1.0'}},1000,vetted.addresses);
      if(response.status>=300&&response.status<400){await response.body?.cancel();vetted=await safeEvidenceUrl(new URL(response.headers.get('location')||'',url).toString(),allowed);url=vetted.url;continue;}
      if(!/text\/html/i.test(response.headers.get('content-type')||''))throw Error('Evidence document is not HTML.');
      const reader=response.body?.getReader();if(!reader)throw Error('Evidence document is empty.');let size=0;const chunks:Uint8Array[]=[];
      try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>768*1024)throw Error('Evidence document exceeds the bounded read.');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});}
      const html=Buffer.concat(chunks).toString('utf8'),$=load(html);$('script,style,nav,footer,header,aside').remove();
      const root=$('article').length?$('article').first():$('main').length?$('main').first():$('body');
      const text=root.text().replace(/\s+/g,' ').trim().slice(0,18000);
      const links=root.find('a[href]').map((_i,el)=>{try{return new URL($(el).attr('href')!,url).toString();}catch{return'';}}).get().filter(Boolean);
      const date=$('meta[property="article:published_time"]').attr('content')||$('time[datetime]').first().attr('datetime');
      const publishedAt=date&&Number.isFinite(Date.parse(date))?new Date(date).toISOString():undefined;
      if(text.length<180)throw Error('Evidence text is insufficient.');return{url:url.toString(),text,links,publishedAt};
    }throw Error('Evidence redirect limit reached.');
  }
}
const fields='id idMal title{romaji english} format status episodes genres averageScore popularity coverImage{extraLarge large} studios(isMain:true){nodes{name}} externalLinks{url site}';
export async function discoverNews(transport:EditorialTransport):Promise<EvidenceBrief[]>{
  const catalog=await publicSnapshot<any>('editorial:candidates:v1',3600,()=>transport.graph(`query{active:Page(perPage:12){media(type:ANIME,status:RELEASING,sort:TRENDING_DESC,isAdult:false){${fields}}} upcoming:Page(perPage:12){media(type:ANIME,status:NOT_YET_RELEASED,sort:POPULARITY_DESC,isAdult:false){${fields}}}}`,{}));
  if(catalog.stale)throw Error('Current editorial candidates could not refresh.');
  const media=[...(catalog.value?.data?.active?.media||[]).slice(0,3),...(catalog.value?.data?.upcoming?.media||[]).slice(0,3)];
  const leads:{item:any;news:any}[]=[];
  for(const item of media){if(!item.idMal)continue;const source=await publicSnapshot<any>(`editorial:news:${item.idMal}`,3600,async()=>{const response=await transport.fetch(`https://api.tenrai.org/v1/anime/${item.idMal}/news`);const json=await response.json();if(!Array.isArray(json.data))throw Error('Invalid news discovery response.');return json;});
    if(!source.stale)for(const news of source.value.data.slice(0,8)){const age=Date.now()-Date.parse(news.date||'');if(age>=0&&age<=48*3600_000&&/announce|confirm|season|film|movie|trailer|delay|postpon|cancel|cast|replace|died|dies|death|passed away|industry|studio|release/i.test(news.title||''))leads.push({item,news});}}
  const briefs:EvidenceBrief[]=[];const seen=new Set<string>();
  for(const {item,news} of leads.sort((a,b)=>Date.parse(b.news.date)-Date.parse(a.news.date)).slice(0,8)){
    if(briefs.length>=4)break;if(seen.has(news.url))continue;seen.add(news.url);
    try{
      const officialHosts=(item.externalLinks||[]).filter((link:any)=>/official/i.test(link.site||'')).flatMap((link:any)=>{try{return[new URL(link.url).hostname];}catch{return[];}});
      const trusted=[...primaryDomains,...officialHosts];const discovery=await transport.document(news.url,['animenewsnetwork.com',...trusted]);
      const direct=trusted.some(host=>hostMatches(new URL(discovery.url).hostname,host));
      let primary=direct?discovery:undefined;
      if(!primary)for(const link of discovery.links.filter(link=>{try{return trusted.some(host=>hostMatches(new URL(link).hostname,host));}catch{return false;}}).slice(0,3)){
        try{const evidence=await transport.document(link,trusted);if(evidence.text.toLowerCase().includes(String(item.title.english||item.title.romaji).toLowerCase().slice(0,12))){primary=evidence;break;}}catch{/* A link is not confirmation if its document cannot be read. */}
      }
      if(!primary?.publishedAt||Date.now()-Date.parse(primary.publishedAt)>7*86400_000||Date.parse(primary.publishedAt)>Date.now()+60_000)continue;
      const title=item.title.english||item.title.romaji,source:EvidenceSource={id:'primary-1',title:'Official announcement',url:primary.url,publishedAt:primary.publishedAt,retrievedAt:new Date().toISOString(),text:primary.text,primary:true};
      // The primary document, not a ranking score or aggregated headline, is
      // supplied as the evidence brief. Sensitive claims follow the same gate.
      briefs.push({kind:'news',subject:title,headline:news.title,fingerprint:fingerprint(`event:${primary.url.split('#')[0]}:${primary.publishedAt}`),sources:[source],items:[toMediaItem(item)],facts:[`Discovery headline: ${news.title}`,`Affected installment: ${title}`,`Discovery date: ${news.date}`]});
    }catch(error){if([403,429].includes((error as any).status))throw error;}
  }
  return briefs;
}
export function toMediaItem(media:any){return{id:media.id,mal_id:media.idMal||0,title:media.title?.english||media.title?.romaji||'Anime',description:'',image:media.coverImage?.extraLarge||media.coverImage?.large||'',genres:media.genres||[],studios:media.studios?.nodes?.map((s:any)=>s.name)||[],format:media.format,status:media.status,popularity:media.popularity,score:media.averageScore?media.averageScore/10:undefined};}
export function precedingWeek(now=Date.now()){const end=new Date(now);end.setUTCHours(0,0,0,0);return{start:end.getTime()-7*86400_000,end:end.getTime()};}
export function calculateRanking(records:any[],period:{start:number;end:number},previous?:Ranking):Ranking{
  const groups=new Map<number,Map<string,any>>();
  for(const row of records){const date=Number(row.date)*1000;if(!Number.isSafeInteger(row.mediaId)||date<period.start||date>=period.end||!Number.isFinite(row.trending)||row.trending<0)continue;
    const days=groups.get(row.mediaId)||new Map();days.set(new Date(date).toISOString().slice(0,10),row);groups.set(row.mediaId,days);}
  const rows=[...groups].filter(([,days])=>days.size>=4).map(([id,days])=>{const records=[...days.values()],media=records[0].media;return{id,title:media?.title?.english||media?.title?.romaji||`AniList ${id}`,mean:records.reduce((sum,row)=>sum+row.trending,0)/records.length,days:records.length,popularity:Math.max(...records.map(row=>Number(row.popularity)||0))};}).sort((a,b)=>b.mean-a.mean||b.popularity-a.popularity||a.id-b.id);
  const candidateIds=[...groups.keys()].sort((a,b)=>a-b);
  const comparable=previous&&Date.parse(previous.end)===period.start&&JSON.stringify(previous.candidateIds)===JSON.stringify(candidateIds)&&previous.rows.every(row=>row.days===7)&&rows.every(row=>row.days===7);
  if(comparable)for(const [index,row] of rows.entries()){const before=previous.rows.findIndex(old=>old.id===row.id);if(before>=0)(row as any).movement=before-index;}
  return{start:new Date(period.start).toISOString(),end:new Date(period.end).toISOString(),method:'Mean recorded daily AniList activity; at least four days. Ties: popularity, then canonical ID.',candidateCount:groups.size,candidateIds,eligibleCount:rows.length,rows:rows.slice(0,10),honorableMentions:rows.slice(10,13),coverage:'Up to 50 candidates discovered from at most 150 high-activity daily records. This is bounded AniList coverage, not worldwide views, streams or sales. Missing days are excluded, not zero-filled.'};
}
export async function rankingBrief(transport:EditorialTransport,kind:'weekly-ranking'|'data-report',now=Date.now()):Promise<EvidenceBrief|undefined>{
  const period=precedingWeek(now),periodKey=new Date(period.end).toISOString().slice(0,10);
  const snapshot=await publicSnapshot<any[]>(`editorial:daily-activity:${periodKey}`,86400,async()=>{
    const found=new Set<number>();
    for(let page=1;page<=3;page++){const candidates=await transport.graph(`query($start:Int!,$end:Int!,$page:Int!){Page(page:$page,perPage:50){pageInfo{hasNextPage} mediaTrends(date_greater:$start,date_lesser:$end,sort:TRENDING_DESC){mediaId}}}`,{start:period.start/1000-1,end:period.end/1000,page});for(const row of candidates.data?.Page?.mediaTrends||[])found.add(row.mediaId);if(!candidates.data?.Page?.pageInfo?.hasNextPage||found.size>=50)break;}
    const ids=[...found].slice(0,50),records:any[]=[];
    if(!ids.length)return records;
    for(let page=1;page<=8;page++){const result=await transport.graph(`query($ids:[Int],$start:Int!,$end:Int!,$page:Int!){Page(page:$page,perPage:50){pageInfo{hasNextPage} mediaTrends(mediaId_in:$ids,date_greater:$start,date_lesser:$end,sort:DATE_DESC){mediaId date trending popularity media{id idMal type title{english romaji} coverImage{extraLarge large}}}}}`,{ids,start:period.start/1000-1,end:period.end/1000,page});records.push(...(result.data?.Page?.mediaTrends||[]).filter((row:any)=>row.media?.type==='ANIME'));if(!result.data?.Page?.pageInfo?.hasNextPage)break;}
    return records;
  });
  if(snapshot.stale)return;
  const previous=await readPublicSnapshot<Ranking>(`editorial:ranking:${new Date(period.start).toISOString().slice(0,10)}`),ranking=calculateRanking(snapshot.value,period,previous?.value);
  if(ranking.eligibleCount<13)return;
  await writePublicSnapshot(`editorial:ranking:${periodKey}`,ranking,Date.now(),604800);
  const source:EvidenceSource={id:'anilist-activity',title:'AniList daily media activity',url:'https://docs.anilist.co/reference/object/mediatrend',retrievedAt:new Date(snapshot.fetchedAt).toISOString(),text:JSON.stringify(ranking),primary:true};
  const ids=new Set([...ranking.rows,...ranking.honorableMentions].map(row=>row.id));
  const items=[...new Map(snapshot.value.filter(row=>ids.has(row.mediaId)).map(row=>[row.mediaId,toMediaItem(row.media)])).values()];
  return{kind,subject:'AniList weekly activity',headline:kind==='weekly-ranking'?`AniList weekly activity: Top 10 for the week ending ${periodKey}`:`What seven days of AniList activity show through ${periodKey}`,fingerprint:fingerprint(`${kind}:${periodKey}`),sources:[source],items,facts:[ranking.method,ranking.coverage],ranking,
    charts:[{title:'Mean recorded daily AniList activity',unit:'activity',values:ranking.rows.map(row=>({label:row.title,value:Math.round(row.mean*100)/100,days:row.days}))}]};
}
