import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, BookOpen, ClipboardCheck, FolderOpen, GraduationCap, ListChecks, Palette, Plus, Users } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { getTeacherCourses } from '@/lib/api';
import { must, useAsync } from '@/lib/useAsync';
import { greeting, pct, timeAgo } from '@/lib/format';
import type { QuizAttempt, Topic, TopicMastery } from '@/lib/types';
import { SearchBar } from '@/components/search/SearchBar';
import { SectionCard, StatCard } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ThemePicker } from '@/components/ThemeSwitcher';
import { CourseForm } from '@/components/teacher/CourseForm';

async function loadTeacherOverview(teacherId: string, isAdmin: boolean) {
  const courses = await getTeacherCourses(teacherId, isAdmin);
  const ids = courses.map((c) => c.id);
  if (!ids.length) return { courses, enrollments: [], resources: 0, quizzes: 0, attempts: [], topics: [], mastery: [] };
  const [enrollments, resources, quizzes, attempts, topics, mastery] = await Promise.all([
    supabase.from('course_enrollments').select('course_id, student_id').in('course_id', ids).then(must) as Promise<{ course_id: string; student_id: string }[]>,
    supabase.from('resources').select('id', { count: 'exact', head: true }).in('course_id', ids).then((r) => r.count ?? 0),
    supabase.from('quizzes').select('id', { count: 'exact', head: true }).in('course_id', ids).then((r) => r.count ?? 0),
    supabase.from('quiz_attempts').select('*, student:profiles(full_name)').in('course_id', ids).eq('status', 'submitted')
      .order('submitted_at', { ascending: false }).limit(8).then(must) as Promise<(QuizAttempt & { student: { full_name: string } | null })[]>,
    supabase.from('topics').select('*').in('course_id', ids).then(must) as Promise<Topic[]>,
    supabase.from('topic_mastery').select('*').in('course_id', ids).then(must) as Promise<TopicMastery[]>,
  ]);
  return { courses, enrollments, resources, quizzes, attempts, topics, mastery };
}

export default function TeacherDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload } = useAsync(() => loadTeacherOverview(profile!.id, profile!.role === 'admin'), [profile?.id]);
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const students = new Set(data?.enrollments.map((e) => e.student_id)).size;
  const difficulties = (data?.topics ?? []).map((t) => {
    const ms = data!.mastery.filter((m) => m.topic_id === t.id);
    const avg = ms.length ? ms.reduce((a, m) => a + Number(m.p_mastery), 0) / ms.length : null;
    return { topic: t, avg, struggling: ms.filter((m) => m.p_mastery < 0.4).length, n: ms.length, course: data!.courses.find((c) => c.id === t.course_id)?.title };
  }).filter((d) => d.avg != null).sort((a, b) => a.avg! - b.avg!).slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="card hero-gradient p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-muted">{greeting()},</p>
            <h1 className="text-2xl font-extrabold sm:text-3xl">{profile?.full_name}</h1>
            <p className="mt-1 text-sm text-muted">Teacher{profile?.role === 'admin' && ' · Administrator'}{profile?.institution && ` · ${profile.institution}`} · {profile?.email}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New course</button>
            <Link to="/teacher/students" className="btn-secondary"><Users className="h-4 w-4" /> Students</Link>
          </div>
        </div>
        <div className="mt-5 max-w-2xl"><SearchBar placeholder="Search your courses, materials, quizzes and students…" /></div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Courses" value={loading ? '…' : data?.courses.length} icon={<GraduationCap className="h-5 w-5" />} />
        <StatCard label="Students" value={loading ? '…' : students} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Materials" value={loading ? '…' : data?.resources} icon={<FolderOpen className="h-5 w-5" />} />
        <StatCard label="Quizzes" value={loading ? '…' : data?.quizzes} icon={<ListChecks className="h-5 w-5" />} />
      </div>

      {loading ? <SkeletonRows rows={4} /> : data && (data.courses.length === 0 ? (
        <EmptyState icon={BookOpen} title="Create your first course" action={<button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New course</button>}>
          Add a course, upload textbooks, PDFs, slides or notes, and build quizzes. Students can enrol once you publish it.
        </EmptyState>
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <SectionCard title="My courses" icon={<GraduationCap className="h-4 w-4 text-accent" />} action={<Link className="link text-sm" to="/teacher/courses">Manage all</Link>}>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.courses.map((c) => (
                  <Link key={c.id} to={`/teacher/courses/${c.id}`} className="rounded-xl border border-border p-4 transition hover:border-accent/60">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{c.title}</p>
                      <span className={`chip ${c.is_published ? 'text-success' : 'text-warning'}`}>{c.is_published ? 'Published' : 'Draft'}</span>
                    </div>
                    <p className="text-xs text-muted">{c.code && `${c.code} · `}{c.subject}</p>
                    <p className="mt-2 text-xs text-muted">{data.enrollments.filter((e) => e.course_id === c.id).length} students · {data.topics.filter((t) => t.course_id === c.id).length} topics</p>
                  </Link>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Common learning difficulties" icon={<AlertTriangle className="h-4 w-4 text-warning" />}>
              {difficulties.length ? (
                <ul className="space-y-3">
                  {difficulties.map((d) => (
                    <li key={d.topic.id}>
                      <div className="mb-1 flex justify-between gap-2 text-sm">
                        <span>{d.topic.name} <span className="text-xs text-muted">· {d.course}</span></span>
                        <span className="shrink-0 text-muted">avg {pct(d.avg)} · {d.struggling}/{d.n} struggling</span>
                      </div>
                      <ProgressBar value={d.avg!} label={`${d.topic.name} class mastery`} />
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">Topic mastery appears once students start taking quizzes.</p>}
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard title="Recent submissions" icon={<ClipboardCheck className="h-4 w-4 text-accent" />}>
              {data.attempts.length ? (
                <ul className="space-y-2.5">
                  {data.attempts.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0"><span className="block truncate font-medium">{a.student?.full_name ?? 'Student'}</span>
                        <span className="block text-xs text-muted">{data.courses.find((c) => c.id === a.course_id)?.title} · {timeAgo(a.submitted_at)}</span></span>
                      <span className="font-semibold">{a.score}/{a.max_score}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">No quiz submissions yet.</p>}
            </SectionCard>
            <SectionCard title="Theme" icon={<Palette className="h-4 w-4 text-accent" />}><ThemePicker /></SectionCard>
          </div>
        </div>
      ))}

      <Modal open={creating} onClose={() => setCreating(false)} title="New course">
        <CourseForm teacherId={profile!.id} onSaved={(c) => { setCreating(false); navigate(`/teacher/courses/${c.id}`); }} />
      </Modal>
    </div>
  );
}
