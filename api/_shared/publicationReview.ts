import { createHash } from 'node:crypto';
import { supabaseRest } from './adminAuth.js';
export async function publicationPolicy(){
  const rows=await supabaseRest('blog_publication_settings?singleton=eq.true&select=automatic_enabled,accepted_run,updated_at&limit=1',{signal:AbortSignal.timeout(5000)});
  if(!rows?.[0])throw Error('Publication review storage is not configured. No article was published.');
  return {automaticEnabled:rows[0].automatic_enabled===true,acceptedRun:rows[0].accepted_run,updatedAt:rows[0].updated_at};
}
function canonical(value:any):any{return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}
export function draftRevision(brief:unknown,draft:unknown){return createHash('sha256').update(JSON.stringify(canonical([2,brief,draft]))).digest('hex');}
