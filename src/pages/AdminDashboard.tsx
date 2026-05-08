import { useQuery } from '@tanstack/react-query';
import { FormEvent, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Crown,
  Database,
  FileText,
  Gauge,
  KeyRound,
  Loader2,
  Lock,
  Newspaper,
  RefreshCw,
  Shield,
  Sparkles,
  UserPlus,
  Users,
  WandSparkles,
} from 'lucide-react';
import Seo from '../components/Seo';
import { useAuth } from '../context/AuthContext';

function statusTone(ok?: boolean) {
  return ok
    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
    : 'border-amber-500/20 bg-amber-500/10 text-amber-300';
}

function MetricCard({ icon: Icon, label, value, detail, tone = 'primary' }: {
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
      <div className="container mx-auto px-4 md:px-10 py-12">
        <Seo title="Admin Access Required | StreamNyaa" description="Admin access is required." canonicalPath="/admin" />
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-[linear-gradient(135deg,rgba(225,29,72,0.14),rgba(14,165,233,0.08)),var(--glass)] p-6">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-black">Admin access required</h1>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">Your account is signed in, but it is not listed as a StreamNyaa admin.</p>
          <Link to="/dashboard" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground">
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

  const supabaseReady = Boolean(data?.storage?.supabaseConfigured);
  const githubReady = Boolean(data?.storage?.githubFallbackConfigured);
  const tableReady = Boolean(data?.admins?.tableReady);
  const articleCount = data?.generatedBlogArticles ?? 'Unknown';

  return (
    <div className="container mx-auto px-4 md:px-10 py-8 md:py-10">
      <Seo title="Admin Dashboard | StreamNyaa" description="StreamNyaa admin dashboard." canonicalPath="/admin" />

      <section className="overflow-hidden rounded-[28px] border border-primary/20 bg-[linear-gradient(135deg,rgba(225,29,72,0.24),rgba(14,165,233,0.10)_46%,rgba(16,185,129,0.11)),var(--glass)] p-6 md:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-background/45 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-primary backdrop-blur">
              <Crown className="h-3.5 w-3.5" />
              Admin control room
            </div>
            <h1 className="max-w-3xl text-3xl font-black tracking-tight md:text-5xl">StreamNyaa operations</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
              Signed in as <span className="font-bold text-foreground">{user.email}</span>. Manage article generation, storage health, admin access, and publishing signals from one focused screen.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={() => triggerGemini('one')} disabled={Boolean(busyAction)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90 disabled:opacity-60">
                {busyAction === 'generate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate article
              </button>
              <button onClick={() => summary.refetch()} className="inline-flex items-center gap-2 rounded-xl border border-border bg-background/55 px-4 py-3 text-sm font-black text-foreground backdrop-blur transition-colors hover:border-primary/40">
                <RefreshCw className={`h-4 w-4 ${summary.isFetching ? 'animate-spin' : ''}`} />
                Refresh status
              </button>
              <Link to="/blog" className="inline-flex items-center gap-2 rounded-xl border border-border bg-background/55 px-4 py-3 text-sm font-black text-foreground backdrop-blur transition-colors hover:border-primary/40">
                <Newspaper className="h-4 w-4" />
                View blog
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-background/45 p-5 backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">System state</p>
                <p className="mt-2 text-2xl font-black text-foreground">{summary.isLoading ? 'Checking' : 'Online'}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300">
                <Gauge className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-background/50 p-3">
                <p className="text-xs text-muted-foreground">Supabase</p>
                <p className="mt-1 text-sm font-black text-foreground">{supabaseReady ? 'Connected' : 'Missing'}</p>
              </div>
              <div className="rounded-xl border border-border bg-background/50 p-3">
                <p className="text-xs text-muted-foreground">Admins</p>
                <p className="mt-1 text-sm font-black text-foreground">{adminEmails.length || '-'}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {summary.isLoading ? (
        <div className="mt-8 rounded-2xl border border-border bg-[var(--glass)] p-6 text-muted-foreground">
          <div className="flex items-center gap-3"><Loader2 className="h-5 w-5 animate-spin text-primary" />Loading admin summary...</div>
        </div>
      ) : summary.error ? (
        <div className="mt-8 rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-red-400">Admin summary could not load.</div>
      ) : (
        <>
          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={Database} label="Articles" value={articleCount} detail="Generated blog posts in storage" />
            <MetricCard icon={Users} label="Admins" value={adminEmails.length} detail="Approved control-room users" tone="sky" />
            <MetricCard icon={Clock} label="Gemini cron" value="Daily" detail={data?.cronSchedule || 'Scheduled generation'} tone="amber" />
            <MetricCard icon={Shield} label="Storage" value={supabaseReady ? 'Ready' : 'Check'} detail={githubReady ? 'Fallback configured' : 'Fallback not configured'} tone="green" />
          </section>

          {actionMessage ? <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-300">{actionMessage}</div> : null}
          {actionError ? <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-semibold text-red-400">{actionError}</div> : null}

          <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
            <div className="space-y-6">
              <div className="rounded-2xl border border-border bg-[var(--glass)] p-5 md:p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                      <WandSparkles className="h-5 w-5" />
                    </div>
                    <h2 className="text-2xl font-black tracking-tight">Article generator</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">Create fresh server-side blog articles and archive them to storage.</p>
                  </div>
                  <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    Gemini
                  </span>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button onClick={() => triggerGemini('one')} disabled={Boolean(busyAction)} className="group rounded-2xl border border-primary/25 bg-primary/10 p-5 text-left transition-colors hover:bg-primary/15 disabled:opacity-60">
                    <div className="flex items-center justify-between gap-3">
                      <Sparkles className="h-6 w-6 text-primary" />
                      {busyAction === 'generate' ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-1" />}
                    </div>
                    <h3 className="mt-4 font-black text-foreground">Generate one article</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">Best for the daily article queue.</p>
                  </button>
                  <button onClick={() => triggerGemini('both')} disabled={Boolean(busyAction)} className="group rounded-2xl border border-border bg-background/45 p-5 text-left transition-colors hover:border-primary/40 disabled:opacity-60">
                    <div className="flex items-center justify-between gap-3">
                      <FileText className="h-6 w-6 text-sky-300" />
                      {busyAction === 'generate-both' ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />}
                    </div>
                    <h3 className="mt-4 font-black text-foreground">Generate two articles</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">Use for a fast second topic.</p>
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-[var(--glass)] p-5 md:p-6">
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight">Storage health</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">Article persistence and admin access checks.</p>
                  </div>
                  <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-black ${statusTone(supabaseReady && tableReady)}`}>
                    {supabaseReady && tableReady ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    {supabaseReady && tableReady ? 'Healthy' : 'Needs attention'}
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-border bg-background/45 p-4">
                    <p className="flex items-center gap-2 text-sm font-black text-foreground">
                      {supabaseReady ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <AlertTriangle className="h-4 w-4 text-amber-300" />}
                      Supabase
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">{supabaseReady ? 'Connected' : 'Missing'}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-background/45 p-4">
                    <p className="flex items-center gap-2 text-sm font-black text-foreground">
                      {githubReady ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <AlertTriangle className="h-4 w-4 text-amber-300" />}
                      GitHub fallback
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">{githubReady ? 'Connected' : 'Missing'}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-background/45 p-4">
                    <p className="flex items-center gap-2 text-sm font-black text-foreground">
                      {tableReady ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <AlertTriangle className="h-4 w-4 text-amber-300" />}
                      Admin table
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">{tableReady ? 'Ready' : 'Setup needed'}</p>
                  </div>
                </div>
                {!tableReady ? (
                  <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-300">{data?.admins?.setupMessage}</p>
                ) : null}
              </div>
            </div>

            <aside className="space-y-6">
              <div className="rounded-2xl border border-border bg-[var(--glass)] p-5">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-300">
                      <UserPlus className="h-5 w-5" />
                    </div>
                    <h2 className="text-xl font-black">Admin access</h2>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs font-black text-muted-foreground">
                    <KeyRound className="h-3.5 w-3.5" />
                    {adminEmails.length}
                  </span>
                </div>
                <form onSubmit={addAdmin} className="space-y-3">
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(event) => setAdminEmail(event.target.value)}
                    placeholder="user@example.com"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
                    required
                  />
                  <button disabled={Boolean(busyAction) || !tableReady} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
                    {busyAction === 'admin' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                    {busyAction === 'admin' ? 'Adding admin...' : 'Add admin'}
                  </button>
                </form>
              </div>

              <div className="rounded-2xl border border-border bg-[var(--glass)] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-black">Current admins</h2>
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-2">
                  {adminEmails.length ? adminEmails.map((email) => (
                    <div key={email} className="flex items-center gap-3 rounded-xl border border-border bg-background/45 p-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Shield className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-foreground">{email}</p>
                        <p className="text-xs text-muted-foreground">Admin access</p>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-xl border border-dashed border-border bg-background/35 p-4 text-sm text-muted-foreground">No admin emails loaded.</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-secondary/20 p-5">
                <div className="flex items-center gap-2 text-sm font-black text-foreground">
                  <Clock className="h-4 w-4 text-primary" />
                  Scheduled publishing
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{data?.cronSchedule || 'Daily generation is scheduled.'}</p>
              </div>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}
