import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  ArrowRight,
  Bookmark,
  Cloud,
  Heart,
  History,
  Library,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCircle,
  type LucideIcon,
} from 'lucide-react';
import Seo from '../components/Seo';
import DesktopLoadingProgress from '../components/DesktopLoadingProgress';
import { useAuth } from '../context/AuthContext';
import { useAccountSync } from '../context/AccountSyncContext';
import { animeIdentity } from '../lib/animeIdentity';
import {
  formatPlaybackTime,
  loadLocalPlaybackHistory,
  subscribeLocalPlaybackHistory,
  type LocalPlaybackSource,
} from '../lib/desktop';
import { useStore } from '../store/useStore';

function displayNameFor(email?: string) {
  const local = String(email || '').split('@')[0] || 'StreamNyaa user';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'StreamNyaa user';
}

function formatDate(value?: string) {
  if (!value) return 'Recent';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recent';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function formatSyncTime(value: number | null) {
  if (!value) return 'Not synced yet';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function progressPercent(source: LocalPlaybackSource) {
  const direct = Number(source.progressPercent || 0);
  if (Number.isFinite(direct) && direct > 0) return Math.max(0, Math.min(100, direct));
  const resume = Number(source.resumeSeconds || 0);
  const duration = Number(source.durationSeconds || 0);
  if (resume > 0 && duration > 0) return Math.max(0, Math.min(100, (resume / duration) * 100));
  return 0;
}

function sourceImageCandidates(source: LocalPlaybackSource) {
  const extended = source as LocalPlaybackSource & {
    thumbnail?: string;
    episodeImage?: string;
    backdrop?: string;
  };
  return [extended.thumbnail, extended.episodeImage, extended.backdrop, source.image, source.banner, source.poster]
    .map((value) => String(value || '').trim())
    .filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
}

function animeTitle(anime: any) {
  return String(anime?.title || anime?.title_english || anime?.title_romaji || anime?.name || 'Untitled anime');
}

function animeImageCandidates(anime: any) {
  return [
    anime?.images?.jpg?.large_image_url,
    anime?.images?.webp?.large_image_url,
    anime?.coverImage?.extraLarge,
    anime?.coverImage?.large,
    anime?.poster,
    anime?.image,
    anime?.bannerImage,
  ]
    .map((value) => String(value || '').trim())
    .filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
}

function animeWatchPath(anime: any) {
  const id = anime?.mal_id ?? anime?.id;
  if (id) return `/watch/${id}`;
  return `/search?q=${encodeURIComponent(animeTitle(anime))}`;
}

function uniqueLibraryItems(myList: any[], likedAnimes: any[]) {
  const rows = new Map<string, any>();
  myList.forEach((anime) => rows.set(animeIdentity(anime), { ...anime, _bookmarked: true }));
  likedAnimes.forEach((anime) => {
    const key = animeIdentity(anime);
    rows.set(key, { ...(rows.get(key) || anime), _liked: true });
  });
  return Array.from(rows.values());
}

function PreviewImage({
  candidates,
  title,
  portrait = false,
}: {
  candidates: string[];
  title: string;
  portrait?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const current = candidates[index] || '';

  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [candidates.join('|')]);

  if (!current || failed) {
    return (
      <div className="flex h-full w-full items-end bg-[radial-gradient(circle_at_35%_20%,rgba(244,63,94,0.32),transparent_38%),linear-gradient(145deg,#1b1118,#07070a)] p-3">
        <span className="line-clamp-2 text-sm font-black leading-tight text-white/78">{title}</span>
      </div>
    );
  }

  return (
    <img
      src={current}
      alt={title}
      className={`h-full w-full ${portrait ? 'object-cover' : 'object-cover'}`}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        setIndex((value) => {
          if (value < candidates.length - 1) return value + 1;
          setFailed(true);
          return value;
        });
      }}
    />
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <article className="sn-glass-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/12 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-2xl font-black tracking-[-0.04em] text-white">{value}</span>
      </div>
      <p className="mt-4 text-sm font-black text-white">{label}</p>
      <p className="mt-1 text-xs leading-5 text-white/46">{detail}</p>
    </article>
  );
}

