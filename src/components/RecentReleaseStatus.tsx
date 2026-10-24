import type {RecentReleasePage} from '../lib/recentReleases';
import {useVisibleCountdown} from '../lib/useVisibleCountdown';
export default function RecentReleaseStatus({page,fetching,retry,error=false}:{page?:RecentReleasePage;fetching:boolean;retry:()=>void;error?:boolean}){
 const now=useVisibleCountdown(page?.retryAt||0,Boolean(page?.retryAt)),waiting=Boolean(page?.retryAt&&page.retryAt>now);
 if(!page||page.complete&&!page.stale&&!error)return null;
 const unavailable=error||page.stale&&!page.initialSnapshot;
 return <div role="status" className="my-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><span>{unavailable?'Some release information is temporarily unavailable. Saved times remain visible.':page.initialSnapshot?'Showing saved release times.':'Release coverage is incomplete.'}</span>{(!fetching||unavailable)&&<button type="button" onClick={retry} disabled={fetching||waiting} className="min-h-9 font-semibold text-primary underline disabled:opacity-50">{waiting?`Retry in ${Math.ceil(((page.retryAt||0)-now)/1000)}s`:unavailable?'Retry':'Continue checking releases'}</button>}</div>;
}
