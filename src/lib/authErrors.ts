/** Turns Supabase Auth errors into messages a student or teacher can act on. */
export function friendlyAuthError(error: unknown): string {
  const raw = (error as { message?: string; code?: string; status?: number }) ?? {};
  const msg = (raw.message || String(error) || '').toLowerCase();
  const code = (raw.code || '').toLowerCase();

  if (code === 'invalid_credentials' || msg.includes('invalid login credentials'))
    return 'Incorrect email or password. Check both and try again.';
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed'))
    return 'Your email is not verified yet. Open the link we emailed you, or resend it below.';
  if (code === 'user_already_exists' || msg.includes('already registered'))
    return 'An account with this email already exists. Try signing in or resetting your password.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || msg.includes('rate limit') || raw.status === 429)
    return 'Too many attempts. Please wait a minute and try again.';
  if (code === 'weak_password' || msg.includes('password should'))
    return 'That password is too weak. Use at least 8 characters with letters and numbers.';
  if (msg.includes('invalid or expired teacher invitation') || msg.includes('database error saving new user'))
    return 'That invitation code is not valid for this email, has expired, or was already used.';
  if (code === 'same_password') return 'Choose a password different from your current one.';
  if (msg.includes('failed to fetch') || msg.includes('network'))
    return 'Cannot reach the server. Check your connection, or that Supabase is configured.';
  if (code === 'otp_expired' || msg.includes('expired'))
    return 'This link has expired. Request a new one.';
  return raw.message || 'Something went wrong. Please try again.';
}
