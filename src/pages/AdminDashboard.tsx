import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import { Database, Shield, Sparkles } from 'lucide-react';
import Seo from '../components/Seo';
import { useAuth } from '../context/AuthContext';

export default function AdminDashboard() {
  const { session, user, isAdmin, loading } = useAuth();

  const summary = useQuery({
    queryKey: ['admin-summary'],
    enabled: Boolean(session?.access_token && isAdmin),
    queryFn: async () => {
      const response = await fetch('/api/admin/summary', {
        headers: { Authorization: `Bearer ${session!.access_token}` },
      });
      if (!response.ok) throw new Error('Admin summary could not load.');
      return response.json();
    },
  });

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">Checking admin access...</div>;
  if (!user) return <Navigate to="/login" replace />;

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 md:px-10 py-12">
        <Seo title="Admin Access Required | StreamNyaa" description="Admin access is required." canonicalPath="/admin" />
        <div className="max-w-xl rounded-2xl border border-border bg-[var(--glass)] p-6">
          <Shield className="mb-4 h-8 w-8 text-primary" />
          <h1 className="text-2xl font-black">Admin access required</h1>
          <p className="mt-3 text-sm text-muted-foreground">Your account is signed in, but it is not listed as a StreamNyaa admin.</p>
          <Link to="/dashboard" className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Back to dashboard</Link>
        </div>
      </div>
    );
  }

  const data = summary.data;

  return (
    <div className="container mx-auto px-4 md:px-10 py-10">
      <Seo title="Admin Dashboard | StreamNyaa" description="StreamNyaa admin dashboard." canonicalPath="/admin" />
      <section className="max-w-4xl">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Shield className="h-6 w-6" />
        </div>
        <h1 className="text-3xl md:text-5xl font-black tracking-tight">Admin dashboard</h1>
        <p className="mt-3 text-muted-foreground">Admin: {user.email}</p>
      </section>

      {summary.isLoading ? (
        <div className="mt-8 rounded-2xl border border-border bg-[var(--glass)] p-6 text-muted-foreground">Loading admin summary...</div>
      ) : summary.error ? (
        <div className="mt-8 rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-red-400">Admin summary could not load.</div>
      ) : (
        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-[var(--glass)] p-5">
            <Database className="mb-4 h-6 w-6 text-primary" />
            <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Supabase articles</p>
            <p className="mt-2 text-3xl font-black">{data?.generatedBlogArticles ?? 'Unknown'}</p>
          </div>
          <div className="rounded-2xl border border-border bg-[var(--glass)] p-5">
            <Sparkles className="mb-4 h-6 w-6 text-primary" />
            <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Gemini cron</p>
            <p className="mt-2 text-sm font-bold text-foreground">{data?.cronSchedule}</p>
          </div>
          <div className="rounded-2xl border border-border bg-[var(--glass)] p-5">
            <Shield className="mb-4 h-6 w-6 text-primary" />
            <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Storage</p>
            <p className="mt-2 text-sm text-muted-foreground">Supabase: {data?.storage?.supabaseConfigured ? 'Connected' : 'Missing'}</p>
            <p className="mt-1 text-sm text-muted-foreground">GitHub fallback: {data?.storage?.githubFallbackConfigured ? 'Connected' : 'Missing'}</p>
          </div>
        </section>
      )}
    </div>
  );
}
