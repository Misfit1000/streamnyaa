import { useAuth } from '../context/AuthContext';
import { useCatalogHealth } from '../lib/useDesktopCatalogHealth';
import { Link } from 'react-router-dom';
import { openDownloadManager } from '../lib/desktopDownloads';
import { useDesktopDownloads } from '../lib/useDesktopDownloads';
import { desktopDataError } from '../lib/desktopData';

export { useCatalogHealth } from '../lib/useDesktopCatalogHealth';
export function DesktopCatalogStatus() {
  const { isAdmin } = useAuth();
  const health = useCatalogHealth(isAdmin);
  if (!isAdmin) return null;
  return <button type="button" className="sn-secondary-action px-3 py-2 text-xs" onClick={() => window.dispatchEvent(new Event('streamnyaa-open-activity'))} title="Open activity and catalog status">
    <span aria-hidden="true" className={`h-2 w-2 rounded-full ${health.failed.length || health.fallback ? 'bg-amber-300' : health.loading ? 'bg-sky-300' : 'bg-white/40'}`} />
    {health.failed.length ? 'Catalog attention' : health.fallback ? 'Saved / fallback catalog' : health.loading ? 'Refreshing catalog' : 'Activity'}
  </button>;
}
export default function DesktopActivitySummary() {
  const { isAdmin } = useAuth();
  const health = useCatalogHealth(isAdmin);
  const {queue,error} = useDesktopDownloads();
  return <section className="mb-4 border-b border-white/10 pb-4" aria-label="Activity overview">
    <div className="flex justify-between gap-2"><h3 className="text-sm font-semibold">{isAdmin ? "Catalog & transfers" : "Transfers"}</h3>{isAdmin && <Link to="/desktop-settings#diagnostics" className="text-xs text-primary">Diagnostics</Link>}</div>
    {isAdmin && (health.failed.length ? <ul className="my-3 space-y-2">{health.failed.slice(0, 4).map(query => {
      const failure = desktopDataError('catalog', query.state.error);
      const label = /episodes/.test(String(query.queryKey[0])) ? 'Episode titles' : /schedule|week/.test(String(query.queryKey[0])) ? 'Release schedule' : 'Catalog update';
      return <li key={query.queryHash} className="text-xs text-white/65">{label}: {failure.statusCode ? `HTTP ${failure.statusCode}` : failure.code}. <button className="underline" onClick={() => void query.fetch().catch(() => {})}>Retry</button></li>;
    })}</ul> : <p className="my-3 text-xs text-white/60">{health.fallback ? 'Some content uses saved data or the fallback provider.' : 'No active catalog errors recorded. This is not a live connection check.'}</p>)}
    <button onClick={openDownloadManager} className="block w-full rounded-lg bg-white/5 p-3 text-left text-sm">Downloads &amp; Offline <span className="float-right">↗</span><span className="mt-1 block text-xs text-white/55">{queue ? `${queue.items.filter(item => ['queued','downloading','verifying'].includes(item.state)).length} active · ${queue.items.filter(item => item.state === 'completed').length} completed · ${queue.items.filter(item => item.state === 'failed').length} need attention` : error || 'Loading transfers…'}</span></button>
  </section>;
}
