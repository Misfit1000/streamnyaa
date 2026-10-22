import AdminPublicationReview from '../components/AdminPublicationReview';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Archive,
  CheckCircle2,
  Clock,
  Crown,
  Database,
  ExternalLink,
  FileText,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  MailCheck,
  Newspaper,
  RefreshCw,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import Seo from '../components/Seo';
import { useAuth } from '../context/AuthContext';
import { generationFeedback, generationJobLabel } from '../lib/adminGeneration';

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

function formatDate(value?: string) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

export default function AdminDashboard() {
  const { session, user, isAdmin, loading } = useAuth();
  const queryClient=useQueryClient();
  const [jobIds,setJobIds]=useState<string[]>([]);
  const [visible,setVisible]=useState(document.visibilityState!=='hidden');
  const [clock,setClock]=useState(Date.now());
  const account=useRef(user?.id);account.current=user?.id;
  useEffect(()=>{const update=()=>setVisible(document.visibilityState!=='hidden');document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);
  useEffect(()=>{if(!visible)return;setClock(Date.now());const timer=setInterval(()=>setClock(Date.now()),30_000);return()=>clearInterval(timer);},[visible]);
  useEffect(()=>{
    setJobIds([]);setActionMessage('');setActionError('');setBusyAction('');
    queryClient.removeQueries({predicate:query=>['admin-summary','admin-jobs','admin-draft'].includes(String(query.queryKey[0]))&&query.queryKey[1]!==user?.id});
    try{if(user?.id)setJobIds(JSON.parse(localStorage.getItem(`streamnyaa.admin.jobs.${user.id}`)||'[]').filter((id:unknown)=>typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id)).slice(0,4));}catch{/* Optional status restoration. */}
  },[user?.id,queryClient]);
  const [adminEmail, setAdminEmail] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyAction, setBusyAction] = useState<'generate' | 'generate-both' | 'admin' | 'remove-admin' | ''>('');

  const summary = useQuery({
    queryKey: ['admin-summary',user?.id],
    enabled: Boolean(session?.access_token && isAdmin),
    queryFn: async ({signal}) => {
      const response = await fetch('/api/admin/summary', {
        signal,
        headers: { Authorization: `Bearer ${session!.access_token}` },
      });
      if (!response.ok) throw new Error('Admin summary could not load.');
      return response.json();
    },
  });
  const jobs=useQuery({queryKey:['admin-jobs',user?.id,...jobIds],enabled:Boolean(session?.access_token&&isAdmin&&jobIds.length),retry:false,
    queryFn:async({signal})=>{const response=await fetch(`/api/admin/generation-status?ids=${jobIds.join(',')}`,{signal,headers:{Authorization:`Bearer ${session!.access_token}`}});if(!response.ok)throw Error('Publication status could not load. Retry from the job list.');return response.json();},
    refetchInterval:query=>visible&&query.state.data?.jobs?.some((job:any)=>job.active)?5000:false});
  useEffect(()=>{
    const current=jobs.data?.jobs;if(!current?.length)return;
    const active=current.some((job:any)=>job.active);
    setActionMessage(generationFeedback(current));
    if(!active){setJobIds([]);try{if(user?.id)localStorage.removeItem(`streamnyaa.admin.jobs.${user.id}`);}catch{/* Optional status restoration. */}void summary.refetch();void queryClient.invalidateQueries({predicate:query=>String(query.queryKey[0]).startsWith('blog')});}
  },[jobs.data]);

  const data = summary.data;
  const adminEmails = useMemo(() => (
    data
      ? [...(data.admins?.env || []), ...(data.admins?.stored || []).map((admin: any) => admin.email)]
        .filter(Boolean)
        .filter((email, index, list) => list.indexOf(email) === index)
      : []
  ), [data]);
  const envAdminEmails = data?.admins?.env || [];
  const storedAdmins = data?.admins?.stored || [];
  const recentArticles = data?.recentArticles || [];

  const trackAcceptedJobs=(ids:string[],acceptedJobs?:any[])=>{
    // A resumed run keeps its ID. Replace its previous terminal cache before
    // subscribing, otherwise that old result can immediately stop polling.
    queryClient.setQueryData(['admin-jobs',user?.id,...ids],{jobs:acceptedJobs||ids.map(id=>({id,status:'pending',active:true,published:[]}))});
    setJobIds(ids);
    try{localStorage.setItem(`streamnyaa.admin.jobs.${user?.id}`,JSON.stringify(ids));}catch{/* Optional status restoration. */}
  };

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
    const owner=user?.id;
    setActionError('');
    setActionMessage('');
    setBusyAction(mode === 'both' ? 'generate-both' : 'generate');
    setActionMessage('Starting draft preparation…');

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
      if(account.current!==owner)return;
      const accepted=(result.jobs||[]).map((job:any)=>job.id);trackAcceptedJobs(accepted,result.jobs||[]);
      setActionMessage(generationFeedback(result.jobs||[]));
      summary.refetch();
    } catch (error) {
      if(account.current===owner)setActionError(error instanceof Error ? error.message : 'Generation failed.');
    } finally {
      if(account.current===owner)setBusyAction('');
    }
  };

  const resumeJob = async (id:string) => {
    if(!session?.access_token||busyAction)return;
    const owner=user?.id;setBusyAction('generate');setActionError('');
    try{
      const response=await fetch('/api/admin/generate-blog',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({jobId:id})});
      if(!response.ok)throw Error('The publication job could not resume.');
      const result=await response.json();
      if(account.current!==owner)return;
      trackAcceptedJobs([id],result.jobs);
      setActionMessage('Resume accepted. Publication still requires evidence, quality checks and a durable save.');
    }catch(error){if(account.current===owner)setActionError(error instanceof Error?error.message:'The job could not resume.');}
    finally{if(account.current===owner)setBusyAction('');}
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

  const removeAdmin = async (email: string) => {
    if (!session?.access_token) return;
    setActionError('');
    setActionMessage('');
    setBusyAction('remove-admin');

    try {
      const response = await fetch(`/api/admin/admins?email=${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not remove admin.');
      setActionMessage(`${email} was removed from stored admin access.`);
      summary.refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not remove admin.');
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
            <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">Control room</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              Signed in as <span className="font-bold text-foreground">{user.email}</span>. Publishing, access, and site health live here.
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
            <Metric label="Articles" value={articleCount} detail="Posts stored in the archive" />
            <Metric label="Admins" value={adminEmails.length} detail="People with console access" />
            <Metric label="Schedule" value="Daily" detail={data?.cronSchedule || 'Daily article check'} />
            <Metric label="Writer" value={data?.config?.geminiConfigured ? 'Configured' : 'Check'} detail={data?.config?.geminiConfigured ? 'Model access is checked when a draft runs' : 'Article key is missing'} />
          </section>

          {actionMessage ? <div role="status" aria-live="polite" className="mt-6 rounded-lg border border-border bg-secondary/20 p-4 text-sm font-semibold text-foreground">{actionMessage}</div> : null}
          {actionError ? <div role="alert" className="mt-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm font-semibold text-red-400">{actionError}</div> : null}
          {jobs.isError&&<p role="status" className="mt-3 text-sm text-amber-200">Publication status could not refresh. <button className="underline" onClick={()=>void jobs.refetch()}>Retry status</button></p>}
          {!!data?.jobs?.length&&<div className="mt-3 space-y-2 text-xs text-muted-foreground">{data.jobs.slice(0,3).map((job:any)=><div key={job.id} className="flex flex-wrap items-center justify-between gap-2"><span>{job.kind} · {formatDate(job.createdAt)} · {generationJobLabel(job)}{job.stage&&job.active?` · ${job.stage}`:''}{job.reason?` · ${job.reason}`:''}{job.retryAt>clock?` · Retry after ${formatDate(new Date(job.retryAt).toISOString())}`:''}</span>{(['pending','failed'].includes(job.status)||job.resumeRequired)&&<button className="min-h-9 font-semibold text-primary underline disabled:opacity-50" disabled={Boolean(busyAction)||job.active||job.retryAt>clock} onClick={()=>void resumeJob(job.id)}>{job.retryAt>clock?'Waiting for provider':'Resume job'}</button>}</div>)}</div>}

          <AdminPublicationReview key={user.id} accountId={user.id} token={session?.access_token||''} jobs={data?.jobs||[]} automaticEnabled={Boolean(data?.publicationPolicy?.automaticEnabled)} onAccepted={ids=>{if(account.current!==user.id)return;trackAcceptedJobs(ids);void summary.refetch();}} />

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
                      <span className="block text-sm font-black text-foreground">Generate one draft</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">Use for today’s main story.</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-primary" />
                  </button>
                  <button onClick={() => triggerGemini('both')} disabled={Boolean(busyAction)} className="grid grid-cols-[40px_1fr_auto] items-center gap-3 rounded-lg border border-border bg-background/45 p-4 text-left transition-colors hover:border-primary/45 disabled:opacity-60">
                    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-primary">
                      {busyAction === 'generate-both' ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
                    </span>
                    <span>
                      <span className="block text-sm font-black text-foreground">Generate two drafts</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">Use when a topic is moving fast.</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-[var(--glass)] p-5">
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-black tracking-tight">Recent articles</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Newest posts currently available on the blog.</p>
                  </div>
                  <Link to="/blog" className="inline-flex w-fit items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-black text-foreground hover:border-primary/45">
                    Open blog
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="overflow-hidden rounded-lg border border-border">
                  {recentArticles.length ? recentArticles.map((article: any) => (
                    <div key={article.slug} className="grid gap-3 border-b border-border bg-background/45 p-4 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center">
                      <div className="min-w-0">
                        <Link to={`/blog/${article.slug}`} className="line-clamp-1 text-sm font-black text-foreground hover:text-primary">
                          {article.title || article.slug}
                        </Link>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{formatDate(article.updated_at)}</span>
                          {article.category ? <span>{article.category}</span> : null}
                          {article.article_kind ? <span>{article.article_kind}</span> : null}
                          {article.status ? <span>{article.status}</span> : null}
                        </div>
                      </div>
                      <Link to={`/blog/${article.slug}`} className="inline-flex items-center gap-1.5 text-xs font-black text-primary hover:underline">
                        View
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  )) : (
                    <div className="bg-background/35 p-5 text-sm text-muted-foreground">No recent articles found in the archive yet.</div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-[var(--glass)] p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-black tracking-tight">System health</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Archive, backup, auth, and generation configuration.</p>
                  </div>
                  <Activity className="h-5 w-5 text-primary" />
                </div>
                <div className="overflow-hidden rounded-lg border border-border bg-background/35">
                  <HealthRow title="Article archive" ready={archiveReady} detail={archiveReady ? 'Database archive is configured.' : 'Database archive is missing.'} />
                  <HealthRow title="Backup path" ready={backupReady} detail={backupReady ? 'GitHub fallback is configured.' : 'GitHub fallback is not configured.'} />
                  <HealthRow title="Admin table" ready={tableReady} detail={tableReady ? 'Admin access table is ready.' : 'Admin table setup is needed.'} />
                  <HealthRow title="Gemini generation" ready={Boolean(data?.config?.geminiConfigured)} detail={data?.config?.geminiConfigured ? 'Article generation key is configured.' : 'Article generation key is missing.'} />
                  <HealthRow title="Production URL" ready={Boolean(data?.config?.productionUrl)} detail={data?.config?.productionUrl || 'Production URL not reported.'} />
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
                    <h2 className="text-xl font-black">Admin shortcuts</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Common checks after deploys or auth changes.</p>
                  </div>
                  <Settings className="h-5 w-5 text-primary" />
                </div>
                <div className="grid gap-2">
                  <a href="/sitemap.xml" target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border border-border bg-background/45 px-3 py-2.5 text-sm font-bold hover:border-primary/45">
                    Sitemap index
                    <Globe className="h-4 w-4 text-primary" />
                  </a>
                  <a href="/api/blog-sitemap" target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border border-border bg-background/45 px-3 py-2.5 text-sm font-bold hover:border-primary/45">
                    Dynamic blog sitemap
                    <Globe className="h-4 w-4 text-primary" />
                  </a>
                  <Link to="/login" className="flex items-center justify-between rounded-lg border border-border bg-background/45 px-3 py-2.5 text-sm font-bold hover:border-primary/45">
                    User login test
                    <MailCheck className="h-4 w-4 text-primary" />
                  </Link>
                  <Link to="/reset-password" className="flex items-center justify-between rounded-lg border border-border bg-background/45 px-3 py-2.5 text-sm font-bold hover:border-primary/45">
                    Reset page
                    <KeyRound className="h-4 w-4 text-primary" />
                  </Link>
                </div>
              </div>

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
                  {adminEmails.length ? adminEmails.map((email) => {
                    const isEnvAdmin = envAdminEmails.includes(email);
                    const storedAdmin = storedAdmins.find((admin: any) => admin.email === email);
                    const canRemove = !isEnvAdmin && email !== user.email;
                    return (
                    <div key={email} className="grid grid-cols-[36px_1fr] items-center gap-3 bg-background/45 p-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Shield className="h-4 w-4" />
                      </span>
                      <span className="grid min-w-0 gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-foreground">{email}</span>
                          <span className="text-xs text-muted-foreground">{isEnvAdmin ? 'Environment admin' : `Stored admin${storedAdmin?.created_at ? ` · ${formatDate(storedAdmin.created_at)}` : ''}`}</span>
                        </span>
                        {canRemove ? (
                          <button
                            type="button"
                            onClick={() => removeAdmin(email)}
                            disabled={busyAction === 'remove-admin'}
                            className="inline-flex items-center justify-center rounded-md border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-xs font-black text-red-300 hover:bg-red-500/15 disabled:opacity-60"
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Remove
                          </button>
                        ) : null}
                      </span>
                    </div>
                  );}) : (
                    <div className="bg-background/35 p-4 text-sm text-muted-foreground">No admin emails loaded.</div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-secondary/20 p-5">
                <div className="flex items-center gap-2 text-sm font-black text-foreground">
                  <Clock className="h-4 w-4 text-primary" />
                  Scheduled publishing
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{data?.cronSchedule || 'Daily generation is scheduled.'}</p><p className="mt-2 text-xs text-muted-foreground">{data?.publicationPolicy?.automaticEnabled?'Automatic publication is enabled after quality checks.':'Drafts are saved privately. Automatic publication is paused for acceptance.'}</p>
              </div>

              <div className="rounded-lg border border-border bg-secondary/20 p-5">
                <div className="flex items-center gap-2 text-sm font-black text-foreground">
                  <Database className="h-4 w-4 text-primary" />
                  Data note
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">Recent posts, admin users, and archive status are loaded from the same production API that powers the live site.</p>
              </div>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}
