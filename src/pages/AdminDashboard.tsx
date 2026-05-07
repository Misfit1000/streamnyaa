import { useQuery } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Database, Shield, Sparkles, UserPlus, WandSparkles } from 'lucide-react';
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
        <>
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

          {actionMessage ? <div className="mt-6 rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-sm font-semibold text-green-400">{actionMessage}</div> : null}
          {actionError ? <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-semibold text-red-400">{actionError}</div> : null}

          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-[var(--glass)] p-5">
              <WandSparkles className="mb-4 h-6 w-6 text-primary" />
              <h2 className="text-xl font-black">Generate Gemini article</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Run the server-side Gemini blog generator now. Use one article normally, or two only when you want an extra fast-moving story.</p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button onClick={() => triggerGemini('one')} disabled={Boolean(busyAction)} className="rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
                  {busyAction === 'generate' ? 'Generating...' : 'Generate one article'}
                </button>
                <button onClick={() => triggerGemini('both')} disabled={Boolean(busyAction)} className="rounded-xl border border-border bg-secondary/50 px-4 py-3 text-sm font-black text-foreground transition-colors hover:border-primary/40 disabled:opacity-60">
                  {busyAction === 'generate-both' ? 'Generating...' : 'Generate two'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-[var(--glass)] p-5">
              <UserPlus className="mb-4 h-6 w-6 text-primary" />
              <h2 className="text-xl font-black">Admin access</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Add another signed-up user as an admin by email.</p>
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
                {[...(data?.admins?.env || []), ...(data?.admins?.stored || []).map((admin: any) => admin.email)]
                  .filter(Boolean)
                  .filter((email, index, list) => list.indexOf(email) === index)
                  .map((email) => (
                    <div key={email} className="rounded-lg border border-border bg-background/50 px-3 py-2 text-sm font-semibold text-foreground">{email}</div>
                  ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
