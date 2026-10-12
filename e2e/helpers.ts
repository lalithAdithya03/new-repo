import { expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const PASSWORD = 'Passw0rd!23';
export const PG_URL = process.env.E2E_PG_URL ?? 'postgresql://postgres@127.0.0.1:54322/postgres';
export const MAIL_DIR = process.env.E2E_MAIL_DIR ?? '/tmp/macro-stack/mail';

/** Runs SQL as the database owner (test setup and assertions only). */
export function sql(query: string): string {
  return execFileSync('psql', [PG_URL, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', query], { encoding: 'utf8' }).trim();
}

export const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@macro.test`;

export async function login(page: Page, role: 'student' | 'teacher', email = `${role}@macro.test`, password = PASSWORD) {
  await page.goto(`/${role}/login`);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(new RegExp(`/${role}/dashboard`));
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: /account menu/i }).click();
  await page.getByTestId('logout').click();
  await expect(page).toHaveURL(/\/$|\/(student|teacher)\/login/);
}

/** Waits for the newest email to an address and returns the first link in it that matches. */
export async function latestLink(to: string, match: RegExp, after = 0): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const files = fs.existsSync(MAIL_DIR) ? fs.readdirSync(MAIL_DIR).filter((f) => f.endsWith(`-${to}.eml`) && +f.split('-')[0] > after).sort() : [];
    if (files.length) {
      const raw = fs.readFileSync(path.join(MAIL_DIR, files.at(-1)!), 'utf8')
        .replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/&amp;/g, '&');
      const link = raw.match(/https?:\/\/[^\s"'<>]+/g)?.find((l) => match.test(l));
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email to ${to} with a link matching ${match}`);
}

/** A one-page PDF with real extractable text, built by hand so the tests need no fixtures. */
export function tinyPdf(lines: string[]): Buffer {
  const text = lines.map((l, i) => `BT /F1 14 Tf 72 ${720 - i * 22} Td (${l.replace(/[()\\]/g, '\\$&')}) Tj ET`).join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}
