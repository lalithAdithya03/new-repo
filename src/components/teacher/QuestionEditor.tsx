import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DIFFICULTIES, type Difficulty, type QuestionType, type Quiz, type Resource, type Topic } from '@/lib/types';
import { Alert } from '@/components/ui/Alert';

const EMPTY = {
  question_type: 'mcq' as QuestionType, prompt: '', options: ['', '', '', ''], correct: 0, accepted: '', numeric: '', tolerance: '1',
  explanation: '', topic_id: '', difficulty: 'medium' as Difficulty, quiz_id: '', source_resource_id: '', source_location: '',
};

/** Creates a question (visible to students) and its answer key (visible only to course staff). */
export function QuestionEditor({ courseId, teacherId, topics, quizzes, resources, defaultQuizId, onSaved }: {
  courseId: string; teacherId: string; topics: Topic[]; quizzes: Quiz[]; resources: Resource[]; defaultQuizId?: string; onSaved: () => void;
}) {
  const [f, setF] = useState({ ...EMPTY, quiz_id: defaultQuizId ?? '' });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setOk(false);
    if (f.prompt.trim().length < 5) { setError('Write the question (at least 5 characters).'); return; }
    const options = f.options.map((o) => o.trim()).filter(Boolean);
    if (f.question_type === 'mcq' && (options.length < 2 || !f.options[f.correct]?.trim())) { setError('Multiple choice needs at least 2 options and a correct one selected.'); return; }
    if (f.question_type === 'short' && !f.accepted.trim()) { setError('Add at least one accepted answer.'); return; }
    if (f.question_type === 'numerical' && (f.numeric === '' || Number.isNaN(Number(f.numeric)))) { setError('Enter the numerical answer.'); return; }

    const correctIndex = f.question_type === 'mcq' ? options.indexOf(f.options[f.correct].trim()) : null;
    const { data: q, error: qErr } = await supabase.from('questions').insert({
      course_id: courseId, created_by: teacherId, quiz_id: f.quiz_id || null, topic_id: f.topic_id || null, question_type: f.question_type,
      prompt: f.prompt.trim(), options: f.question_type === 'mcq' ? options : [], difficulty: f.difficulty,
      source_resource_id: f.source_resource_id || null, source_location: f.source_location.trim() || null,
    }).select().single();
    if (qErr) { setError(qErr.message); return; }
    const { error: kErr } = await supabase.from('question_keys').insert({
      question_id: q.id, correct_option: correctIndex,
      accepted_answers: f.question_type === 'short' ? f.accepted.split('|').map((a) => a.trim()).filter(Boolean) : [],
      numeric_answer: f.question_type === 'numerical' ? Number(f.numeric) : null,
      tolerance: f.question_type === 'numerical' ? Math.max(0, Number(f.tolerance) || 0) / 100 : 0.01,
      explanation: f.explanation.trim(),
    });
    if (kErr) { await supabase.from('questions').delete().eq('id', q.id); setError(kErr.message); return; }
    setF({ ...EMPTY, quiz_id: f.quiz_id, topic_id: f.topic_id, difficulty: f.difficulty, question_type: f.question_type });
    setOk(true);
    onSaved();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div><label className="label" htmlFor="qe-type">Type</label>
          <select id="qe-type" className="input" value={f.question_type} onChange={(e) => setF({ ...f, question_type: e.target.value as QuestionType })}>
            <option value="mcq">Multiple choice</option><option value="short">Short answer</option><option value="numerical">Numerical</option>
          </select></div>
        <div><label className="label" htmlFor="qe-topic">Topic</label>
          <select id="qe-topic" className="input" value={f.topic_id} onChange={(e) => setF({ ...f, topic_id: e.target.value })}>
            <option value="">None</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></div>
        <div><label className="label" htmlFor="qe-diff">Difficulty</label>
          <select id="qe-diff" className="input capitalize" value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value as Difficulty })}>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select></div>
        <div><label className="label" htmlFor="qe-quiz">Add to</label>
          <select id="qe-quiz" className="input" value={f.quiz_id} onChange={(e) => setF({ ...f, quiz_id: e.target.value })}>
            <option value="">Question bank (adaptive practice)</option>{quizzes.map((z) => <option key={z.id} value={z.id}>Quiz: {z.title}</option>)}
          </select></div>
      </div>
      <div><label className="label" htmlFor="qe-prompt">Question</label>
        <textarea id="qe-prompt" className="input min-h-20" value={f.prompt} onChange={(e) => setF({ ...f, prompt: e.target.value })} /></div>

      {f.question_type === 'mcq' && (
        <fieldset className="space-y-2">
          <legend className="label">Options (select the correct one)</legend>
          {f.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name="qe-correct" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={f.correct === i} onChange={() => setF({ ...f, correct: i })} aria-label={`Option ${i + 1} is correct`} />
              <input className="input" value={o} placeholder={`Option ${i + 1}`} onChange={(e) => setF({ ...f, options: f.options.map((x, j) => (j === i ? e.target.value : x)) })} />
              {f.options.length > 2 && <button type="button" className="btn-ghost p-2" aria-label="Remove option" onClick={() => setF({ ...f, options: f.options.filter((_, j) => j !== i), correct: f.correct >= i && f.correct > 0 ? f.correct - 1 : f.correct })}><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
          {f.options.length < 6 && <button type="button" className="btn-ghost" onClick={() => setF({ ...f, options: [...f.options, ''] })}><Plus className="h-4 w-4" /> Add option</button>}
        </fieldset>
      )}
      {f.question_type === 'short' && (
        <div><label className="label" htmlFor="qe-acc">Accepted answers</label>
          <input id="qe-acc" className="input" value={f.accepted} onChange={(e) => setF({ ...f, accepted: e.target.value })} placeholder="learning rate | step size" />
          <p className="mt-1 text-xs text-muted">Separate alternatives with |. Matching ignores case and extra spaces.</p></div>
      )}
      {f.question_type === 'numerical' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="qe-num">Correct value</label><input id="qe-num" className="input" type="number" step="any" value={f.numeric} onChange={(e) => setF({ ...f, numeric: e.target.value })} /></div>
          <div><label className="label" htmlFor="qe-tol">Tolerance (%)</label><input id="qe-tol" className="input" type="number" step="any" min="0" value={f.tolerance} onChange={(e) => setF({ ...f, tolerance: e.target.value })} /></div>
        </div>
      )}
      <div><label className="label" htmlFor="qe-exp">Explanation (shown after submission)</label>
        <textarea id="qe-exp" className="input min-h-16" value={f.explanation} onChange={(e) => setF({ ...f, explanation: e.target.value })} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="qe-src">Source material</label>
          <select id="qe-src" className="input" value={f.source_resource_id} onChange={(e) => setF({ ...f, source_resource_id: e.target.value })}>
            <option value="">None</option>{resources.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select></div>
        <div><label className="label" htmlFor="qe-loc">Location in source</label>
          <input id="qe-loc" className="input" value={f.source_location} onChange={(e) => setF({ ...f, source_location: e.target.value })} placeholder="p.12, slide 4 or 00:12:30" /></div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {ok && <Alert tone="success">Question saved.</Alert>}
      <button className="btn-primary">Save question</button>
    </form>
  );
}
