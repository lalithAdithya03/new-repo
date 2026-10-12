// Tiny stand-in for the Supabase API gateway (local tests only):
//   /auth/v1/*  -> GoTrue      /rest/v1/* -> PostgREST
//   /storage/v1 -> minimal object storage that enforces storage.objects RLS through psql as the caller
//   /functions/v1/* -> 404 (no Edge Functions locally, so the tutor runs in demo mode)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { verify } from './jwt.mjs';

const PORT = +process.env.GATEWAY_PORT || 54321;
const SECRET = process.env.JWT_SECRET;
const PG = process.env.PG_URL;
const FILES = process.env.STORAGE_DIR;
const AUTH = 'http://127.0.0.1:9999', REST = 'http://127.0.0.1:3000';
const signed = new Map();

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, prefer, range, accept-profile, content-profile, x-upsert, cache-control, x-supabase-api-version',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
  'access-control-expose-headers': 'content-range, content-location, x-total-count',
};
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { ...cors, 'content-type': 'application/json', ...headers });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

function sqlAs(claims, sql) {
  const script = `begin; select set_config('request.jwt.claims', ${lit(JSON.stringify(claims))}, true); set local role ${claims.role === 'authenticated' ? 'authenticated' : 'anon'}; ${sql}; commit;`;
  return execFileSync('psql', [PG, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function proxy(req, res, target) {
  const body = await readBody(req);
  const headers = { ...req.headers };
  delete headers.host; delete headers['content-length'];
  const r = await fetch(target, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body, redirect: 'manual' });
  const out = Buffer.from(await r.arrayBuffer());
  const h = {};
  r.headers.forEach((v, k) => { if (!k.startsWith('access-control') && !['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)) h[k] = v; });
  res.writeHead(r.status, { ...h, ...cors });
  res.end(out);
}

async function storage(req, res, url) {
  const m = url.pathname.match(/^\/storage\/v1\/object\/(sign\/|public\/|authenticated\/)?([^/]+)\/(.+)$/);
  if (req.method === 'GET' && url.pathname.startsWith('/storage/v1/object/sign/')) {
    const tok = url.searchParams.get('token');
    const f = signed.get(tok);
    if (!f || f.exp < Date.now()) return send(res, 400, { error: 'invalid signature' });
    return send(res, 200, fs.readFileSync(f.file), { 'content-type': f.mime || 'application/octet-stream' });
  }
  const claims = verify((req.headers.authorization || '').replace(/^Bearer /, ''), SECRET);
  if (!claims) return send(res, 401, { error: 'Invalid JWT', message: 'Invalid JWT' });
  if (req.method === 'DELETE' && url.pathname.match(/^\/storage\/v1\/object\/[^/]+\/?$/)) {
    const bucket = url.pathname.split('/')[4];
    const { prefixes } = JSON.parse((await readBody(req)).toString() || '{}');
    const removed = [];
    for (const name of prefixes || []) {
      try {
        const out = sqlAs(claims, `delete from storage.objects where bucket_id = ${lit(bucket)} and name = ${lit(name)} returning name`);
        if (out) { removed.push({ name }); fs.rmSync(path.join(FILES, bucket, name), { force: true }); }
      } catch { /* RLS denied: skip */ }
    }
    return send(res, 200, removed);
  }
  if (!m) return send(res, 404, { error: 'not found' });
  const [, kind, bucket, name] = m;
  const file = path.join(FILES, bucket, decodeURIComponent(name));
  try {
    if (req.method === 'POST' && kind === 'sign/') {
      const ok = sqlAs(claims, `select count(*) from storage.objects where bucket_id = ${lit(bucket)} and name = ${lit(decodeURIComponent(name))}`);
      if (ok !== '1') return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      const { expiresIn } = JSON.parse((await readBody(req)).toString() || '{}');
      const token = crypto.randomBytes(16).toString('hex');
      const meta = fs.existsSync(file + '.mime') ? fs.readFileSync(file + '.mime', 'utf8') : '';
      signed.set(token, { file, mime: meta, exp: Date.now() + (expiresIn || 60) * 1000 });
      return send(res, 200, { signedURL: `/object/sign/${bucket}/${name}?token=${token}` });
    }
    if ((req.method === 'POST' || req.method === 'PUT') && !kind) {
      const body = await readBody(req);
      sqlAs(claims, `insert into storage.objects (bucket_id, name, owner) values (${lit(bucket)}, ${lit(decodeURIComponent(name))}, ${lit(claims.sub)})`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      // supabase-js sends a File as multipart/form-data when it is a Blob in the browser; store raw bytes either way.
      let data = body;
      const ct = req.headers['content-type'] || '';
      if (ct.startsWith('multipart/form-data')) {
        const boundary = '--' + ct.split('boundary=')[1];
        const start = body.indexOf('\r\n\r\n', body.indexOf(boundary)) + 4;
        const end = body.lastIndexOf(boundary) - 2;
        data = body.subarray(start, end);
      }
      fs.writeFileSync(file, data);
      fs.writeFileSync(file + '.mime', ct.startsWith('multipart') ? 'application/octet-stream' : ct);
      return send(res, 200, { Key: `${bucket}/${name}`, Id: crypto.randomUUID() });
    }
  } catch (e) {
    const msg = String(e.stderr || e.message);
    const rls = /row-level security|permission denied/.test(msg);
    return send(res, rls ? 403 : 400, { statusCode: rls ? '403' : '400', error: rls ? 'Unauthorized' : 'Error', message: rls ? 'new row violates row-level security policy' : msg });
  }
  return send(res, 405, { error: 'method not allowed' });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  try {
    if (url.pathname.startsWith('/auth/v1')) return await proxy(req, res, AUTH + url.pathname.slice(8) + url.search);
    if (url.pathname.startsWith('/rest/v1')) return await proxy(req, res, REST + url.pathname.slice(8) + url.search);
    if (url.pathname.startsWith('/storage/v1')) return await storage(req, res, url);
    // GoTrue builds email links (/verify?token=…) from the bare external URL; route them to Auth too.
    if (/^\/(verify|callback|authorize)\b/.test(url.pathname)) return await proxy(req, res, AUTH + url.pathname + url.search);
    if (url.pathname.startsWith('/functions/v1')) return send(res, 404, { error: 'not_found', message: 'Function not deployed' });
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, 502, { error: String(e) }); }
}).listen(PORT, '127.0.0.1', () => console.log(`gateway on :${PORT}`));
