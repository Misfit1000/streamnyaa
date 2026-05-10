import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BarChart3, CheckCircle2, Gauge, GitCompare, Layers3, Loader2, Search, Tags, Trophy } from 'lucide-react';
import { fetchAnimeDetails, searchAnime } from '../api/jikan';
import Seo from '../components/Seo';
import { animePath } from '../lib/slug';

function formatStatus(status?: string) {
  return status ? status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Unknown';
}

function formatNumber(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : 'N/A';
}

function listNames(items?: Array<{ name: string }>) {
  return (items || []).map((item) => item.name).filter(Boolean);
}

function winnerLabel(aValue?: number | null, bValue?: number | null, lowerIsBetter = false) {
  const a = Number(aValue || 0);
  const b = Number(bValue || 0);
  if (!a && !b) return 'Even';
  if (a === b) return 'Even';
  const aWins = lowerIsBetter ? a < b : a > b;
  return aWins ? 'left' : 'right';
}

function comparisonPercent(value?: number | null, other?: number | null, lowerIsBetter = false) {
  const current = Number(value || 0);
  const alternate = Number(other || 0);
  if (!current && !alternate) return 50;
  if (!alternate) return 88;
  if (!current) return 12;
  const total = current + alternate;
  const percent = lowerIsBetter ? (alternate / total) * 100 : (current / total) * 100;
  return Math.max(12, Math.min(88, Math.round(percent)));
}

