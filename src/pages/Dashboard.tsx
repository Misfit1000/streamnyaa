import { Link, Navigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Bell,
  BookOpen,
  Bookmark,
  CalendarDays,
  Compass,
  Download,
  Heart,
  LayoutDashboard,
  LogOut,
  Newspaper,
  Search,
  Shield,
  Sparkles,
  UserCircle,
} from 'lucide-react';
import Seo from '../components/Seo';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../store/useStore';

function shortName(email?: string) {
  const name = String(email || 'there').split('@')[0].replace(/[._-]+/g, ' ').trim();
  return name ? name.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'there';
}

function StatCard({ icon: Icon, label, value, detail, tone = 'primary' }: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  detail: string;
  tone?: 'primary' | 'green' | 'sky' | 'amber';
}) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary border-primary/20',
    green: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    sky: 'bg-sky-500/10 text-sky-300 border-sky-500/20',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  }[tone];

  return (
    <div className="rounded-2xl border border-border bg-[var(--glass)] p-5 transition-colors hover:border-primary/35">
      <div className={`mb-5 flex h-11 w-11 items-center justify-center rounded-xl border ${toneClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-black tracking-tight text-foreground">{value}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}

function ActionCard({ to, icon: Icon, title, text, tone = 'primary' }: {
  to: string;
  icon: typeof Activity;
  title: string;
  text: string;
  tone?: 'primary' | 'green' | 'sky' | 'amber';
}) {
  const toneClass = {
    primary: 'bg-primary/10 text-primary',
    green: 'bg-emerald-500/10 text-emerald-300',
    sky: 'bg-sky-500/10 text-sky-300',
    amber: 'bg-amber-500/10 text-amber-300',
  }[tone];

  return (
    <Link to={to} className="group rounded-2xl border border-border bg-[var(--glass)] p-5 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-4">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
      </div>
      <h2 className="mt-5 font-black text-foreground transition-colors group-hover:text-primary">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </Link>
  );
}

export default function Dashboard() {
  const { user, isAdmin, loading, signOut } = useAuth();
  const { myList, likedAnimes, nsfwMode, toggleNsfwMode } = useStore();

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">Loading dashboard...</div>;
  }

  if (!user) return <Navigate to="/login" replace />;

  const joinedDate = user.created_at
    ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(user.created_at))
    : 'Recently';
  const combinedMap = new Map<number, typeof myList[number]>();
  myList.forEach((anime) => combinedMap.set(anime.mal_id, anime));
  (likedAnimes || []).forEach((anime) => combinedMap.set(anime.mal_id, anime));
  const collection = Array.from(combinedMap.values());
  const recentCollection = collection.slice(-4).reverse();
  const displayName = shortName(user.email);

  return (
    <div className="container mx-auto px-4 md:px-10 py-8 md:py-10">
      <Seo title="Dashboard | StreamNyaa" description="Manage your StreamNyaa account dashboard." canonicalPath="/dashboard" />

      <section className="relative overflow-hidden rounded-[28px] border border-border bg-[linear-gradient(135deg,rgba(225,29,72,0.22),rgba(14,165,233,0.08)_42%,rgba(16,185,129,0.10)),var(--glass)] p-6 md:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-background/45 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-primary backdrop-blur">
              <LayoutDashboard className="h-3.5 w-3.5" />
              {isAdmin ? 'Admin account' : 'User account'}
            </div>
            <h1 className="max-w-3xl text-3xl font-black tracking-tight md:text-5xl">Welcome back, {displayName}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
              Signed in as <span className="font-bold text-foreground">{user.email}</span>. Your anime list, discovery tools, release checks, and account controls are ready.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/my-list" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90">
                <BookOpen className="h-4 w-4" />
                Open collection
              </Link>
              <Link to="/anime/popular" className="inline-flex items-center gap-2 rounded-xl border border-border bg-background/55 px-4 py-3 text-sm font-black text-foreground backdrop-blur transition-colors hover:border-primary/40">
                <Compass className="h-4 w-4" />
                Discover anime
              </Link>
              {isAdmin ? (
                <Link to="/admin" className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-black text-primary transition-colors hover:bg-primary/15">
                  <Shield className="h-4 w-4" />
                  Admin tools
                </Link>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background/45 p-5 backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Account pulse</p>
                <p className="mt-2 text-2xl font-black text-foreground">Active</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300">
                <Activity className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-background/50 p-3">
                <p className="text-xs text-muted-foreground">Joined</p>
                <p className="mt-1 text-sm font-black text-foreground">{joinedDate}</p>
              </div>
              <div className="rounded-xl border border-border bg-background/50 p-3">
                <p className="text-xs text-muted-foreground">Access</p>
                <p className="mt-1 text-sm font-black text-foreground">{isAdmin ? 'User + Admin' : 'User'}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Bookmark} label="Saved" value={myList.length} detail="Bookmarked anime in your collection" />
        <StatCard icon={Heart} label="Favorites" value={(likedAnimes || []).length} detail="Titles marked as favorites" tone="green" />
        <StatCard icon={Sparkles} label="Collection" value={collection.length} detail="Unique titles across saved and liked" tone="sky" />
        <StatCard icon={Shield} label="Role" value={isAdmin ? 'Admin' : 'User'} detail={isAdmin ? 'Site controls enabled' : 'Standard account access'} tone="amber" />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-black tracking-tight">Quick launch</h2>
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Core tools</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ActionCard to="/schedule" icon={CalendarDays} title="Release schedule" text="Check airing days, episode movement, and active shows." tone="sky" />
            <ActionCard to="/nyaa" icon={Download} title="Download search" text="Open the cleaner source search and filters." />
            <ActionCard to="/blog" icon={Newspaper} title="Anime blog" text="Read the latest anime stories, guides, and updates." tone="amber" />
            <ActionCard to="/search" icon={Search} title="Search anime" text="Find title pages by name, genre, status, and score." tone="green" />
            <ActionCard to="/anime/popular" icon={Compass} title="Popular anime" text="Browse landing pages built for discovery." tone="sky" />
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-[var(--glass)] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Recent collection</p>
                <h2 className="mt-1 text-xl font-black">Your picks</h2>
              </div>
              <Link to="/my-list" className="text-sm font-black text-primary hover:underline">View all</Link>
            </div>
            {recentCollection.length ? (
              <div className="space-y-3">
                {recentCollection.map((anime) => (
                  <Link key={anime.mal_id} to={`/anime/${anime.mal_id}`} className="group grid grid-cols-[52px_1fr] gap-3 rounded-xl border border-border bg-background/45 p-2 transition-colors hover:border-primary/40">
                    {anime.images?.jpg?.image_url || anime.images?.jpg?.large_image_url ? (
                      <img src={anime.images?.jpg?.image_url || anime.images?.jpg?.large_image_url} alt={anime.title} className="h-[72px] w-[52px] rounded-lg object-cover" loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="flex h-[72px] w-[52px] items-center justify-center rounded-lg bg-secondary text-primary">
                        <BookOpen className="h-5 w-5" />
                      </span>
                    )}
                    <span className="min-w-0 py-1">
                      <span className="line-clamp-2 text-sm font-black leading-tight text-foreground group-hover:text-primary">{anime.title}</span>
                      <span className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {anime.score ? <span>{anime.score}/10</span> : null}
                        {anime.type ? <span>{anime.type}</span> : null}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-background/35 p-5 text-sm leading-6 text-muted-foreground">
                Your saved anime will appear here after you add titles.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-[var(--glass)] p-5">
            <div className="mb-4 flex items-center gap-2">
              <UserCircle className="h-5 w-5 text-primary" />
              <h2 className="font-black">Preferences</h2>
            </div>
            <button
              type="button"
              onClick={toggleNsfwMode}
              className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-colors ${nsfwMode ? 'border-primary/30 bg-primary/10' : 'border-border bg-background/45 hover:border-primary/35'}`}
            >
              <span>
                <span className="block text-sm font-black text-foreground">NSFW mode</span>
                <span className="mt-1 block text-xs text-muted-foreground">{nsfwMode ? 'Enabled' : 'Disabled'}</span>
              </span>
              <span className={`h-6 w-11 rounded-full p-1 transition-colors ${nsfwMode ? 'bg-primary' : 'bg-secondary'}`}>
                <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${nsfwMode ? 'translate-x-5' : ''}`} />
              </span>
            </button>
            <button onClick={signOut} className="mt-3 flex w-full items-center justify-between rounded-xl border border-border bg-background/45 p-4 text-left transition-colors hover:border-primary/40">
              <span>
                <span className="block text-sm font-black text-foreground">Sign out</span>
                <span className="mt-1 block text-xs text-muted-foreground">End this browser session</span>
              </span>
              <LogOut className="h-5 w-5 text-primary" />
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-secondary/20 p-5">
            <div className="flex items-center gap-2 text-sm font-black text-foreground">
              <Bell className="h-4 w-4 text-primary" />
              Today panel
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Use schedule and recent updates to keep your watchlist from getting dusty.</p>
          </div>
        </aside>
      </section>
    </div>
  );
}
