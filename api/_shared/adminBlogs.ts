import {requireAdmin,supabaseRest} from './adminAuth.js';
import {refreshBlogCache} from './blogCache.js';

const uuid=/^[a-f0-9-]{36}$/i,slug=/^[a-z0-9][a-z0-9-]{0,220}$/;
export async function manageBlogs(req:any,res:any){
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
  try{
    const auth=await requireAdmin(req);if('error'in auth)return res.status(auth.status).json({error:auth.error});
    if(req.method==='POST'){
      const {kind,id,revision,action}=req.body||{};
      if(!['article','draft'].includes(kind)||!((kind==='article'?slug:uuid).test(String(id)))||!Number.isSafeInteger(revision)||revision<0||!['trash','restore'].includes(action))return res.status(400).json({error:'Invalid blog action.'});
      const changed=await supabaseRest('rpc/manage_blog_entry',{method:'POST',body:JSON.stringify({p_kind:kind,p_id:id,p_revision:revision,p_trash:action==='trash',p_actor:auth.user.id})});
      if(!changed)return res.status(409).json({error:'This entry changed or its job is active. Refresh the list before trying again.'});
      const cacheRefreshed=kind==='article'?await refreshBlogCache(id,action==='trash'):true;
      return res.status(200).json({ok:true,action,cacheRefreshed});
    }
    const view=String(req.query?.view||'published'),search=String(req.query?.q||'').trim();
    if(!['published','drafts','jobs','trash-articles','trash-drafts'].includes(view)||search.length>120)return res.status(400).json({error:'Invalid blog filter.'});
    const articles=['published','trash-articles'].includes(view),trashed=view.startsWith('trash-'),time=articles?'updated_at':'created_at',id=articles?'slug':'id';
    const params=new URLSearchParams({select:articles?'slug,title,excerpt,updated_at,source,admin_revision,admin_deleted_at,content_kind:content->>contentKind':'id,status,kind,origin,reason,created_at,updated_at,lease_until,admin_revision,admin_deleted_at,title:checkpoint->draft->draft->>headline,rejected_title:checkpoint->rejections->-1->draft->>headline',order:`${time}.desc,${id}.desc`,limit:'21',admin_deleted_at:trashed?'not.is.null':'is.null'});
    if(view==='drafts')params.set('or','(checkpoint->draft->draft.not.is.null,checkpoint->rejections->-1->draft.not.is.null)');
    const safeSearch=search.replace(/[^\p{L}\p{N}\s-]/gu,'').slice(0,100);
    if(safeSearch&&articles)params.set('title',`ilike.*${safeSearch}*`);
    if(req.query?.cursor){
      if(typeof req.query.cursor!=='string'||req.query.cursor.length>1024)return res.status(400).json({error:'Invalid page cursor.'});
      let cursor:any;try{cursor=JSON.parse(Buffer.from(String(req.query.cursor),'base64url').toString('utf8'));}catch{return res.status(400).json({error:'Invalid page cursor.'});}
      if(cursor.view!==view||cursor.q!==search||typeof cursor.at!=='string'||!/^\d{4}-\d\d-\d\dT[\d:.+-]+Z?$/.test(cursor.at)||!Number.isFinite(Date.parse(cursor.at))||!(articles?slug:uuid).test(cursor.id))return res.status(400).json({error:'Invalid page cursor.'});
      // AND keeps the draft filter independent of the pagination OR.
      params.set('and',`(or(${time}.lt.${cursor.at},and(${time}.eq.${cursor.at},${id}.lt.${cursor.id})))`);
    }
    const rows=await supabaseRest(`${articles?'blog_articles':'blog_generation_runs'}?${params}`);
    if(!Array.isArray(rows))throw Error('Invalid blog list.');
    const data=rows.slice(0,20),last=data.at(-1);
    return res.status(200).json({entries:data,view,nextCursor:rows.length>20&&last?Buffer.from(JSON.stringify({view,q:search,at:last[time],id:last[id]})).toString('base64url'):undefined});
  }catch{return res.status(503).json({error:'Blog management is temporarily unavailable. Retry without repeating a generation request.'});}
}
