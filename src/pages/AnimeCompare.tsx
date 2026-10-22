import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Copy, Search, X } from 'lucide-react';
import { fetchAnimeDetails } from '../api/jikan';
import { catalogOptions, catalogRequest } from '../api/webCatalog';
import { compareIdentity, comparisonFacts, comparableFacts, parseCompareIdentity } from '../lib/comparisonFacts';
import { useStore } from '../store/useStore';
import Seo from '../components/Seo';
import DataStatus from '../components/DataStatus';
import { animePath } from '../lib/slug';

function TitleSelector({ label, selected, onSelect, onClear }: { label: string; selected: any; onSelect: (anime: any) => void; onClear: () => void }) {
  const id = useId(), [input, setInput] = useState(''), [term, setTerm] = useState(''), [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const adult = useStore(state => state.nsfwMode), container = useRef<HTMLDivElement>(null), field = useRef<HTMLInputElement>(null);
  useEffect(() => { const timer = setTimeout(() => { setTerm(input.trim()); setActive(-1); }, 300); return () => clearTimeout(timer); }, [input]);
  useEffect(() => { const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener('pointerdown', outside); return () => document.removeEventListener('pointerdown', outside); }, []);
  const request = useMemo(() => catalogRequest(new URLSearchParams({ q: term }), adult), [term, adult]);
  const query = useInfiniteQuery({ ...catalogOptions(request), enabled: open && term.length >= 2 });
  const items = query.data?.pages[0]?.data.slice(0, 6) || [];
  const choose = (anime: any) => { onSelect(anime); setOpen(false); setInput(''); setTerm(''); field.current?.focus(); };
  return <div ref={container} className="relative min-w-0 rounded-xl border border-border bg-secondary/20 p-4">
    <div className="mb-3 flex items-center justify-between gap-3"><label htmlFor={id} className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</label>{selected && <button type="button" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => { onClear(); setInput(''); setTerm(''); field.current?.focus(); }} className="rounded p-2 hover:bg-secondary"><X className="h-4 w-4" /></button>}</div>
    {selected && <div className="mb-3 flex min-h-20 gap-3"><img src={selected.images?.jpg?.large_image_url || selected.images?.jpg?.image_url || '/logo.svg'} onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = '/logo.svg'; }} alt="" className="h-20 w-14 shrink-0 rounded object-cover" /><div className="min-w-0"><h2 className="font-bold leading-snug">{selected.title || 'Loading title…'}</h2>{Boolean(selected.mal_id || selected.anilist_id) && <Link className="mt-2 inline-block text-xs text-primary underline" to={animePath(selected)}>Open title page</Link>}</div></div>}
    <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input id={id} ref={field} role="combobox" aria-autocomplete="list" aria-expanded={open && term.length >= 2} aria-controls={`${id}-results`} aria-activedescendant={active >= 0 && items[active] ? `${id}-option-${active}` : undefined}
      value={input} onFocus={() => setOpen(true)} onChange={event => { setInput(event.target.value); setOpen(true); }} placeholder="Search an anime…" className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm"
      onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); setActive(-1); } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(index => Math.max(0, Math.min(items.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))); } else if (event.key === 'Enter') { event.preventDefault(); if (open && active >= 0 && items[active]) choose(items[active]); else { setTerm(input.trim()); setOpen(true); } } }} /></div>
    {open && term.length >= 2 && <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-border bg-background p-2 shadow-xl">
      <DataStatus label="Matching titles" error={query.isError} fetching={query.isFetching} empty={!query.isPending && !items.length} retry={() => void query.refetch()} />
      <ul id={`${id}-results`} role="listbox" aria-label={`${label} matches`}>{items.map((anime: any, index: number) => <li key={compareIdentity(anime)} id={`${id}-option-${index}`} role="option" aria-selected={active === index}><button tabIndex={-1} type="button" onClick={() => choose(anime)} className={`flex min-h-12 w-full items-center gap-3 rounded px-3 py-2 text-left text-sm hover:bg-secondary ${active === index ? 'bg-secondary' : ''}`}><img src={anime.images?.jpg?.image_url || '/logo.svg'} alt="" className="h-12 w-8 shrink-0 rounded object-cover" /><span>{anime.title}</span></button></li>)}</ul>
    </div>}
  </div>;
}

