import {createHash} from 'node:crypto';
import {publicCalendar} from './publicCalendar.js';
import {readPublicSnapshot,writePublicSnapshot} from './publicSnapshots.js';
import {isCalendarRecord} from '../../src/lib/calendarModel.js';
import {recentReleaseCandidates,type RecentRelease,type RecentReleasePage,type ReleaseTrack} from '../../src/lib/recentReleases.js';
import type {RequestUsage} from './requestReuse.js';
import {isHentaiTitle} from '../../src/lib/webSourceProvider.js';
type Frozen={version:1;rows:RecentRelease[];fetchedAt:number;nextBoundaryAt?:number;before:number;track:ReleaseTrack;snapshotId?:string;complete?:boolean;stale?:boolean;retryAt?:number;createdAt?:number};
function stableJson(value:any):string{return Array.isArray(value)?`[${value.map(stableJson).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).filter(key=>value[key]!==undefined&&key!=='snapshotId').sort().map(key=>`${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`:JSON.stringify(value);}
const frozenId=(value:Frozen)=>createHash('sha256').update(stableJson(value)).digest('hex').slice(0,32);
export async function recentReleases(req:any,usage:RequestUsage):Promise<RecentReleasePage>{
 const before=Number(req.query.before),track=(req.query.track||'sub') as ReleaseTrack;
 if(!Number.isSafeInteger(before)||before<=0||before>Date.now()/1000+60||before<Date.now()/1000-8*86400||!['sub','dub'].includes(track))throw Object.assign(Error('Invalid release window or track.'),{status:400});
 const adult=req.query.adult==='1',type=String(req.query.type||''),genre=String(req.query.genre||''),status=String(req.query.status||''),year=Number(req.query.year)||0;
 if([type,genre,status].some(value=>value.length>100)||year&&(year<1900||year>2200))throw Object.assign(Error('Invalid release filters.'),{status:400});
 const webPolicy=req.query.contentPolicy==='2';
 const filterKey=createHash('sha256').update(JSON.stringify({before,track,adult,type,genre,status,year,...(webPolicy?{contentPolicy:2}:{})})).digest('hex').slice(0,16);
 const rawCursor=String(req.query.cursor||''),match=/^([a-f0-9]{32})\.([a-f0-9]{16})\.(\d{1,5})$/.exec(rawCursor);
 if(rawCursor&&(!match||match[2]!==filterKey))throw Object.assign(Error('Invalid release cursor.'),{status:400});
 const base=`recent-releases:v1:${before}:${track}`;
 const id=match?.[1],saved=await readPublicSnapshot<Frozen>(id?`${base}:${id}`:`${base}:latest`);
 let snapshot=saved?.value;
 if(snapshot?.version!==1||snapshot.before!==before||snapshot.track!==track||!Array.isArray(snapshot.rows)||snapshot.rows.length>1500||!snapshot.rows.every(row=>isCalendarRecord(row)&&row.releasePolicyVersion===1&&Number.isSafeInteger(row.releaseEpisode)&&Number(row.releaseEpisode)>0&&Number.isFinite(row.releaseAt)&&Number(row.releaseAt)<=before*1000))snapshot=undefined;
 if(!id&&snapshot?.complete===false&&Date.now()>Math.max(snapshot.retryAt||0,(snapshot.createdAt||0)+60000))snapshot=undefined;
 if(id&&!snapshot)throw Object.assign(Error('The release snapshot expired. Refresh this feed.'),{status:409});
 let buildCursor:string|undefined,retryAt:number|undefined=snapshot?.retryAt,stale=Boolean(snapshot?.stale),initialSnapshot=false,complete=Boolean(snapshot)&&snapshot?.complete!==false,snapshotId=id||(snapshot?.snapshotId&&/^[a-f0-9]{32}$/.test(snapshot.snapshotId)?snapshot.snapshotId:undefined);
 // JSONB can reorder object keys. A cursor must refer to a persisted immutable
 // key, not a new hash calculated from the database's serialization order.
 if(snapshot&&!snapshotId){
  snapshotId=frozenId(snapshot);snapshot={...snapshot,snapshotId};
  try{await writePublicSnapshot(`${base}:${snapshotId}`,snapshot,snapshot.fetchedAt,86400);await writePublicSnapshot(`${base}:latest`,snapshot,snapshot.fetchedAt,86400);}catch{throw Object.assign(Error('Release pagination could not be saved. Retry shortly.'),{status:503,retryAt:Date.now()+30000});}
 }
 if(!snapshot){
  const day=Math.floor(before/86400)*86400;
  const calendar=await publicCalendar({query:{start:day-7*86400,end:day+86400,progressive:'1',...(req.query.build?{cursor:String(req.query.build)}:{}),priorityDay:day}},usage);
  const tracks=calendar.providers.animeschedule;
  const candidates=recentReleaseCandidates(calendar.data,before,track,Boolean(tracks&&(tracks.fetchedAt>0||tracks.stale)));
  snapshot={version:1,rows:candidates.data,fetchedAt:calendar.fetchedAt,before,track,nextBoundaryAt:candidates.nextBoundaryAt};
  initialSnapshot=Boolean(calendar.initialSnapshot);stale=calendar.stale;complete=calendar.complete;retryAt=calendar.retryAt;buildCursor=calendar.cursor;
  // Terminal partial coverage still has usable confirmed rows. Paginate those
  // without pretending unresolved identities or an unavailable provider are complete.
  if(complete||!buildCursor&&snapshot.rows.length){
   snapshot={...snapshot,complete,stale,retryAt,createdAt:Date.now()};
   snapshotId=frozenId(snapshot);snapshot={...snapshot,snapshotId};
   try{await writePublicSnapshot(`${base}:${snapshotId}`,snapshot,snapshot.fetchedAt,86400);await writePublicSnapshot(`${base}:latest`,snapshot,snapshot.fetchedAt,86400);}catch{
    // Pagination cannot claim a durable snapshot that another instance cannot read.
    complete=false;snapshotId=undefined;stale=true;retryAt=Date.now()+60000;
   }
  }
 }
 const values=snapshot.rows.filter(row=>(adult||!(webPolicy?isHentaiTitle(row):row.isAdult))&&(!type||String(row.type).toUpperCase()===type.toUpperCase())&&(!genre||Array.isArray(row.genres)&&row.genres.some((item:any)=>(item.name||item)===genre))&&(!year||Number(row.year)===year)&&(!status||({airing:'RELEASING',complete:'FINISHED',upcoming:'NOT_YET_RELEASED'} as any)[status]===row.status));
 const offset=match?Number(match[3]):0;
 if(offset%24||offset>1500)throw Object.assign(Error('Invalid release page.'),{status:400});
 return{version:1,before,track,data:values.slice(offset,offset+24),page:offset/24+1,complete,stale,initialSnapshot,fetchedAt:snapshot.fetchedAt,
  ...(snapshotId?{snapshot:snapshotId,...(offset+24<values.length?{nextCursor:`${snapshotId}.${filterKey}.${offset+24}`}:{})}:buildCursor?{buildCursor}:{}),retryAt,nextBoundaryAt:snapshot.nextBoundaryAt};
}
