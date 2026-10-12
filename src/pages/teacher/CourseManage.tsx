import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, Eye, FolderOpen, Hash, ListChecks, Plus, Settings2, Trash2, Users } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { MATERIALS_BUCKET, supabase } from '@/lib/supabase';
import { recordActivity } from '@/lib/api';
import { must, useAsync } from '@/lib/useAsync';
import { pct, scorePct, timeAgo } from '@/lib/format';
import { DIFFICULTIES, RESOURCE_TYPES, type Course, type Difficulty, type Question, type Quiz, type QuizAttempt, type Resource, type Topic, type TopicMastery } from '@/lib/types';
import { PageHeader, SectionCard, StatCard } from '@/components/ui/PageHeader';
import { DifficultyBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { FullPageSpinner, SkeletonRows } from '@/components/ui/Spinner';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { CourseForm } from '@/components/teacher/CourseForm';
import { UploadResource } from '@/components/teacher/UploadResource';
import { QuestionEditor } from '@/components/teacher/QuestionEditor';

const TABS = [
  { id: 'materials', label: 'Materials', icon: FolderOpen },
  { id: 'topics', label: 'Topics', icon: Hash },
  { id: 'quizzes', label: 'Assessments', icon: ListChecks },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings2 },
] as const;

interface Insights {
  students: number; attempts: number; avg_score: number | null;
  topics: { topic_id: string; name: string; avg_mastery: number | null; students_struggling: number }[];
  hardest_questions: { question_id: string; prompt: string; answered: number; correct_rate: number }[];
}

