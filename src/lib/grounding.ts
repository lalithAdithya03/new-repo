/**
 * Grounding engine ported from StudyMate (docs/ARCHITECTURE.md §2): tokeniser, BM25-style scoring,
 * key-term coverage, and an extractive answer. It decides whether a question is covered by the
 * retrieved course material before any AI is involved, and powers demo mode when no AI is configured.
 */
import type { Grounding, MatchedChunk } from './types';

const STOP = new Set(
  'a an the of in on to is are was were be been and or for with as by at from that this it its which what how why when who do does did can could should would will into than then there their these those such not no but if so we you your about between over under using use used also may might each explain tell me please describe give'.split(' '),
);

export function stem(w: string) {
  if (w.length > 5) w = w.replace(/(ing|ed)$/, '');
  return w.endsWith('ss') ? w : w.replace(/s$/, '');
}

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 1 && !STOP.has(w)).map(stem);
}

export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

export interface ScoredChunk { chunk: MatchedChunk; score: number; coverage: number }

export interface GroundingResult {
  level: Exclude<Grounding, 'demo'>;
  coverage: number;
  ranked: ScoredChunk[];
}

/** Coverage thresholds from StudyMate: < 0.30 refuse, 0.30–0.60 partial, >= 0.60 answer. */
export const COVERAGE_REFUSE = 0.3;
export const COVERAGE_FULL = 0.6;

export function assessGrounding(question: string, chunks: MatchedChunk[]): GroundingResult {
  const qt = [...new Set(tokenize(question))];
  if (!qt.length || !chunks.length) return { level: 'not_covered', coverage: 0, ranked: [] };

  const docs = chunks.map((c) => tokenize(`${c.topic_name} ${c.content}`));
  const df: Record<string, number> = {};
  docs.forEach((d) => new Set(d).forEach((t) => (df[t] = (df[t] || 0) + 1)));
  const n = docs.length;
  // Terms that appear in no retrieved chunk get the maximum IDF, so missing key terms hurt coverage.
  const maxIdf = Math.log(1 + (n + 0.5) / 0.5);
  const idf = (t: string) => (df[t] ? Math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5)) : maxIdf);
  const avgLen = docs.reduce((a, d) => a + d.length, 0) / n || 1;
  const total = qt.reduce((a, t) => a + idf(t), 0);

  const ranked = chunks
    .map((chunk, i) => {
      let score = 0;
      let covered = 0;
      for (const t of qt) {
        const f = docs[i].filter((x) => x === t).length;
        if (f) {
          score += (idf(t) * f * 2.2) / (f + 1.2 * (0.25 + (0.75 * docs[i].length) / avgLen));
          covered += idf(t);
        }
      }
      return { chunk, score, coverage: total ? covered / total : 0 };
    })
    .sort((a, b) => b.score - a.score);

  const coverage = ranked[0].score ? ranked[0].coverage : 0;
  const level = coverage < COVERAGE_REFUSE ? 'not_covered' : coverage < COVERAGE_FULL ? 'partial' : 'grounded';
  return { level, coverage, ranked };
}

/** Best-matching sentences from the top chunks, quoted verbatim (no generated text). */
export function extractiveAnswer(question: string, ranked: ScoredChunk[], maxSentences = 2) {
  const qt = new Set(tokenize(question));
  const picks: { sentence: string; chunk: MatchedChunk; overlap: number }[] = [];
  for (const { chunk } of ranked.slice(0, 2)) {
    for (const s of sentences(chunk.content)) {
      const overlap = tokenize(s).filter((t) => qt.has(t)).length;
      if (overlap > 0) picks.push({ sentence: s, chunk, overlap });
    }
  }
  return picks.sort((a, b) => b.overlap - a.overlap).slice(0, maxSentences);
}