function SearchBox({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: any;
  onSelect: (anime: any) => void;
}) {
  const [term, setTerm] = useState('');
  const activeTerm = term.trim();
  const { data, isFetching } = useQuery({
    queryKey: ['compare-search', label, activeTerm],
    queryFn: () => searchAnime(activeTerm, 1),
    enabled: activeTerm.length >= 2,
    staleTime: 1000 * 60 * 10,
  });

  return (
    <div className="rounded-3xl border border-[var(--glass-border)] bg-[var(--glass)] p-4 shadow-xl shadow-black/10 backdrop-blur-2xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">{label}</p>
          <h2 className="text-lg font-black text-foreground">{selected?.title || 'Pick an anime'}</h2>
        </div>
        {selected?.images?.jpg?.image_url ? (
          <img src={selected.images.jpg.image_url} alt={selected.title} className="h-16 w-12 rounded-xl object-cover" loading="lazy" referrerPolicy="no-referrer" />
        ) : null}
      </div>

      <div className="relative">
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search anime title..."
          className="w-full rounded-2xl border border-border bg-background/70 px-4 py-3 pl-11 text-sm font-semibold text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        />
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        {isFetching ? <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary" /> : null}
      </div>

      <div className="mt-4 grid gap-2">
        {activeTerm.length < 2 ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/35 p-4 text-sm text-muted-foreground">
            Type at least two letters to search.
          </div>
        ) : null}
        {(data?.data || []).slice(0, 5).map((anime: any) => (
          <button
            key={`${label}-${anime.mal_id}`}
            type="button"
            onClick={() => onSelect(anime)}
            className={`grid grid-cols-[44px_1fr_auto] items-center gap-3 rounded-2xl border p-2 text-left transition-colors ${
              selected?.mal_id === anime.mal_id
                ? 'border-primary/45 bg-primary/10'
                : 'border-transparent bg-background/45 hover:border-primary/30 hover:bg-primary/5'
            }`}
          >
            <img src={anime.images?.jpg?.image_url || anime.images?.jpg?.large_image_url} alt={anime.title} className="h-14 w-11 rounded-xl object-cover" loading="lazy" referrerPolicy="no-referrer" />
            <span className="min-w-0">
              <span className="block line-clamp-1 text-sm font-black text-foreground">{anime.title}</span>
              <span className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{anime.score ? `${anime.score}/10` : 'No score'}</span>
                <span>{formatStatus(anime.status)}</span>
              </span>
            </span>
            {selected?.mal_id === anime.mal_id ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <ArrowRight className="h-4 w-4 text-muted-foreground" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  left,
  right,
  winner,
  leftValue,
  rightValue,
  lowerIsBetter = false,
  detail,
}: {
  label: string;
  left: string;
  right: string;
  winner?: 'left' | 'right' | 'Even';
  leftValue?: number | null;
  rightValue?: number | null;
  lowerIsBetter?: boolean;
  detail?: string;
}) {
  const leftPercent = comparisonPercent(leftValue, rightValue, lowerIsBetter);
  const rightPercent = comparisonPercent(rightValue, leftValue, lowerIsBetter);
  const hasBars = typeof leftValue === 'number' || typeof rightValue === 'number';

  return (
    <div className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] p-4 shadow-lg shadow-black/10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">{label}</p>
          {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
        </div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wider ${
          winner === 'left' || winner === 'right'
            ? 'bg-primary/10 text-primary'
            : 'bg-secondary text-muted-foreground'
        }`}>
          {winner === 'Even' ? 'Even' : winner === 'left' ? 'Anime A leads' : winner === 'right' ? 'Anime B leads' : 'Compare'}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-end">
        <div className={`rounded-2xl border p-3 ${winner === 'left' ? 'border-primary/25 bg-primary/10 text-primary' : 'border-border bg-background/45 text-foreground'}`}>
          <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Anime A</p>
          <p className="mt-1 text-2xl font-black">{left}</p>
          {hasBars ? (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-background/80">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${leftPercent}%` }} />
            </div>
          ) : null}
        </div>

        <div className="hidden h-12 w-12 items-center justify-center rounded-full border border-border bg-background/70 text-muted-foreground md:flex">
          <GitCompare className="h-5 w-5" />
        </div>

        <div className={`rounded-2xl border p-3 text-left md:text-right ${winner === 'right' ? 'border-primary/25 bg-primary/10 text-primary' : 'border-border bg-background/45 text-foreground'}`}>
          <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Anime B</p>
          <p className="mt-1 text-2xl font-black">{right}</p>
          {hasBars ? (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-background/80">
              <div className="ml-auto h-full rounded-full bg-primary transition-all" style={{ width: `${rightPercent}%` }} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AnimeHero({ anime, side }: { anime: any; side: 'left' | 'right' }) {
  const image = anime?.images?.jpg?.large_image_url || anime?.images?.jpg?.image_url;
  return (
    <div className="relative overflow-hidden rounded-3xl border border-[var(--glass-border)] bg-[var(--glass)] shadow-xl shadow-black/10">
      {image ? <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20 blur-xl" loading="lazy" referrerPolicy="no-referrer" /> : null}
      <div className="relative grid gap-4 p-5 sm:grid-cols-[112px_1fr]">
        {image ? <img src={image} alt={anime.title} className="h-40 w-28 rounded-2xl object-cover shadow-lg shadow-black/30" loading="lazy" referrerPolicy="no-referrer" /> : null}
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">{side === 'left' ? 'Anime A' : 'Anime B'}</p>
          <h2 className="mt-2 line-clamp-2 text-2xl font-black text-foreground">{anime.title}</h2>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{anime.synopsis || 'Synopsis not available.'}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-muted-foreground">
            <span className="rounded-full bg-background/70 px-2.5 py-1">Score {anime.score || 'N/A'}</span>
            <span className="rounded-full bg-background/70 px-2.5 py-1">{formatStatus(anime.status)}</span>
            <span className="rounded-full bg-background/70 px-2.5 py-1">{anime.episodes || 'TBA'} eps</span>
          </div>
          <Link to={animePath(anime)} className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-black text-primary-foreground transition-colors hover:bg-primary/90">
            Open page
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AnimeCompare() {
  const [leftPick, setLeftPick] = useState<any>(null);
  const [rightPick, setRightPick] = useState<any>(null);

  const { data: leftDetails, isFetching: leftLoading } = useQuery({
    queryKey: ['anime', leftPick?.mal_id ? String(leftPick.mal_id) : ''],
    queryFn: () => fetchAnimeDetails(String(leftPick!.mal_id)),
    enabled: Boolean(leftPick?.mal_id),
  });
  const { data: rightDetails, isFetching: rightLoading } = useQuery({
    queryKey: ['anime', rightPick?.mal_id ? String(rightPick.mal_id) : ''],
    queryFn: () => fetchAnimeDetails(String(rightPick!.mal_id)),
    enabled: Boolean(rightPick?.mal_id),
  });

  const left = leftDetails?.data || leftPick;
  const right = rightDetails?.data || rightPick;
  const leftGenres = listNames(left?.genres);
  const rightGenres = listNames(right?.genres);
  const sharedGenres = useMemo(() => leftGenres.filter((genre) => rightGenres.includes(genre)), [leftGenres, rightGenres]);
  const leftStudios = listNames(left?.studios);
  const rightStudios = listNames(right?.studios);
  const isReady = Boolean(left && right);

  return (
    <div className="container mx-auto px-4 py-10 md:px-10">
      <Seo
        title="Anime Comparison Tool | StreamNyaa"
        description="Compare two anime by score, popularity, genres, studio, episode count, status, and quick viewing context on StreamNyaa."
        canonicalPath="/compare"
      />

      <header className="mx-auto mb-8 max-w-4xl text-center">
        <p className="mb-3 text-[11px] font-black uppercase tracking-[0.22em] text-primary">Anime comparison</p>
        <h1 className="text-4xl font-black tracking-tight text-foreground md:text-6xl">Compare two anime side by side</h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
          Pick two titles and compare score, popularity, genres, studio, episode count, and airing status in one clean view.
        </p>
      </header>

      <section className="grid gap-5 lg:grid-cols-2">
        <SearchBox label="First title" selected={leftPick} onSelect={setLeftPick} />
        <SearchBox label="Second title" selected={rightPick} onSelect={setRightPick} />
      </section>

      {(leftLoading || rightLoading) && isReady ? (
        <div className="mt-8 flex items-center justify-center gap-3 rounded-2xl border border-border bg-secondary/20 p-5 text-sm font-bold text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Loading full comparison details...
        </div>
      ) : null}

      {isReady ? (
        <section className="mt-10 space-y-8">
          <div className="grid gap-5 lg:grid-cols-2">
            <AnimeHero anime={left} side="left" />
            <AnimeHero anime={right} side="right" />
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-[var(--glass-border)] bg-[linear-gradient(135deg,rgba(225,29,72,0.10),rgba(14,165,233,0.07),rgba(255,255,255,0.025)),var(--glass)] p-5 shadow-2xl shadow-black/20 backdrop-blur-2xl">
            <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-primary">
                  <Gauge className="h-4 w-4" />
                  Core stats
                </div>
                <h2 className="text-2xl font-black text-foreground md:text-3xl">Performance snapshot</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                  A cleaner read of reception, reach, episode size, production, and current release state.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-black">
                <span className="rounded-2xl bg-background/65 px-3 py-2 text-foreground">A: {left.title}</span>
                <span className="rounded-2xl bg-background/65 px-3 py-2 text-foreground">B: {right.title}</span>
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <StatCard label="Score" left={left.score ? `${left.score}/10` : 'N/A'} right={right.score ? `${right.score}/10` : 'N/A'} leftValue={left.score} rightValue={right.score} winner={winnerLabel(left.score, right.score) as any} detail="Audience score signal" />
              <StatCard label="Popularity" left={formatNumber(left.popularity)} right={formatNumber(right.popularity)} leftValue={left.popularity} rightValue={right.popularity} lowerIsBetter winner={winnerLabel(left.popularity, right.popularity, true) as any} detail="Lower rank number is stronger" />
              <StatCard label="Episodes" left={left.episodes ? `${left.episodes}` : 'TBA'} right={right.episodes ? `${right.episodes}` : 'TBA'} leftValue={left.episodes} rightValue={right.episodes} winner={winnerLabel(left.episodes, right.episodes) as any} detail="Confirmed or listed episode count" />
              <StatCard label="Status" left={formatStatus(left.status)} right={formatStatus(right.status)} detail="Current release state" />
              <StatCard label="Studio" left={leftStudios.slice(0, 2).join(', ') || 'TBA'} right={rightStudios.slice(0, 2).join(', ') || 'TBA'} detail="Main production studio listing" />
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
            <div className="rounded-3xl border border-[var(--glass-border)] bg-[var(--glass)] p-5 shadow-xl shadow-black/10 backdrop-blur-2xl">
              <div className="mb-4 flex items-center gap-2">
                <Tags className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-black text-foreground">Genre overlap</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {sharedGenres.length ? sharedGenres.map((genre) => (
                  <span key={genre} className="rounded-full bg-primary/10 px-3 py-1.5 text-sm font-black text-primary">{genre}</span>
                )) : (
                  <span className="rounded-full border border-border bg-background/55 px-3 py-1.5 text-sm font-bold text-muted-foreground">No shared genres listed</span>
                )}
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-muted-foreground">{left.title}</p>
                  <div className="flex flex-wrap gap-2">
                    {leftGenres.map((genre) => <span key={`left-${genre}`} className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold">{genre}</span>)}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-[11px] font-black uppercase tracking-wider text-muted-foreground">{right.title}</p>
                  <div className="flex flex-wrap gap-2">
                    {rightGenres.map((genre) => <span key={`right-${genre}`} className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold">{genre}</span>)}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--glass-border)] bg-[linear-gradient(135deg,rgba(225,29,72,0.14),rgba(14,165,233,0.08)),var(--glass)] p-5 shadow-xl shadow-black/10 backdrop-blur-2xl">
              <div className="mb-4 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-black text-foreground">Quick read</h2>
              </div>
              <div className="space-y-3 text-sm leading-6 text-muted-foreground">
                <p>
                  <span className="font-black text-foreground">{winnerLabel(left.score, right.score) === 'left' ? left.title : winnerLabel(left.score, right.score) === 'right' ? right.title : 'Both titles'}</span>
                  {' '}has the stronger score signal based on available metadata.
                </p>
                <p>
                  <span className="font-black text-foreground">{winnerLabel(left.popularity, right.popularity, true) === 'left' ? left.title : winnerLabel(left.popularity, right.popularity, true) === 'right' ? right.title : 'Both titles'}</span>
                  {' '}has the stronger popularity rank signal.
                </p>
                <p>
                  Shared genres: <span className="font-black text-foreground">{sharedGenres.length ? sharedGenres.join(', ') : 'none listed'}</span>.
                </p>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Link to={animePath(left, '/downloads')} className="rounded-2xl bg-background/65 p-3 text-sm font-black text-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                  {left.title} downloads
                </Link>
                <Link to={animePath(right, '/downloads')} className="rounded-2xl bg-background/65 p-3 text-sm font-black text-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                  {right.title} downloads
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-10 rounded-3xl border border-dashed border-border bg-secondary/20 p-8 text-center text-muted-foreground">
          <Layers3 className="mx-auto mb-3 h-8 w-8 text-primary" />
          Choose one anime on each side to start the comparison.
        </section>
      )}
    </div>
  );
}
