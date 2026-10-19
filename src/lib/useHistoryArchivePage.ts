import { useEffect, useState } from 'react';
import { historyArchiveReady, historyRequest, subscribeHistoryArchive, type HistoryPage } from './desktopHistoryArchive';
export function useHistoryArchivePage<T>(kind:'page'|'titles',query:Record<string,unknown>) {
  const [page,setPage]=useState<HistoryPage<T>>({items:[],total:0,nextOffset:null});
  const [ready,setReady]=useState(historyArchiveReady),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const signature=JSON.stringify(query);
  useEffect(()=>{
    const changed=()=>{setReady(historyArchiveReady());setRevision(v=>v+1);};
    const unsubscribe=subscribeHistoryArchive(changed);
    window.addEventListener('streamnyaa:history-ready',changed);
    return()=>{unsubscribe();window.removeEventListener('streamnyaa:history-ready',changed);};
  },[]);
  useEffect(()=>{
    if(!ready)return;let cancelled=false;
    const timer=setTimeout(()=>{void historyRequest<HistoryPage<T>>(kind,{...JSON.parse(signature),limit:50}).then(next=>{if(!cancelled){setPage(next);setError('');}}).catch(e=>{if(!cancelled)setError(String(e));});},100);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[kind,signature,ready,revision]);
  return {...page,ready,error};
}
