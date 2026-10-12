export function timeAgo(iso: string | null | undefined) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  const units: [number, string][] = [[60, 'minute'], [3600, 'hour'], [86400, 'day'], [604800, 'week'], [2629800, 'month'], [31557600, 'year']];
  let unit = units[0];
  for (const u of units) if (diff >= u[0]) unit = u;
  const n = Math.floor(diff / unit[0]);
  return `${n} ${unit[1]}${n === 1 ? '' : 's'} ago`;
}

export function pct(v: number | null | undefined) {
  return v == null ? '–' : `${Math.round(v * 100)}%`;
}

export function scorePct(score: number | null, max: number | null) {
  if (score == null || !max) return '–';
  return `${Math.round((score / max) * 100)}%`;
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function bytes(n: number | null | undefined) {
  if (!n) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i ? 1 : 0)} ${u[i]}`;
}
