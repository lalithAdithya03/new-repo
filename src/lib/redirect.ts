/** Only allow same-site relative paths in ?next= to avoid open redirects. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  try {
    const decoded = decodeURIComponent(next);
    if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.includes('\\')) return null;
    return decoded;
  } catch {
    return null;
  }
}
