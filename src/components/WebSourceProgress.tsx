import {useEffect,useState} from 'react';
import type {SourceDiscovery} from '../lib/desktopSourceDiscovery';
export default function WebSourceProgress({data,fetching,retry}:{data?:SourceDiscovery<unknown>;fetching:boolean;retry:()=>void}){
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{if(!data?.retryAt)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[data?.retryAt]);
  if(!data||data.complete)return null;
  const waiting=(data.retryAt||0)>now;
  return <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-secondary/20 p-3 text-sm text-muted-foreground">
    <span>{fetching?'Checking title aliases and remaining source pages…':data.partialReason==='provider-failure'?'Source lookup could not finish. Results already found are retained.':'More title aliases or source pages remain to be checked.'}</span>
    <button type="button" disabled={fetching||waiting} onClick={retry} className="rounded-lg border border-primary/30 px-3 py-2 font-bold text-primary disabled:opacity-50">{waiting?`Retry in ${Math.ceil(((data.retryAt||0)-now)/1000)}s`:fetching?'Searching…':'Find more sources'}</button>
  </div>;
}
