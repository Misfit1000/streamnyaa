/** One speculative operation per window; deliberate navigation does not queue here. */
let speculative:AbortController|undefined;
export function createIntentPrefetch(run:(signal:AbortSignal)=>Promise<unknown>){
 let timer:ReturnType<typeof setTimeout>|undefined;let own:AbortController|undefined;
 const cancel=()=>{if(timer)clearTimeout(timer);timer=undefined;own?.abort();if(speculative===own)speculative=undefined;own=undefined;};
 const start=(immediate=false)=>{if(immediate&&own&&!own.signal.aborted)return;cancel();
  const fire=()=>{timer=undefined;if(!immediate)speculative?.abort();const controller=new AbortController();own=controller;if(!immediate)speculative=controller;
   void run(controller.signal).catch(()=>{}).finally(()=>{if(speculative===controller)speculative=undefined;});
  };if(immediate)fire();else timer=setTimeout(fire,150);
 };return {start,cancel};
}
