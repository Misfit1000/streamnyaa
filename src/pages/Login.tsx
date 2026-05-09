import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, KeyRound, Lock, LogIn, Mail, ShieldCheck, Sparkles, UserPlus } from 'lucide-react';
import Seo from '../components/Seo';
import { useAuth } from '../context/AuthContext';
import { fetchSeasonalAnime } from '../api/jikan';

type LoginProps = {
  adminOnly?: boolean;
};

const FALLBACK_VISUALS = [
  {
    title: 'Witch Hat Atelier',
    hero: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/147105-NhP2xCqQy9lM.jpg',
    cover: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx147105-rwOX8qyUy8gV.jpg',
  },
  {
    title: 'ONE PIECE',
    hero: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-YCDoj1EkAxFn.jpg',
    cover: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg',
  },
  {
    title: 'Re:ZERO Season 4',
    hero: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx189046-yaHWtS5FII46.jpg',
    cover: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx189046-yaHWtS5FII46.jpg',
  },
  {
    title: 'Wistoria Season 2',
    hero: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx182300-IYkq5KrkQq1V.jpg',
    cover: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx182300-IYkq5KrkQq1V.jpg',
  },
];

export default function Login({ adminOnly = false }: LoginProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signIn, signInGoogle, signUp, sendPasswordReset, resetPassword } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [activeVisualIndex, setActiveVisualIndex] = useState(0);
  const { data: seasonalData } = useQuery({
    queryKey: ['login-seasonal-visuals'],
    queryFn: fetchSeasonalAnime,
    staleTime: 1000 * 60 * 60 * 6,
  });
  const seasonalVisuals = useMemo(() => {
    const apiVisuals = (seasonalData?.data || [])
      .map((anime: any) => ({
        title: anime.title,
        hero: anime.banner_image || anime.images?.webp?.large_image_url || anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url,
        cover: anime.images?.webp?.large_image_url || anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || anime.banner_image,
      }))
      .filter((item: { title?: string; hero?: string; cover?: string }) => item.title && item.hero && item.cover)
      .slice(0, 8);
    return apiVisuals.length >= 3 ? apiVisuals : FALLBACK_VISUALS;
  }, [seasonalData]);
  const activeVisual = seasonalVisuals[activeVisualIndex % seasonalVisuals.length] || FALLBACK_VISUALS[0];
  const previewVisuals = Array.from({ length: 3 }, (_, index) => seasonalVisuals[(activeVisualIndex + index + 1) % seasonalVisuals.length]).filter(Boolean);

  useEffect(() => {
    setActiveVisualIndex(0);
  }, [seasonalVisuals.length]);

  useEffect(() => {
    if (seasonalVisuals.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setActiveVisualIndex((index) => (index + 1) % seasonalVisuals.length);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [seasonalVisuals.length]);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const queryParams = new URLSearchParams(location.search);
    const accessToken = hashParams.get('access_token') || '';
    const type = hashParams.get('type') || queryParams.get('type');

    if (accessToken && type === 'recovery') {
      setResetToken(accessToken);
      setMode('reset');
      setMessage('Choose a new password for your StreamNyaa account.');
      window.history.replaceState(null, '', '/reset-password');
    } else if (location.pathname === '/reset-password' || queryParams.get('mode') === 'reset') {
      setMode('reset');
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!adminOnly && user && location.pathname === '/login') {
      navigate('/dashboard', { replace: true });
    }
  }, [adminOnly, user, location.pathname, navigate]);

  const startGoogleLogin = async () => {
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      await signInGoogle();
    } catch (authError) {
      setSubmitting(false);
      setError(authError instanceof Error ? authError.message : 'Google sign-in failed.');
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    try {
      if (mode === 'forgot') {
        await sendPasswordReset(email.trim());
        setMessage('Password reset link sent. Check your email and open the link to set a new password.');
      } else if (mode === 'reset') {
        if (password !== confirmPassword) throw new Error('Passwords do not match.');
        await resetPassword(resetToken, password);
        setMessage('Password updated. You can sign in with your new password.');
        setMode('login');
        setPassword('');
        setConfirmPassword('');
        setResetToken('');
      } else if (adminOnly || mode === 'login') {
        await signIn(email.trim(), password);
        navigate(adminOnly ? '/admin' : '/dashboard');
      } else {
        await signUp(email.trim(), password);
        setMessage('Account created. Check your email if confirmation is required, then sign in.');
        setMode('login');
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const modeCopy = adminOnly
    ? {
        title: 'Admin sign in',
        description: 'Use an approved StreamNyaa admin email to open site controls, blog generation, and access management.',
        action: 'Open admin dashboard',
      }
    : mode === 'forgot'
    ? {
        title: 'Reset your password',
        description: 'Enter your account email and StreamNyaa will send a secure link to create a new password.',
        action: 'Send reset link',
      }
    : mode === 'reset'
    ? {
        title: 'Choose a new password',
        description: 'Set a fresh password for your StreamNyaa account. Use at least 6 characters.',
        action: 'Update password',
      }
    : mode === 'login'
    ? {
        title: 'Welcome back',
        description: 'Sign in to open your saved list, account tools, and quick StreamNyaa shortcuts.',
        action: 'Sign in',
      }
    : {
        title: 'Create your account',
        description: 'Make a StreamNyaa account so your dashboard is ready as more personal features are added.',
        action: 'Create account',
      };

  return (
    <div className="relative flex min-h-[calc(100vh-72px)] items-center justify-center overflow-hidden px-3 py-4 md:px-6">
      <Seo
        title={adminOnly ? 'Admin Sign In | StreamNyaa' : 'Sign in to StreamNyaa | StreamNyaa'}
        description={adminOnly ? 'Private StreamNyaa admin sign in.' : 'Sign in to StreamNyaa to manage your account and watchlist.'}
        canonicalPath={adminOnly ? '/login/admin' : '/login'}
        robots={adminOnly ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}
      />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_16%,rgba(225,29,72,0.16),transparent_34%),radial-gradient(circle_at_86%_76%,rgba(255,255,255,0.08),transparent_30%)]" />
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[24px] border border-white/10 bg-black shadow-2xl shadow-black/40 lg:h-[min(590px,calc(100vh-96px))] lg:grid-cols-[1fr_0.86fr]">
        <section className="relative min-h-[220px] overflow-hidden bg-zinc-950 p-2.5 text-white md:min-h-[300px] lg:min-h-0">
          <div className="relative h-full overflow-hidden rounded-[22px] border border-white/10 bg-secondary">
            <img
              key={activeVisual.hero}
              src={activeVisual.hero}
              alt={`${activeVisual.title} seasonal anime artwork`}
              className="h-full w-full object-cover object-center brightness-[0.92] saturate-110 transition-opacity duration-500"
              loading="eager"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02),rgba(0,0,0,0.7))]" />
            <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-3">
              <Link to="/" className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/45 px-4 py-2 text-sm font-black text-white backdrop-blur">
                <Sparkles className="h-4 w-4 text-primary" />
                StreamNyaa
              </Link>
              <span className="rounded-full border border-white/20 bg-black/45 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-white/85 backdrop-blur">
                {adminOnly ? 'Admin' : 'Account'}
              </span>
            </div>
            <div className="absolute bottom-3 left-3 right-3 md:bottom-4 md:left-4 md:right-4">
              <div className="max-w-md rounded-2xl border border-white/14 bg-black/42 p-3.5 backdrop-blur-md">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">{adminOnly ? 'Private access' : 'Anime dashboard'}</p>
                <h2 className="mt-1.5 text-xl font-black leading-tight md:text-2xl">
                  {adminOnly ? 'Manage StreamNyaa from a focused control space.' : 'Sign in and keep your anime space close.'}
                </h2>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/70">
                  {adminOnly
                    ? 'Article tools, admin access, and publishing controls stay behind the private admin route.'
                    : 'Saved anime, schedules, blog reads, and discovery shortcuts feel cleaner when they start from one account.'}
                </p>
                <p className="mt-2 text-xs font-black text-white/60">Now showing: <span className="text-white">{activeVisual.title}</span></p>
              </div>
              <div className="mt-2 hidden grid-cols-3 gap-2 sm:grid">
                {previewVisuals.map((visual, index) => (
                  <div key={`${visual.cover}-${index}`} className="aspect-[16/10] overflow-hidden rounded-xl border border-white/12 bg-black/40">
                    <img src={visual.cover} alt={`${visual.title} anime cover`} className="h-full w-full object-cover brightness-90" loading="lazy" referrerPolicy="no-referrer" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 items-center bg-black p-5 text-white sm:p-7 md:p-8">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-5 flex items-center justify-between gap-4 lg:justify-end">
              <Link to="/" className="text-sm font-black text-white lg:hidden">StreamNyaa</Link>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/65">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                {adminOnly ? 'Admin access' : 'User login'}
              </div>
            </div>

            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-primary">
              <Lock className="h-5 w-5" />
            </div>
            <h1 className="text-center text-2xl font-black tracking-tight md:text-3xl">{modeCopy.title}</h1>
            <p className="mx-auto mt-2 max-w-sm text-center text-sm leading-6 text-white/58">{modeCopy.description}</p>

            {!adminOnly ? (
              <div className="mt-5 grid grid-cols-2 rounded-full border border-white/10 bg-white/5 p-1 shadow-inner">
                <button type="button" onClick={() => setMode('login')} className={`rounded-lg px-3 py-2.5 text-sm font-black transition-colors ${mode === 'login' || mode === 'forgot' || mode === 'reset' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-white/56 hover:text-white'}`}>Login</button>
                <button type="button" onClick={() => setMode('signup')} className={`rounded-lg px-3 py-2.5 text-sm font-black transition-colors ${mode === 'signup' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-white/56 hover:text-white'}`}>Sign up</button>
              </div>
            ) : null}

            {!adminOnly && mode === 'login' ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={startGoogleLogin}
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-black text-black transition-colors hover:bg-white/90 disabled:opacity-60"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[13px] font-black text-zinc-900">G</span>
                  Continue with Google
                </button>
                <div className="my-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="text-xs font-bold uppercase tracking-wider text-white/45">or</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>
              </div>
            ) : null}

            <form onSubmit={submit} className="mt-4 space-y-3">
              {mode !== 'reset' ? (
              <div>
                <label className="mb-2 block text-sm font-black text-white">Email</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    className="w-full rounded-2xl border border-white/10 bg-white/10 py-3 pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/38 focus:border-white/30"
                    placeholder="you@example.com"
                  />
                </div>
              </div>
              ) : null}

              {mode !== 'forgot' ? (
              <div>
                <label className="mb-2 block text-sm font-black text-white">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={6}
                    className="w-full rounded-2xl border border-white/10 bg-white/10 py-3 pl-4 pr-12 text-sm text-white outline-none transition-colors placeholder:text-white/38 focus:border-white/30"
                    placeholder="At least 6 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              ) : null}

              {mode === 'reset' ? (
                <div>
                  <label className="mb-2 block text-sm font-black text-white">Confirm password</label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                      minLength={6}
                      className="w-full rounded-2xl border border-white/10 bg-white/10 py-3 pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/38 focus:border-white/30"
                      placeholder="Repeat new password"
                    />
                  </div>
                </div>
              ) : null}

              {error ? <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-semibold text-red-400">{error}</p> : null}
              {message ? <p className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm font-semibold text-green-400">{message}</p> : null}

              <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-black shadow-lg shadow-white/10 transition-colors hover:bg-white/90 disabled:opacity-60">
                {mode === 'forgot' || mode === 'reset' ? <KeyRound className="h-4 w-4" /> : adminOnly || mode === 'login' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                {submitting ? 'Please wait...' : modeCopy.action}
              </button>
            </form>

            {(adminOnly || mode === 'login') ? (
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setMessage('');
                  setMode('forgot');
                }}
                className="mt-3 w-full text-center text-sm font-bold text-white/72 hover:text-white hover:underline"
              >
                Forgot your password?
              </button>
            ) : mode === 'forgot' || mode === 'reset' ? (
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setMessage('');
                  setMode('login');
                }}
                className="mt-3 w-full text-center text-sm font-bold text-white/72 hover:text-white hover:underline"
              >
                Back to sign in
              </button>
            ) : null}

            {adminOnly ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-black text-white">Admin-only entry</p>
                <p className="mt-1 text-sm leading-6 text-white/55">If this email is not on the admin list, the dashboard will stay locked after sign-in.</p>
              </div>
            ) : null}

            <p className="mt-4 text-center text-sm text-white/50">
              <Link to="/" className="font-bold text-white/78 hover:text-white hover:underline">Back to StreamNyaa</Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export function AdminLogin() {
  return <Login adminOnly />;
}
