/**
 * AI tutor pipeline:
 *  1. retrieve candidate excerpts the student may read (match_chunks RPC, RLS-enforced)
 *  2. decide coverage locally with the StudyMate grounding engine; off-material questions stop here
 *  3. generate an explanation with the server-side "tutor" Edge Function (API key stays on the server)
 *  4. if that function is not deployed/configured, fall back to clearly-labelled demo mode:
 *     verbatim sentences from the sources, no generated text.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase, TUTOR_FUNCTION } from './supabase';
import { assessGrounding, extractiveAnswer } from './grounding';
import type { Citation, Grounding, MatchedChunk } from './types';

export type Level = 'beginner' | 'intermediate' | 'advanced';

export interface TutorAnswer {
  content: string;
  grounding: Grounding;
  citations: Citation[];
  /** Why demo mode was used, when it was. */
  demoReason?: string;
  closestTopics?: string[];
}

function toCitation(c: MatchedChunk, n: number): Citation {
  return {
    n, chunk_id: c.id, resource_id: c.resource_id, resource_title: c.resource_title, resource_type: c.resource_type,
    location_kind: c.location_kind, location_label: c.location_label, topic_name: c.topic_name, excerpt: c.content.slice(0, 280),
  };
}

export async function retrieve(question: string, courseId?: string | null, resourceId?: string | null) {
  const { data, error } = await supabase.rpc('match_chunks', {
    p_query: question, p_course_id: courseId || null, p_resource_id: resourceId || null, p_limit: 8,
  });
  if (error) throw error;
  return (data ?? []) as MatchedChunk[];
}

export async function askTutor(opts: {
  question: string; level: Level; courseId?: string | null; resourceId?: string | null;
  history: { role: 'user' | 'assistant'; content: string }[];
}): Promise<TutorAnswer> {
  const chunks = await retrieve(opts.question, opts.courseId, opts.resourceId);
  const g = assessGrounding(opts.question, chunks);
  const closestTopics = [...new Set(g.ranked.slice(0, 3).filter((r) => r.score > 0).map((r) => r.chunk.topic_name))];

  if (g.level === 'not_covered') {
    return {
      grounding: 'not_covered',
      content: 'This question is not covered by your course material, so I won’t answer it from outside knowledge.',
      citations: [],
      closestTopics,
    };
  }

  const top = g.ranked.slice(0, 5).map((r) => r.chunk);
  const { data, error } = await supabase.functions.invoke(TUTOR_FUNCTION, {
    body: { question: opts.question, level: opts.level, chunk_ids: top.map((c) => c.id), history: opts.history },
  });

  if (!error && data && typeof data.answer === 'string') {
    const covered = data.covered as 'full' | 'partial' | 'none';
    return {
      grounding: covered === 'none' ? 'not_covered' : covered === 'partial' || g.level === 'partial' ? 'partial' : 'grounded',
      content: data.answer,
      // Keep the [n] numbering the model used so inline citations match the chips.
      citations: (data.cited as number[]).filter((n) => top[n - 1]).map((n) => toCitation(top[n - 1], n)),
      closestTopics: covered === 'none' ? closestTopics : undefined,
    };
  }

  // Demo mode: the AI function isn't available. Say so, and quote the sources instead of generating.
  let demoReason = 'The AI tutor service is not configured, so this answer quotes your material directly.';
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body?.error === 'rate_limited') demoReason = 'The AI service is busy right now, so this answer quotes your material directly.';
      else if (body?.error && body.error !== 'not_configured') demoReason = `The AI service returned an error (${body.error}), so this answer quotes your material directly.`;
    } catch { /* keep default */ }
  }
  const picks = extractiveAnswer(opts.question, g.ranked);
  const ids = [...new Set(picks.map((p) => p.chunk.id))];
  const numbered = ids.map((id, i) => toCitation(picks.find((p) => p.chunk.id === id)!.chunk, i + 1));
  const quote = picks.map((p) => `“${p.sentence}” [${ids.indexOf(p.chunk.id) + 1}]`).join(' ');
  return {
    grounding: g.level === 'partial' ? 'partial' : 'demo',
    content: g.level === 'partial'
      ? `Only part of your question is covered by the material. Here is what it says: ${quote}`
      : quote,
    citations: numbered,
    demoReason,
  };
}
