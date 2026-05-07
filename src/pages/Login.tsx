import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, LogIn, ShieldCheck, Sparkles, Star, UserPlus } from 'lucide-react';
import Seo from '../components/Seo';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await signIn(email.trim(), password);
        navigate('/dashboard');
      } else {
        await signUp(email.trim(), password);
        setMessage('Account created. Check your email if Supabase asks you to confirm it, then sign in.');
        setMode('login');
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const modeCopy = mode === 'login'
    ? {
        title: 'Welcome back',
        description: 'Sign in to open your saved list, account tools, and admin controls when your email has access.',
        action: 'Sign in',
      }
    : {
        title: 'Create your account',
        description: 'Make a StreamNyaa account so your dashboard is ready as more personal features are added.',
        action: 'Create account',
      };

  return (
    <div className="container mx-auto px-4 md:px-10 py-10 md:py-14">
      <Seo title="Sign in to StreamNyaa | StreamNyaa" description="Sign in to StreamNyaa to manage your account, watchlist, and admin dashboard access." canonicalPath="/login" />
      <div className="mx-auto grid max-w-6xl overflow-hidden rounded-2xl border border-border bg-background shadow-2xl shadow-black/20 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden min-h-[620px] overflow-hidden bg-zinc-950 p-8 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 opacity-70">
            <img
              src="https://s4.anilist.co/file/anilistcdn/media/anime/banner/21-YCDoj1EkAxFn.jpg"
              alt=""
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(5,5,7,0.96),rgba(5,5,7,0.78),rgba(225,29,72,0.34))]" />
          </div>
          <div className="relative">
            <Link to="/" className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white backdrop-blur">
              <Sparkles className="h-4 w-4 text-primary" />
              StreamNyaa
            </Link>
            <h1 className="mt-12 max-w-xl text-5xl font-black leading-tight tracking-tight">Your anime hub, now with an account layer.</h1>
            <p className="mt-5 max-w-lg text-base leading-8 text-white/72">Keep your saved pages close, reach admin tools faster, and use one clean sign-in for the features being added around StreamNyaa.</p>
          </div>
          <div className="relative grid gap-3">
            {[
              ['Saved anime list', 'Keep watch targets easier to reach from your dashboard.'],
              ['Admin-ready access', 'Admin emails open blog and site controls from the same login.'],
              ['Secure session', 'Your browser keeps a private Supabase session until you sign out.'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-xl border border-white/12 bg-black/35 p-4 backdrop-blur">
                <div className="flex items-start gap-3">
                  <Star className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-black">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-white/65">{body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[radial-gradient(circle_at_top_right,rgba(225,29,72,0.12),transparent_34%),var(--background)] p-5 sm:p-8 md:p-10">
          <div className="mx-auto max-w-md">
            <div className="mb-8 flex items-center justify-between gap-4">
              <Link to="/" className="text-sm font-black text-foreground">StreamNyaa</Link>
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-[var(--glass)] px-3 py-1.5 text-xs font-bold text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Supabase login
              </div>
            </div>

            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Lock className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-black tracking-tight md:text-4xl">{modeCopy.title}</h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{modeCopy.description}</p>

            <div className="mt-7 grid grid-cols-2 rounded-xl border border-border bg-background/70 p-1 shadow-inner">
              <button onClick={() => setMode('login')} className={`rounded-lg px-3 py-2.5 text-sm font-black transition-colors ${mode === 'login' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:text-foreground'}`}>Login</button>
              <button onClick={() => setMode('signup')} className={`rounded-lg px-3 py-2.5 text-sm font-black transition-colors ${mode === 'signup' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:text-foreground'}`}>Sign up</button>
            </div>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-muted-foreground">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-muted-foreground">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={6}
                    className="w-full rounded-xl border border-border bg-background py-3.5 pl-4 pr-12 text-sm text-foreground outline-none transition-colors focus:border-primary"
                    placeholder="At least 6 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error ? <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-semibold text-red-400">{error}</p> : null}
              {message ? <p className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm font-semibold text-green-400">{message}</p> : null}

              <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-black text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90 disabled:opacity-60">
                {mode === 'login' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                {submitting ? 'Please wait...' : modeCopy.action}
              </button>
            </form>

            <div className="mt-6 rounded-xl border border-border bg-[var(--glass)] p-4">
              <p className="text-sm font-black text-foreground">Admin sign in</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">Use the same login. If your email is on the admin list, the admin dashboard appears automatically.</p>
            </div>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              <Link to="/" className="font-bold text-primary hover:underline">Back to StreamNyaa</Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
