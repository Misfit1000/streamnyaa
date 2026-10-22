import { waitUntil } from '@vercel/functions';
import { envAdminEmails, requireAdmin, supabaseBaseUrl, supabaseRest, supabaseSecretKey } from './adminAuth.js';
import { enqueueManualGeneration, generationStatus, runGenerationBatch } from './publishing.js';
import { publicationPolicy, draftRevision } from './publicationReview.js';
import { editorialModel } from './editorialModel.js';

export async function generateBlog(req:any,res:any){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const auth=await requireAdmin(req);if('error'in auth)return res.status(auth.status).json({error:auth.error});
    let ids:string[];
    if(req.body?.jobId){const id=String(req.body.jobId);if(!/^[a-f0-9-]{36}$/i.test(id))return res.status(400).json({error:'Invalid job identifier.'});
      const rows=await supabaseRest(`blog_generation_runs?id=eq.${id}&select=*&limit=1`);const prior=rows?.[0];if(!prior)return res.status(404).json({error:'Job not found.'});
      if(['failed','pending'].includes(prior.status))await supabaseRest(`blog_generation_runs?id=eq.${id}&status=eq.${prior.status}`,{method:'PATCH',body:JSON.stringify({status:'pending',checkpoint:{...prior.checkpoint,resumeRequired:false}})});
      ids=[id];
    }else ids=[(await enqueueManualGeneration(auth.user.id,String(req.body?.requestId||''),req.body?.mode==='both'?2:1)).id];
    const work=runGenerationBatch(ids).catch(error=>console.error('Publication worker stopped:',String(error?.message||'Unknown error').slice(0,200)));
    waitUntil(work);
    return res.status(202).json({accepted:true,jobs:await generationStatus(ids)});
  }catch(error){return res.status((error as any).status===400?400:503).json({error:(error as Error).message||'Publishing storage is not available.'});}
}
export async function reviewBlog(req:any,res:any){
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  const auth=await requireAdmin(req);if('error'in auth)return res.status(auth.status).json({error:auth.error});
  const id=String(req.query?.jobId||req.body?.jobId||'');if(!/^[a-f0-9-]{36}$/i.test(id))return res.status(400).json({error:'Invalid job identifier.'});
  try{
    const rows=await supabaseRest(`blog_generation_runs?id=eq.${id}&select=id,status,publication_mode,checkpoint&limit=1`),run=rows?.[0];
    if(!run)return res.status(404).json({error:'Job not found.'});
    if(req.method==='GET'){
      const state=run.checkpoint,brief=state.briefs?.[state.next||0];
      return res.status(200).json({id,status:run.status,publicationMode:run.publication_mode,policy:await publicationPolicy(),draft:run.status==='awaiting_review'&&state.draft?.draft?{revision:draftRevision(brief,state.draft.draft),article:state.draft.draft,brief,errors:state.draft.errors||[]}:null});
    }
    if(req.body.action==='enable-automatic'){
      const enabled=await supabaseRest('rpc/enable_blog_automatic',{method:'POST',body:JSON.stringify({p_accepted_run:id})});
      if(!enabled)return res.status(409).json({error:'A reviewed article must be durably published before enabling automatic publication.'});
      return res.status(200).json({policy:await publicationPolicy()});
    }
    if(!['approve','reject'].includes(req.body.action))return res.status(400).json({error:'Choose approve or reject.'});
    if(req.body.action==='reject'&&!String(req.body.reason||'').trim())return res.status(400).json({error:'Explain why the draft was rejected.'});
    const revision=String(req.body.revision||'');
    if(!/^[a-f0-9]{64}$/.test(revision))return res.status(400).json({error:'Invalid draft revision.'});
    const actual=run.checkpoint?.draft?.draft&&draftRevision(run.checkpoint.briefs?.[run.checkpoint.next||0],run.checkpoint.draft.draft);
    if(actual!==revision)return res.status(409).json({error:'This draft changed. Load and review the current revision.'});
    const accepted=await supabaseRest('rpc/review_blog_draft',{method:'POST',body:JSON.stringify({p_id:id,p_revision:revision,p_approve:req.body.action==='approve',p_reviewer:auth.user.email||auth.user.id,p_reason:String(req.body.reason||'').slice(0,1000)})});
    if(!accepted)return res.status(409).json({error:'This draft was already reviewed or changed. Refresh its status.'});
    if(req.body.action==='approve')waitUntil(runGenerationBatch([id]).catch(error=>console.error('Reviewed publication stopped:',String(error?.message||'Unknown error').slice(0,200))));
    return res.status(202).json({accepted:true,jobs:await generationStatus([id])});
  }catch(error){return res.status(503).json({error:(error as Error).message||'Draft review is unavailable.'});}
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
    return res.status(200).json({adminEmail:auth.user.email,generatedBlogArticles:articles.count,recentArticles:articles.recent,jobs,publicationPolicy:await publicationPolicy(),lastSuccessfulPublication:jobs.find((job:any)=>job.status==='published')?.updatedAt,
      cronSchedule:'Daily 00:00–00:59 UTC · 05:45–06:44 Nepal time',admins:{env:envAdminEmails(),stored:admins.rows,tableReady:admins.ready,setupMessage:admins.message},
      archive:{supabaseConfigured:Boolean(supabaseBaseUrl()&&supabaseSecretKey()),githubFallbackConfigured:Boolean(process.env.GITHUB_ARTICLE_TOKEN||process.env.GH_ARTICLE_TOKEN)},config:{geminiConfigured:Boolean(process.env.GEMINI_API_KEY),geminiModel:editorialModel(),smtpExpected:true,productionUrl:'https://www.streamnyaa.xyz'}});
  }catch(error){return res.status(503).json({error:(error as Error).message||'Admin summary could not load.'});}
}
