import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, MailCheck, User } from 'lucide-react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { Field, PasswordField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { friendlyAuthError } from '@/lib/authErrors';
import { validateEmail, validateName, validateNewPassword } from '@/lib/validation';

export default function StudentRegister() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [agree, setAgree] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const errs = {
    name: validateName(form.name),
    email: validateEmail(form.email),
    password: validateNewPassword(form.password),
    confirm: form.confirm !== form.password ? 'Passwords do not match.' : null,
    agree: agree ? null : 'Please accept the terms to continue.',
  };
  const show = (k: keyof typeof errs) => (touched ? errs[k] : null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (Object.values(errs).some(Boolean)) return;
    if (!isSupabaseConfigured) { setError('Supabase is not configured yet. See the README to connect a project.'); return; }
    setSubmitting(true);
    // Only the name goes in metadata. The database trigger always creates a *student* profile here.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: { data: { full_name: form.name.trim() }, emailRedirectTo: `${window.location.origin}/student/login?verified=1` },
    });
    setSubmitting(false);
    if (signUpError) { setError(friendlyAuthError(signUpError)); return; }
    // Supabase returns a user with no identities when the email is already registered.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setError('An account with this email already exists. Try signing in or resetting your password.');
      return;
    }
    if (data.session) navigate('/student/dashboard', { replace: true });
    else setSentTo(form.email.trim());
  };

  if (sentTo) {
    return (
      <AuthLayout variant="student" title="Check your inbox">
        <div className="text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-success/15 text-success"><MailCheck className="h-6 w-6" /></span>
          <p className="text-sm">We sent a verification link to <strong>{sentTo}</strong>. Open it to activate your account, then sign in.</p>
          <button className="link mt-4 text-sm" onClick={async () => {
            const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: sentTo });
            setError(resendError ? friendlyAuthError(resendError) : null);
          }}>Resend the email</button>
          {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
          <Link to="/student/login" className="btn-primary mt-5 w-full">Go to student login</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      variant="student"
      title="Create your student account"
      subtitle="Free for students. Join your courses and start learning with your AI tutor."
      footer={<>Already have an account? <Link to="/student/login" className="link">Sign in</Link></>}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Full name" autoComplete="name" icon={<User className="h-4 w-4" />} value={form.name} onChange={set('name')} error={show('name')} />
        <Field label="Email address" type="email" autoComplete="email" icon={<Mail className="h-4 w-4" />} value={form.email} onChange={set('email')} error={show('email')} />
        <div>
          <PasswordField label="Password" autoComplete="new-password" value={form.password} onChange={set('password')} error={show('password')}
            hint="At least 8 characters with letters and numbers." />
          <PasswordStrength password={form.password} />
        </div>
        <PasswordField label="Confirm password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={show('confirm')} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--primary))]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I agree to use Macro AI responsibly and to the processing of my learning data to personalise my studies.</span>
        </label>
        {show('agree') && <p className="-mt-2 text-xs font-medium text-danger">{show('agree')}</p>}
        <button type="submit" className="btn-primary w-full py-3" disabled={submitting}>
          {submitting ? <Spinner label="Creating account…" /> : 'Create student account'}
        </button>
        <p className="text-xs text-muted">Teachers can't sign up here. Teacher accounts are created through an institution invitation.</p>
      </form>
    </AuthLayout>
  );
}
