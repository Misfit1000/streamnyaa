export function editorialModel(){
  const model=(process.env.GEMINI_MODEL||'gemini-2.5-flash').trim().replace(/^models\//,'');
  if(!/^gemini-[a-z\d.-]+$/i.test(model))throw Error('GEMINI_MODEL must identify a Gemini model.');
  return model;
}
const provider='generativelanguage.googleapis.com';
export type ModelRequestState={model?:string;editorialVersion?:number;attempts?:number;failures?:number;retryAt?:number;retryAfter?:string;lastAttemptAt?:string;lastStatus?:number;lastCode?:string;lastMessage?:string;finishReason?:string;usage?:{input?:number;output?:number;thinking?:number}};
export type ModelRequestBudget={requests:number;limit:number};
type Runtime={now:()=>number;sleep:(ms:number)=>Promise<void>};
const runtime:Runtime={now:Date.now,sleep:ms=>new Promise(resolve=>setTimeout(resolve,ms))};
const backoff=[30_000,60_000,120_000,300_000];
const sourceIds={type:'ARRAY',items:{type:'STRING'}};
const articleSchema={type:'OBJECT',properties:{headline:{type:'STRING'},excerpt:{type:'STRING'},paragraphs:{type:'ARRAY',maxItems:12,items:{type:'OBJECT',properties:{text:{type:'STRING'},sourceIds},required:['text','sourceIds']}},sections:{type:'ARRAY',maxItems:6,items:{type:'OBJECT',properties:{heading:{type:'STRING'},body:{type:'STRING'},sourceIds},required:['heading','body','sourceIds']}},rejectReason:{type:'STRING'}},required:['headline','excerpt','paragraphs','sections']};
export function editorialGenerationConfig(model:string,version=2){
  const schema=structuredClone(articleSchema);
  if(version>=3){(schema.properties.paragraphs.items.properties as any).findingIds=sourceIds;(schema.properties.sections.items.properties as any).findingIds=sourceIds;}
  return{temperature:.35,maxOutputTokens:8192,responseMimeType:'application/json',...(model.startsWith('gemini-2.5-')?{thinkingConfig:{thinkingBudget:2048},responseSchema:schema}:{})};
}
function retryDeadline(header:string|null,now:number){if(!header)return 0;return /^\d+(?:\.\d+)?$/.test(header)?now+Number(header)*1000:Date.parse(header)||0;}
function modelError(state:ModelRequestState){
  return Object.assign(Error(`Gemini ${state.model} returned ${state.lastStatus?`HTTP ${state.lastStatus}`:'an unavailable response'}${state.lastCode?` (${state.lastCode})`:''}.${state.lastMessage?` ${state.lastMessage}`:''} No article was published.`),{status:state.lastStatus||503,provider,model:state.model,retryAt:state.retryAt,retryAfter:state.retryAfter});
}
/** One worker shares a three-request budget across generation and its one revision. */
export async function requestEditorialModel(prompt:string,deadline:number,state:ModelRequestState,onCheckpoint:()=>Promise<void>,budget:ModelRequestBudget={requests:0,limit:3},time:Runtime=runtime){
  const model=state.model||editorialModel();state.model=model;
  while(budget.requests<budget.limit){
    const wait=Math.max(0,(state.retryAt||0)-time.now());
    if(wait&&time.now()+wait>deadline-65_000)throw modelError(state);
    if(wait)await time.sleep(wait);
    if(time.now()>deadline-45_000)throw Error('Publishing time budget reached; saved writing can resume.');
    delete state.retryAt;state.attempts=(state.attempts||0)+1;state.lastAttemptAt=new Date(time.now()).toISOString();budget.requests++;
    await onCheckpoint();
    let response:Response|undefined,result:any;
    try{
      response=await fetch(`https://${provider}/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',signal:AbortSignal.timeout(Math.min(60_000,Math.max(1,deadline-time.now()-5000))),headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY!},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:editorialGenerationConfig(model,state.editorialVersion)})});
      result=await response.json().catch(()=>undefined);
    }catch(error){state.lastStatus=503;state.lastCode=(error as Error).name==='TimeoutError'?'TIMEOUT':'CONNECTION_ERROR';state.lastMessage='The request timed out or could not connect.';}
    if(response?.ok&&result&&typeof result==='object'){
      state.lastStatus=response.status;delete state.lastCode;delete state.lastMessage;delete state.retryAt;delete state.retryAfter;state.failures=0;
      state.finishReason=result.candidates?.[0]?.finishReason;
      const usage=result.usageMetadata||{};state.usage={input:usage.promptTokenCount,output:usage.candidatesTokenCount,thinking:usage.thoughtsTokenCount};
      return result;
    }
    if(response){
      state.lastStatus=response.ok?502:response.status;
      state.retryAfter=response.headers.get('retry-after')||undefined;
      state.lastCode=typeof result?.error?.status==='string'&&/^[A-Z_]{1,60}$/.test(result.error.status)?result.error.status:undefined;
      // Do not persist arbitrary upstream payloads or credentials in diagnostics.
      const message=typeof result?.error?.message==='string'?result.error.message:'';
      const key=process.env.GEMINI_API_KEY;state.lastMessage=(key?message.split(key).join('[redacted]'):message).replace(/AIza[\w-]+/g,'[redacted]').replace(/https?:\/\/\S+/g,'[provider URL]').slice(0,300);
    }
    state.failures=(state.failures||0)+1;
    const transient=[500,502,503,504].includes(state.lastStatus||0),throttled=state.lastStatus===429;
    if(transient||throttled)state.retryAt=Math.max(time.now()+(throttled?300_000:backoff[Math.min(state.failures-1,backoff.length-1)]),retryDeadline(response?.headers.get('retry-after')||null,time.now()));
    await onCheckpoint();
    if(!transient)throw modelError(state);
  }
  throw modelError(state);
}
