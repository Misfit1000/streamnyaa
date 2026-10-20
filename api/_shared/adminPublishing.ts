import { waitUntil } from '@vercel/functions';
import { envAdminEmails, requireAdmin, supabaseBaseUrl, supabaseRest, supabaseSecretKey } from './adminAuth.js';
import { enqueueGeneration, generationStatus, runGenerationBatch } from './publishing.js';

export async function generateBlog(req:any,res:any){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const auth=await requireAdmin(req);if('error'in auth)return res.status(auth.status).json({error:auth.error});
    let ids:string[];
    if(req.body?.jobId){const id=String(req.body.jobId);if(!/^[a-f0-9-]{36}$/i.test(id))return res.status(400).json({error:'Invalid job identifier.'});
      const rows=await supabaseRest(`blog_generation_runs?id=eq.${id}&select=*&limit=1`);const prior=rows?.[0];if(!prior)return res.status(404).json({error:'Job not found.'});
      if(['failed','pending'].includes(prior.status))await supabaseRest(`blog_generation_runs?id=eq.${id}&status=eq.${prior.status}`,{method:'PATCH',body:JSON.stringify({status:'pending',checkpoint:{...prior.checkpoint,resumeRequired:false}})});
      ids=[id];
    }else ids=[(await enqueueGeneration('daily',req.body?.mode==='both'?2:1)).id];
    const work=runGenerationBatch(ids).catch(error=>console.error('Publication worker stopped:',String(error?.message||'Unknown error').slice(0,200)));
    waitUntil(work);
    return res.status(202).json({accepted:true,jobs:await generationStatus(ids)});
  }catch(error){return res.status(503).json({error:(error as Error).message||'Publishing storage is not available.'});}
}
export async function generationStatusRoute(req:any,res:any){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const auth=await requireAdmin(req);if('error'in auth)return res.status(auth.status).json({error:auth.error});
  const ids=String(req.query.ids||'').split(',').filter(Boolean);
  if(ids.length>4||ids.some(id=>!/^[a-f0-9-]{36}$/i.test(id)))return res.status(400).json({error:'Invalid job identifiers.'});
  try{return res.status(200).json({jobs:await generationStatus(ids.length?ids:undefined)});}catch{return res.status(503).json({error:'Publication status is temporarily unavailable.'});}
}
async function articleSummary(){
  if(!supabaseBaseUrl()||!supabaseSecretKey())return{count:null,recent:[]};
  const params=new URLSearchParams({select:'slug,title,updated_at,source,category:content->>category,article_kind:content->>articleKind,status:content->>articleStatus',order:'updated_at.desc',limit:'8'});
  const response=await fetch(`${supabaseBaseUrl()}/rest/v1/blog_articles?${params}`,{signal:AbortSignal.timeout(5000),headers:{apikey:supabaseSecretKey(),Authorization:`Bearer ${supabaseSecretKey()}`,Prefer:'count=exact'}});
  if(!response.ok)throw Error('Published article summary could not load.');
  return{count:Number(response.headers.get('content-range')?.split('/')[1])||0,recent:await response.json()};
}
export async function summary(req:any,res:any){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  try{
    const auth=await requireAdmin(req);if('error'in auth)return res.status(auth.status).json({error:auth.error});
    const [articles,admins,jobs]=await Promise.all([articleSummary(),supabaseRest('admin_users?select=email,created_at,created_by&order=created_at.desc').then(rows=>({rows,ready:true,message:''})).catch(error=>({rows:[],ready:false,message:String(error.message)})),generationStatus().catch(()=>[])]);
    return res.status(200).json({adminEmail:auth.user.email,generatedBlogArticles:articles.count,recentArticles:articles.recent,jobs,lastSuccessfulPublication:jobs.find((job:any)=>job.status==='published')?.updatedAt,
      cronSchedule:'Daily 00:00–00:59 UTC · 05:45–06:44 Nepal time',admins:{env:envAdminEmails(),stored:admins.rows,tableReady:admins.ready,setupMessage:admins.message},
      archive:{supabaseConfigured:Boolean(supabaseBaseUrl()&&supabaseSecretKey()),githubFallbackConfigured:Boolean(process.env.GITHUB_ARTICLE_TOKEN||process.env.GH_ARTICLE_TOKEN)},config:{geminiConfigured:Boolean(process.env.GEMINI_API_KEY),smtpExpected:true,productionUrl:'https://www.streamnyaa.xyz'}});
  }catch(error){return res.status(503).json({error:(error as Error).message||'Admin summary could not load.'});}
}
