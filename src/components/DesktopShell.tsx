import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Download,
  HardDrive,
  Home,
  Library,
  MonitorPlay,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserCircle,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getDesktopRuntimeStatus, loadDesktopPlaybackSettings, type DesktopRuntimeStatus } from '../lib/desktop';

const navItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/nyaa?desktop=1', label: 'Sources', icon: Download },
  { to: '/local-player?desktop=1', label: 'Player', icon: MonitorPlay },
  { to: '/search', label: 'Browse', icon: Search },
  { to: '/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/my-list', label: 'Library', icon: Library },
  { to: '/compare', label: 'Compare', icon: BarChart3 },
  { to: '/desktop-settings', label: 'Settings', icon: Settings },
];

const quickItems = [
  { to: '/schedule', label: 'Latest episodes', icon: CalendarDays },
  { to: '/search?sort=trending&status=airing', label: 'Trending', icon: Sparkles },
  { to: '/nyaa?desktop=1', label: 'Sources', icon: Download },
  { to: '/local-player?desktop=1', label: 'Player', icon: MonitorPlay },
  { to: '/my-list', label: 'Library', icon: Library },
];

const routeImages = {
  sources: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-jR5z3nlQF9m3.jpg',
  player: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-C6FPmWm59CyP.jpg',
  browse: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/147105-oOj4tG6IujS7.jpg',
  schedule: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/5114-4EP2X4MMDi0I.jpg',
  library: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/11061-i7VYEDTd0HXT.jpg',
  compare: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/1735-MdBQjA6gE1pT.jpg',
  settings: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/1535-NfoFLxZ2QZ9G.jpg',
  account: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/19815-RaCx7Qvx3S5N.jpg',
  admin: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/9253-GBCo1l1b8YV0.jpg',
  anime: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/1-OquNCNB6srGe.jpg',
  blog: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/101348-2fhS7Oa92F0L.jpg',
  default: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/20-HHxhPj5JD13a.jpg',
};

function routeKey(pathname: string) {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/nyaa')) return 'sources';
  if (pathname.startsWith('/local-player')) return 'player';
  if (pathname.startsWith('/search')) return 'browse';
  if (pathname.startsWith('/schedule')) return 'schedule';
  if (pathname.startsWith('/my-list')) return 'library';
  if (pathname.startsWith('/compare')) return 'compare';
  if (pathname.startsWith('/desktop-settings')) return 'settings';
  if (pathname.startsWith('/dashboard')) return 'account';
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/anime') || pathname.startsWith('/manga')) return 'anime';
  if (pathname.startsWith('/blog')) return 'blog';
  return 'default';
}

