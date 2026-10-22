import {dedupeNyaaItems,searchNyaa,type NyaaItem} from '../api/nyaa';
import {batchTitleIdentity,classifySourceIdentity,isBatchRelease,parseSourceEpisode,sourceIdentitySignature,type SourceIdentity} from './desktopSourceIdentity';
import {runSourceSearchPass,sourceSearchPlan,type SourceDiscovery,type SourceSearchJob} from './desktopSourceDiscovery';
import {sourceAudioCompatible} from './desktopSourceSelection';
export type WebSource=NyaaItem&{matchTier:'exact'|'uncertain'|'batch'|'search';matchReason:string};
export type WebSourceRequest={identity?:SourceIdentity;query?:string;episode?:number|null;category?:string;filter?:string};
export function webSourceKey(request:WebSourceRequest){return ['web-source-discovery',2,request.identity?sourceIdentitySignature(request.identity):request.query?.trim().toLowerCase(),request.episode||null,request.category||'1_0',request.filter||'0'] as const;}
export function webSourcePlan(request:WebSourceRequest):SourceSearchJob[]{
  if(request.identity)return sourceSearchPlan(request.identity,request.episode||undefined).filter(job=>!request.category||['0_0','1_0'].includes(request.category)||job.category===request.category);
  const query=request.query?.trim()||'';if(!query)return[];
  const episode=isBatchRelease(query)||request.category&&!request.category.startsWith('1_')?null:request.episode||parseSourceEpisode(query);
  return [1,2,3].map(page=>({query,category:request.category||'1_0',page,scope:episode?'episode':'title',...(episode?{episode}:{})}));
}
export function classifyWebSources(items:NyaaItem[],identity?:SourceIdentity,episode?:number|null):WebSource[]{
  return dedupeNyaaItems(items).flatMap<WebSource>(item=>{
    if(!identity)return [{...item,matchTier:isBatchRelease(item.title)?'batch' as const:'search' as const,matchReason:'Search result; verify the title, installment and file list.'}];
    if(/\b(?:NCOP|NCED|creditless|trailer|teaser|soundtrack|sample)\b/i.test(item.title))return[];
    if(isBatchRelease(item.title))return batchTitleIdentity(item.title,identity)?[{...item,matchTier:'batch' as const,matchReason:'Title and installment matched; episode files are not inspected on web.'}]:[];
    const evidence=classifySourceIdentity(item.title,identity,episode||parseSourceEpisode(item.title)||1);
    return evidence.evidence==='conflict'?[]:[{...item,matchTier:evidence.evidence,matchReason:evidence.reason}];
  });
}
export async function discoverWebSources(request:WebSourceRequest,options:{previous?:SourceDiscovery<WebSource>;signal?:AbortSignal;publish?:(value:SourceDiscovery<WebSource>)=>void;requestLimit?:number}={}){
  const previous=options.previous;
  return runSourceSearchPass<WebSource>({jobs:previous?.pending?.length?previous.pending:webSourcePlan(request),initial:previous?.items,
    // Failed/stale lanes stay pending. Rechecking them successfully clears their
    // warning; old successful rows stay available if this refresh also fails.
    initialState:{fetchedAt:previous?.fetchedAt},signal:options.signal,requestLimit:options.requestLimit??8,budgetMs:24000,
    merge:items=>dedupeNyaaItems(items) as WebSource[],publish:options.publish,
    fetch:async(job,deadlineMs)=>{
      const controller=new AbortController(),cancel=()=>controller.abort(options.signal?.reason);
      options.signal?.addEventListener('abort',cancel,{once:true});
      if(options.signal?.aborted)cancel();
      // The browser transport has no native network deadline. Bound this
      // consumer without cancelling another tab/navigation sharing its request.
      const timer=setTimeout(()=>controller.abort(new DOMException('Source lookup timed out.','TimeoutError')),deadlineMs);
      try {
        const raw=await searchNyaa(job.query,job.category,request.filter||'0',String(job.page),{deep:false,pages:1,wide:false,signal:controller.signal,deadlineMs,
          maxAgeMs:job.scope==='episode'?60000:300000,intent:job.scope==='episode'?{scope:'episode',episode:job.episode}:{scope:'title'}});
        return{items:classifyWebSources(raw,request.identity,request.episode),complete:raw.complete,stale:raw.stale,fetchedAt:raw.fetchedAt,emptyPage:raw.length===0,retryAt:raw.retryAt};
      } finally {clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);}
    }});
}
export function webAudioMatches(title:string,audio:'sub'|'dub'|'all'){
  return sourceAudioCompatible(title,audio==='all'?'any':audio);
}
export function batchSearchText(query:string){
  if(/\b(?:movie|film|season|part|cour)\s*\d+\s*$/i.test(query))return query.trim();
  return query.replace(/\b(S\d{1,2})E\d{1,4}\b/ig,'$1').replace(/\b(?:episode|ep)\.?\s*\d{1,4}\b/ig,' ').replace(/\s[-–]\s*\d{1,4}(?:v\d+)?\s*$/i,'').replace(/\s+\d{1,3}\s*$/,'').replace(/\s+/g,' ').trim();
}
export function torrentFileUrl(link:string){try{const url=new URL(link),id=url.pathname.match(/^\/view\/(\d+)$/)?.[1];return url.protocol==='https:'&&url.hostname==='nyaa.si'&&id?`https://nyaa.si/download/${id}.torrent`:undefined;}catch{return undefined;}}
