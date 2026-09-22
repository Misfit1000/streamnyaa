import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { applyNativeCheckpoint, restoreNativeRecovery, type NativeCheckpoint } from '../lib/desktopNativeProgress';
export default function DesktopProgressBridge() {
  const { user, loading } = useAuth();
  useEffect(() => {
    if(loading) return;
    const invoke=window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
    const listen=window.__TAURI__?.event?.listen;
    if(!invoke || !listen) return;
    const owner=user?.id || ''; let disposed=false; let cleanup:(()=>void)|undefined;
    const appliedKey=`streamnyaa.nativeProgress.applied.v1:${owner}`;
    let saved: Record<string,number>={};
    try {const parsed=JSON.parse(localStorage.getItem(appliedKey)||'{}');if(parsed && typeof parsed==='object' && !Array.isArray(parsed))saved=Object.fromEntries(Object.entries(parsed).filter(([,v])=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0).slice(-1000)) as Record<string,number>;}catch{/* replay durable checkpoints */}
    const sequences=new Map<string,number>(Object.entries(saved));
    const apply=(record:NativeCheckpoint)=>{
      if(disposed || record.context.owner!==owner || (sequences.get(record.sessionId)||0)>=record.sequence) return;
      sequences.set(record.sessionId,record.sequence); applyNativeCheckpoint(record,owner);
      try{localStorage.setItem(appliedKey,JSON.stringify(Object.fromEntries([...sequences].slice(-1000))));}catch{/* native checkpoints remain durable */}
    };
    void (async()=>{
      cleanup=await listen<NativeCheckpoint>('streamnyaa-playback-progress',event=>apply(event.payload));
      if(disposed){cleanup();return;}
      await invoke('set_playback_progress_owner',{owner});
      if(disposed)return;
      const snapshot=await invoke<{records:NativeCheckpoint[];activeSessionIds:string[]}>('get_playback_checkpoints',{owner});
      const records=snapshot.records;
      if(disposed)return;
      records.sort((a,b)=>a.updatedAt-b.updatedAt).forEach(apply);
      if(records.length && !snapshot.activeSessionIds.includes(records[records.length-1].sessionId)) restoreNativeRecovery(records[records.length-1],owner);
    })().catch(()=>undefined);
    return ()=>{disposed=true;cleanup?.();};
  },[user?.id,loading]);
  return null;
}