export default function AnimeCompare() {
  const [params, setParams] = useSearchParams(), [differences, setDifferences] = useState(false), [feedback, setFeedback] = useState('');
  const picks = useRef(new Map<string, any>()), adult = useStore(state => state.nsfwMode);
  const a = params.get('a'), b = params.get('b'), leftId = parseCompareIdentity(a), rightId = parseCompareIdentity(b);
  const leftQuery = useQuery({ queryKey: ['anime', leftId?.route, adult], queryFn: ({ signal }) => fetchAnimeDetails(leftId!.route, { signal, anilistId: leftId?.provider === 'anilist' ? leftId.id : undefined, malId: leftId?.provider === 'mal' ? leftId.id : undefined }), enabled: Boolean(leftId), retry: false });
  const rightQuery = useQuery({ queryKey: ['anime', rightId?.route, adult], queryFn: ({ signal }) => fetchAnimeDetails(rightId!.route, { signal, anilistId: rightId?.provider === 'anilist' ? rightId.id : undefined, malId: rightId?.provider === 'mal' ? rightId.id : undefined }), enabled: Boolean(rightId), retry: false });
  const left = leftQuery.data?.data || picks.current.get(a || ''), right = rightQuery.data?.data || picks.current.get(b || '');
  const select = (side: 'a' | 'b', anime?: any) => { const next = new URLSearchParams(params); if (anime) { const id = compareIdentity(anime); picks.current.set(id, anime); next.set(side, id); } else next.delete(side); setParams(next); setFeedback(''); };
  const rows = comparisonFacts(left).map((fact, index) => ({ left: fact, right: comparisonFacts(right)[index] })).filter(row => !differences || !row.left.known || !row.right.known || !comparableFacts(row.left, row.right) || row.left.value !== row.right.value);
  const genreNames = (anime: any): string[] => (anime?.genres || []).map((genre: any) => typeof genre === 'string' ? genre : genre.name).filter(Boolean);
  const shared = genreNames(left).filter(genre => genreNames(right).includes(genre));
  const copy = async () => { try { await navigator.clipboard.writeText(window.location.href); setFeedback('Comparison link copied.'); } catch { setFeedback('Copy this page’s address to share the comparison.'); } };
  return <div className="container mx-auto max-w-6xl px-4 py-8 md:px-10">
    <Seo title="Compare Anime | StreamNyaa" description="Compare anime facts side by side: scores, episode counts, status, studios and genres, with clearly labeled data sources." canonicalPath="/compare" />
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-black md:text-3xl">Compare anime</h1><p className="mt-2 text-sm text-muted-foreground">Two titles, their facts, and the differences that matter to you.</p></div><div className="flex gap-2">
      <button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm disabled:opacity-40" disabled={!a && !b} onClick={() => { const next = new URLSearchParams(params); next.delete('a'); next.delete('b'); if (a) next.set('b', a); if (b) next.set('a', b); setParams(next); }}><ArrowLeftRight className="h-4 w-4" />Swap</button>
      <button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm disabled:opacity-40" disabled={!a && !b} onClick={() => void copy()}><Copy className="h-4 w-4" />Share</button>
    </div></header>
    <div className="grid gap-4 md:grid-cols-2"><div><TitleSelector label="First title" selected={left || (leftId ? { title: 'Loading title…' } : null)} onSelect={anime => select('a', anime)} onClear={() => select('a')} /><DataStatus label="First title details" error={leftQuery.isError} fetching={Boolean(leftId) && leftQuery.isFetching} retry={() => void leftQuery.refetch()} /></div><div><TitleSelector label="Second title" selected={right || (rightId ? { title: 'Loading title…' } : null)} onSelect={anime => select('b', anime)} onClear={() => select('b')} /><DataStatus label="Second title details" error={rightQuery.isError} fetching={Boolean(rightId) && rightQuery.isFetching} retry={() => void rightQuery.refetch()} /></div></div>
    {(a && !leftId || b && !rightId) && <p role="status" className="my-4 text-sm text-muted-foreground">A title link is invalid. Choose that title again.</p>}
    <p role="status" className="my-3 text-sm text-muted-foreground">{feedback}</p>
    {left && right ? <section className="mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Side by side</h2><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={differences} onChange={event => setDifferences(event.target.checked)} className="accent-primary" />Show differences</label></div>
      {shared.length > 0 && <p className="mb-4 text-sm text-muted-foreground">Shared genres: <span className="text-foreground">{shared.join(' · ')}</span></p>}
      <div className="overflow-x-auto rounded-xl border border-border" role="region" aria-label="Anime comparison table" tabIndex={0}><table className="w-full min-w-[520px] text-sm"><caption className="sr-only">Facts for {left.title} and {right.title}. Unknown values are not estimates.</caption><thead className="border-b border-border bg-secondary/40"><tr><th scope="col" className="w-1/5 p-4 text-left">Fact</th><th scope="col" className="w-2/5 p-4 text-left">{left.title}</th><th scope="col" className="w-2/5 p-4 text-left">{right.title}</th></tr></thead><tbody>
        {rows.map(row => <tr key={row.left.label} className="border-b border-border last:border-0"><th scope="row" className="p-4 text-left font-medium text-muted-foreground">{row.left.label}</th>{[row.left, row.right].map((fact, index) => <td key={index} className="p-4 align-top leading-relaxed">{fact.value}{fact.provider && fact.known && <span className="mt-1 block text-xs text-muted-foreground">{fact.provider === 'anilist' ? 'AniList' : 'MyAnimeList via Tenrai'}</span>}</td>)}</tr>)}
        {!rows.length && <tr><td colSpan={3} className="p-6 text-muted-foreground">The available facts match.</td></tr>}
      </tbody></table></div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Scores and popularity reflect their named providers. Counts and ranks measure different things; neither establishes a better anime.</p>
      <div className="mt-5 flex flex-wrap gap-3"><Link className="rounded-lg border border-border px-4 py-3 text-sm hover:border-primary" to={animePath(left, '/downloads')}>Sources for {left.title}</Link><Link className="rounded-lg border border-border px-4 py-3 text-sm hover:border-primary" to={animePath(right, '/downloads')}>Sources for {right.title}</Link></div>
    </section> : <p className="mt-6 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">Choose one title on each side to compare. You can share the resulting page address.</p>}
  </div>;
}