function getRouteMeta(pathname: string) {
  const key = routeKey(pathname);
  const baseActions = {
    sources: { to: '/nyaa?desktop=1', label: 'Find sources', icon: Download },
    browse: { to: '/search', label: 'Browse anime', icon: Search },
    schedule: { to: '/schedule', label: 'Schedule', icon: CalendarDays },
    player: { to: '/local-player?desktop=1', label: 'Open player', icon: MonitorPlay },
    library: { to: '/my-list', label: 'My library', icon: Library },
  };

  const meta = {
    home: null,
    sources: {
      eyebrow: 'Source studio',
      title: 'Find the cleanest anime source fast.',
      description: 'Search episode, batch, sub, dub, and quality metadata with source scoring, presets, freshness labels, and local playback handoff.',
      image: routeImages.sources,
      stats: ['Quality scoring', 'Episode matching', 'Source presets'],
      actions: [baseActions.sources, baseActions.player],
    },
    player: {
      eyebrow: 'Local player',
      title: 'Choose a source, then play it locally.',
      description: 'A desktop-first playback space with source selector, episode targeting, runtime status, download progress, and fallback player controls.',
      image: routeImages.player,
      stats: ['In-app playback', 'Local cache', 'Smart fallback'],
      actions: [baseActions.sources, baseActions.player],
    },
    browse: {
      eyebrow: 'Anime discovery',
      title: 'Browse titles without losing context.',
      description: 'Filter by format, status, rating, and genre, then jump into title pages, source search, related anime, and seasonal hubs.',
      image: routeImages.browse,
      stats: ['Genre filters', 'Title pages', 'Clean slugs'],
      actions: [baseActions.browse, baseActions.sources],
    },
    schedule: {
      eyebrow: 'Release board',
      title: 'See what is airing next.',
      description: 'Track current episodes by day, local time, and title page, with quick paths into downloads when an episode has aired.',
      image: routeImages.schedule,
      stats: ['Local timezone', 'Airing days', 'Episode labels'],
      actions: [baseActions.schedule, baseActions.sources],
    },
    library: {
      eyebrow: 'Personal shelf',
      title: 'Keep favorites and saved anime close.',
      description: 'Your saved titles, liked anime, recent activity, and account shortcuts stay in one calm desktop workspace.',
      image: routeImages.library,
      stats: ['Saved titles', 'Favorites', 'Recent activity'],
      actions: [baseActions.library, baseActions.browse],
    },
    compare: {
      eyebrow: 'Matchup desk',
      title: 'Compare anime like a scorecard.',
      description: 'Pick two titles and compare score, popularity, status, studios, genres, episodes, and recommendations in one view.',
      image: routeImages.compare,
      stats: ['Core stats', 'Shared genres', 'Direct links'],
      actions: [{ to: '/compare', label: 'Start comparing', icon: BarChart3 }, baseActions.browse],
    },
    settings: {
      eyebrow: 'Desktop control',
      title: 'Tune local playback and storage.',
      description: 'Check readiness, save player settings, open storage, and keep the desktop app configured without technical clutter.',
      image: routeImages.settings,
      stats: ['Readiness', 'Storage', 'Player setup'],
      actions: [{ to: '/desktop-settings', label: 'Check setup', icon: Settings }, baseActions.player],
    },
    account: {
      eyebrow: 'Account hub',
      title: 'Your StreamNyaa workspace.',
      description: 'Saved titles, source history, quick tools, and sign-in synced activity are grouped into a cleaner desktop dashboard.',
      image: routeImages.account,
      stats: ['History', 'My list', 'Shortcuts'],
      actions: [{ to: '/dashboard', label: 'Dashboard', icon: UserCircle }, baseActions.sources],
    },
    admin: {
      eyebrow: 'Admin cockpit',
      title: 'Manage content and site tools.',
      description: 'Admin actions stay separate from the user flow, with quick access to blog generation, account tools, and site controls.',
      image: routeImages.admin,
      stats: ['Admin tools', 'Blog actions', 'Access'],
      actions: [{ to: '/admin', label: 'Admin tools', icon: ShieldCheck }, baseActions.browse],
    },
    anime: {
      eyebrow: 'Title room',
      title: 'Anime details with download-first actions.',
      description: 'Synopsis, score, genres, schedule context, related titles, and source links live together in a more cinematic title page.',
      image: routeImages.anime,
      stats: ['MAL details', 'Related anime', 'Sources'],
      actions: [baseActions.sources, baseActions.browse],
    },
    blog: {
      eyebrow: 'Anime journal',
      title: 'Guides and anime stories with better context.',
      description: 'Read anime articles, related titles, current topic pages, and discovery links without leaving the StreamNyaa design system.',
      image: routeImages.blog,
      stats: ['Articles', 'Related anime', 'SEO pages'],
      actions: [{ to: '/blog', label: 'Read blog', icon: Sparkles }, baseActions.browse],
    },
    default: {
      eyebrow: 'StreamNyaa desktop',
      title: 'One place for anime discovery.',
      description: 'Search, compare, track, save, and prepare local playback from a consistent desktop interface.',
      image: routeImages.default,
      stats: ['Discovery', 'Sources', 'Local playback'],
      actions: [baseActions.browse, baseActions.sources],
    },
  } as const;

  return meta[key] || meta.default;
}

function pageTitle(pathname: string) {
  if (pathname === '/') return 'Home';
  if (pathname.startsWith('/nyaa')) return 'Sources';
  if (pathname.startsWith('/local-player')) return 'Player';
  if (pathname.startsWith('/search')) return 'Browse';
  if (pathname.startsWith('/schedule')) return 'Schedule';
  if (pathname.startsWith('/my-list')) return 'Library';
  if (pathname.startsWith('/compare')) return 'Compare';
  if (pathname.startsWith('/desktop-settings')) return 'Settings';
  if (pathname.startsWith('/dashboard')) return 'Account';
  if (pathname.startsWith('/admin')) return 'Admin';
  return 'StreamNyaa';
}

