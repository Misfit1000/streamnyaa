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
    const failed = new Map<string, NativeCheckpoint>();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const valid = (record: NativeCheckpoint) => record?.version === 1
      && typeof record.sessionId === 'string' && record.sessionId.length > 0
      && Number.isSafeInteger(record.sequence) && record.sequence > 0
      && record.context?.owner === owner && typeof record.context.animeId === 'string' && record.context.animeId.length > 0
      && typeof record.context.title === 'string' && record.context.title.trim().length > 0
      && typeof record.context.episode === 'string' && /^\d+$/.test(record.context.episode) && Number.isSafeInteger(Number(record.context.episode)) && Number(record.context.episode) > 0
      && Number.isFinite(record.updatedAt) && record.updatedAt >= 0
      && Array.isArray(record.coverage?.intervals)
      && record.coverage.intervals.every(range => Array.isArray(range) && range.length === 2 && range.every(value => Number.isFinite(value) && value >= 0) && range[1] >= range[0])
      && Number.isFinite(record.coverage.furthest) && record.coverage.furthest >= 0
      && Number.isFinite(record.coverage.lastPosition) && record.coverage.lastPosition >= 0
      && (record.coverage.duration == null || Number.isFinite(record.coverage.duration) && record.coverage.duration >= 0);
    const scheduleRetry = () => {
      if(disposed || retryTimer || !failed.size) return;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        for(const record of [...failed.values()]) apply(record);
        scheduleRetry();
      }, 5000);
    };
    const apply=(record:NativeCheckpoint)=>{
      if(disposed || !valid(record) || (sequences.get(record.sessionId)||0)>=record.sequence
        || (failed.get(record.sessionId)?.sequence || 0)>record.sequence) return;
      let persisted = applyNativeCheckpoint(record,owner);
      if(persisted) try {
        const nextSequences = new Map(sequences); nextSequences.set(record.sessionId,record.sequence);
        localStorage.setItem(appliedKey,JSON.stringify(Object.fromEntries([...nextSequences].slice(-1000))));
        sequences.set(record.sessionId,record.sequence);
      } catch { persisted = false; /* Native checkpoints remain durable; retry acknowledgement. */ }
      if(persisted) {
        failed.delete(record.sessionId);
        if(!failed.size) { clearTimeout(retryTimer); retryTimer = undefined; }
      } else {
        failed.set(record.sessionId,record);
        if(failed.size>1000) failed.delete(failed.keys().next().value!);
        scheduleRetry();
      }
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
    return ()=>{disposed=true;clearTimeout(retryTimer);failed.clear();cleanup?.();};
  },[user?.id,loading]);
  return null;
}