export default function CourseManage() {
  const { id } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') ?? 'materials') as (typeof TABS)[number]['id'];
  const [showQuestion, setShowQuestion] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const base = useAsync(async () => {
    const course = must(await supabase.from('courses').select('*').eq('id', id!).maybeSingle()) as Course | null;
    if (!course) return null;
    const [topics, resources, quizzes, questions] = await Promise.all([
      supabase.from('topics').select('*').eq('course_id', id!).order('position').then(must) as Promise<Topic[]>,
      supabase.from('resources').select('*').eq('course_id', id!).order('created_at', { ascending: false }).then(must) as Promise<Resource[]>,
      supabase.from('quizzes').select('*').eq('course_id', id!).order('created_at', { ascending: false }).then(must) as Promise<Quiz[]>,
      supabase.from('questions').select('*').eq('course_id', id!).order('created_at', { ascending: false }).then(must) as Promise<Question[]>,
    ]);
    return { course, topics, resources, quizzes, questions };
  }, [id]);

  const students = useAsync(async () => {
    if (tab !== 'students') return null;
    const [enr, attempts, mastery] = await Promise.all([
      supabase.from('course_enrollments').select('enrolled_at, student:profiles(id, full_name, email)').eq('course_id', id!).then(must) as Promise<{ enrolled_at: string; student: { id: string; full_name: string; email: string } | null }[]>,
      supabase.from('quiz_attempts').select('*').eq('course_id', id!).eq('status', 'submitted').order('submitted_at', { ascending: false }).then(must) as Promise<QuizAttempt[]>,
      supabase.from('topic_mastery').select('*').eq('course_id', id!).then(must) as Promise<TopicMastery[]>,
    ]);
    return { enr, attempts, mastery };
  }, [id, tab]);

  const insights = useAsync(async () => (tab === 'insights' ? must(await supabase.rpc('course_insights', { p_course_id: id! })) as Insights : null), [id, tab]);

  if (base.loading) return <FullPageSpinner />;
  if (base.error) return <ErrorState message={base.error} onRetry={base.reload} />;
  if (!base.data) return <EmptyState icon={Settings2} title="Course not found">It doesn't exist or you don't manage it.</EmptyState>;
  const { course, topics, resources, quizzes, questions } = base.data;
  if (profile?.role !== 'admin' && course.teacher_id !== profile?.id) {
    return <EmptyState icon={Settings2} title="You don't manage this course">Only the course's teacher (or an administrator) can edit it.</EmptyState>;
  }

  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    setActionError(null);
    const { error } = await p;
    if (error) setActionError(error.message); else base.reload();
  };

  const deleteResource = async (r: Resource) => {
    if (!confirm(`Delete “${r.title}”? This also removes its file and extracted text.`)) return;
    if (r.storage_path) await supabase.storage.from(MATERIALS_BUCKET).remove([r.storage_path]);
    run(supabase.from('resources').delete().eq('id', r.id));
  };

  return (
    <div>
      <Link to="/teacher/courses" className="btn-ghost -ml-3 mb-2 w-fit"><ArrowLeft className="h-4 w-4" /> Courses</Link>
      <PageHeader
        title={course.title}
        subtitle={<>{course.code && `${course.code} · `}{course.subject} · <span className={course.is_published ? 'text-success' : 'text-warning'}>{course.is_published ? 'Published' : 'Draft (students cannot see it yet)'}</span></>}
        actions={<>
          <Link to={`/courses/${course.id}`} className="btn-secondary"><Eye className="h-4 w-4" /> Student view</Link>
          <button className="btn-primary" onClick={() => run(supabase.from('courses').update({ is_published: !course.is_published }).eq('id', course.id))}>
            {course.is_published ? 'Unpublish' : 'Publish course'}
          </button>
        </>}
      />

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-border bg-surface p-1" role="tablist">
        {TABS.map(({ id: t, label, icon: Icon }) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setParams({ tab: t })}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition ${tab === t ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-surface-2 hover:text-text'}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>
      {actionError && <div className="mb-4"><Alert tone="error">{actionError}</Alert></div>}

      {tab === 'materials' && (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
          <SectionCard title="Add learning material" icon={<Plus className="h-4 w-4 text-accent" />}>
            <UploadResource courseId={course.id} subject={course.subject} topics={topics} teacherId={profile!.id} onDone={base.reload} />
          </SectionCard>
          <SectionCard title={`Materials (${resources.length})`} icon={<FolderOpen className="h-4 w-4 text-accent" />}>
            {resources.length ? (
              <ul className="divide-y divide-border">
                {resources.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <Link to={`/resources/${r.id}`} className="block truncate text-sm font-semibold hover:text-accent">{r.title}</Link>
                      <p className="truncate text-xs text-muted">{RESOURCE_TYPES.find((t) => t.value === r.resource_type)?.label} · {topics.find((t) => t.id === r.topic_id)?.name ?? 'General'} · {r.is_published ? 'visible' : 'hidden'} · {timeAgo(r.created_at)}</p>
                    </div>
                    <DifficultyBadge value={r.difficulty} />
                    <button className="btn-ghost p-2" aria-label={r.is_published ? 'Hide from students' : 'Show to students'} title={r.is_published ? 'Hide from students' : 'Show to students'}
                      onClick={() => run(supabase.from('resources').update({ is_published: !r.is_published }).eq('id', r.id))}><Eye className={`h-4 w-4 ${r.is_published ? '' : 'opacity-40'}`} /></button>
                    <button className="btn-ghost p-2 hover:text-danger" aria-label={`Delete ${r.title}`} onClick={() => deleteResource(r)}><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No materials yet. Upload a textbook, PDF, slides or notes.</p>}
          </SectionCard>
        </div>
      )}

      {tab === 'topics' && <TopicsTab courseId={course.id} topics={topics} run={run} />}

      {tab === 'quizzes' && (
        <div className="space-y-6">
          <NewQuiz courseId={course.id} teacherId={profile!.id} topics={topics} run={run} />
          <SectionCard title={`Quizzes (${quizzes.length})`} icon={<ListChecks className="h-4 w-4 text-accent" />}
            action={<button className="btn-secondary" onClick={() => setShowQuestion('')}><Plus className="h-4 w-4" /> Add to question bank</button>}>
            {quizzes.length ? (
              <ul className="space-y-3">
                {quizzes.map((z) => {
                  const qs = questions.filter((q) => q.quiz_id === z.id);
                  return (
                    <li key={z.id} className="rounded-xl border border-border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="mr-auto font-semibold">{z.title} <span className="text-xs font-normal text-muted">· {qs.length} questions</span></p>
                        <DifficultyBadge value={z.difficulty} />
                        <span className={`chip ${z.is_published ? 'text-success' : 'text-warning'}`}>{z.is_published ? 'Published' : 'Draft'}</span>
                        <button className="btn-secondary py-1.5" onClick={() => setShowQuestion(z.id)}><Plus className="h-4 w-4" /> Question</button>
                        <button className="btn-ghost py-1.5" onClick={() => run(supabase.from('quizzes').update({ is_published: !z.is_published }).eq('id', z.id))}>{z.is_published ? 'Unpublish' : 'Publish'}</button>
                        <button className="btn-ghost p-2 hover:text-danger" aria-label={`Delete ${z.title}`} onClick={() => confirm(`Delete quiz “${z.title}”? Its questions move to the question bank.`) && run(supabase.from('quizzes').delete().eq('id', z.id))}><Trash2 className="h-4 w-4" /></button>
                      </div>
                      {qs.length > 0 && <QuestionList questions={qs} topics={topics} run={run} />}
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-muted">No quizzes yet. Create one above.</p>}
          </SectionCard>
          <SectionCard title={`Question bank · adaptive practice (${questions.filter((q) => !q.quiz_id).length})`} icon={<ListChecks className="h-4 w-4 text-accent" />}>
            <p className="mb-3 text-sm text-muted">Adaptive practice draws from these plus the questions in published quizzes, choosing difficulty from each student's mastery.</p>
            {questions.some((q) => !q.quiz_id) ? <QuestionList questions={questions.filter((q) => !q.quiz_id)} topics={topics} run={run} /> : <p className="text-sm text-muted">No bank questions yet.</p>}
          </SectionCard>
          <Modal open={showQuestion !== null} onClose={() => setShowQuestion(null)} title="New question" wide>
            <QuestionEditor courseId={course.id} teacherId={profile!.id} topics={topics} quizzes={quizzes} resources={resources}
              defaultQuizId={showQuestion || undefined} onSaved={base.reload} />
          </Modal>
        </div>
      )}

      {tab === 'students' && (students.loading ? <SkeletonRows /> : students.error ? <ErrorState message={students.error} /> : students.data && (
        students.data.enr.length ? (
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted"><tr><th className="p-4">Student</th><th>Enrolled</th><th>Quizzes</th><th>Avg score</th><th>Avg mastery</th><th>Weakest topic</th></tr></thead>
              <tbody className="divide-y divide-border">
                {students.data.enr.filter((e) => e.student).map(({ student, enrolled_at }) => {
                  const at = students.data!.attempts.filter((a) => a.student_id === student!.id);
                  const ms = students.data!.mastery.filter((m) => m.student_id === student!.id);
                  const avgScore = at.length ? at.reduce((a, x) => a + (x.score ?? 0) / (x.max_score || 1), 0) / at.length : null;
                  const avgM = ms.length ? ms.reduce((a, m) => a + Number(m.p_mastery), 0) / ms.length : null;
                  const weakest = [...ms].sort((a, b) => a.p_mastery - b.p_mastery)[0];
                  return (
                    <tr key={student!.id}>
                      <td className="p-4"><Link to={`/teacher/students?student=${student!.id}`} className="font-medium hover:text-accent">{student!.full_name}</Link><span className="block text-xs text-muted">{student!.email}</span></td>
                      <td className="text-muted">{timeAgo(enrolled_at)}</td>
                      <td>{at.length}</td><td>{pct(avgScore)}</td><td>{pct(avgM)}</td>
                      <td className="text-muted">{weakest ? `${topics.find((t) => t.id === weakest.topic_id)?.name} (${pct(Number(weakest.p_mastery))})` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon={Users} title="No students enrolled yet">{course.is_published ? 'Students can enrol from the course catalogue.' : 'Publish the course so students can find and enrol in it.'}</EmptyState>
      ))}

      {tab === 'insights' && (insights.loading ? <SkeletonRows /> : insights.error ? <ErrorState message={insights.error} /> : insights.data && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Students" value={insights.data.students} icon={<Users className="h-5 w-5" />} />
            <StatCard label="Quiz submissions" value={insights.data.attempts} icon={<ListChecks className="h-5 w-5" />} />
            <StatCard label="Average score" value={insights.data.avg_score != null ? `${insights.data.avg_score}%` : '–'} icon={<BarChart3 className="h-5 w-5" />} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Topic-wise class mastery" icon={<BarChart3 className="h-4 w-4 text-accent" />}>
              {insights.data.topics.length ? (
                <ul className="space-y-3">
                  {insights.data.topics.map((t) => (
                    <li key={t.topic_id}>
                      <div className="mb-1 flex justify-between text-sm"><span>{t.name}</span><span className="text-muted">{t.avg_mastery != null ? `${pct(t.avg_mastery)} · ${t.students_struggling} struggling` : 'no data'}</span></div>
                      <ProgressBar value={t.avg_mastery ?? 0} label={`${t.name} class mastery`} />
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">Add topics to see mastery per topic.</p>}
            </SectionCard>
            <SectionCard title="Most-missed questions" icon={<ListChecks className="h-4 w-4 text-warning" />}>
              {insights.data.hardest_questions.length ? (
                <ul className="space-y-2.5 text-sm">
                  {insights.data.hardest_questions.map((q) => (
                    <li key={q.question_id} className="flex justify-between gap-3"><span className="min-w-0">{q.prompt}</span><span className="shrink-0 text-muted">{scorePct(Math.round(q.correct_rate * q.answered), q.answered)} correct · {q.answered}</span></li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">Appears once students answer questions.</p>}
            </SectionCard>
          </div>
        </div>
      ))}

      {tab === 'settings' && (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <SectionCard title="Course details" icon={<Settings2 className="h-4 w-4 text-accent" />}>
            <CourseForm teacherId={profile!.id} course={course} onSaved={() => base.reload()} />
          </SectionCard>
          <SectionCard title="Danger zone" icon={<Trash2 className="h-4 w-4 text-danger" />}>
            <p className="text-sm text-muted">Deleting the course removes its topics, materials, quizzes, enrolments and student progress. This cannot be undone.</p>
            <button className="btn-danger mt-4" onClick={async () => {
              if (!confirm(`Delete “${course.title}” permanently?`)) return;
              if (resources.some((r) => r.storage_path)) await supabase.storage.from(MATERIALS_BUCKET).remove(resources.filter((r) => r.storage_path).map((r) => r.storage_path!));
              const { error } = await supabase.from('courses').delete().eq('id', course.id);
              if (error) setActionError(error.message); else navigate('/teacher/courses');
            }}>Delete course</button>
          </SectionCard>
        </div>
      )}
    </div>
  );
}

type Run = (p: PromiseLike<{ error: { message: string } | null }>) => Promise<void>;

function TopicsTab({ courseId, topics, run }: { courseId: string; topics: Topic[]; run: Run }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prereqs, setPrereqs] = useState<string[]>([]);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await run(supabase.from('topics').insert({ course_id: courseId, name: name.trim(), description: description.trim(), prerequisites: prereqs, position: topics.length + 1 }));
    setName(''); setDescription(''); setPrereqs([]);
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      <SectionCard title="Add a topic" icon={<Plus className="h-4 w-4 text-accent" />}>
        <form onSubmit={add} className="space-y-3">
          <div><label className="label" htmlFor="tp-name">Name</label><input id="tp-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Gradient Descent" /></div>
          <div><label className="label" htmlFor="tp-desc">Description</label><input id="tp-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          {topics.length > 0 && (
            <fieldset><legend className="label">Prerequisites</legend>
              <div className="flex flex-wrap gap-2">
                {topics.map((t) => (
                  <button type="button" key={t.id} aria-pressed={prereqs.includes(t.name)} onClick={() => setPrereqs((p) => (p.includes(t.name) ? p.filter((x) => x !== t.name) : [...p, t.name]))}
                    className={`chip cursor-pointer ${prereqs.includes(t.name) ? 'border-accent bg-primary/15 text-text' : ''}`}>{t.name}</button>
                ))}
              </div></fieldset>
          )}
          <button className="btn-primary">Add topic</button>
        </form>
      </SectionCard>
      <SectionCard title={`Topics (${topics.length})`} icon={<Hash className="h-4 w-4 text-accent" />}>
        {topics.length ? (
          <ol className="space-y-2">
            {topics.map((t, i) => (
              <li key={t.id} className="flex items-start gap-3 rounded-xl border border-border p-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-xs font-bold text-accent">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t.name}</p>
                  {t.description && <p className="text-xs text-muted">{t.description}</p>}
                  {t.prerequisites.length > 0 && <p className="text-xs text-muted">Prerequisites: {t.prerequisites.join(', ')}</p>}
                </div>
                <button className="btn-ghost p-2 hover:text-danger" aria-label={`Delete ${t.name}`} onClick={() => confirm(`Delete topic “${t.name}”?`) && run(supabase.from('topics').delete().eq('id', t.id))}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-muted">Topics organise materials and questions, and drive mastery tracking.</p>}
      </SectionCard>
    </div>
  );
}

function NewQuiz({ courseId, teacherId, topics, run }: { courseId: string; teacherId: string; topics: Topic[]; run: Run }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [topicId, setTopicId] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) return;
    await run(supabase.from('quizzes').insert({ course_id: courseId, created_by: teacherId, title: title.trim(), description: description.trim(), topic_id: topicId || null, difficulty }));
    recordActivity('created_quiz', `Created quiz ${title.trim()}`, `/teacher/courses/${courseId}?tab=quizzes`);
    setTitle(''); setDescription('');
  };
  return (
    <SectionCard title="Create a quiz" icon={<Plus className="h-4 w-4 text-accent" />}>
      <form onSubmit={add} className="grid gap-3 md:grid-cols-[1.2fr_1.5fr_1fr_0.8fr_auto] md:items-end">
        <div><label className="label" htmlFor="nq-title">Title</label><input id="nq-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Week 5 checkpoint" /></div>
        <div><label className="label" htmlFor="nq-desc">Description</label><input id="nq-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div><label className="label" htmlFor="nq-topic">Topic</label>
          <select id="nq-topic" className="input" value={topicId} onChange={(e) => setTopicId(e.target.value)}><option value="">Mixed</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div><label className="label" htmlFor="nq-diff">Difficulty</label>
          <select id="nq-diff" className="input capitalize" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>{DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
        <button className="btn-primary h-[42px]">Create</button>
      </form>
      <p className="mt-2 text-xs text-muted">New quizzes start as drafts. Add questions, then publish.</p>
    </SectionCard>
  );
}

function QuestionList({ questions, topics, run }: { questions: Question[]; topics: Topic[]; run: Run }) {
  return (
    <ul className="mt-3 space-y-2">
      {questions.map((q) => (
        <li key={q.id} className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <span className="chip shrink-0">{q.question_type === 'mcq' ? 'MCQ' : q.question_type === 'short' ? 'Short' : 'Numerical'}</span>
          <span className="min-w-0 flex-1">{q.prompt}<span className="block text-xs text-muted">{topics.find((t) => t.id === q.topic_id)?.name ?? 'No topic'} · {q.difficulty}{q.source_location && ` · ${q.source_location}`}{!q.is_active && ' · inactive'}</span></span>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => run(supabase.from('questions').update({ is_active: !q.is_active }).eq('id', q.id))}>{q.is_active ? 'Disable' : 'Enable'}</button>
          <button className="btn-ghost p-1.5 hover:text-danger" aria-label="Delete question" onClick={() => confirm('Delete this question?') && run(supabase.from('questions').delete().eq('id', q.id))}><Trash2 className="h-4 w-4" /></button>
        </li>
      ))}
    </ul>
  );
}
