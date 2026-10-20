import { getBlogPost, type BlogPostData } from '../src/api/blogShared.js';
import { latestPublishedBlogPost } from './blogArchive.js';
import { publicSnapshot } from './_shared/publicSnapshots.js';
import { EditorialTransport, toMediaItem } from './_shared/publishingData.js';

const memory=new Map<string,{at:number;value:BlogPostData}>(),flights=new Map<string,Promise<BlogPostData>>();
async function readPost(slug:string):Promise<BlogPostData>{
  const definition=getBlogPost(slug);if(!definition)throw Object.assign(Error('Blog post not found.'),{status:404});
  if(definition.articleKind==='gemini'){
    const published=await latestPublishedBlogPost(slug);
    if(!published)throw Object.assign(Error('No published article is available for this section yet.'),{status:404});
    return published;
  }
  const transport=new EditorialTransport(Date.now()+25_000),schedule=slug==='todays-anime-release-schedule'||slug==='recent-anime-episode-updates';
  const day=Math.floor(Date.now()/86400_000)*86400;
  const fields='id idMal title{romaji english} coverImage{extraLarge large} genres studios(isMain:true){nodes{name}} status episodes format averageScore popularity';
  const query=schedule?`query{Page(perPage:20){airingSchedules(airingAt_greater:${day-(slug==='recent-anime-episode-updates'?86400:0)},airingAt_lesser:${day+86400},sort:TIME){airingAt episode media{${fields}}}}}`
    :`query{Page(perPage:20){media(type:ANIME,isAdult:false,status:${slug==='upcoming-anime-this-season'?'NOT_YET_RELEASED':'RELEASING'},sort:${slug==='popular-anime-right-now'||slug==='upcoming-anime-this-season'?'POPULARITY_DESC':'TRENDING_DESC'}){${fields}}}}`;
  const snapshot=await publicSnapshot<any>(`blog-guide:${slug}:${schedule?day:''}`,schedule?180:3600,()=>transport.graph(query,{}));
  const items=schedule?(snapshot.value.data?.Page?.airingSchedules||[]).map((row:any)=>({...toMediaItem(row.media),airingAt:row.airingAt,episode:row.episode})):(snapshot.value.data?.Page?.media||[]).map(toMediaItem);
  const updatedAt=new Date(snapshot.fetchedAt).toISOString();
  return{...definition,updatedAt,items,articleStatus:snapshot.stale?'stale':'catalog-guide',articleSource:'fallback',article:{headline:definition.title,excerpt:definition.description,heroCallout:'',
    paragraphs:[schedule?`This view lists ${items.length} genuine episode airing records from AniList. Times identify the original broadcast and do not establish a separate dub release.`:`This catalog view contains ${items.length} titles using the selected AniList ordering. Current activity and cumulative list popularity are different measurements; this page is not the weekly activity ranking.`,
      `Metadata was retrieved ${updatedAt}.${snapshot.stale?' The provider could not refresh this saved view.':''}`],sections:[],takeaways:[],faq:[]}};
}
/** Read-only compatibility entry point. Publication is exclusively a job operation. */
export async function getCachedBlogPost(slug:string,_preview=false,_force=false,_options:unknown={}){
  const saved=memory.get(slug);if(saved&&saved.at+60_000>Date.now())return saved.value;
  const active=flights.get(slug);if(active)return active;
  const request=readPost(slug).then(value=>{memory.set(slug,{at:Date.now(),value});return value;});
  flights.set(slug,request);try{return await request;}finally{flights.delete(slug);}
}
export default async function handler(req:any,res:any){
  res.setHeader('X-Robots-Tag','noindex');
  if(req.method!=='GET')return res.status(405).json({error:'Blog reads require GET. Use authenticated publishing jobs for generation.'});
  if(req.query.force||req.query.manual)return res.status(405).json({error:'Generation is available through authenticated Admin jobs only.'});
  const slug=String(Array.isArray(req.query.slug)?req.query.slug[0]:req.query.slug||'');
  try{const value=await getCachedBlogPost(slug);res.setHeader('Cache-Control',value.articleStatus==='stale'?'no-store':'public, max-age=60, s-maxage=300, stale-while-revalidate=600');return res.status(200).json(value);}
  catch(error){res.setHeader('Cache-Control','no-store');return res.status((error as any).status||503).json({error:(error as Error).message});}
}
