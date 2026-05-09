import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Eye, EyeOff, KeyRound, Lock, LogIn, Mail, UserPlus } from 'lucide-react';
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
        setMessage('Choose a new password.');
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
        setMessage('Profile created. Check your email if confirmation is required, then sign in.');
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
        description: 'Enter your email and a secure password reset link will be sent to you.',
        action: 'Send reset link',
      }
    : mode === 'reset'
    ? {
        title: 'Choose a new password',
        description: 'Set a fresh password. Use at least 6 characters.',
        action: 'Update password',
      }
    : mode === 'login'
    ? {
        title: 'Welcome back',
        description: 'Sign in to open your saved list, quick tools, and anime shortcuts.',
        action: 'Sign in',
      }
    : {
        title: 'Create your profile',
        description: 'Create a profile so your dashboard is ready as more personal features are added.',
        action: 'Create profile',
      };

  return (
    <div className="relative flex min-h-[calc(100vh-72px)] items-center justify-center overflow-hidden bg-background px-3 py-4 text-white md:px-6">
      <Seo
        title={adminOnly ? 'Admin Sign In | StreamNyaa' : 'Sign in to StreamNyaa | StreamNyaa'}
        description={adminOnly ? 'Private StreamNyaa admin sign in.' : 'Sign in to StreamNyaa to manage your account and watchlist.'}
        canonicalPath={adminOnly ? '/login/admin' : '/login'}
        robots={adminOnly ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}
      />
      <div className="absolute inset-0 -z-30 overflow-hidden">
        <img
          key={`login-bg-${activeVisual.hero}`}
          src={activeVisual.hero}
          alt=""
          className="h-full w-full scale-110 object-cover opacity-65 blur-2xl"
          aria-hidden="true"
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="absolute inset-0 -z-20 bg-[linear-gradient(115deg,rgba(5,5,7,0.72),rgba(5,5,7,0.42)_42%,rgba(225,29,72,0.18)),linear-gradient(180deg,rgba(5,5,7,0.38),rgba(5,5,7,0.82))]" />
      <div className="absolute inset-0 -z-10 opacity-35 blur-[3px]" aria-hidden="true">
        <div className="mx-auto mt-8 h-[52vh] max-w-6xl rounded-[32px] border border-white/10 bg-white/8 p-5 shadow-2xl shadow-black/35 backdrop-blur-md">
          <div className="grid h-full grid-cols-[1fr_260px] gap-5">
            <div className="relative overflow-hidden rounded-[28px] bg-black/40">
              <img src={activeVisual.hero} alt="" className="h-full w-full object-cover opacity-70" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/35 to-transparent" />
              <div className="absolute bottom-8 left-8 h-8 w-64 rounded-full bg-white/20" />
              <div className="absolute bottom-20 left-8 h-14 w-96 rounded-2xl bg-white/16" />
            </div>
            <div className="space-y-3">
              {previewVisuals.map((visual, index) => (
                <div key={`mock-${visual.cover}-${index}`} className="grid grid-cols-[54px_1fr] gap-3 rounded-2xl bg-black/34 p-2">
                  <img src={visual.cover} alt="" className="h-16 w-12 rounded-xl object-cover" referrerPolicy="no-referrer" />
                  <div className="space-y-2 py-2">
                    <div className="h-3 rounded-full bg-white/22" />
                    <div className="h-3 w-2/3 rounded-full bg-white/12" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mx-auto mt-5 grid max-w-6xl grid-cols-5 gap-4">
          {[activeVisual, ...previewVisuals, ...seasonalVisuals.slice(0, 1)].slice(0, 5).map((visual, index) => (
            <div key={`mock-card-${visual.cover}-${index}`} className="aspect-[2/3] overflow-hidden rounded-2xl bg-black/35 shadow-xl">
              <img src={visual.cover} alt="" className="h-full w-full object-cover opacity-78" referrerPolicy="no-referrer" />
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-[30px] border border-white/14 bg-black/54 shadow-2xl shadow-black/45 backdrop-blur-2xl md:min-h-[520px] md:grid-cols-[0.95fr_1.05fr] lg:min-h-[560px]">
        <section className="flex min-h-0 items-center bg-black/20 px-5 py-6 backdrop-blur-xl sm:px-8 md:px-10">
          <div className="mx-auto w-full max-w-[360px]">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/12 text-primary">
                <Lock className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-black tracking-tight md:text-3xl">{modeCopy.title}</h1>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-white/58">{modeCopy.description}</p>
            </div>

            {!adminOnly ? (
              <div className="mb-4 grid grid-cols-2 rounded-full border border-white/10 bg-white/5 p-1 shadow-inner">
                <button type="button" onClick={() => setMode('login')} className={`rounded-full px-3 py-2.5 text-sm font-black transition-colors ${mode === 'login' || mode === 'forgot' || mode === 'reset' ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'text-white/56 hover:text-white'}`}>Login</button>
                <button type="button" onClick={() => setMode('signup')} className={`rounded-full px-3 py-2.5 text-sm font-black transition-colors ${mode === 'signup' ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'text-white/56 hover:text-white'}`}>Sign up</button>
              </div>
            ) : null}

            {!adminOnly && mode === 'login' ? (
              <div className="mb-4">
                <button
                  type="button"
                  onClick={startGoogleLogin}
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-3 rounded-full border border-white/10 bg-white px-4 py-3 text-sm font-black text-black transition-colors hover:bg-white/90 disabled:opacity-60"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.24 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z" />
                  </svg>
                  Continue with Google
                </button>
                <div className="my-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="text-xs font-bold uppercase tracking-wider text-white/42">or</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>
              </div>
            ) : null}

            <form onSubmit={submit} className="space-y-3">
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
                    className="w-full rounded-full border border-white/15 bg-white/[0.07] py-3 pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/38 focus:border-primary/70"
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
                    className="w-full rounded-full border border-white/15 bg-white/[0.07] py-3 pl-4 pr-12 text-sm text-white outline-none transition-colors placeholder:text-white/38 focus:border-primary/70"
                    placeholder="At least 6 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
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
                      className="w-full rounded-full border border-white/15 bg-white/[0.07] py-3 pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/38 focus:border-primary/70"
                      placeholder="Repeat new password"
                    />
                  </div>
                </div>
              ) : null}

              {error ? <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-semibold text-red-400">{error}</p> : null}
              {message ? <p className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm font-semibold text-green-400">{message}</p> : null}

              <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-black text-white shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90 disabled:opacity-60">
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
              <Link to="/" className="font-bold text-white/78 hover:text-white hover:underline">Back to home</Link>
            </p>
          </div>
        </section>

        <section className="relative hidden items-center justify-center bg-white/[0.035] p-5 backdrop-blur-xl md:flex lg:p-7">
          <div className="absolute bottom-10 left-0 h-px w-20 bg-primary/50" />
          <div className="w-full max-w-[330px]">
            <div className="overflow-hidden rounded-[30px] border border-primary/20 bg-zinc-950 p-2 shadow-2xl shadow-black/45">
              <div className="aspect-[3/4] overflow-hidden rounded-[24px] bg-zinc-900">
                <img
                  key={activeVisual.cover}
                  src={activeVisual.cover}
                  alt={`${activeVisual.title} seasonal anime cover`}
                  className="h-full w-full object-cover object-center transition-opacity duration-500"
                  loading="eager"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {previewVisuals.map((visual, index) => (
                <button
                  key={`${visual.cover}-${index}`}
                  type="button"
                  onClick={() => setActiveVisualIndex((activeVisualIndex + index + 1) % seasonalVisuals.length)}
                  className="aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition-transform hover:-translate-y-0.5"
                  aria-label={`Show ${visual.title} artwork`}
                >
                  <img src={visual.cover} alt={`${visual.title} anime cover`} className="h-full w-full object-cover object-center" loading="lazy" referrerPolicy="no-referrer" />
                </button>
              ))}
            </div>
            <p className="mt-3 truncate text-center text-xs font-bold text-white/46">
              Seasonal cover: <span className="text-white/72">{activeVisual.title}</span>
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
