export type TimelineResult = { items: any[]; complete: boolean; pending: any[]; expanded: string[]; retryAfterMs?: number;retryAt?:number };
export const TIMELINE_GRAPH_VERSION=2;
export const TIMELINE_RELATIONS=new Set(['PREQUEL','SEQUEL','PARENT','SIDE_STORY','SPIN_OFF','ALTERNATIVE','COMPILATION','OTHER']);
export function normalizeTimelineRelation(value:string){const type=String(value||'').trim().toUpperCase().replace(/[\s-]+/g,'_');return ({PARENT_STORY:'PARENT',ALTERNATIVE_VERSION:'ALTERNATIVE',SPINOFF:'SPIN_OFF'} as Record<string,string>)[type]||type;}
export function timelineTitles(item:any):string[]{return [item?.name,typeof item?.title==='string'?item.title:undefined,item?.title?.english,item?.title?.romaji,item?.title?.native,item?.title_english,item?.title_romaji,item?.title_japanese,...(Array.isArray(item?.synonyms)?item.synonyms:[]),...(Array.isArray(item?.title_synonyms)?item.title_synonyms:[])].filter((title):title is string=>typeof title==='string'&&Boolean(title.trim()));}
function franchiseTitle(title:string){return title.normalize('NFKC').toLowerCase().replace(/\b(?:season|part|cour)\s+\d{1,2}\b|\b\d{1,2}(?:st|nd|rd|th)\s+season\b/gi,' ').replace(/\s+(?:\d{1,2}|ii|iii|iv|v|vi|vii|viii|ix|x)$/i,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
export function timelineRelationVisible(root:any,item:any,relation:string){
 const type=normalizeTimelineRelation(relation);if(!TIMELINE_RELATIONS.has(type))return false;if(type!=='OTHER')return true;
 const roots=timelineTitles(root).map(franchiseTitle).filter(title=>title.length>=4),titles=timelineTitles(item).map(franchiseTitle);
 return roots.some(rootTitle=>titles.includes(rootTitle));
}
export function timelineSeasonNumber(item:any):number|null{
 const values=new Set(timelineTitles(item).map(title=>Number((title.match(/\bseason\s+(\d{1,2})\b/i)||title.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i))?.[1]||0)).filter(value=>value>0));
 return values.size===1?[...values][0]:null;
}
export function timelinePartNumber(item:any):number|null{const values=new Set(timelineTitles(item).map(title=>Number(title.match(/\b(?:part|cour)\s+(\d{1,2})\b/i)?.[1]||0)).filter(value=>value>0));return values.size===1?[...values][0]:null;}
type LabeledEntry={kind:string;name:string;year:number|null;seasonNumber:number|null;sourceSeasonNumber:number|null;partNumber:number|null;anilist_id?:number|string|null;mal_id?:number|string|null};
export function timelineLabels<T extends LabeledEntry>(items:T[]):Array<T&{label:string}>{
 return [...items].sort((a,b)=>{
  if(a.kind==='season'&&b.kind==='season'&&a.seasonNumber&&b.seasonNumber)return a.seasonNumber-b.seasonNumber||(a.partNumber||0)-(b.partNumber||0)||(a.year||Infinity)-(b.year||Infinity)||a.name.localeCompare(b.name);
  return (a.year||Infinity)-(b.year||Infinity)||a.name.localeCompare(b.name)||String(a.anilist_id||a.mal_id).localeCompare(String(b.anilist_id||b.mal_id));
 }).map(item=>({...item,sourceSeasonNumber:item.seasonNumber||null,label:item.kind==='season'?(item.seasonNumber?`Season ${item.seasonNumber}${item.partNumber?` Part ${item.partNumber}`:''}`:item.partNumber?`TV · Part ${item.partNumber}`:'TV'):({movie:'Movie',ova:'OVA',ona:'ONA',special:'Special'} as Record<string,string>)[item.kind]||'Related entry'}));
}
const identities = (item: any): string[] => [item?.anilist_id ? 'anilist:' + item.anilist_id : '', item?.mal_id ? 'mal:' + item.mal_id : ''].filter(Boolean);
const identity = (item: any) => identities(item)[0] || '';
export const sameTimelineInstallment=(a:any,b:any)=>!(a?.anilist_id&&b?.anilist_id&&String(a.anilist_id)!==String(b.anilist_id))&&!(a?.mal_id&&b?.mal_id&&String(a.mal_id)!==String(b.mal_id))&&identities(a).some(key=>identities(b).includes(key));

export async function loadSeriesTimeline(options: {
  root: any; previous?: TimelineResult; children: (item: any) => any[]; allowed: (item: any) => boolean;
  fetchBatch: (entries: any[], signal: AbortSignal) => Promise<any[]>; signal: AbortSignal; onPartial: (result: TimelineResult) => void;
}): Promise<TimelineResult> {
  const { root, signal, children, allowed, fetchBatch, onPartial } = options;
  if(signal.aborted)throw new DOMException('Cancelled','AbortError');
  const items = new Map((options.previous?.items || []).map(item => [identity(item), item]));
  const expanded = new Set(options.previous?.complete === false ? options.previous.expanded : identities(root));
  const queue = options.previous?.complete === false ? [...options.previous.pending] : [];
  let retryAfterMs: number | undefined;
  let retryAt:number|undefined;
  const enqueue = (entry: any) => {
    const keys = identities(entry);
    if (keys.length && !expanded.has(identity(entry)) && !queue.some(item => sameTimelineInstallment(item,entry)) && allowed(entry)) queue.push(entry);
  };
  children(root).forEach(enqueue);
  const result = (): TimelineResult => ({ items: [...items.values()], complete: queue.length === 0,
    pending: [...queue], expanded: [...expanded], retryAfterMs,retryAt });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  const deadline = setTimeout(cancel, 10_000);
  try {
  // Bound a refresh, not the series size. Automatic recovery resumes the remaining queue.
  for (let batchNumber = 0; queue.length && batchNumber < 8; batchNumber++) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (controller.signal.aborted) break;
    const batch = queue.splice(0, 8);
    try {
      const loaded = await fetchBatch(batch, controller.signal);
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const foundItems: any[] = [];
      const missing: any[] = [];
      for (const entry of batch) {
        const key = identity(entry);
        const found = loaded.find(item=>sameTimelineInstallment(entry,item));
        if (!found) { missing.push(entry); continue; }
        identities(entry).concat(identities(found)).forEach(key => expanded.add(key));
        const value = { ...found, relation: entry.relation };
        for (const [id, item] of items) if (sameTimelineInstallment(item,value)) items.delete(id);
        items.set(identity(value), value);
        foundItems.push(value);
      }
      foundItems.forEach(value => children(value).forEach(enqueue));
      missing.forEach(enqueue);
      for (let i = queue.length - 1; i >= 0; i--) if (expanded.has(identity(queue[i]))) queue.splice(i, 1);
      onPartial(result());
      if (missing.length) break;
    } catch (error) {
      if (signal.aborted) throw error;
      retryAfterMs = (error as { retryAfterMs?: number })?.retryAfterMs;
      retryAt=(error as {retryAt?:number})?.retryAt;
      queue.unshift(...batch);
      break;
    }
  }
  return result();
  } finally { clearTimeout(deadline); signal.removeEventListener('abort', cancel); }
}