function runtimeText(runtime: DesktopRuntimeStatus | null) {
  if (!runtime) return 'Checking';
  if (runtime.ready) return 'Local playback ready';
  if (!runtime.torrent_engine_configured) return 'Playback setup needed';
  if (!runtime.player_configured) return 'Player setup needed';
  return 'Setup needed';
}

function friendlyRuntimeMessage(message = '') {
  return message
    .replace(/rqbit/gi, 'the local engine')
    .replace(/MPV/gi, 'the local player')
    .replace(/command or full executable path/gi, 'setup path')
    .replace(/commands are configured/gi, 'is ready');
}

export default function DesktopShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [query, setQuery] = useState('');
  const [runtime, setRuntime] = useState<DesktopRuntimeStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDesktopRuntimeStatus(loadDesktopPlaybackSettings())
      .then((status) => {
        if (!cancelled && status) setRuntime(status);
      })
      .catch(() => {
        if (!cancelled) setRuntime(null);
      });
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  const runtimeReady = Boolean(runtime?.ready);
  const title = pageTitle(location.pathname);
  const statusLabel = useMemo(() => runtimeText(runtime), [runtime]);
  const currentRouteKey = routeKey(location.pathname);
  const routeMeta = useMemo(() => getRouteMeta(location.pathname), [location.pathname]);

  const submitBrowse = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    navigate(value ? `/search?q=${encodeURIComponent(value)}` : '/search');
  };

  const submitSources = () => {
    const value = query.trim();
    navigate(value ? `/nyaa?desktop=1&q=${encodeURIComponent(value)}` : '/nyaa?desktop=1');
  };

  return (
    <div className="desktop-shell min-h-screen overflow-hidden bg-[#030305] text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.20),transparent_34%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.08),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.035),transparent_32%)]" />

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[252px] border-r border-white/10 bg-black/50 shadow-2xl shadow-black/40 backdrop-blur-2xl lg:flex lg:flex-col">
        <Link to="/" className="group flex h-20 items-center gap-3 px-5">
          <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-primary text-white shadow-lg shadow-primary/25">
            <span className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.45),transparent_45%)]" />
            <HardDrive className="relative h-5 w-5" />
          </span>
          <span>
            <span className="block text-lg font-black tracking-tight text-white">StreamNyaa</span>
            <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">Desktop</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-bold transition-all ${
                isActive
                  ? 'bg-white text-black shadow-lg shadow-black/25'
                  : 'text-white/58 hover:bg-white/[0.075] hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="space-y-3 border-t border-white/10 p-4">
          <Link
            to="/local-player?desktop=1"
            className="block rounded-3xl border border-white/10 bg-white/[0.055] p-4 transition-colors hover:border-primary/45 hover:bg-primary/10"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/42">
                <span className={`h-2.5 w-2.5 rounded-full ${runtimeReady ? 'bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.8)]' : 'bg-amber-400'}`} />
                Playback
              </span>
              <MonitorPlay className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-2 text-sm font-black text-white">{statusLabel}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/42">
              {friendlyRuntimeMessage(runtime?.message || 'Checking local playback.')}
            </p>
          </Link>

          <div className="grid grid-cols-2 gap-2">
            <Link
              to={user ? '/dashboard' : '/login'}
              className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2.5 text-xs font-black text-white/70 hover:border-primary/35 hover:text-white"
            >
              <UserCircle className="h-4 w-4" />
              {user ? 'Account' : 'Sign in'}
            </Link>
            {isAdmin ? (
              <Link
                to="/admin"
                className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2.5 text-xs font-black text-white/70 hover:border-primary/35 hover:text-white"
              >
                <ShieldCheck className="h-4 w-4" />
                Admin
              </Link>
            ) : (
              <Link
                to="/desktop-settings"
                className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2.5 text-xs font-black text-white/70 hover:border-primary/35 hover:text-white"
              >
                <Settings className="h-4 w-4" />
                Setup
              </Link>
            )}
          </div>
        </div>
      </aside>

      <div className="relative min-h-screen lg:pl-[252px]">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#050507]/72 backdrop-blur-2xl">
          <div className="flex h-auto flex-col gap-3 px-4 py-3 lg:h-20 lg:flex-row lg:items-center lg:justify-between lg:px-7 lg:py-0">
            <div className="flex min-w-0 items-center gap-3">
              <span className="hidden h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.055] text-primary lg:flex">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <h1 className="truncate text-xl font-black text-white">{title}</h1>
                <p className="hidden text-xs font-semibold text-white/38 lg:block">Local-first anime source discovery and playback</p>
              </div>
            </div>

            <form onSubmit={submitBrowse} className="flex w-full max-w-3xl gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search anime, episode, source..."
                  className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.065] pl-11 pr-3 text-sm font-semibold text-white outline-none placeholder:text-white/32 focus:border-primary/70 focus:bg-white/[0.09]"
                />
              </div>
              <button
                type="submit"
                className="h-12 rounded-2xl border border-white/10 bg-white/[0.07] px-5 text-sm font-black text-white hover:bg-white/12"
              >
                Browse
              </button>
              <button
                type="button"
                onClick={submitSources}
                className="h-12 rounded-2xl bg-primary px-5 text-sm font-black text-white shadow-lg shadow-primary/20 hover:bg-primary/90"
              >
                Sources
              </button>
            </form>
          </div>

          <div className="flex gap-1 overflow-x-auto border-t border-white/10 px-3 py-2 lg:hidden">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-black ${
                  isActive ? 'bg-white text-black' : 'text-white/60'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </NavLink>
            ))}
          </div>

          {location.pathname !== '/' ? (
            <div className="hidden gap-2 overflow-x-auto border-t border-white/10 px-7 py-2 lg:flex">
              {quickItems.map(({ to, label, icon: Icon }) => (
                <Link
                  key={label}
                  to={to}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[11px] font-black text-white/55 hover:border-primary/40 hover:bg-primary/10 hover:text-white"
                >
                  <Icon className="h-3.5 w-3.5 text-primary" />
                  {label}
                </Link>
              ))}
            </div>
          ) : null}
        </header>

        <main className={`desktop-route-main desktop-page-${currentRouteKey} min-w-0 pb-10`}>
          {routeMeta ? (
            <section className="desktop-route-hero relative overflow-hidden">
              <img
                src={routeMeta.image}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-40"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,#030305_0%,rgba(3,3,5,0.88)_33%,rgba(3,3,5,0.42)_70%,rgba(3,3,5,0.82)_100%),linear-gradient(0deg,#030305_0%,rgba(3,3,5,0.58)_28%,rgba(3,3,5,0.05)_100%)]" />
              <div className="relative grid gap-6 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-7 lg:py-10">
                <div className="max-w-3xl">
                  <p className="text-[11px] font-black uppercase tracking-[0.26em] text-primary">{routeMeta.eyebrow}</p>
                  <h2 className="mt-3 max-w-3xl text-4xl font-black leading-[0.98] tracking-tight text-white md:text-6xl">
                    {routeMeta.title}
                  </h2>
                  <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-white/62 md:text-base">
                    {routeMeta.description}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    {routeMeta.actions.map(({ to, label, icon: Icon }, index) => (
                      <Link
                        key={`${label}-${to}`}
                        to={to}
                        className={`inline-flex h-10 items-center gap-2 rounded px-5 text-sm font-black transition-colors ${
                          index === 0
                            ? 'bg-white text-black hover:bg-white/88'
                            : 'border border-white/18 bg-black/35 text-white backdrop-blur hover:border-white/35'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </Link>
                    ))}
                  </div>
                </div>

                <aside className="hidden self-end rounded-2xl border border-white/10 bg-black/35 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl xl:block">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/45">
                      <Zap className="h-3.5 w-3.5 text-primary" />
                      Smart tools
                    </span>
                    <ArrowRight className="h-4 w-4 text-white/35" />
                  </div>
                  <div className="mt-4 grid gap-2">
                    {routeMeta.stats.map((item) => (
                      <div key={item} className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-black text-white/78">
                        {item}
                      </div>
                    ))}
                  </div>
                </aside>
              </div>
            </section>
          ) : null}
          <div className="desktop-outlet-wrap">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
