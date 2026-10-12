import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { friendlyAuthError } from '@/lib/authErrors';
import { validateEmail, validateLoginPassword } from '@/lib/validation';
import { safeNext } from '@/lib/redirect';
import { dashboardFor, useAuth } from '@/auth/AuthProvider';
import type { Role } from '@/lib/types';
import { Field, PasswordField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';

type Portal = 'student' | 'teacher';

function allowed(portal: Portal, role: Role) {
  return portal === 'student' ? role === 'student' : role === 'teacher' || role === 'admin';
}

export function LoginForm({ portal }: { portal: Portal }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { profile, session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({ email: false, password: false });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wrongPortal, setWrongPortal] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const next = safeNext(params.get('next'));

  // Already signed in with the right role: go straight to the dashboard.
  useEffect(() => {
    if (session && profile && allowed(portal, profile.role) && !submitting) {
      navigate(next ?? dashboardFor(profile.role), { replace: true });
    }
  }, [session, profile, portal, next, navigate, submitting]);

  useEffect(() => {
    if (params.get('signedOut')) setNotice('You have been logged out.');
    else if (params.get('reset')) setNotice('Password updated. Sign in with your new password.');
    else if (params.get('verified')) setNotice('Email verified. You can sign in now.');
  }, [params]);

  const emailErr = touched.email ? validateEmail(email) : null;
  const passErr = touched.password ? validateLoginPassword(password) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    setError(null); setNotice(null); setUnverified(false); setWrongPortal(false);
    if (validateEmail(email) || validateLoginPassword(password)) return;
    if (!isSupabaseConfigured) {
      setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        const code = (signInError as { code?: string }).code;
        setUnverified(code === 'email_not_confirmed' || /not confirmed/i.test(signInError.message));
        setError(friendlyAuthError(signInError));
        return;
      }
      // The role comes from the database (profiles.role), never from the form.
      const { data: prof, error: profErr } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
      if (profErr || !prof) {
        await supabase.auth.signOut();
        setError('Signed in, but your profile could not be loaded. Please contact support.');
        return;
      }
      const role = prof.role as Role;
      if (!allowed(portal, role)) {
        await supabase.auth.signOut();
        setWrongPortal(true);
        setError(portal === 'student'
          ? 'This is a teacher account. Please use the teacher login.'
          : 'This account does not have teacher access. Teachers join through an institution invitation.');
        return;
      }
      setSuccess(true);
      navigate(next ?? dashboardFor(role), { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    setUnverified(false);
    if (resendError) setError(friendlyAuthError(resendError));
    else { setError(null); setNotice('Verification email sent. Check your inbox and spam folder.'); }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-describedby="login-status">
      <div id="login-status" className="space-y-3" aria-live="polite">
        {notice && <Alert tone="success">{notice}</Alert>}
        {success && <Alert tone="success">Signed in. Redirecting to your dashboard…</Alert>}
        {error && (
          <Alert tone="error">
            {error}
            {unverified && (
              <button type="button" className="link mt-1 block" onClick={resend}>Resend verification email</button>
            )}
            {wrongPortal && (
              <Link className="link mt-1 block" to={portal === 'student' ? '/teacher/login' : '/teacher/onboarding'}>
                {portal === 'student' ? 'Go to teacher login' : 'Teacher onboarding'}
              </Link>
            )}
          </Alert>
        )}
      </div>
      <Field
        label="Email address"
        type="email"
        autoComplete="email"
        inputMode="email"
        icon={<Mail className="h-4 w-4" />}
        placeholder={portal === 'teacher' ? 'you@school.edu' : 'you@example.com'}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onBlur={() => setTouched((t) => ({ ...t, email: true }))}
        error={emailErr}
        name="email"
      />
      <PasswordField
        label="Password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onBlur={() => setTouched((t) => ({ ...t, password: true }))}
        error={passErr}
        name="password"
      />
      <div className="flex justify-end">
        <Link to={`/forgot-password?portal=${portal}`} className="link text-sm">Forgot password?</Link>
      </div>
      <button type="submit" className="btn-primary w-full py-3" disabled={submitting} data-testid="login-submit">
        {submitting ? <Spinner label="Signing in…" /> : portal === 'teacher' ? 'Sign in to teacher portal' : 'Sign in'}
      </button>
    </form>
  );
}
