import type { NyaaItem } from '../api/nyaa';
import type { SourceIdentity } from './desktopSourceIdentity';

export type BatchFile = { index:number; name:string; bytes:number };
export type BatchSelection = { infoHash:string; manifestId:string; fileIndex:number; manual:boolean;episode?:number };
export type BatchResolution = { state:'matched'|'choose-file'|'not-found'|'unavailable'; infoHash:string; manifestId:string; reason:string; files:BatchFile[]; availableEpisodes:number[]; selection:BatchSelection|null };
export function batchResolutionKey(identity:SourceIdentity,source:Pick<NyaaItem,'infoHash'>,episode:number){return JSON.stringify([identity.animeId,identity.format,identity.seasonNumber,identity.partNumber,source.infoHash.toLowerCase(),episode]);}
export async function inspectDesktopBatch(source:Pick<NyaaItem,'magnet'|'title'>,identity:SourceIdentity,episode:number,signal?:AbortSignal,allowManual=false):Promise<BatchResolution>{
  const invoke=window.__TAURI__?.core?.invoke||window.__TAURI__?.invoke;
  if(!invoke)throw Error('Native batch inspection is unavailable.');
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  const requestId=`batch-${crypto.randomUUID()}`;
  const abort=()=>{void invoke('cancel_batch_inspection',{requestId}).catch(()=>{});};
  signal?.addEventListener('abort',abort,{once:true});
  try{
    const result=await invoke<BatchResolution>('inspect_batch_release',{request:{magnet:source.magnet,title:source.title,identity,episode,allowManual},requestId});
    if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
    if(!result||!['matched','choose-file','not-found','unavailable'].includes(result.state)||!Array.isArray(result.files)||!Array.isArray(result.availableEpisodes))throw Error('The batch file list could not be validated.');
    return result;
  }finally{signal?.removeEventListener('abort',abort);}
}
