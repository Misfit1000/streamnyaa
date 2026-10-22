import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import EditorialArticleBody from './EditorialArticleBody';
import {articleFromEditorialDraft} from '../lib/editorialPresentation';
import {BLOG_POSTS,type BlogPostData} from '../api/blogShared';
type Job={id:string;status:string;reviewApproved?:boolean};
export default function AdminPublicationReview({accountId,token,jobs,automaticEnabled,onAccepted}:{accountId:string;token:string;jobs:Job[];automaticEnabled:boolean;onAccepted:(ids:string[])=>void}){
  const [jobId,setJobId]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const draft=useQuery({queryKey:['admin-draft',accountId,jobId],enabled:Boolean(jobId),retry:false,staleTime:0,gcTime:0,
    queryFn:async({signal})=>{const r=await fetch(`/api/admin/generation-review?jobId=${jobId}`,{signal,cache:'no-store',headers:{Authorization:`Bearer ${token}`}});const data=await r.json();if(!r.ok)throw Error(data.error||'Draft could not load.');return data;}});
  async function act(id:string,action:string){
    if(busy)return;setBusy(true);setError('');
    try{const r=await fetch('/api/admin/generation-review',{method:'POST',cache:'no-store',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({jobId:id,action,revision:draft.data?.draft?.revision,reason})});const data=await r.json();if(!r.ok)throw Error(data.error||'Review could not be saved.');setJobId('');onAccepted((data.jobs||[]).map((job:Job)=>job.id));}
    catch(error){setError((error as Error).message);}finally{setBusy(false);}
  }
  const approved=jobs.find(job=>job.status==='published'&&job.reviewApproved);
  const awaitingReview=jobs.filter(job=>job.status==='awaiting_review');
  const saved=draft.data?.draft,brief=saved?.brief;
  const preview:BlogPostData|undefined=saved&&brief?.editorialVersion===3?{...BLOG_POSTS[0],updatedAt:brief.sources[0]?.retrievedAt||'',qualityVersion:3,contentKind:brief.kind,article:articleFromEditorialDraft(saved.article,brief.findings),items:brief.items,sources:brief.sources,ranking:brief.ranking,charts:brief.charts,activityEvidence:brief.activityEvidence}:undefined;
  return <div className="mt-3 space-y-3 text-sm">
    {!!awaitingReview.length&&<p role="status" className="rounded-lg border border-primary/25 bg-primary/5 p-3">Draft written. Generate saves a private draft; approval publishes it. Review the saved draft below.</p>}
    <div className="flex flex-wrap gap-3">{awaitingReview.map(job=><button key={job.id} type="button" className="font-semibold text-primary underline" onClick={()=>{setJobId(job.id);setError('');setReason('');}}>Review saved draft</button>)}
      {!automaticEnabled&&approved&&<button type="button" disabled={busy} className="font-semibold text-primary underline" onClick={()=>void act(approved.id,'enable-automatic')}>Enable automatic publishing after acceptance</button>}</div>
    {error&&<p role="alert" className="text-red-400">{error}</p>}
    {jobId&&<section aria-label="Private draft review" className="rounded-lg border border-border bg-background/45 p-4">
      <div className="flex items-center justify-between gap-3"><h3 className="font-bold">Private draft review</h3><button type="button" onClick={()=>setJobId('')} className="underline">Close review</button></div>
      {draft.isPending?<p role="status">Loading saved draft…</p>:draft.isError?<p role="alert">{draft.error.message}</p>:!draft.data?.draft?<p>This job has no draft awaiting review. Refresh job status.</p>:<>
        <p className="mt-3 text-xs text-muted-foreground">Check the primary evidence, facts, useful context and wording before publishing. This draft is not public.</p>
        <h4 className="mt-4 text-lg font-bold">{draft.data.draft.article.headline}</h4><p className="mt-2 text-muted-foreground">{draft.data.draft.article.excerpt}</p>
        {preview?<div className="mt-4"><EditorialArticleBody post={preview} preview/></div>:<>
        {(draft.data.draft.article.paragraphs||[]).map((block:any,index:number)=><p key={index} className="mt-4 leading-7">{block.text}<small className="ml-2 text-muted-foreground">[{block.sourceIds.join(', ')}]</small></p>)}
        {(draft.data.draft.article.sections||[]).map((block:any,index:number)=><div key={index} className="mt-4"><h5 className="font-semibold">{block.heading}</h5><p className="mt-2 leading-7">{block.body}</p><small className="text-muted-foreground">[{block.sourceIds.join(', ')}]</small></div>)}
        </>}
        <h4 className="mt-5 font-bold">Evidence brief</h4><p>{draft.data.draft.brief.subject}</p>
        {(draft.data.draft.brief.sources||[]).map((source:any)=><details key={source.id} className="mt-3 rounded border border-border p-3"><summary className="cursor-pointer">{source.id} · {source.title} · {source.publishedAt||'Publication date unavailable'}</summary><a href={/^https:\/\//.test(source.url)?source.url:undefined} target="_blank" rel="noreferrer" className="mt-2 block break-all text-primary underline">{source.url}</a><p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-muted-foreground">{source.text}</p></details>)}
        <label className="mt-5 block">Review notes<textarea value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)} className="mt-2 block w-full rounded border border-border bg-background p-3" /></label>
        <div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={()=>void act(jobId,'approve')} className="rounded bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-60">Approve and publish</button><button type="button" disabled={busy||!reason.trim()} onClick={()=>void act(jobId,'reject')} className="rounded border border-border px-4 py-2 disabled:opacity-60">Reject draft</button></div>
      </>}
    </section>}
  </div>;
}
