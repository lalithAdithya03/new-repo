import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, Mail, MailCheck, User } from 'lucide-react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { Field, PasswordField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { friendlyAuthError } from '@/lib/authErrors';
import { validateEmail, validateInviteCode, validateName, validateNewPassword } from '@/lib/validation';

/**
 * Teacher onboarding. Teacher status is never self-selected: an administrator issues an invitation
 * for a specific email, and the database trigger verifies the code (hash, email, expiry, single use)
 * before creating a teacher profile. See supabase/migrations/*_auth_roles.sql.
 */
export default function TeacherOnboarding() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', code: '', password: '', confirm: '' });
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const errs = {
    name: validateName(form.name),
    email: validateEmail(form.email),
    code: validateInviteCode(form.code),
    password: validateNewPassword(form.password),
    confirm: form.confirm !== form.password ? 'Passwords do not match.' : null,
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
    const code = form.code.trim().toUpperCase();
    const email = form.email.trim();
    try {
      const { data: valid, error: checkError } = await supabase.rpc('check_teacher_invite', { p_email: email, p_code: code });
      if (checkError) throw checkError;
      if (!valid) {
        setError('That invitation code is not valid for this email, has expired, or was already used. Ask your administrator for a new one.');
        return;
      }
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password: form.password,
        options: {
          data: { full_name: form.name.trim(), invite_code: code },
          emailRedirectTo: `${window.location.origin}/teacher/login?verified=1`,
        },
      });
      if (signUpError) throw signUpError;
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setError('An account with this email already exists. Sign in, then redeem your code under Settings → Teacher access.');
        return;
      }
      if (data.session) navigate('/teacher/dashboard', { replace: true });
      else setSentTo(email);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (sentTo) {
    return (
      <AuthLayout variant="teacher" title="Verify your email">
        <div className="text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-success/15 text-success"><MailCheck className="h-6 w-6" /></span>
          <p className="text-sm">Your teacher account was created for <strong>{sentTo}</strong>. Open the verification link we emailed you, then sign in.</p>
          <Link to="/teacher/login" className="btn-primary mt-5 w-full">Go to teacher login</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      variant="teacher"
      title="Teacher onboarding"
      subtitle="Teacher accounts are approved by your institution. Use the invitation code sent to your school email."
      footer={<>Already set up? <Link to="/teacher/login" className="link">Teacher login</Link></>}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <Alert tone="info">
          No code yet? Ask your Macro AI administrator to invite your email address. If you already have a student account,
          sign in and redeem the code under <strong>Settings → Teacher access</strong>.
        </Alert>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Full name" autoComplete="name" icon={<User className="h-4 w-4" />} value={form.name} onChange={set('name')} error={show('name')} />
        <Field label="Invited email address" type="email" autoComplete="email" icon={<Mail className="h-4 w-4" />} value={form.email} onChange={set('email')} error={show('email')} />
        <Field label="Invitation code" autoComplete="one-time-code" icon={<KeyRound className="h-4 w-4" />} placeholder="MAC-XXXXXXXXXXXXXXXXXXXXXXXX"
          value={form.code} onChange={set('code')} error={show('code')} className="font-mono uppercase" />
        <div>
          <PasswordField label="Password" autoComplete="new-password" value={form.password} onChange={set('password')} error={show('password')} />
          <PasswordStrength password={form.password} />
        </div>
        <PasswordField label="Confirm password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} error={show('confirm')} />
        <button type="submit" className="btn-primary w-full py-3" disabled={submitting}>
          {submitting ? <Spinner label="Verifying invitation…" /> : 'Create teacher account'}
        </button>
      </form>
    </AuthLayout>
  );
}
