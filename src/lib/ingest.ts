/**
 * Turns uploaded material into citeable chunks (one per page / slide / timestamp / section).
 * - PDFs: text is extracted in the browser with pdf.js, one chunk per page (page numbers kept).
 * - Text, Markdown, VTT/SRT transcripts and pasted notes: StudyMate markers are understood:
 *     "## Topic > Prereq"  sets the topic, "[p.12]" / "[slide 4]" / "[00:12:30]" set the location,
 *     VTT/SRT cue timestamps become locations automatically.
 * Other formats (PPTX, DOCX, video) are stored as files; add their text as notes/transcript to make them citeable.
 */
import type { LocationKind } from './types';

export interface ChunkDraft {
  topic_name: string;
  location_kind: LocationKind;
  location_label: string;
  page_number: number | null;
  seconds: number | null;
  content: string;
}

const MAX_CHUNK = 1500;

function toSeconds(ts: string) {
  const parts = ts.split(':').map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function locationOf(marker: string): Pick<ChunkDraft, 'location_kind' | 'location_label' | 'page_number' | 'seconds'> {
  const m = marker.trim();
  let r: RegExpMatchArray | null;
  if ((r = m.match(/^p\.?\s*(\d+)$/i))) return { location_kind: 'page', location_label: `p.${r[1]}`, page_number: +r[1], seconds: null };
  if ((r = m.match(/^slide\s*(\d+)$/i))) return { location_kind: 'slide', location_label: `slide ${r[1]}`, page_number: +r[1], seconds: null };
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(m)) {
    const label = m.split(':').length === 2 ? `00:${m.padStart(5, '0')}` : m.padStart(8, '0');
    return { location_kind: 'timestamp', location_label: label, page_number: null, seconds: toSeconds(m) };
  }
  return { location_kind: 'section', location_label: m, page_number: null, seconds: null };
}

/** Splits long text at sentence boundaries so each chunk stays readable as a citation. */
export function splitLong(text: string, max = MAX_CHUNK): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let cur = '';
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    if ((cur + ' ' + s).trim().length > max && cur) { out.push(cur.trim()); cur = s; }
    else cur = `${cur} ${s}`;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.flatMap((c) => (c.length > max * 1.5 ? c.match(new RegExp(`.{1,${max}}`, 'gs')) ?? [c] : [c]));
}

export function parseMarkedText(raw: string, defaultTopic = 'General'): ChunkDraft[] {
  const out: ChunkDraft[] = [];
  let topic = defaultTopic;
  let loc = locationOf('§1');
  let buf: string[] = [];
  let cues = 0;
  let sectionNo = 1;

  const flush = () => {
    const text = buf.join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    buf = [];
    if (text.length < 20) return;
    for (const piece of splitLong(text)) out.push({ topic_name: topic, ...loc, content: piece });
  };

  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    let m: RegExpMatchArray | null;
    if ((m = s.match(/^#{1,3}\s*([^>]+?)\s*(?:>\s*(.+))?$/))) {
      flush();
      topic = m[1].trim();
      if (loc.location_kind === 'section') loc = locationOf(`§${++sectionNo}`);
    } else if ((m = s.match(/^\[(p\.?\s*\d+|slide\s*\d+|\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/i))) {
      flush();
      loc = locationOf(m[1]);
      if (m[2]) buf.push(m[2]);
    } else if ((m = s.match(/^(\d{1,2}:\d{2}(?::\d{2})?)(?:[.,]\d+)?\s*-->/))) {
      // VTT/SRT cue: start a new chunk every 4 cues so timestamps stay precise.
      if (cues++ % 4 === 0) { flush(); loc = locationOf(m[1]); }
    } else if (s && !/^\d+$/.test(s) && !/^WEBVTT/i.test(s) && !/^NOTE\b/.test(s)) {
      buf.push(s);
    }
  }
  flush();
  return out;
}

export function isPdf(file: File) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}
export function isTextLike(file: File) {
  return /^text\//.test(file.type) || /\.(txt|md|markdown|vtt|srt)$/i.test(file.name);
}

/** Extracts per-page text from a PDF in the browser. pdf.js is loaded only when needed. */
export async function extractPdfChunks(file: File, topic: string, onProgress?: (page: number, total: number) => void) {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const chunks: ChunkDraft[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = content.items.map((i) => ('str' in i ? i.str : '')).join(' ').replace(/\s+/g, ' ').trim();
    for (const piece of text.length >= 20 ? splitLong(text) : []) {
      chunks.push({ topic_name: topic, location_kind: 'page', location_label: `p.${p}`, page_number: p, seconds: null, content: piece });
    }
    onProgress?.(p, doc.numPages);
  }
  return { chunks, pageCount: doc.numPages };
}

export function formatSeconds(total: number) {
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
