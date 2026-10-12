import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ClipboardList, History, ListChecks, Play, RotateCcw, Target, XCircle } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { getEnrolledCourses, getTopics } from '@/lib/api';
import { must, useAsync } from '@/lib/useAsync';
import { pct, scorePct, timeAgo } from '@/lib/format';
import type { AnswerResponse, GradedAttempt, PublicQuestion, Quiz, QuizAttempt, Resource, StartedAttempt } from '@/lib/types';
import { PageHeader, SectionCard } from '@/components/ui/PageHeader';
import { DifficultyBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Spinner, SkeletonRows } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { ProgressBar } from '@/components/ui/ProgressBar';

function QuestionCard({ q, index, value, onChange }: { q: PublicQuestion; index: number; value: AnswerResponse | undefined; onChange: (v: AnswerResponse) => void }) {
  const name = `q-${q.id}`;
  return (
    <fieldset className="card card-pad animate-fade-up" data-testid="quiz-question">
      <legend className="sr-only">Question {index + 1}</legend>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="chip">Q{index + 1}</span>
        {q.topic_name && <span className="chip">{q.topic_name}</span>}
        <DifficultyBadge value={q.difficulty} />
        <span className="chip">{q.type === 'mcq' ? 'Multiple choice' : q.type === 'short' ? 'Short answer' : 'Numerical'}</span>
      </div>
      <p className="font-medium">{q.prompt}</p>
      <div className="mt-4">
        {q.type === 'mcq' ? (
          <div className="grid gap-2">
            {q.options.map((opt, i) => (
              <label key={i} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition ${value?.option === i ? 'border-accent bg-primary/10' : 'border-border hover:border-accent/50'}`}>
                <input type="radio" name={name} className="h-4 w-4 accent-[rgb(var(--primary))]" checked={value?.option === i} onChange={() => onChange({ option: i })} />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        ) : q.type === 'short' ? (
          <input className="input" aria-label="Your answer" placeholder="Type your answer" value={value?.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} />
        ) : (
          <input className="input max-w-xs" aria-label="Your numerical answer" type="number" step="any" inputMode="decimal" placeholder="Enter a number"
            value={value?.value ?? ''} onChange={(e) => onChange({ value: e.target.value === '' ? undefined : Number(e.target.value) })} />
        )}
      </div>
    </fieldset>
  );
}

function Results({ result, onAgain }: { result: GradedAttempt; onAgain: () => void }) {
  const weakTopicIds = useMemo(() => [...new Set(result.results.filter((r) => (r.mastery ?? 1) < 0.5 && r.question.topic_id).map((r) => r.question.topic_id!))], [result]);
  const recs = useAsync(async () => weakTopicIds.length
    ? must(await supabase.from('resources').select('id, title, resource_type, topic_id').in('topic_id', weakTopicIds).limit(6)) as Pick<Resource, 'id' | 'title' | 'resource_type' | 'topic_id'>[]
    : [], [weakTopicIds.join(',')]);
  const ratio = result.max_score ? result.score / result.max_score : 0;
  const answerText = (r: GradedAttempt['results'][number]) =>
    r.question.type === 'mcq' ? r.question.options[r.correct_option ?? -1] : r.question.type === 'short' ? r.accepted_answer : String(r.numeric_answer);
  const yourText = (r: GradedAttempt['results'][number]) =>
    r.question.type === 'mcq' ? (r.response.option != null ? r.question.options[r.response.option] : '—') : r.question.type === 'short' ? r.response.text || '—' : r.response.value ?? '—';

  return (
    <div className="space-y-5" data-testid="quiz-results">
      <div className="card card-pad flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-primary/15">
          <span className="font-display text-2xl font-extrabold">{Math.round(ratio * 100)}%</span>
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold">You scored {result.score} / {result.max_score}</h2>
          <p className="text-sm text-muted">{ratio >= 0.8 ? 'Excellent work. Your mastery estimates went up.' : ratio >= 0.5 ? 'Good effort. Review the explanations below for the ones you missed.' : 'Keep going. The recommended material below targets your weak topics.'}</p>
        </div>
        <button className="btn-primary" onClick={onAgain}><RotateCcw className="h-4 w-4" /> New quiz</button>
      </div>

      {weakTopicIds.length > 0 && (
        <SectionCard title="Recommended revision" icon={<Target className="h-4 w-4 text-warning" />}>
          {recs.loading ? <Spinner /> : recs.data?.length ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {recs.data.map((r) => <li key={r.id}><Link to={`/resources/${r.id}`} className="card block p-3 text-sm font-medium hover:border-accent/60">{r.title}</Link></li>)}
            </ul>
          ) : (
            <p className="text-sm text-muted">Revise these topics in your course materials: {[...new Set(result.results.filter((r) => (r.mastery ?? 1) < 0.5).map((r) => r.question.topic_name))].join(', ')}.</p>
          )}
        </SectionCard>
      )}

      {result.results.map((r, i) => (
        <div key={r.question.id} className={`card card-pad border-l-4 ${r.is_correct ? 'border-l-success' : 'border-l-danger'}`}>
          <div className="flex items-start gap-3">
            {r.is_correct ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />}
            <div className="min-w-0 flex-1">
              <p className="font-medium">Q{i + 1}. {r.question.prompt}</p>
              <p className="mt-2 text-sm">Your answer: <span className={r.is_correct ? 'text-success' : 'text-danger'}>{String(yourText(r))}</span></p>
              {!r.is_correct && <p className="text-sm">Correct answer: <span className="font-semibold text-success">{answerText(r)}</span></p>}
              {r.explanation && <p className="mt-2 rounded-xl bg-surface-2 p-3 text-sm">{r.explanation}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                {r.question.topic_name && <span>Topic: {r.question.topic_name}{r.mastery != null && <> · mastery now {pct(r.mastery)}</>}</span>}
                {r.question.source_resource_id && (
                  <Link className="link" to={`/resources/${r.question.source_resource_id}${r.question.source_location ? `?loc=${encodeURIComponent(r.question.source_location)}` : ''}`}>
                    Source{r.question.source_location ? ` · ${r.question.source_location}` : ''}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function QuizzesPage() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const [courseId, setCourseId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState('auto');
  const [attempt, setAttempt] = useState<StartedAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerResponse>>({});
  const [result, setResult] = useState<GradedAttempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const courses = useAsync(() => getEnrolledCourses(profile!.id), [profile?.id]);
  const courseIds = courses.data?.map((c) => c.course.id) ?? [];
  useEffect(() => { if (!courseId && courseIds.length) setCourseId(courseIds[0]); }, [courseIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const topics = useAsync(() => getTopics(courseId ? [courseId] : []), [courseId]);
  const quizzes = useAsync(async () => courseIds.length
    ? must(await supabase.from('quizzes').select('*').in('course_id', courseIds).order('created_at', { ascending: false })) as Quiz[] : [], [courseIds.join(',')]);
  const attempts = useAsync(async () => must(await supabase.from('quiz_attempts').select('*').eq('student_id', profile!.id).eq('status', 'submitted')
    .order('submitted_at', { ascending: false }).limit(10)) as QuizAttempt[], [profile?.id, result?.attempt_id]);

  const begin = async (run: () => PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
    setBusy(true); setError(null); setResult(null); setAnswers({});
    const { data, error: e } = await run();
    setBusy(false);
    if (e) { setError(e.message); return; }
    setAttempt(data as StartedAttempt);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const startAdaptive = () => begin(() => supabase.rpc('start_adaptive_attempt', { p_course_id: courseId, p_topic_id: topicId || null, p_count: count, p_difficulty: difficulty }));
  const startQuiz = (quizId: string) => begin(() => supabase.rpc('start_quiz_attempt', { p_quiz_id: quizId }));

  // Deep link from search: /student/quizzes?quiz=<id>
  const quizParam = params.get('quiz');
  useEffect(() => {
    if (quizParam && !attempt && !busy) { startQuiz(quizParam); setParams({}, { replace: true }); }
  }, [quizParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const answered = attempt ? attempt.questions.filter((q) => {
    const a = answers[q.id];
    return a && (a.option != null || (a.text ?? '').trim() || a.value != null);
  }).length : 0;

  const submit = async () => {
    if (!attempt) return;
    setBusy(true); setError(null);
    const { data, error: e } = await supabase.rpc('submit_quiz_attempt', { p_attempt_id: attempt.attempt_id, p_answers: answers });
    setBusy(false);
    if (e) { setError(e.message); return; }
    setResult(data as GradedAttempt);
    setAttempt(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (result) return <><PageHeader title="Quiz results" /><Results result={result} onAgain={() => setResult(null)} /></>;

  if (attempt) {
    return (
      <div>
        <PageHeader title={attempt.quiz_title ?? 'Adaptive practice'} subtitle={`${attempt.questions.length} questions · answers are checked on the server when you submit`} />
        <div className="sticky top-16 z-10 -mx-4 mb-4 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          <div className="mb-1 flex justify-between text-xs text-muted"><span>{answered} of {attempt.questions.length} answered</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-primary transition-all" style={{ width: `${(answered / attempt.questions.length) * 100}%` }} /></div>
        </div>
        <div className="space-y-4">
          {attempt.questions.map((q, i) => (
            <QuestionCard key={q.id} q={q} index={i} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
          ))}
        </div>
        {error && <div className="mt-4"><Alert tone="error">{error}</Alert></div>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button className="btn-ghost" onClick={() => setAttempt(null)}>Cancel</button>
          <button className="btn-primary px-6" onClick={submit} disabled={busy} data-testid="submit-quiz">
            {busy ? <Spinner label="Grading…" /> : answered < attempt.questions.length ? `Submit (${attempt.questions.length - answered} unanswered)` : 'Submit answers'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Quizzes & assessments" subtitle="Adaptive practice that targets your weak topics, plus quizzes from your teachers." />
      {courses.loading ? <SkeletonRows /> : courses.error ? <ErrorState message={courses.error} onRetry={courses.reload} /> : !courses.data?.length ? (
        <EmptyState icon={ListChecks} title="No courses yet" action={<Link to="/student/courses" className="btn-primary">Browse courses</Link>}>Enrol in a course to take quizzes.</EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-6">
            <SectionCard title="Adaptive practice" icon={<Target className="h-4 w-4 text-accent" />}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="label" htmlFor="qc">Course</label>
                  <select id="qc" className="input" value={courseId} onChange={(e) => { setCourseId(e.target.value); setTopicId(''); }}>
                    {courses.data.map((c) => <option key={c.course.id} value={c.course.id}>{c.course.title}</option>)}
                  </select></div>
                <div><label className="label" htmlFor="qt">Topic</label>
                  <select id="qt" className="input" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
                    <option value="">All topics (weakest first)</option>
                    {topics.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select></div>
                <div><label className="label" htmlFor="qn">Questions</label>
                  <select id="qn" className="input" value={count} onChange={(e) => setCount(+e.target.value)}>
                    {[3, 5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select></div>
                <div><label className="label" htmlFor="qd">Difficulty</label>
                  <select id="qd" className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                    <option value="auto">Adaptive (matches your mastery)</option>
                    <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                  </select></div>
              </div>
              {error && <div className="mt-4"><Alert tone="error">{error}</Alert></div>}
              <button className="btn-primary mt-5 w-full sm:w-auto" onClick={startAdaptive} disabled={busy || !courseId} data-testid="start-adaptive">
                {busy ? <Spinner label="Preparing questions…" /> : <><Play className="h-4 w-4" /> Start practice</>}
              </button>
              <p className="mt-3 text-xs text-muted">Unseen questions come first, so you won't repeat questions until you've seen the whole bank.</p>
            </SectionCard>

            <SectionCard title="Quizzes from your teachers" icon={<ClipboardList className="h-4 w-4 text-accent" />}>
              {quizzes.loading ? <SkeletonRows rows={2} /> : quizzes.data?.length ? (
                <ul className="space-y-2">
                  {quizzes.data.map((z) => (
                    <li key={z.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{z.title}</p>
                        <p className="truncate text-xs text-muted">{courses.data!.find((c) => c.course.id === z.course_id)?.course.title} · {z.description}</p>
                      </div>
                      <DifficultyBadge value={z.difficulty} />
                      <button className="btn-secondary" onClick={() => startQuiz(z.id)} disabled={busy}>Start</button>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">Your teachers haven't published any quizzes yet.</p>}
            </SectionCard>
          </div>

          <SectionCard title="Recent attempts" icon={<History className="h-4 w-4 text-accent" />}>
            {attempts.loading ? <SkeletonRows /> : attempts.data?.length ? (
              <ul className="space-y-3">
                {attempts.data.map((a) => (
                  <li key={a.id}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="truncate">{a.mode === 'quiz' ? (quizzes.data?.find((z) => z.id === a.quiz_id)?.title ?? 'Quiz') : 'Adaptive practice'}</span>
                      <span className="font-semibold">{a.score}/{a.max_score} · {scorePct(a.score, a.max_score)}</span>
                    </div>
                    <ProgressBar value={a.max_score ? (a.score ?? 0) / a.max_score : 0} />
                    <p className="mt-1 text-xs text-muted">{timeAgo(a.submitted_at)}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No attempts yet. Your scores will appear here.</p>}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
