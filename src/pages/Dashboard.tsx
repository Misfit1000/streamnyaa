import { Link, Navigate } from 'react-router-dom';
import { BookOpen, LayoutDashboard, LogOut, Shield } from 'lucide-react';
import Seo from '../components/Seo';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user, isAdmin, loading, signOut } = useAuth();

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">Loading dashboard...</div>;
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="container mx-auto px-4 md:px-10 py-10">
      <Seo title="Dashboard | StreamNyaa" description="Manage your StreamNyaa account dashboard." canonicalPath="/dashboard" />
      <section className="max-w-4xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <LayoutDashboard className="h-6 w-6" />
        </div>
        <h1 className="text-3xl md:text-5xl font-black tracking-tight">Dashboard</h1>
        <p className="mt-3 text-muted-foreground">Signed in as {user.email}</p>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <Link to="/my-list" className="rounded-2xl border border-border bg-[var(--glass)] p-5 transition-colors hover:border-primary/40">
          <BookOpen className="mb-4 h-6 w-6 text-primary" />
          <h2 className="font-black text-foreground">My List</h2>
          <p className="mt-2 text-sm text-muted-foreground">Open your saved anime and manga list.</p>
        </Link>
        {isAdmin ? (
          <Link to="/admin" className="rounded-2xl border border-primary/30 bg-primary/10 p-5 transition-colors hover:bg-primary/15">
            <Shield className="mb-4 h-6 w-6 text-primary" />
            <h2 className="font-black text-foreground">Admin dashboard</h2>
            <p className="mt-2 text-sm text-muted-foreground">Review blog storage and admin-only status.</p>
          </Link>
        ) : (
          <div className="rounded-2xl border border-border bg-[var(--glass)] p-5">
            <Shield className="mb-4 h-6 w-6 text-muted-foreground" />
            <h2 className="font-black text-foreground">User account</h2>
            <p className="mt-2 text-sm text-muted-foreground">Your account is active.</p>
          </div>
        )}
        <button onClick={signOut} className="rounded-2xl border border-border bg-[var(--glass)] p-5 text-left transition-colors hover:border-primary/40">
          <LogOut className="mb-4 h-6 w-6 text-primary" />
          <h2 className="font-black text-foreground">Sign out</h2>
          <p className="mt-2 text-sm text-muted-foreground">End this browser session.</p>
        </button>
      </section>
    </div>
  );
}
