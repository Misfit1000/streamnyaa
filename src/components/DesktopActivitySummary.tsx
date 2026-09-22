import { useAuth } from '../context/AuthContext';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { openDownloadManager, getDownloadQueue, listenDownloadsChanged, type DesktopDownloadQueue } from '../lib/desktopDownloads';
import { desktopDataError } from '../lib/desktopData';

export function useCatalogHealth() {
  const client = useQueryClient();
  const [, update] = useState(0);
  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = client.getQueryCache().subscribe(() => {
      if (timer !== undefined) return;
      timer = window.setTimeout(() => { timer = undefined; update(v => v + 1); }, 250);
    });
    return () => { unsubscribe(); window.clearTimeout(timer); };
  }, [client]);
  const queries = client.getQueryCache().getAll().filter(query => query.getObserversCount() > 0 && /desktop|episodes/.test(String(query.queryKey[0])));
  const failed = queries.filter(query => query.state.error);
  const fallback = queries.some(query => {
    const data = query.state.data as any;
    return data?.fallback || data?.pages?.[0]?.fallback || data?.streamnyaa?.status === 'stale';
  });
  return { failed, fallback, loading: queries.some(query => query.state.fetchStatus === 'fetching') };
}
export function DesktopCatalogStatus() {
  const { isAdmin } = useAuth();
  const health = useCatalogHealth();
  if (!isAdmin) return null;
  return <button type="button" className="sn-secondary-action px-3 py-2 text-xs" onClick={() => window.dispatchEvent(new Event('streamnyaa-open-activity'))} title="Open activity and catalog status">
    <span aria-hidden="true" className={`h-2 w-2 rounded-full ${health.failed.length || health.fallback ? 'bg-amber-300' : health.loading ? 'bg-sky-300' : 'bg-white/40'}`} />
    {health.failed.length ? 'Catalog attention' : health.fallback ? 'Saved / fallback catalog' : health.loading ? 'Refreshing catalog' : 'Activity'}
  </button>;
}
export default function DesktopActivitySummary() {
  const { isAdmin } = useAuth();
  const health = useCatalogHealth();
  const [queue,setQueue] = useState<DesktopDownloadQueue>();
  const [error,setError] = useState('');
  useEffect(() => {
    let disposed = false, busy = false; let stop: (() => void) | undefined;
    const refresh = async () => { if (busy) return; busy = true; try { const next = await getDownloadQueue(); if (!disposed) { setQueue(next); setError(''); } } catch { if (!disposed) setError('Download status unavailable. Open Downloads to retry.'); } finally { busy = false; } };
    void refresh(); const timer = window.setInterval(refresh, 5000);
    void listenDownloadsChanged(() => void refresh()).then(value => { if(disposed) value(); else stop = value; }).catch(() => {});
    return () => { disposed = true; stop?.(); window.clearInterval(timer); };
  }, []);
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
