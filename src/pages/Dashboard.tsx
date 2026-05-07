import { Link, Navigate } from 'react-router-dom';
import { BookOpen, CalendarDays, Compass, Download, LayoutDashboard, LogOut, Newspaper, Shield, UserCircle } from 'lucide-react';
import Seo from '../components/Seo';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user, isAdmin, loading, signOut } = useAuth();

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">Loading dashboard...</div>;
  }

  if (!user) return <Navigate to="/login" replace />;

  const joinedDate = user.created_at
    ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(user.created_at))
    : 'Recently';

  return (
    <div className="container mx-auto px-4 md:px-10 py-10">
      <Seo title="Dashboard | StreamNyaa" description="Manage your StreamNyaa account dashboard." canonicalPath="/dashboard" />
      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-border bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.18),transparent_30%),var(--glass)] p-6 md:p-8">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LayoutDashboard className="h-6 w-6" />
          </div>
          <p className="mb-3 inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-primary">
            {isAdmin ? 'Admin account' : 'User account'}
          </p>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight">Dashboard</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">Signed in as <span className="font-bold text-foreground">{user.email}</span>. Your StreamNyaa account is ready for saved lists, quick anime tools, and admin access when enabled.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/my-list" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition-colors hover:bg-primary/90">
              <BookOpen className="h-4 w-4" />
              Open my list
            </Link>
            {isAdmin ? (
              <Link to="/admin" className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-black text-primary transition-colors hover:bg-primary/15">
                <Shield className="h-4 w-4" />
                Admin tools
              </Link>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-[var(--glass)] p-6">
          <UserCircle className="mb-4 h-8 w-8 text-primary" />
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Account overview</p>
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
              <span className="text-sm text-muted-foreground">Status</span>
              <span className="rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-xs font-black text-green-400">Active</span>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
              <span className="text-sm text-muted-foreground">Access</span>
              <span className="text-sm font-bold text-foreground">{isAdmin ? 'User + admin' : 'User'}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">Joined</span>
              <span className="text-sm font-bold text-foreground">{joinedDate}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/my-list" className="rounded-2xl border border-border bg-[var(--glass)] p-5 transition-colors hover:border-primary/40">
          <BookOpen className="mb-4 h-6 w-6 text-primary" />
          <h2 className="font-black text-foreground">My List</h2>
          <p className="mt-2 text-sm text-muted-foreground">Open your saved anime and manga list.</p>
        </Link>
        <Link to="/schedule" className="rounded-2xl border border-border bg-[var(--glass)] p-5 transition-colors hover:border-primary/40">
          <CalendarDays className="mb-4 h-6 w-6 text-primary" />
          <h2 className="font-black text-foreground">Schedule</h2>
          <p className="mt-2 text-sm text-muted-foreground">Check airing anime and upcoming episodes.</p>
        </Link>
        <Link to="/nyaa" className="rounded-2xl border border-border bg-[var(--glass)] p-5 transition-colors hover:border-primary/40">
          <Download className="mb-4 h-6 w-6 text-primary" />
          <h2 className="font-black text-foreground">Downloads</h2>
          <p className="mt-2 text-sm text-muted-foreground">Search torrent sources with cleaner filters.</p>
        </Link>
        <Link to="/blog" className="rounded-2xl border border-border bg-[var(--glass)] p-5 transition-colors hover:border-primary/40">
          <Newspaper className="mb-4 h-6 w-6 text-primary" />
          <h2 className="font-black text-foreground">Blog</h2>
          <p className="mt-2 text-sm text-muted-foreground">Read current anime articles and updates.</p>
        </Link>
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-3">
        {isAdmin ? (
          <Link to="/admin" className="rounded-2xl border border-primary/30 bg-primary/10 p-5 transition-colors hover:bg-primary/15">
            <Shield className="mb-4 h-6 w-6 text-primary" />
            <h2 className="font-black text-foreground">Admin dashboard</h2>
            <p className="mt-2 text-sm text-muted-foreground">Generate articles, review storage, and manage admins.</p>
          </Link>
        ) : (
          <div className="rounded-2xl border border-border bg-[var(--glass)] p-5">
            <Shield className="mb-4 h-6 w-6 text-muted-foreground" />
            <h2 className="font-black text-foreground">User account</h2>
            <p className="mt-2 text-sm text-muted-foreground">Your account is active.</p>
          </div>
        )}
        <Link to="/anime/popular" className="rounded-2xl border border-border bg-[var(--glass)] p-5 transition-colors hover:border-primary/40">
          <Compass className="mb-4 h-6 w-6 text-primary" />
          <h2 className="font-black text-foreground">Explore anime</h2>
          <p className="mt-2 text-sm text-muted-foreground">Jump into popular titles and discovery pages.</p>
        </Link>
        <button onClick={signOut} className="rounded-2xl border border-border bg-[var(--glass)] p-5 text-left transition-colors hover:border-primary/40">
          <LogOut className="mb-4 h-6 w-6 text-primary" />
          <h2 className="font-black text-foreground">Sign out</h2>
          <p className="mt-2 text-sm text-muted-foreground">End this browser session.</p>
        </button>
      </section>
    </div>
  );
}
