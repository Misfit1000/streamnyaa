import type {ActivityEvidence} from '../api/editorialTypes';
/** Validate and project stored public evidence; never relay arbitrary checkpoint fields. */
export function publicActivityEvidence(value:unknown):ActivityEvidence|undefined{
  const v=value as ActivityEvidence;
  if(!v||v.version!==1||v.calculationVersion!==1||v.provider!=='anilist'||!Number.isFinite(Date.parse(v.retrievedAt))||Date.parse(v.endExclusive)-Date.parse(v.start)!==7*86400_000||!v.start.endsWith('T00:00:00.000Z')||!v.endExclusive.endsWith('T00:00:00.000Z'))return;
  if(!Array.isArray(v.candidateIds)||v.candidateIds.length>50||!v.candidateIds.length||v.candidateIds.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(v.candidateIds).size!==v.candidateIds.length)return;
  const ids=new Set(v.candidateIds);
  if(!Array.isArray(v.titles)||v.titles.length>50||v.titles.some(t=>!ids.has(t.id)||typeof t.title!=='string'||!t.title.length||t.title.length>500)||new Set(v.titles.map(t=>t.id)).size!==v.titles.length)return;
  if(!Array.isArray(v.observations)||!v.observations.length||v.observations.length>350)return;
  const days=new Set<string>();
  for(const row of v.observations){
    if(!ids.has(row.mediaId)||!Number.isFinite(row.date)||row.date*1000<Date.parse(v.start)||row.date*1000>=Date.parse(v.endExclusive)||!Number.isFinite(row.activity)||row.activity<0||!Number.isFinite(row.popularity)||row.popularity<0||row.retrievedAt&&!Number.isFinite(Date.parse(row.retrievedAt)))return;
    const key=`${row.mediaId}:${new Date(row.date*1000).toISOString().slice(0,10)}`;if(days.has(key))return;days.add(key);
  }
  return{version:1,calculationVersion:1,provider:'anilist',retrievedAt:v.retrievedAt,start:v.start,endExclusive:v.endExclusive,candidateIds:[...v.candidateIds],titles:v.titles.map(({id,title})=>({id,title})),observations:v.observations.map(({mediaId,date,activity,popularity,retrievedAt})=>({mediaId,date,activity,popularity,retrievedAt}))};
}
