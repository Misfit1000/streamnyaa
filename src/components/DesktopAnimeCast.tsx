import { useEffect, useId, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronDown, Loader2, Mic, Users } from 'lucide-react';
import { castIdentityKey, fetchAnimeCast, type CastIdentity, type CastPage } from '../api/animeCast';
import { desktopDataError } from '../lib/desktopData';

function CastContents({ identity }: { identity: CastIdentity }) {
  const [language, setLanguage] = useState('Japanese');
  const [visible, setVisible] = useState(6);
  const [now, setNow] = useState(Date.now());
  const query = useInfiniteQuery({ queryKey: ['desktop-cast', castIdentityKey(identity), 1],
    initialPageParam: { page: 1, provider: undefined as CastPage['provider'] | undefined },
    queryFn: ({ signal, pageParam }) => fetchAnimeCast(identity, pageParam.page, { signal }, pageParam.provider),
    getNextPageParam: page => page.hasNextPage ? { page: page.page + 1, provider: page.provider } : undefined,
    staleTime: 86400_000, gcTime: 86400_000, retry: false, refetchOnWindowFocus: false,
    enabled: Boolean(identity.anilistId || identity.malId),
  });
  const failure = query.error ? desktopDataError('cast', query.error) : undefined;
  const retryAt = Math.max(failure?.retryAt || 0, ...(query.data?.pages.map(page => page.retryAt || 0) || [0]));
  useEffect(() => { if (retryAt <= Date.now()) return; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [retryAt]);
  const records = [...new Map((query.data?.pages.flatMap(page => page.data) || []).map(record => [record.id, record])).values()];
  const more = async () => {
    if (visible >= records.length && query.hasNextPage) { const result = await query.fetchNextPage(); if (result.isError) return; }
    setVisible(value => value + 6);
  };
  return <div className="border-t border-white/[0.08] p-4 md:p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-white/55">Characters and their voice actors</p>
      <div role="group" aria-label="Voice language" className="flex flex-wrap gap-1 rounded-lg bg-black/35 p-1">
        {['Japanese', 'English', 'All languages'].map(value => <button type="button" key={value} aria-pressed={value === language}
          onClick={() => setLanguage(value)} className={`min-h-9 rounded-md px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${value === language ? 'bg-primary text-white' : 'text-white/65 hover:bg-white/10'}`}>{value}</button>)}
      </div>
    </div>
    {!identity.anilistId && !identity.malId ? <p role="status" className="text-sm text-white/60">Cast will load when this anime’s identity is available.</p>
      : query.isPending ? <p role="status" className="flex items-center gap-2 text-sm text-white/60"><Loader2 className="h-4 w-4 animate-spin" />Loading cast…</p>
      : !records.length && !query.isError ? <p role="status" className="text-sm text-white/60">Cast has not been published for this anime.</p> : null}
    {query.data?.pages.some(page => page.stale) && <p className="mb-3 text-xs text-white/55">Saved cast · Last updated {new Date(Math.min(...query.data.pages.map(page => page.fetchedAt))).toLocaleString()}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {records.slice(0, visible).map(character => {
        const actors = character.actors.filter(actor => language === 'All languages' || actor.language === language);
        return <article key={character.id} className="flex min-w-0 gap-3 overflow-hidden rounded-lg border border-white/10 bg-white/[0.025] p-3">
          {character.image ? <img src={character.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-28 w-20 shrink-0 rounded-md bg-white/5 object-cover" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} />
            : <div className="grid h-28 w-20 shrink-0 place-items-center rounded-md bg-white/5"><Users className="h-6 w-6 text-white/30" /></div>}
          <div className="min-w-0"><h3 className="break-words text-sm font-semibold text-white">{character.name}</h3><p className="mt-1 text-xs text-white/50">{character.role}</p>
            {actors.length ? actors.map(actor => <p key={`${actor.id}:${actor.language}`} className="mt-3 flex items-start gap-2 text-xs"><Mic className="h-4 w-4 shrink-0 text-white/65" /><span className="min-w-0 break-words">{actor.name}<small className="mt-1 block text-white/45">{actor.language}</small></span></p>) : <p className="mt-3 text-xs text-white/45">{language === 'All languages' ? 'Voice actor not listed' : `${language} voice actor not listed`}</p>}
          </div>
        </article>;
      })}
    </div>
    {query.isError && <div role="status" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/65"><span>{records.length ? 'Available cast remains visible. ' : ''}Cast could not refresh.</span>
      {failure?.retryable && <button type="button" disabled={now < retryAt || query.isFetching} className="sn-secondary-action px-3 py-2 disabled:opacity-50" onClick={() => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())}>{now < retryAt ? `Retry in ${Math.ceil((retryAt - now) / 1000)}s` : 'Retry cast'}</button>}</div>}
    {(visible < records.length || query.hasNextPage) && <div className="mt-4 text-center"><button type="button" disabled={query.isFetching || now < retryAt} onClick={() => void more()} className="sn-secondary-action inline-flex min-h-10 items-center gap-2 px-5 py-2 disabled:opacity-50">{query.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}Show more cast</button></div>}
  </div>;
}
export default function DesktopAnimeCast({ identity }: { identity: CastIdentity }) {
  const [open, setOpen] = useState(false); const region = useId();
  return <section className="sn-glass-panel mb-5 overflow-hidden rounded-xl" aria-label="Cast and characters">
    <button type="button" aria-expanded={open} aria-controls={region} onClick={() => setOpen(value => !value)} className="flex min-h-16 w-full items-center gap-3 p-5 text-left hover:bg-white/[0.025] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      <Users className="h-5 w-5 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block font-semibold">Cast &amp; characters</span><span className="mt-1 block text-xs text-white/50">Characters and voice actors</span></span><ChevronDown className={`h-5 w-5 text-white/60 motion-safe:transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    <div id={region} hidden={!open}>{open && <CastContents key={castIdentityKey(identity)} identity={identity} />}</div>
  </section>;
}
