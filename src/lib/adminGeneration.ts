export type AdminGenerationJob={id:string;kind:string;status:string;active:boolean;stage?:string;reason?:string;createdAt?:string;updatedAt?:string;retryAt?:number;resumeRequired?:boolean;published:string[]};
export function generationJobLabel(job:AdminGenerationJob){
 if(job.status==='awaiting_review')return 'Ready for review';
 if(job.status==='skipped')return 'No eligible article';
 if(job.status==='running')return job.active?'Running':'Paused';
 if(job.status==='pending')return job.active?'Queued':'Paused';
 return job.status==='failed'?'Failed':job.status==='published'?'Published':job.status;
}
export function generationFeedback(jobs:AdminGenerationJob[],now=Date.now()){
 const published=jobs.reduce((count,job)=>count+job.published.length,0),prefix=published?`${published} article${published===1?'':'s'} durably published. `:'';
 if(jobs.some(job=>job.active))return prefix+`Draft preparation is running${jobs.find(job=>job.active)?.stage?` · ${jobs.find(job=>job.active)!.stage}`:''}. New drafts still require editorial review.`;
 if(jobs.some(job=>job.status==='awaiting_review'))return prefix+'A draft is saved privately and ready for review. Open it below to approve or reject it.';
 const paused=jobs.filter(job=>['pending','failed'].includes(job.status)||job.resumeRequired);
 if(paused.length){const retryAt=Math.max(...paused.map(job=>job.retryAt||0)),reason=[...new Set(paused.map(job=>job.reason).filter(Boolean))].join(' ');return prefix+`Generation paused. ${reason}${retryAt>now?` Retry after ${new Date(retryAt).toLocaleString()}.`:' Resume the saved job to retry.'}`;}
 if(jobs.some(job=>job.status==='skipped'))return prefix+'No new article passed this run. '+[...new Set(jobs.map(job=>job.reason).filter(Boolean))].join(' ');
 return prefix||'The saved job finished without publishing an article.';
}
