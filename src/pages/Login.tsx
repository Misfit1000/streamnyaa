import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, LogIn, UserPlus } from 'lucide-react';
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

  return (
    <div className="container mx-auto px-4 md:px-10 py-12">
      <Seo title="Login | StreamNyaa" description="Sign in to StreamNyaa to manage your account and dashboard." canonicalPath="/login" />
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-[var(--glass)] p-6 md:p-8 shadow-xl">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="text-3xl font-black tracking-tight">{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {mode === 'login' ? 'Open your StreamNyaa dashboard.' : 'Create a StreamNyaa account with email and password.'}
        </p>

        <div className="mt-6 grid grid-cols-2 rounded-xl border border-border bg-background/60 p-1">
          <button onClick={() => setMode('login')} className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${mode === 'login' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Login</button>
          <button onClick={() => setMode('signup')} className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${mode === 'signup' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Sign up</button>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-muted-foreground">Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-muted-foreground">Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-primary"
              placeholder="At least 6 characters"
            />
          </div>

          {error ? <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-semibold text-red-400">{error}</p> : null}
          {message ? <p className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm font-semibold text-green-400">{message}</p> : null}

          <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
            {mode === 'login' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {submitting ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          <Link to="/" className="font-bold text-primary hover:underline">Back to StreamNyaa</Link>
        </p>
      </div>
    </div>
  );
}
