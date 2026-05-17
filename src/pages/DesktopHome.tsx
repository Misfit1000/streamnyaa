import { Link } from 'react-router-dom';
import { Download, History, MonitorPlay, Search, Settings } from 'lucide-react';
import Seo from '../components/Seo';
import { loadLocalPlaybackHistory } from '../lib/desktop';

export default function DesktopHome() {
  const recentSources = loadLocalPlaybackHistory().slice(0, 4);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      <Seo title="StreamNyaa Desktop" description="StreamNyaa desktop app home." canonicalPath="/" robots="noindex, nofollow" />

      <section className="rounded-3xl border border-border bg-[linear-gradient(135deg,rgba(225,29,72,0.12),rgba(255,255,255,0.04)),var(--glass)] p-6 md:p-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Desktop app</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-black tracking-tight text-foreground md:text-5xl">
          Search sources, choose an episode, play locally.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
          StreamNyaa Desktop keeps the web app focused on discovery while giving Windows users local playback and download controls.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/nyaa?desktop=1" className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground hover:bg-primary/90">
            <Download className="h-4 w-4" />
            Find sources
          </Link>
          <Link to="/local-player?desktop=1" className="inline-flex items-center gap-2 rounded-xl border border-border bg-background/55 px-5 py-3 text-sm font-black text-foreground hover:border-primary/40">
            <MonitorPlay className="h-4 w-4" />
            Open player
          </Link>
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="rounded-2xl border border-border bg-[var(--glass)] p-5">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <h2 className="font-black text-foreground">Recent local sources</h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {recentSources.length ? recentSources.map((source) => (
              <Link key={source.magnet} to="/local-player?desktop=1" className="rounded-xl border border-border bg-background/45 p-4 hover:border-primary/35">
                <p className="line-clamp-2 text-sm font-black text-foreground">{source.animeTitle || source.title}</p>
                <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">{source.title}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-muted-foreground">
                  {source.episode ? <span>Ep {source.episode}</span> : null}
                  {source.size ? <span>{source.size}</span> : null}
                  {source.seeders ? <span>{source.seeders} seeders</span> : null}
                </div>
              </Link>
            )) : (
              <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground md:col-span-2">
                No recent sources yet. Search sources to start building your local playback history.
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-3">
          {[
            { to: '/search', label: 'Browse anime', detail: 'Find title pages and episode info.', icon: Search },
            { to: '/desktop-settings', label: 'Desktop settings', detail: 'Check rqbit, MPV, and cache.', icon: Settings },
            { to: '/local-player?desktop=1', label: 'Resume player', detail: 'Continue with recent sources.', icon: MonitorPlay },
          ].map(({ to, label, detail, icon: Icon }) => (
            <Link key={label} to={to} className="flex items-center gap-3 rounded-2xl border border-border bg-[var(--glass)] p-4 hover:border-primary/35">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-black text-foreground">{label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
              </span>
            </Link>
          ))}
        </aside>
      </div>
    </div>
  );
}
