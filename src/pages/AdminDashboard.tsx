import { useQuery } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock, Crown, Database, RefreshCw, Shield, Sparkles, UserPlus, Users, WandSparkles } from 'lucide-react';
import Seo from '../components/Seo';
import { useAuth } from '../context/AuthContext';

export default function AdminDashboard() {
  const { session, user, isAdmin, loading } = useAuth();
  const [adminEmail, setAdminEmail] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyAction, setBusyAction] = useState<'generate' | 'generate-both' | 'admin' | ''>('');

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

  const triggerGemini = async (mode: 'one' | 'both') => {
    if (!session?.access_token) return;
    setActionError('');
    setActionMessage('');
    setBusyAction(mode === 'both' ? 'generate-both' : 'generate');

    try {
      const response = await fetch('/api/admin/generate-blog', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Generation failed.');
      setActionMessage(`Generated ${data.generated?.length || 0} article${data.generated?.length === 1 ? '' : 's'}.`);
      summary.refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Generation failed.');
    } finally {
      setBusyAction('');
    }
  };

  const addAdmin = async (event: FormEvent) => {
    event.preventDefault();
    if (!session?.access_token) return;
    setActionError('');
    setActionMessage('');
    setBusyAction('admin');

    try {
      const response = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: adminEmail }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not add admin.');
      setAdminEmail('');
      setActionMessage(`${data.email} can now access the admin dashboard after signing in.`);
      summary.refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not add admin.');
    } finally {
      setBusyAction('');
    }
  };

  const adminEmails = data
    ? [...(data.admins?.env || []), ...(data.admins?.stored || []).map((admin: any) => admin.email)]
      .filter(Boolean)
      .filter((email, index, list) => list.indexOf(email) === index)
    : [];

  return (
    <div className="container mx-auto px-4 md:px-10 py-10">
      <Seo title="Admin Dashboard | StreamNyaa" description="StreamNyaa admin dashboard." canonicalPath="/admin" />
      <section className="rounded-2xl border border-primary/20 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_32%),var(--glass)] p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Crown className="h-6 w-6" />
            </div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-primary">
              <Shield className="h-3.5 w-3.5" />
              Admin control room
            </p>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight">Admin dashboard</h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">Signed in as <span className="font-bold text-foreground">{user.email}</span>. Generate blog articles, check storage, and manage admin access from one place.</p>
          </div>
          <button onClick={() => summary.refetch()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background/70 px-4 py-3 text-sm font-black text-foreground transition-colors hover:border-primary/40">
            <RefreshCw className={`h-4 w-4 ${summary.isFetching ? 'animate-spin' : ''}`} />
            Refresh status
          </button>
        </div>
      </section>

      {summary.isLoading ? (
        <div className="mt-8 rounded-2xl border border-border bg-[var(--glass)] p-6 text-muted-foreground">Loading admin summary...</div>
      ) : summary.error ? (
        <div className="mt-8 rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-red-400">Admin summary could not load.</div>
      ) : (
        <>
          <section className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-[var(--glass)] p-5 transition-colors hover:border-primary/40">
              <Database className="mb-4 h-6 w-6 text-primary" />
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Supabase articles</p>
              <p className="mt-2 text-3xl font-black">{data?.generatedBlogArticles ?? 'Unknown'}</p>
              <p className="mt-2 text-sm text-muted-foreground">Stored generated posts</p>
            </div>
            <div className="rounded-2xl border border-border bg-[var(--glass)] p-5 transition-colors hover:border-primary/40">
              <Sparkles className="mb-4 h-6 w-6 text-primary" />
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Gemini cron</p>
              <p className="mt-2 text-sm font-bold leading-6 text-foreground">{data?.cronSchedule}</p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-xs font-black text-green-400">
                <Clock className="h-3.5 w-3.5" />
                Scheduled
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-[var(--glass)] p-5 transition-colors hover:border-primary/40">
              <Shield className="mb-4 h-6 w-6 text-primary" />
              <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Storage</p>
              <div className="mt-3 space-y-2">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  {data?.storage?.supabaseConfigured ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <AlertTriangle className="h-4 w-4 text-yellow-300" />}
                  Supabase: {data?.storage?.supabaseConfigured ? 'Connected' : 'Missing'}
                </p>
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  {data?.storage?.githubFallbackConfigured ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <AlertTriangle className="h-4 w-4 text-yellow-300" />}
                  GitHub fallback: {data?.storage?.githubFallbackConfigured ? 'Connected' : 'Missing'}
                </p>
              </div>
            </div>
          </section>

          {actionMessage ? <div className="mt-6 rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-sm font-semibold text-green-400">{actionMessage}</div> : null}
          {actionError ? <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-semibold text-red-400">{actionError}</div> : null}

          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-[var(--glass)] p-5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <WandSparkles className="mb-4 h-6 w-6 text-primary" />
                  <h2 className="text-xl font-black">Generate Gemini article</h2>
                </div>
                <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-black text-primary">Server-side</span>
              </div>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">Run the blog generator now without waiting for the daily job. Use one article normally, or two only when a second fast-moving anime topic is worth covering.</p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button onClick={() => triggerGemini('one')} disabled={Boolean(busyAction)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90 disabled:opacity-60">
                  <Sparkles className="h-4 w-4" />
                  {busyAction === 'generate' ? 'Generating...' : 'Generate one article'}
                </button>
                <button onClick={() => triggerGemini('both')} disabled={Boolean(busyAction)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm font-black text-foreground transition-colors hover:border-primary/40 disabled:opacity-60">
                  <WandSparkles className="h-4 w-4" />
                  {busyAction === 'generate-both' ? 'Generating...' : 'Generate two'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-[var(--glass)] p-5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <UserPlus className="mb-4 h-6 w-6 text-primary" />
                  <h2 className="text-xl font-black">Admin access</h2>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs font-black text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {adminEmails.length} admins
                </span>
              </div>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">Add another signed-up user as an admin by email. They will see admin tools after signing in.</p>
              {!data?.admins?.tableReady ? (
                <p className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-yellow-300">{data?.admins?.setupMessage}</p>
              ) : null}
              <form onSubmit={addAdmin} className="mt-5 flex flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(event) => setAdminEmail(event.target.value)}
                  placeholder="user@example.com"
                  className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
                  required
                />
                <button disabled={Boolean(busyAction) || !data?.admins?.tableReady} className="rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
                  {busyAction === 'admin' ? 'Adding...' : 'Add admin'}
                </button>
              </form>
              <div className="mt-5 space-y-2">
                <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Current admins</p>
                <div className="flex flex-wrap gap-2">
                  {adminEmails.map((email) => (
                    <div key={email} className="rounded-full border border-border bg-background/60 px-3 py-2 text-sm font-semibold text-foreground">{email}</div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