function ActionCard({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="sn-card-hover group flex items-center justify-between gap-4 p-4 hover:bg-primary/10"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-black/30 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-black text-white">{title}</span>
          <span className="mt-1 line-clamp-1 block text-xs text-white/48">{description}</span>
        </span>
      </span>
      <ArrowRight className="h-5 w-5 shrink-0 text-white/34 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}

export default function DesktopProfile() {
  const { user, isAdmin, loading, signOut } = useAuth();
  const { state: syncState, message: syncMessage, lastSyncedAt, syncNow } = useAccountSync();
  const myList = useStore((state) => state.myList);
  const likedAnimes = useStore((state) => state.likedAnimes || []);
  const [history, setHistory] = useState<LocalPlaybackSource[]>(() => loadLocalPlaybackHistory());
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => subscribeLocalPlaybackHistory(() => setHistory(loadLocalPlaybackHistory())), []);

  const libraryItems = useMemo(() => uniqueLibraryItems(myList, likedAnimes), [likedAnimes, myList]);
  const recentHistory = history.slice(0, 4);
  const recentLibrary = libraryItems.slice(0, 5);
  const displayName = displayNameFor(user?.email);
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'SN';

  if (loading) {
    return <DesktopLoadingProgress variant="screen" label="Loading your desktop profile" percent={72} detail="Restoring the encrypted session before account data is shown." />;
  }

  if (!user) {
    return <Navigate to="/login?next=/profile" replace />;
  }

  const syncTone = syncState === 'synced'
    ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
    : syncState === 'syncing'
      ? 'border-sky-400/20 bg-sky-500/10 text-sky-200'
      : syncState === 'unavailable'
        ? 'border-amber-400/20 bg-amber-500/10 text-amber-200'
        : 'border-white/10 bg-white/[0.045] text-white/58';

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="sn-page py-6">
      <Seo title="Profile | StreamNyaa Desktop" description="StreamNyaa Desktop profile and sync." canonicalPath="/profile" robots="noindex, nofollow" />

      <section className="sn-hero-panel overflow-hidden rounded-3xl">
        <div className="relative p-6 md:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_22%,rgba(244,63,94,0.22),transparent_30%),radial-gradient(circle_at_16%_12%,rgba(99,102,241,0.16),transparent_32%)]" />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="flex min-w-0 items-center gap-5">
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl border border-primary/30 bg-[linear-gradient(135deg,rgba(244,63,94,0.36),rgba(255,255,255,0.08))] text-2xl font-black text-white shadow-2xl shadow-primary/16">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-primary">
                  {isAdmin ? 'Desktop admin profile' : 'Desktop profile'}
                </p>
                <h1 className="mt-2 truncate text-3xl font-semibold tracking-[-0.04em] text-white md:text-4xl">{displayName}</h1>
                <p className="mt-2 text-sm font-semibold text-white/54">{user.email}</p>
                <p className="mt-1 text-xs text-white/38">Joined {formatDate(user.created_at)}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void syncNow()}
                disabled={syncState === 'syncing'}
                className="sn-secondary-action h-11 px-4 disabled:cursor-wait disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${syncState === 'syncing' ? 'animate-spin' : ''}`} />
                Sync now
              </button>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className="sn-primary-action h-11 px-4 disabled:cursor-wait disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" />
                {signingOut ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Library} label="Saved anime" value={myList.length} detail="Bookmarks synced to your account." />
        <StatCard icon={Heart} label="Favorites" value={likedAnimes.length} detail="Liked anime follow you across devices." />
        <StatCard icon={History} label="Watch entries" value={history.length} detail="Resume data from local playback history." />
        <StatCard icon={Cloud} label="Last sync" value={lastSyncedAt ? 'Live' : 'Idle'} detail={formatSyncTime(lastSyncedAt)} />
      </section>

      <section className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-semibold ${syncTone}`}>
        {syncMessage || 'Sign-in is active. Desktop sync will keep library and watch history aligned when the service is available.'}
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="sn-glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">Data Sync</p>
              <h2 className="mt-2 text-xl font-black text-white">Synced desktop data</h2>
            </div>
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <ActionCard to="/my-list" icon={Bookmark} title="Library and bookmarks" description="Saved and favorited anime use account sync." />
            <ActionCard to="/dashboard" icon={History} title="Watch history" description="Playback progress is stored locally and synced after sign-in." />
            <ActionCard to="/search" icon={Search} title="Discover anime" description="Find anime, then save it to your synced desktop library." />
            <ActionCard to="/desktop-settings" icon={UserCircle} title="Desktop preferences" description="Playback preferences remain native to this desktop app." />
          </div>

          {isAdmin ? (
            <div className="mt-5 rounded-2xl border border-primary/25 bg-primary/10 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-black text-white">Admin status recognized</p>
                  <p className="mt-1 text-sm leading-6 text-white/55">
                    This desktop page keeps the admin identity available for synced account data, but it does not load the web admin dashboard inside the desktop app.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="sn-glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">Recent History</p>
              <h2 className="mt-2 text-xl font-black text-white">Continue from account data</h2>
            </div>
            <Link to="/dashboard" className="text-xs font-black uppercase tracking-[0.18em] text-white/42 transition-colors hover:text-primary">
              View all
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {recentHistory.length ? recentHistory.map((source) => {
              const title = source.animeTitle || source.title;
              const progress = progressPercent(source);
              return (
                <Link
                  key={`${source.animeId || title}-${source.episode || ''}-${source.infoHash || source.magnet || source.title}`}
                  to="/dashboard"
                  className="sn-card-hover group flex gap-3 p-3 hover:bg-primary/10"
                >
                  <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-xl bg-white/[0.04]">
                    <PreviewImage candidates={sourceImageCandidates(source)} title={title} />
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
                      <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 py-1">
                    <p className="line-clamp-1 text-sm font-black text-white">{title}</p>
                    <p className="mt-1 line-clamp-1 text-xs font-semibold text-white/42">{source.title}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black text-white/46">
                      {source.episode ? <span>Episode {source.episode}</span> : null}
                      <span>{source.resumeSeconds ? `Resume ${formatPlaybackTime(source.resumeSeconds)}` : `${Math.round(progress)}% watched`}</span>
                    </div>
                  </div>
                </Link>
              );
            }) : (
              <div className="sn-empty-state px-4 py-8 text-center">
                <p className="text-sm font-black text-white">No synced watch history yet.</p>
                <p className="mt-2 text-sm leading-6 text-white/48">Open a source from a watch page and it will appear here after sync.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="sn-glass-panel mt-5 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary">Library Preview</p>
            <h2 className="mt-2 text-xl font-black text-white">Bookmarks and favorites</h2>
          </div>
          <Link to="/my-list" className="text-xs font-black uppercase tracking-[0.18em] text-white/42 transition-colors hover:text-primary">
            Open library
          </Link>
        </div>

        {recentLibrary.length ? (
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {recentLibrary.map((anime) => (
              <Link
                key={`profile-library-${animeIdentity(anime)}`}
                to={animeWatchPath(anime)}
                className="sn-card-hover group overflow-hidden rounded-2xl"
              >
                <div className="aspect-[2/3] overflow-hidden bg-white/[0.04]">
                  <PreviewImage candidates={animeImageCandidates(anime)} title={animeTitle(anime)} portrait />
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 min-h-[2.5rem] text-sm font-black leading-tight text-white">{animeTitle(anime)}</p>
                  <p className="mt-2 text-xs font-semibold text-white/42">
                    {anime.type || anime.format || 'Anime'} {anime.year ? `- ${anime.year}` : ''}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="sn-empty-state mt-5 px-4 py-10 text-center">
            <p className="text-sm font-black text-white">No saved anime yet.</p>
            <p className="mt-2 text-sm leading-6 text-white/48">Use Explore or a watch page to bookmark anime into your synced desktop library.</p>
            <Link to="/search" className="sn-primary-action mt-5 h-11 px-5">
              Explore anime
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
