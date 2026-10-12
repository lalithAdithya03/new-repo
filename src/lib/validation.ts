export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Enter your email address.';
  if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address, like name@school.edu.';
  return null;
}

export function validateLoginPassword(password: string): string | null {
  if (!password) return 'Enter your password.';
  return null;
}

/** Rules for new passwords (registration and reset). */
export function validateNewPassword(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) return 'Include at least one letter and one number.';
  return null;
}

export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^a-zA-Z0-9]/.test(password)) score++;
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
  return { score: score as 0 | 1 | 2 | 3 | 4, label: labels[score] };
}

export function validateName(name: string): string | null {
  if (name.trim().length < 2) return 'Enter your full name.';
  return null;
}

export const INVITE_CODE_RE = /^MAC-[0-9A-F]{24}$/;
export function validateInviteCode(code: string): string | null {
  if (!code.trim()) return 'Enter the invitation code from your institution.';
  if (!INVITE_CODE_RE.test(code.trim().toUpperCase())) return 'Invitation codes look like MAC- followed by 24 letters and numbers.';
  return null;
}
