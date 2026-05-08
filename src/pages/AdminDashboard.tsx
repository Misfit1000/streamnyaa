import { useQuery } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Archive,
  CheckCircle2,
  Clock,
  Crown,
  FileText,
  KeyRound,
  Loader2,
  Lock,
  Newspaper,
  RefreshCw,
  Shield,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';
import Seo from '../components/Seo';
import { useAuth } from '../context/AuthContext';

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/70 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-black text-foreground">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function HealthRow({ title, ready, detail }: { title: string; ready: boolean; detail: string }) {
  return (
    <div className="grid grid-cols-[24px_1fr_auto] items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      {ready ? <CheckCircle2 className="h-5 w-5 text-emerald-300" /> : <AlertTriangle className="h-5 w-5 text-amber-300" />}
      <span className="min-w-0">
        <span className="block text-sm font-black text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
      </span>
      <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${ready ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/20 bg-amber-500/10 text-amber-300'}`}>
        {ready ? 'Ready' : 'Check'}
      </span>
    </div>
  );
}

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

  const data = summary.data;
  const adminEmails = useMemo(() => (
    data
      ? [...(data.admins?.env || []), ...(data.admins?.stored || []).map((admin: any) => admin.email)]
        .filter(Boolean)
        .filter((email, index, list) => list.indexOf(email) === index)
      : []
  ), [data]);

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">Checking admin access...</div>;
  if (!user) return <Navigate to="/login/admin" replace />;

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-12 md:px-10">
        <Seo title="Admin Access Required | StreamNyaa" description="Admin access is required." canonicalPath="/admin" />
        <div className="mx-auto max-w-xl rounded-lg border border-border bg-[var(--glass)] p-6">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-black">Admin access required</h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">Your account is signed in, but it is not listed as a StreamNyaa admin.</p>
          <Link to="/dashboard" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-black text-primary-foreground">
            Back to dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

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
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Generation failed.');
      setActionMessage(`Generated ${result.generated?.length || 0} article${result.generated?.length === 1 ? '' : 's'}.`);
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
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not add admin.');
      setAdminEmail('');
      setActionMessage(`${result.email} can now access the admin dashboard after signing in.`);
      summary.refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not add admin.');
    } finally {
      setBusyAction('');
    }
  };

  const archiveReady = Boolean(data?.archive?.supabaseConfigured);
  const backupReady = Boolean(data?.archive?.githubFallbackConfigured);
  const tableReady = Boolean(data?.admins?.tableReady);
  const articleCount = data?.generatedBlogArticles ?? 'Unknown';

  return (
    <div className="container mx-auto px-4 py-8 md:px-10">
      <Seo title="Admin Dashboard | StreamNyaa" description="StreamNyaa admin dashboard." canonicalPath="/admin" />

      <header className="border-b border-border pb-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Admin console</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">Operations dashboard</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              Signed in as <span className="font-bold text-foreground">{user.email}</span>. Manage publishing, admin access, and archive health from one focused screen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => triggerGemini('one')} disabled={Boolean(busyAction)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {busyAction === 'generate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate
            </button>
            <button onClick={() => summary.refetch()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-black text-foreground hover:border-primary/45">
              <RefreshCw className={`h-4 w-4 ${summary.isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link to="/blog" className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-black text-foreground hover:border-primary/45">
              <Newspaper className="h-4 w-4" />
              Blog
            </Link>
          </div>
        </div>
      </header>

      {summary.isLoading ? (
        <div className="mt-8 rounded-lg border border-border bg-[var(--glass)] p-6 text-muted-foreground">
          <div className="flex items-center gap-3"><Loader2 className="h-5 w-5 animate-spin text-primary" />Loading admin summary...</div>
        </div>
      ) : summary.error ? (
        <div className="mt-8 rounded-lg border border-red-500/20 bg-red-500/10 p-6 text-red-400">Admin summary could not load.</div>
      ) : (
        <>
          <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Articles" value={articleCount} detail="Generated posts in archive" />
            <Metric label="Admins" value={adminEmails.length} detail="Approved admin accounts" />
            <Metric label="Schedule" value="Daily" detail={data?.cronSchedule || 'Scheduled generation'} />
            <Metric label="Archive" value={archiveReady ? 'Ready' : 'Check'} detail={backupReady ? 'Backup path configured' : 'Backup path missing'} />
          </section>

          {actionMessage ? <div className="mt-6 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-300">{actionMessage}</div> : null}
          {actionError ? <div className="mt-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm font-semibold text-red-400">{actionError}</div> : null}

          <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
            <div className="space-y-6">
              <div className="rounded-lg border border-border bg-[var(--glass)] p-5">
                <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-xl font-black tracking-tight">Article publishing</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Generate and archive new editorial posts.</p>
                  </div>
                  <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-black text-primary">
                    <Crown className="h-3.5 w-3.5" />
                    Admin only
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <button onClick={() => triggerGemini('one')} disabled={Boolean(busyAction)} className="grid grid-cols-[40px_1fr_auto] items-center gap-3 rounded-lg border border-primary/25 bg-primary/10 p-4 text-left transition-colors hover:bg-primary/15 disabled:opacity-60">
                    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 text-primary">
                      {busyAction === 'generate' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                    </span>
                    <span>
                      <span className="block text-sm font-black text-foreground">Generate one article</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">Use for the normal daily queue.</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-primary" />
                  </button>
                  <button onClick={() => triggerGemini('both')} disabled={Boolean(busyAction)} className="grid grid-cols-[40px_1fr_auto] items-center gap-3 rounded-lg border border-border bg-background/45 p-4 text-left transition-colors hover:border-primary/45 disabled:opacity-60">
                    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-primary">
                      {busyAction === 'generate-both' ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
                    </span>
                    <span>
                      <span className="block text-sm font-black text-foreground">Generate two articles</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">Use when a second topic is needed.</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-[var(--glass)] p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-black tracking-tight">System health</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Archive, backup, and admin-table status.</p>
                  </div>
                  <Activity className="h-5 w-5 text-primary" />
                </div>
                <div className="overflow-hidden rounded-lg border border-border bg-background/35">
                  <HealthRow title="Article archive" ready={archiveReady} detail={archiveReady ? 'Database archive is configured.' : 'Database archive is missing.'} />
                  <HealthRow title="Backup path" ready={backupReady} detail={backupReady ? 'GitHub fallback is configured.' : 'GitHub fallback is not configured.'} />
                  <HealthRow title="Admin table" ready={tableReady} detail={tableReady ? 'Admin access table is ready.' : 'Admin table setup is needed.'} />
                </div>
                {!tableReady ? (
                  <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-300">{data?.admins?.setupMessage}</p>
                ) : null}
              </div>
            </div>

            <aside className="space-y-6">
              <div className="rounded-lg border border-border bg-[var(--glass)] p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black">Admin access</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Grant dashboard access by email.</p>
                  </div>
                  <KeyRound className="h-5 w-5 text-primary" />
                </div>
                <form onSubmit={addAdmin} className="space-y-3">
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(event) => setAdminEmail(event.target.value)}
                    placeholder="user@example.com"
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
                    required
                  />
                  <button disabled={Boolean(busyAction) || !tableReady} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
                    {busyAction === 'admin' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                    {busyAction === 'admin' ? 'Adding admin...' : 'Add admin'}
                  </button>
                </form>
              </div>

              <div className="rounded-lg border border-border bg-[var(--glass)] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-black">Current admins</h2>
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {adminEmails.length ? adminEmails.map((email) => (
                    <div key={email} className="grid grid-cols-[36px_1fr] items-center gap-3 bg-background/45 p-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Shield className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black text-foreground">{email}</span>
                        <span className="text-xs text-muted-foreground">Admin access</span>
                      </span>
                    </div>
                  )) : (
                    <div className="bg-background/35 p-4 text-sm text-muted-foreground">No admin emails loaded.</div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-secondary/20 p-5">
                <div className="flex items-center gap-2 text-sm font-black text-foreground">
                  <Clock className="h-4 w-4 text-primary" />
                  Scheduled publishing
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{data?.cronSchedule || 'Daily generation is scheduled.'}</p>
              </div>

              <div className="rounded-lg border border-border bg-secondary/20 p-5">
                <div className="flex items-center gap-2 text-sm font-black text-foreground">
                  <Archive className="h-4 w-4 text-primary" />
                  Archive note
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">New generated posts are saved to the configured archive and appear on the blog after refresh.</p>
              </div>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}
