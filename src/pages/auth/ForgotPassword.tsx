import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Field } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { friendlyAuthError } from '@/lib/authErrors';
import { validateEmail } from '@/lib/validation';

export default function ForgotPassword() {
  const [params] = useSearchParams();
  const portal = params.get('portal') === 'teacher' ? 'teacher' : 'student';
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const emailErr = touched ? validateEmail(email) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (validateEmail(email)) return;
    if (!isSupabaseConfigured) { setError('Supabase is not configured yet.'); return; }
    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password?portal=${portal}`,
    });
    setSubmitting(false);
    // Rate limits are worth reporting; "user not found" is deliberately not revealed.
    if (resetError && (resetError as { status?: number }).status === 429) { setError(friendlyAuthError(resetError)); return; }
    setSent(true);
  };

  return (
    <AuthLayout
      variant={portal}
      title="Reset your password"
      subtitle="Enter your account email and we'll send you a secure reset link."
      footer={<Link to={`/${portal}/login`} className="link">Back to {portal} login</Link>}
    >
      {sent ? (
        <Alert tone="success" title="Check your email">
          If an account exists for {email.trim()}, a password reset link is on its way. The link expires after a short time.
        </Alert>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Email address" type="email" autoComplete="email" icon={<Mail className="h-4 w-4" />} value={email}
            onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)} error={emailErr} />
          <button type="submit" className="btn-primary w-full py-3" disabled={submitting}>
            {submitting ? <Spinner label="Sending…" /> : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
