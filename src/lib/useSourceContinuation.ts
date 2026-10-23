import { useEffect,useRef } from 'react';
/** Continue only a visible, unfinished search with no eligible result; never poll errors. */
export function useSourceContinuation(scope:string,options:{enabled:boolean;fetching:boolean;eligible:boolean;pending:boolean;stale?:boolean;providerFailure?:boolean;retryAt?:number;run:()=>unknown}) {
  const state=useRef({scope,passes:0});if(state.current.scope!==scope)state.current={scope,passes:0};
  useEffect(()=>{
    if(!options.enabled||options.fetching||options.eligible||!options.pending||options.stale||options.providerFailure||state.current.passes>=2)return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const resume=()=>{if(document.visibilityState==='hidden'||timer)return;timer=setTimeout(()=>{timer=undefined;if(document.visibilityState==='hidden'||state.current.scope!==scope||state.current.passes>=2)return;state.current.passes++;void options.run();},Math.max(150,(options.retryAt||0)-Date.now()));};
    document.addEventListener('visibilitychange',resume);resume();return()=>{if(timer)clearTimeout(timer);document.removeEventListener('visibilitychange',resume);};
  },[scope,options.enabled,options.fetching,options.eligible,options.pending,options.stale,options.providerFailure,options.retryAt,options.run]);
}
