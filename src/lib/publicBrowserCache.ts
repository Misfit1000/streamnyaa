/** Public, read-only payload reuse. Never use for auth, account, Admin or mutations. */
export type PublicRecord = { version: 1; key: string; value: unknown; headers: [string,string][]; fetchedAt: number; expiresAt: number; bytes: number; accessedAt: number };
export interface PublicDisk { get(key:string):Promise<PublicRecord|undefined>; put(record:PublicRecord):Promise<void> }
const MAX_BYTES=16*1024*1024, MAX_ENTRIES=256, MEMORY_BYTES=4*1024*1024;
const allowedHeaders=['content-type','x-streamnyaa-fetched-at','x-streamnyaa-provider','x-streamnyaa-metadata-cache','x-source-fetched-at','x-source-cache','x-source-complete','x-source-query-count','cache-control'];
let diskPromise:Promise<IDBDatabase|null>|undefined;
function database(){
 if(!diskPromise)diskPromise=new Promise(resolve=>{
  if(typeof window==='undefined'||!window.indexedDB){resolve(null);return;}
  try{const request=window.indexedDB.open('streamnyaa-public-v1',1);
   request.onupgradeneeded=()=>{for(const name of ['payloads','index'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'key'});};
   request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();diskPromise=undefined;};resolve(request.result);};
   request.onerror=request.onblocked=()=>resolve(null);
  }catch{resolve(null);}
 });return diskPromise;
}
const bounded=<T,>(promise:Promise<T>,ms=50):Promise<T|undefined>=>new Promise(resolve=>{
 const timer=setTimeout(()=>resolve(undefined),ms);promise.then(value=>{clearTimeout(timer);resolve(value);},()=>{clearTimeout(timer);resolve(undefined);});
});
const browserDisk:PublicDisk={
 async get(key){const db=await bounded(database());if(!db)return;
  return bounded(new Promise<PublicRecord|undefined>(resolve=>{try{const request=db.transaction('payloads').objectStore('payloads').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(undefined);}catch{resolve(undefined);}}));
 },
 async put(record){const db=await bounded(database());if(!db)return;
  await new Promise<void>(resolve=>{try{
   const tx=db.transaction(['payloads','index'],'readwrite'),payloads=tx.objectStore('payloads'),index=tx.objectStore('index');
   payloads.put(record);index.put({key:record.key,bytes:record.bytes,accessedAt:record.accessedAt,expiresAt:record.expiresAt});
   const request=index.getAll();request.onsuccess=()=>{
    const rows=(request.result as Pick<PublicRecord,'key'|'bytes'|'accessedAt'|'expiresAt'>[]).sort((a,b)=>b.accessedAt-a.accessedAt);
    let bytes=0,count=0;for(const row of rows){if(row.expiresAt>Date.now()&&count<MAX_ENTRIES&&bytes+row.bytes<=MAX_BYTES){bytes+=row.bytes;count++;}else{payloads.delete(row.key);index.delete(row.key);}}
   };tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>resolve();
  }catch{resolve();}});
 }
};
type LockRunner=<T>(name:string,signal:AbortSignal,run:()=>Promise<T>)=>Promise<T>;
type Flight={promise:Promise<Response>;controller:AbortController;consumers:number;done:boolean};
const aborted=()=>new DOMException('Request cancelled','AbortError');
export class PublicRequestCache {
 private memory=new Map<string,PublicRecord>();private memoryBytes=0;private flights=new Map<string,Flight>();
 constructor(private disk?:PublicDisk,private lock?:LockRunner,private onWrite?:(key:string)=>void){}
 invalidateMemory(key:string){const previous=this.memory.get(key);if(previous){this.memoryBytes-=previous.bytes;this.memory.delete(key);}}
 private remember(record:PublicRecord){this.invalidateMemory(record.key);if(record.bytes>MEMORY_BYTES)return;
  this.memory.set(record.key,record);this.memoryBytes+=record.bytes;
  while(this.memory.size>128||this.memoryBytes>MEMORY_BYTES)this.invalidateMemory(this.memory.keys().next().value!);
 }
 private valid(record:PublicRecord|undefined,key:string,maxAge:number):record is PublicRecord{
  return !!record&&record.version===1&&record.key===key&&Number.isFinite(record.fetchedAt)&&record.fetchedAt<=Date.now()+1000
   &&record.fetchedAt>0&&record.expiresAt>Date.now()&&record.fetchedAt+maxAge>Date.now()&&record.bytes>0&&record.bytes<=MAX_BYTES
   &&Array.isArray(record.headers)&&record.headers.every(h=>Array.isArray(h)&&h.length===2&&allowedHeaders.includes(h[0])&&typeof h[1]==='string');
 }
 private response(record:PublicRecord){return new Response(JSON.stringify(record.value),{status:200,headers:record.headers});}
 private async read(key:string,maxAge:number,validate:(value:unknown)=>boolean){const memory=this.memory.get(key);if(this.valid(memory,key,maxAge)&&validate(memory.value)){this.remember(memory);return memory;}
  const record=await bounded(Promise.resolve().then(()=>this.disk?.get(key)));if(this.valid(record,key,maxAge)&&validate(record.value)){this.remember(record);return record;}
 }
 request(key:string,maxAge:number,fetcher:(signal:AbortSignal)=>Promise<Response>,signal?:AbortSignal,validate:(value:unknown)=>boolean=()=>true){
  if(signal?.aborted)return Promise.reject(aborted());
  const flightKey=key+':max-age:'+maxAge;let flight=this.flights.get(flightKey);
  // A StrictMode remount or deliberate navigation may arrive before the
  // abandoned transport settles. It must never inherit that cancelled work.
  if(flight?.controller.signal.aborted)flight=undefined;
  if(!flight){const controller=new AbortController();const owned:Flight={controller,consumers:0,done:false,promise:Promise.resolve(new Response())};
   const run=async()=>{if(controller.signal.aborted)throw aborted();const saved=await this.read(key,maxAge,validate);if(saved)return this.response(saved);
    const response=await fetcher(controller.signal);if(controller.signal.aborted)throw aborted();
    if(!response.ok)return response;
    let value:unknown;try{value=await response.clone().json();}catch{return response;}
    const stale=['x-source-cache','x-streamnyaa-metadata-cache','x-streamnyaa-local-cache'].some(h=>/stale/i.test(response.headers.get(h)||''));
    const fetchedAt=Number(response.headers.get('x-source-fetched-at')||response.headers.get('x-streamnyaa-fetched-at'))||Date.now();
    if(stale||response.headers.get('x-source-complete')==='false'||!validate(value)||fetchedAt<=0||fetchedAt>Date.now()+1000||/private|no-store/i.test(response.headers.get('cache-control')||''))return response;
    const headerAge=/max-age=(\d+)/i.exec(response.headers.get('cache-control')||'');
    const expiresAt=Math.min(fetchedAt+maxAge,headerAge?Date.now()+Number(headerAge[1])*1000:Infinity);
    const headers=allowedHeaders.flatMap(h=>response.headers.has(h)?[[h,response.headers.get(h)!] as [string,string]]:[]);
    const record:PublicRecord={version:1,key,value,headers,fetchedAt,expiresAt,bytes:2*(JSON.stringify(value).length+key.length)+512,accessedAt:Date.now()};
    if(record.bytes<=MAX_BYTES&&expiresAt>Date.now()){this.remember(record);await bounded(Promise.resolve().then(()=>this.disk?.put(record)),500);try{this.onWrite?.(key);}catch{/* Optional coordination. */}}
    return response;
   };
   owned.promise=Promise.resolve().then(()=>this.lock?this.lock(key,controller.signal,run):run()).finally(()=>{owned.done=true;if(this.flights.get(flightKey)===owned)this.flights.delete(flightKey);});
   void owned.promise.catch(()=>{});this.flights.set(flightKey,owned);flight=owned;
  }
  const owned=flight;owned.consumers++;
  return new Promise<Response>((resolve,reject)=>{let done=false;
   const finish=(error?:unknown,response?:Response)=>{if(done)return;done=true;signal?.removeEventListener('abort',abort);owned.consumers--;if(!owned.done&&owned.consumers===0)owned.controller.abort();if(error)reject(error);else resolve(response!.clone());};
   const abort=()=>finish(aborted());signal?.addEventListener('abort',abort,{once:true});owned.promise.then(response=>finish(undefined,response),error=>finish(error));
  });
 }
}
const browserLock:LockRunner=async(name,signal,run)=>{
 const db=await bounded(database());
 if(!db||typeof navigator==='undefined'||!navigator.locks)return run();
 const admission=new AbortController();let acquired=false;
 const cancel=()=>admission.abort();signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
 const timer=setTimeout(()=>{if(!acquired)admission.abort();},500);
 try{return await navigator.locks.request('streamnyaa-public:'+name,{signal:admission.signal},async()=>{acquired=true;clearTimeout(timer);return run();});}
 catch(error){if(signal.aborted)throw aborted();if(acquired)throw error;return run();}
 finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
};
let channel:BroadcastChannel|undefined;
const shared=new PublicRequestCache(browserDisk,browserLock,key=>channel?.postMessage(key));
if(typeof window!=='undefined'&&window.BroadcastChannel){try{channel=new window.BroadcastChannel('streamnyaa-public-v1');channel.onmessage=event=>{if(typeof event.data==='string')shared.invalidateMemory(event.data);};}catch{/* Optional tab coordination. */}}
export async function sharedPublicResponse(key:string,maxAge:number,fetcher:(signal:AbortSignal)=>Promise<Response>,signal?:AbortSignal,validate?:(value:unknown)=>boolean){
 if(!/^(?:metadata:(?:anilist|tenrai|tmdb|animeschedule|anidb):|source:v2:|calendar:v[12]:|recent-releases:v[12]:)/.test(key))throw new Error('Only public resource requests may use this cache.');
 return shared.request(key,maxAge,fetcher,signal,validate);
}
