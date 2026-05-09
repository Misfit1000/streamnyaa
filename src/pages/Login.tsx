import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, Lock, LogIn, Mail, ShieldCheck, Sparkles, UserPlus } from 'lucide-react';
import Seo from '../components/Seo';
import { useAuth } from '../context/AuthContext';

type LoginProps = {
  adminOnly?: boolean;
};

const LOGIN_VISUALS = {
  main: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx147105-rwOX8qyUy8gV.jpg',
  side: [
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-ELSYx3yMPcKM.jpg',
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx189046-yaHWtS5FII46.jpg',
    'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx182300-IYkq5KrkQq1V.jpg',
  ],
};

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
    <div className="relative min-h-[calc(100vh-80px)] overflow-hidden px-4 py-8 md:px-10 md:py-12">
      <Seo
        title={adminOnly ? 'Admin Sign In | StreamNyaa' : 'Sign in to StreamNyaa | StreamNyaa'}
        description={adminOnly ? 'Private StreamNyaa admin sign in.' : 'Sign in to StreamNyaa to manage your account and watchlist.'}
        canonicalPath={adminOnly ? '/login/admin' : '/login'}
        robots={adminOnly ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}
      />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_16%,rgba(225,29,72,0.16),transparent_34%),radial-gradient(circle_at_86%_76%,rgba(255,255,255,0.08),transparent_30%)]" />
      <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-2xl shadow-black/40 lg:grid-cols-[1.02fr_0.98fr]">
        <section className="relative min-h-[260px] overflow-hidden bg-zinc-950 p-3 text-white md:min-h-[360px] lg:min-h-[650px]">
          <div className="relative h-full overflow-hidden rounded-[22px] border border-white/10 bg-secondary">
            <img
              src={LOGIN_VISUALS.main}
              alt="Featured anime artwork"
              className="h-full w-full object-cover object-center brightness-[0.92] saturate-110"
              loading="eager"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.04),rgba(0,0,0,0.62))]" />
            <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-3">
              <Link to="/" className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/45 px-4 py-2 text-sm font-black text-white backdrop-blur">
                <Sparkles className="h-4 w-4 text-primary" />
                StreamNyaa
              </Link>
              <span className="rounded-full border border-white/20 bg-black/45 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-white/85 backdrop-blur">
                {adminOnly ? 'Admin' : 'Account'}
              </span>
            </div>
            <div className="absolute bottom-4 left-4 right-4">
              <div className="max-w-md rounded-2xl border border-white/14 bg-black/42 p-4 backdrop-blur-md">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">{adminOnly ? 'Private access' : 'Anime dashboard'}</p>
                <h2 className="mt-2 text-2xl font-black leading-tight md:text-3xl">
                  {adminOnly ? 'Manage StreamNyaa from a focused control space.' : 'Sign in and keep your anime space close.'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  {adminOnly
                    ? 'Article tools, admin access, and publishing controls stay behind the private admin route.'
                    : 'Saved anime, schedules, blog reads, and discovery shortcuts feel cleaner when they start from one account.'}
                </p>
              </div>
              <div className="mt-3 hidden grid-cols-3 gap-2 sm:grid">
                {LOGIN_VISUALS.side.map((imageUrl, index) => (
                  <div key={imageUrl} className="aspect-[16/9] overflow-hidden rounded-xl border border-white/12 bg-black/40">
                    <img src={imageUrl} alt={`Anime preview ${index + 1}`} className="h-full w-full object-cover brightness-90" loading="lazy" referrerPolicy="no-referrer" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center bg-black p-5 text-white sm:p-8 md:p-10">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-10 flex items-center justify-between gap-4 lg:justify-end">
              <Link to="/" className="text-sm font-black text-white lg:hidden">StreamNyaa</Link>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/65">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                {adminOnly ? 'Admin access' : 'User login'}
              </div>
            </div>

            <div className="mx-auto mb-7 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-primary">
              <Lock className="h-6 w-6" />
            </div>
            <h1 className="text-center text-3xl font-black tracking-tight md:text-4xl">{modeCopy.title}</h1>
            <p className="mx-auto mt-3 max-w-sm text-center text-sm leading-7 text-white/58">{modeCopy.description}</p>

            {!adminOnly ? (
              <div className="mt-8 grid grid-cols-2 rounded-full border border-white/10 bg-white/5 p-1 shadow-inner">
                <button type="button" onClick={() => setMode('login')} className={`rounded-lg px-3 py-2.5 text-sm font-black transition-colors ${mode === 'login' || mode === 'forgot' || mode === 'reset' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:text-foreground'}`}>Login</button>
                <button type="button" onClick={() => setMode('signup')} className={`rounded-lg px-3 py-2.5 text-sm font-black transition-colors ${mode === 'signup' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-white/56 hover:text-white'}`}>Sign up</button>
              </div>
            ) : null}

            {!adminOnly && mode === 'login' ? (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={startGoogleLogin}
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white px-4 py-3.5 text-sm font-black text-black transition-colors hover:bg-white/90 disabled:opacity-60"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[13px] font-black text-zinc-900">G</span>
                  Continue with Google
                </button>
                <div className="my-5 flex items-center gap-3">
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="text-xs font-bold uppercase tracking-wider text-white/45">or</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>
              </div>
            ) : null}

            <form onSubmit={submit} className="mt-6 space-y-4">
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
                    className="w-full rounded-2xl border border-white/10 bg-white/10 py-3.5 pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/38 focus:border-white/30"
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
                    className="w-full rounded-2xl border border-white/10 bg-white/10 py-3.5 pl-4 pr-12 text-sm text-white outline-none transition-colors placeholder:text-white/38 focus:border-white/30"
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
                      className="w-full rounded-2xl border border-white/10 bg-white/10 py-3.5 pl-11 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/38 focus:border-white/30"
                      placeholder="Repeat new password"
                    />
                  </div>
                </div>
              ) : null}

              {error ? <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-semibold text-red-400">{error}</p> : null}
              {message ? <p className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm font-semibold text-green-400">{message}</p> : null}

              <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3.5 text-sm font-black text-black shadow-lg shadow-white/10 transition-colors hover:bg-white/90 disabled:opacity-60">
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
                className="mt-4 w-full text-center text-sm font-bold text-white/72 hover:text-white hover:underline"
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
                className="mt-4 w-full text-center text-sm font-bold text-white/72 hover:text-white hover:underline"
              >
                Back to sign in
              </button>
            ) : null}

            {adminOnly ? (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-black text-white">Admin-only entry</p>
                <p className="mt-1 text-sm leading-6 text-white/55">If this email is not on the admin list, the dashboard will stay locked after sign-in.</p>
              </div>
            ) : null}

            <p className="mt-6 text-center text-sm text-white/50">
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
