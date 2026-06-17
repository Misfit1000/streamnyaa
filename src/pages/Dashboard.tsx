import { Link, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BookOpen,
  Bookmark,
  CalendarDays,
  Cloud,
  Compass,
  Download,
  Heart,
  LogOut,
  Newspaper,
  RefreshCw,
  Search,
  Shield,
  UserCircle,
} from 'lucide-react';
import Seo from '../components/Seo';
import { useAuth } from '../context/AuthContext';
import { useAccountSync } from '../context/AccountSyncContext';
import {
  fetchAccountDownloadHistory,
  getDownloadHistory,
  mergeDownloadHistory,
  type DownloadHistoryEntry,
} from '../lib/activity';
import { useStore } from '../store/useStore';
import { animeIdentity } from '../lib/animeIdentity';
import { animePath } from '../lib/slug';

const DASHBOARD_FALLBACK_IMAGES = [
  'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx147105-rwOX8qyUy8gV.jpg',
  'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg',
  'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx189046-yaHWtS5FII46.jpg',
  'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx182300-IYkq5KrkQq1V.jpg',
];

function shortName(email?: string) {
  const name = String(email || 'there').split('@')[0].replace(/[._-]+/g, ' ').trim();
  return name ? name.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'there';
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/70 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-black text-foreground">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function ToolRow({ to, icon: Icon, title, text }: {
  to: string;
  icon: typeof Activity;
  title: string;
  text: string;
}) {
  return (
    <Link to={to} className="group grid grid-cols-[36px_1fr_20px] items-center gap-3 rounded-lg border border-border bg-background/55 p-3 transition-colors hover:border-primary/45 hover:bg-primary/5">
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-black text-foreground group-hover:text-primary">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{text}</span>
      </span>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}

export default function Dashboard() {
  const { user, session, isAdmin, loading, signOut } = useAuth();
  const { state: syncState, message: syncMessage, lastSyncedAt, syncNow } = useAccountSync();
  const { myList, likedAnimes, nsfwMode, toggleNsfwMode } = useStore();
  const [downloadHistory, setDownloadHistory] = useState<DownloadHistoryEntry[]>([]);
  const [historyState, setHistoryState] = useState<'local' | 'loading' | 'synced' | 'unavailable'>('local');

  useEffect(() => {
    let cancelled = false;
    const localHistory = getDownloadHistory(8);
    setDownloadHistory(localHistory.slice(0, 6));
    setHistoryState(session?.access_token ? 'loading' : 'local');

    async function loadAccountHistory() {
      if (!session?.access_token) return;
      try {
        const accountHistory = await fetchAccountDownloadHistory(session, 20);
        if (cancelled) return;
        setDownloadHistory(mergeDownloadHistory(accountHistory, localHistory).slice(0, 6));
        setHistoryState('synced');
      } catch {
        if (!cancelled) setHistoryState('unavailable');
      }
    }

    loadAccountHistory();
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">Loading dashboard...</div>;
  }

  if (!user) return <Navigate to="/login" replace />;

  const joinedDate = user.created_at
    ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(user.created_at))
    : 'Recently';
  const combinedMap = new Map<string, typeof myList[number]>();
  myList.forEach((anime) => combinedMap.set(animeIdentity(anime), anime));
  (likedAnimes || []).forEach((anime) => combinedMap.set(animeIdentity(anime), anime));
  const collection = Array.from(combinedMap.values());
  const recentCollection = collection.slice(-5).reverse();
  const displayName = shortName(user.email);
  const syncLabel = syncState === 'synced' ? 'Synced' : syncState === 'syncing' ? 'Syncing' : syncState === 'unavailable' ? 'Local fallback' : 'Local only';
  const syncDetail = lastSyncedAt
    ? `Last sync ${new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(lastSyncedAt))}`
    : session?.access_token
      ? 'Waiting for first sync'
      : 'Sign in to sync';
  const heroImages = [
    ...recentCollection
      .map((anime) => anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url)
      .filter(Boolean),
    ...DASHBOARD_FALLBACK_IMAGES,
  ].slice(0, 4);

  return (
    <div className="container mx-auto px-4 py-8 md:px-10">
      <Seo title="Dashboard | StreamNyaa" description="Manage your StreamNyaa account dashboard." canonicalPath="/dashboard" />

      <header className="overflow-hidden rounded-2xl border border-border bg-[var(--glass)]">
        <div className="grid gap-0 lg:grid-cols-[1fr_360px]">
          <div className="p-5 md:p-7">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">{isAdmin ? 'Admin account' : 'User account'}</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">Dashboard</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                Welcome back, <span className="font-bold text-foreground">{displayName}</span>. Your account tools, saved titles, and discovery shortcuts are here.
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/my-list" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground hover:bg-primary/90">
                <BookOpen className="h-4 w-4" />
                My list
              </Link>
              <Link to="/anime/popular" className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-black text-foreground hover:border-primary/45">
                <Compass className="h-4 w-4" />
                Discover
              </Link>
              {isAdmin ? (
                <Link to="/admin" className="inline-flex items-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-4 py-2.5 text-sm font-black text-primary hover:bg-primary/15">
                  <Shield className="h-4 w-4" />
                  Admin
                </Link>
              ) : null}
            </div>
          </div>
          <div className="relative min-h-[220px] overflow-hidden border-t border-border bg-secondary lg:border-l lg:border-t-0">
            <div className="absolute inset-0 grid grid-cols-4 gap-1 p-2">
              {heroImages.map((image, index) => (
                <div key={`${image}-${index}`} className="overflow-hidden rounded-xl bg-background">
                  <img src={image} alt="" className="h-full w-full object-cover brightness-[0.82]" loading="lazy" referrerPolicy="no-referrer" />
                </div>
              ))}
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.55),rgba(0,0,0,0.05)),linear-gradient(180deg,transparent,rgba(0,0,0,0.5))]" />
            <div className="absolute bottom-4 left-4 right-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Your anime shelf</p>
              <p className="mt-1 text-lg font-black text-white">{collection.length ? `${collection.length} titles saved or liked` : 'Start building your list'}</p>
            </div>
          </div>
        </div>
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Saved anime" value={myList.length} detail="Titles added to your list" />
        <Metric label="Favorites" value={(likedAnimes || []).length} detail="Titles marked as favorites" />
        <Metric label="Collection size" value={collection.length} detail="Unique saved and liked titles" />
        <Metric label="Account sync" value={syncLabel} detail={syncDetail} />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-[var(--glass)] p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black tracking-tight">Workspace</h2>
                <p className="mt-1 text-sm text-muted-foreground">Fast access to the parts of StreamNyaa you use most.</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <ToolRow to="/schedule" icon={CalendarDays} title="Release schedule" text="Track airing titles and upcoming episodes." />
              <ToolRow to="/nyaa" icon={Download} title="Downloads" text="Search source results with filters and badges." />
              <ToolRow to="/search" icon={Search} title="Browse anime" text="Find titles by name, status, genre, and rating." />
              <ToolRow to="/blog" icon={Newspaper} title="Anime blog" text="Read news, guides, and current anime stories." />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-[var(--glass)] p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black tracking-tight">Download history</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {historyState === 'synced'
                    ? 'Copied and opened source links saved to your account.'
                    : historyState === 'loading'
                      ? 'Loading saved source history from your account...'
                      : 'Copied and opened source links saved in this browser.'}
                </p>
              </div>
              <Link to="/nyaa" className="text-sm font-black text-primary hover:underline">Find sources</Link>
            </div>
            {downloadHistory.length ? (
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {downloadHistory.map((entry) => (
                  <div key={entry.id} className="grid gap-2 bg-background/45 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <span className="min-w-0">
                      <span className="line-clamp-1 text-sm font-black text-foreground">{entry.title}</span>
                      <span className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {entry.animeTitle ? <span>{entry.animeTitle}</span> : null}
                        {entry.episode ? <span>Ep {entry.episode}</span> : null}
                        {entry.size ? <span>{entry.size}</span> : null}
                        {entry.seeders ? <span>{entry.seeders} seeders</span> : null}
                      </span>
                    </span>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black uppercase text-primary">{entry.action}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-background/35 p-5 text-sm leading-6 text-muted-foreground">
                Copy or open a source link from a download page and it will appear here. When you are signed in, new activity can follow your account across devices.
              </div>
            )}
            {historyState === 'unavailable' ? (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Account history is not available right now, so this browser's saved history is shown.
              </p>
            ) : null}
          </div>

          <div className="rounded-lg border border-border bg-[var(--glass)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black tracking-tight">Recent collection</h2>
                <p className="mt-1 text-sm text-muted-foreground">Latest titles from your saved and liked anime.</p>
              </div>
              <Link to="/my-list" className="text-sm font-black text-primary hover:underline">View all</Link>
            </div>
            {recentCollection.length ? (
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {recentCollection.map((anime) => (
                  <Link key={animeIdentity(anime)} to={animePath(anime)} className="grid grid-cols-[52px_1fr_auto] items-center gap-3 bg-background/45 p-3 transition-colors hover:bg-primary/5">
                    {anime.images?.jpg?.image_url || anime.images?.jpg?.large_image_url ? (
                      <img src={anime.images?.jpg?.image_url || anime.images?.jpg?.large_image_url} alt={anime.title} className="h-[72px] w-[52px] rounded-md object-cover" loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="flex h-[72px] w-[52px] items-center justify-center rounded-md bg-secondary text-primary">
                        <BookOpen className="h-5 w-5" />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="line-clamp-1 text-sm font-black text-foreground">{anime.title}</span>
                      <span className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {anime.score ? <span>{anime.score}/10</span> : null}
                        {anime.type ? <span>{anime.type}</span> : null}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-background/35 p-5 text-sm leading-6 text-muted-foreground">
                Saved anime will appear here after you add titles to your list.
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-lg border border-border bg-[var(--glass)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <UserCircle className="h-5 w-5 text-primary" />
              <h2 className="font-black">Account</h2>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4 border-b border-border pb-3">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="truncate font-bold text-foreground">{user.email}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border pb-3">
                <dt className="text-muted-foreground">Joined</dt>
                <dd className="font-bold text-foreground">{joinedDate}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Role</dt>
                <dd className="font-bold text-foreground">{isAdmin ? 'Admin' : 'User'}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-border bg-[var(--glass)] p-5">
            <div className="flex items-center gap-2 text-sm font-black text-foreground">
              <Cloud className="h-4 w-4 text-primary" />
              Cross-device sync
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {syncMessage || 'Saved anime, favorites, source history, and desktop watch progress stay local until you sign in.'}
            </p>
            <button
              type="button"
              onClick={() => void syncNow()}
              disabled={syncState === 'syncing'}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background/45 px-4 py-2.5 text-sm font-black text-foreground transition-colors hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${syncState === 'syncing' ? 'animate-spin' : ''}`} />
              {syncState === 'syncing' ? 'Syncing...' : 'Sync now'}
            </button>
          </div>

          <div className="rounded-lg border border-border bg-[var(--glass)] p-5">
            <h2 className="font-black">Preferences</h2>
            <button
              type="button"
              onClick={toggleNsfwMode}
              className={`mt-4 flex w-full items-center justify-between rounded-lg border p-4 text-left transition-colors ${nsfwMode ? 'border-primary/30 bg-primary/10' : 'border-border bg-background/45 hover:border-primary/35'}`}
            >
              <span>
                <span className="block text-sm font-black text-foreground">Content filter</span>
                <span className="mt-1 block text-xs text-muted-foreground">{nsfwMode ? 'NSFW mode enabled' : 'SFW mode enabled'}</span>
              </span>
              <span className={`h-6 w-11 rounded-full p-1 transition-colors ${nsfwMode ? 'bg-primary' : 'bg-secondary'}`}>
                <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${nsfwMode ? 'translate-x-5' : ''}`} />
              </span>
            </button>
            <button onClick={signOut} className="mt-3 flex w-full items-center justify-between rounded-lg border border-border bg-background/45 p-4 text-left transition-colors hover:border-primary/40">
              <span>
                <span className="block text-sm font-black text-foreground">Sign out</span>
                <span className="mt-1 block text-xs text-muted-foreground">End this browser session</span>
              </span>
              <LogOut className="h-5 w-5 text-primary" />
            </button>
          </div>

          <div className="rounded-lg border border-border bg-secondary/20 p-5">
            <div className="flex items-center gap-2 text-sm font-black text-foreground">
              <Activity className="h-4 w-4 text-primary" />
              Account status
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Session active. Your browser is signed in and ready.</p>
          </div>
        </aside>
      </section>
    </div>
  );
}
