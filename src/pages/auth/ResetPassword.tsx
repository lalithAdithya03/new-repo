import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { PasswordField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Alert';
import { FullPageSpinner, Spinner } from '@/components/ui/Spinner';
import { supabase } from '@/lib/supabase';
import { friendlyAuthError } from '@/lib/authErrors';
import { validateNewPassword } from '@/lib/validation';
import { useAuth } from '@/auth/AuthProvider';

/** Landing page for the emailed recovery link; Supabase signs the user in from the link first. */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const portal = params.get('portal') === 'teacher' ? 'teacher' : 'student';
  const navigate = useNavigate();
  const { session, loading, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passErr = touched ? validateNewPassword(password) : null;
  const confirmErr = touched && confirm !== password ? 'Passwords do not match.' : null;

  if (loading) return <FullPageSpinner label="Checking your reset link…" />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (validateNewPassword(password) || confirm !== password) return;
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) { setError(friendlyAuthError(updateError)); return; }
    await signOut();
    navigate(`/${portal}/login?reset=1`, { replace: true });
  };

  return (
    <AuthLayout variant={portal} title="Choose a new password" footer={<Link to={`/${portal}/login`} className="link">Back to login</Link>}>
      {!session ? (
        <Alert tone="error" title="This reset link is invalid or has expired">
          <Link to={`/forgot-password?portal=${portal}`} className="link">Request a new link</Link>
        </Alert>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <div>
            <PasswordField label="New password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={passErr} />
            <PasswordStrength password={password} />
          </div>
          <PasswordField label="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={confirmErr} />
          <button type="submit" className="btn-primary w-full py-3" disabled={submitting}>
            {submitting ? <Spinner label="Saving…" /> : 'Update password'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
