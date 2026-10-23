import type {RecentReleasePage} from '../lib/recentReleases';
import {useVisibleCountdown} from '../lib/useVisibleCountdown';
export default function RecentReleaseStatus({page,fetching,retry}:{page?:RecentReleasePage;fetching:boolean;retry:()=>void}){
 const now=useVisibleCountdown(page?.retryAt||0,Boolean(page?.retryAt)),waiting=Boolean(page?.retryAt&&page.retryAt>now);
 if(!page||page.complete&&!page.stale)return null;
 return <div role="status" className="my-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><span>{page.stale?'Some release times could not refresh. Saved timing remains visible.':'Release coverage is still being checked. These results are not yet complete.'}</span><button type="button" onClick={retry} disabled={fetching||waiting} className="min-h-9 font-semibold text-primary underline disabled:opacity-50">{fetching?'Checking…':waiting?`Retry in ${Math.ceil(((page.retryAt||0)-now)/1000)}s`:'Continue checking releases'}</button></div>;
}
