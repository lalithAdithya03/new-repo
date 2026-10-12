import crypto from 'node:crypto';
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
export function sign(payload, secret) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
export function verify(token, secret) {
  const [h, b, s] = (token || '').split('.');
  if (!s) return null;
  const expect = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url');
  if (expect !== s) return null;
  const p = JSON.parse(Buffer.from(b, 'base64url').toString());
  if (p.exp && p.exp < Date.now() / 1000) return null;
  return p;
}
if (process.argv[2]) {
  const secret = process.argv[3];
  console.log(sign({ role: process.argv[2], iss: 'supabase', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 10 * 365 * 86400 }, secret));
}
