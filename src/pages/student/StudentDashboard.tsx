import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity as ActivityIcon, ArrowRight, BookOpen, Bot, CalendarCheck, Flame, GraduationCap, ListChecks, Palette, Plus,
  Sparkles, Target, Trash2, TrendingUp,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { loadStudentOverview, weakTopics } from '@/lib/studentData';
import { greeting, pct, scorePct, timeAgo } from '@/lib/format';
import { RESOURCE_TYPES, type StudyGoal } from '@/lib/types';
import { SearchBar } from '@/components/search/SearchBar';
import { SectionCard, StatCard } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Spinner';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ThemePicker } from '@/components/ThemeSwitcher';

function Goals({ goals: initial, studentId }: { goals: StudyGoal[]; studentId: string }) {
  const [goals, setGoals] = useState(initial);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const { data, error: err } = await supabase.from('study_goals').insert({ student_id: studentId, title: title.trim(), due_on: due || null }).select().single();
    if (err) { setError(err.message); return; }
    setGoals((g) => [...g, data as StudyGoal]); setTitle(''); setDue(''); setError(null);
  };
  const toggle = async (g: StudyGoal) => {
    setGoals((all) => all.map((x) => (x.id === g.id ? { ...x, done: !x.done } : x)));
    await supabase.from('study_goals').update({ done: !g.done }).eq('id', g.id);
  };
  const remove = async (g: StudyGoal) => {
    setGoals((all) => all.filter((x) => x.id !== g.id));
    await supabase.from('study_goals').delete().eq('id', g.id);
  };
  return (
    <div>
      {goals.length ? (
        <ul className="space-y-2">
          {goals.map((g) => (
            <li key={g.id} className="group flex items-center gap-3 rounded-xl border border-border px-3 py-2">
              <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={g.done} onChange={() => toggle(g)} aria-label={`Mark ${g.title} done`} />
              <span className={`min-w-0 flex-1 truncate text-sm ${g.done ? 'text-muted line-through' : ''}`}>{g.title}</span>
              {g.due_on && <span className="text-xs text-muted">{new Date(g.due_on + 'T00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
              <button onClick={() => remove(g)} className="text-muted opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100" aria-label="Delete goal"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">Set a goal to stay on track, like “Revise overfitting by Friday”.</p>}
      <form onSubmit={add} className="mt-3 flex gap-2">
        <input className="input" placeholder="Add a study goal" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New goal" />
        <input className="input w-36" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
        <button className="btn-primary px-3" aria-label="Add goal"><Plus className="h-4 w-4" /></button>
      </form>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}

export default function StudentDashboard() {
  const { profile } = useAuth();
  const { data, error, loading, reload } = useAsync(() => loadStudentOverview(profile!.id), [profile?.id]);
  const firstName = profile?.full_name.split(' ')[0] ?? 'there';

  if (error) return <ErrorState message={error} onRetry={reload} />;

  const weak = data ? weakTopics(data.masteryRows).slice(0, 4) : [];
  const practised = data?.masteryRows.filter((r) => r.mastery) ?? [];
  const avgMastery = practised.length ? practised.reduce((a, r) => a + Number(r.mastery!.p_mastery), 0) / practised.length : null;
  const lastCourse = data?.enrollments[0];
  const typeLabel = (t: string) => RESOURCE_TYPES.find((x) => x.value === t)?.label ?? t;

  return (
    <div className="space-y-6">
      <div className="card hero-gradient overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-muted">{greeting()},</p>
            <h1 className="text-2xl font-extrabold sm:text-3xl">{firstName} 👋</h1>
            <p className="mt-1 text-sm text-muted">{profile?.email}{profile?.institution && ` · ${profile.institution}`}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/student/tutor" className="btn-primary"><Bot className="h-4 w-4" /> Ask the AI tutor</Link>
            <Link to="/student/quizzes" className="btn-secondary"><ListChecks className="h-4 w-4" /> Practise</Link>
          </div>
        </div>
        <div className="mt-5 max-w-2xl"><SearchBar placeholder="Search your courses, notes, slides and topics…" /></div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Study streak" value={<>{profile?.study_streak ?? 0} <span className="text-base font-semibold text-muted">day{profile?.study_streak === 1 ? '' : 's'}</span></>} icon={<Flame className="h-5 w-5" />} hint="Study daily to keep it going" />
        <StatCard label="Courses" value={loading ? '…' : data?.enrollments.length ?? 0} icon={<GraduationCap className="h-5 w-5" />} />
        <StatCard label="Quizzes taken" value={loading ? '…' : data?.attempts.length ?? 0} icon={<ListChecks className="h-5 w-5" />} hint={data?.attempts[0] ? `Last: ${scorePct(data.attempts[0].score, data.attempts[0].max_score)}` : undefined} />
        <StatCard label="Average mastery" value={loading ? '…' : pct(avgMastery)} icon={<TrendingUp className="h-5 w-5" />} hint={practised.length ? `${practised.length} topics practised` : 'Take a quiz to start'} />
      </div>

      {loading ? <SkeletonRows rows={4} /> : data && (
        <>
          {data.enrollments.length === 0 ? (
            <EmptyState icon={BookOpen} title="Welcome to Macro AI! Start by joining a course" action={<Link to="/student/courses" className="btn-primary">Browse courses <ArrowRight className="h-4 w-4" /></Link>}>
              Once you enrol, your course materials, AI tutor, quizzes and progress tracking all light up here.
            </EmptyState>
          ) : (
            <div className="grid gap-6 xl:grid-cols-3">
              <div className="space-y-6 xl:col-span-2">
                {lastCourse && (
                  <SectionCard title="Continue learning" icon={<Sparkles className="h-4 w-4 text-accent" />}>
                    <Link to={`/courses/${lastCourse.course.id}`} className="flex items-center gap-4 rounded-xl border border-border p-4 transition hover:border-accent/60">
                      <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-fg"><BookOpen className="h-6 w-6" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{lastCourse.course.title}</p>
                        <p className="text-xs text-muted">{lastCourse.course.subject}{lastCourse.last_opened_at ? ` · opened ${timeAgo(lastCourse.last_opened_at)}` : ' · not opened yet'}</p>
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted" />
                    </Link>
                  </SectionCard>
                )}

                <SectionCard title="My courses" icon={<GraduationCap className="h-4 w-4 text-accent" />} action={<Link to="/student/courses" className="link text-sm">All courses</Link>}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {data.enrollments.map(({ course }) => {
                      const rows = data.masteryRows.filter((r) => r.topic.course_id === course.id);
                      const m = rows.filter((r) => r.mastery);
                      const avg = m.length ? m.reduce((a, r) => a + Number(r.mastery!.p_mastery), 0) / rows.length : 0;
                      return (
                        <Link key={course.id} to={`/courses/${course.id}`} className="rounded-xl border border-border p-4 transition hover:border-accent/60">
                          <p className="font-semibold">{course.title}</p>
                          <p className="text-xs text-muted">{course.code && `${course.code} · `}{course.subject} · {rows.length} topics</p>
                          <ProgressBar value={avg} className="mt-3" label={`${course.title} progress`} />
                          <p className="mt-1 text-xs text-muted">Course mastery {Math.round(avg * 100)}%</p>
                        </Link>
                      );
                    })}
                  </div>
                </SectionCard>

                <SectionCard title="Topic mastery" icon={<TrendingUp className="h-4 w-4 text-accent" />} action={<Link to="/student/progress" className="link text-sm">Details</Link>}>
                  {practised.length ? (
                    <ul className="space-y-3">
                      {data.masteryRows.slice(0, 8).map((r) => (
                        <li key={r.topic.id}>
                          <div className="mb-1 flex justify-between text-sm"><span>{r.topic.name}</span><span className="text-muted">{r.mastery ? pct(Number(r.mastery.p_mastery)) : 'not practised'}</span></div>
                          <ProgressBar value={r.mastery ? Number(r.mastery.p_mastery) : 0} label={`${r.topic.name} mastery`} />
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-muted">Take your first adaptive quiz and your mastery for each topic will appear here.</p>}
                </SectionCard>

                <SectionCard title="Recent learning materials" icon={<BookOpen className="h-4 w-4 text-accent" />}>
                  {data.resources.length ? (
                    <ul className="divide-y divide-border">
                      {data.resources.slice(0, 6).map((r) => (
                        <li key={r.id}><Link to={`/resources/${r.id}`} className="flex items-center gap-3 py-2.5 hover:text-accent">
                          <span className="chip">{typeLabel(r.resource_type)}</span><span className="min-w-0 flex-1 truncate text-sm font-medium">{r.title}</span>
                          <span className="hidden text-xs text-muted sm:inline">{timeAgo(r.created_at)}</span>
                        </Link></li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-muted">Your teachers haven't uploaded materials yet.</p>}
                </SectionCard>
              </div>

              <div className="space-y-6">
                <SectionCard title="Weak topics to revise" icon={<Target className="h-4 w-4 text-warning" />}>
                  {weak.length ? (
                    <ul className="space-y-2">
                      {weak.map((r) => (
                        <li key={r.topic.id} className="rounded-xl border border-border p-3">
                          <div className="flex items-center justify-between text-sm"><span className="font-medium">{r.topic.name}</span><span className="text-danger">{pct(Number(r.mastery!.p_mastery))}</span></div>
                          <div className="mt-2 flex gap-3 text-xs">
                            <Link className="link" to={`/search?q=${encodeURIComponent(r.topic.name)}&type=passage`}>Revise material</Link>
                            <Link className="link" to={`/student/tutor?course=${r.topic.course_id}&q=${encodeURIComponent(`Explain ${r.topic.name}`)}`}>Ask tutor</Link>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-muted">{practised.length ? 'No weak topics right now. Nice work!' : 'Weak topics will be recommended after your first quiz.'}</p>}
                </SectionCard>

                <SectionCard title="Recent quizzes" icon={<ListChecks className="h-4 w-4 text-accent" />}>
                  {data.attempts.length ? (
                    <ul className="space-y-2">
                      {data.attempts.slice(0, 5).map((a) => (
                        <li key={a.id} className="flex items-center justify-between text-sm">
                          <span className="text-muted">{a.mode === 'quiz' ? 'Teacher quiz' : 'Adaptive practice'} · {timeAgo(a.submitted_at)}</span>
                          <span className="font-semibold">{a.score}/{a.max_score}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <Link to="/student/quizzes" className="btn-secondary w-full">Take your first quiz</Link>}
                </SectionCard>

                <SectionCard title="Study goals" icon={<CalendarCheck className="h-4 w-4 text-accent" />}>
                  <Goals goals={data.goals} studentId={profile!.id} />
                </SectionCard>

                <SectionCard title="Recent activity" icon={<ActivityIcon className="h-4 w-4 text-accent" />}>
                  {data.activity.length ? (
                    <ul className="space-y-2.5">
                      {data.activity.map((a) => (
                        <li key={a.id} className="text-sm">
                          {a.link ? <Link to={a.link} className="hover:text-accent">{a.title}</Link> : a.title}
                          <span className="block text-xs text-muted">{timeAgo(a.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-muted">Your study activity will show up here.</p>}
                </SectionCard>

                <SectionCard title="Theme" icon={<Palette className="h-4 w-4 text-accent" />}><ThemePicker /></SectionCard>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
