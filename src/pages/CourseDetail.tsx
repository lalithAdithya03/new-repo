import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BookOpen, Bot, ListChecks, Lock, Plus, Settings2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { recordActivity } from '@/lib/api';
import { must, useAsync } from '@/lib/useAsync';
import { RESOURCE_TYPES, type Course, type Quiz, type Resource, type Topic } from '@/lib/types';
import { DifficultyBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { FullPageSpinner } from '@/components/ui/Spinner';

export default function CourseDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const focusTopic = params.get('topic');
  const { profile } = useAuth();
  const [enrolling, setEnrolling] = useState(false);

  const { data, error, loading, reload } = useAsync(async () => {
    const course = must(await supabase.from('courses').select('*').eq('id', id!).maybeSingle()) as Course | null;
    if (!course) return null;
    const [topics, resources, quizzes, teacher, enrollment] = await Promise.all([
      supabase.from('topics').select('*').eq('course_id', id!).order('position').then(must) as Promise<Topic[]>,
      supabase.from('resources').select('*').eq('course_id', id!).order('created_at').then(must) as Promise<Resource[]>,
      supabase.from('quizzes').select('*').eq('course_id', id!).then(must) as Promise<Quiz[]>,
      supabase.from('teacher_directory').select('full_name, institution').eq('id', course.teacher_id).maybeSingle().then((r) => r.data),
      supabase.from('course_enrollments').select('course_id').eq('course_id', id!).eq('student_id', profile!.id).maybeSingle().then((r) => r.data),
    ]);
    return { course, topics, resources, quizzes, teacher, enrolled: !!enrollment };
  }, [id, profile?.id]);

  useEffect(() => {
    if (data?.enrolled) supabase.from('course_enrollments').update({ last_opened_at: new Date().toISOString() }).eq('course_id', id!).eq('student_id', profile!.id).then(() => undefined);
  }, [data?.enrolled, id, profile]);

  useEffect(() => {
    if (focusTopic && data) document.getElementById(`topic-${focusTopic}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusTopic, data]);

  if (loading) return <FullPageSpinner />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState icon={Lock} title="Course not found">It may be unpublished, or you may not have access.</EmptyState>;

  const { course, topics, resources, quizzes, teacher, enrolled } = data;
  const isStaff = profile?.role === 'admin' || course.teacher_id === profile?.id;
  const isStudent = profile?.role === 'student';
  const typeLabel = (t: string) => RESOURCE_TYPES.find((x) => x.value === t)?.label ?? t;

  const enrol = async () => {
    setEnrolling(true);
    const { error: e } = await supabase.from('course_enrollments').insert({ course_id: course.id, student_id: profile!.id });
    setEnrolling(false);
    if (!e) { recordActivity('enrolled', `Enrolled in ${course.title}`, `/courses/${course.id}`); reload(); }
  };

  return (
    <div className="space-y-6">
      <div className="card hero-gradient p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          {course.code && <span className="chip">{course.code}</span>}
          <span className="chip">{course.subject}</span>
          <DifficultyBadge value={course.difficulty} />
          {!course.is_published && <span className="chip border-warning/50 text-warning">Draft</span>}
        </div>
        <h1 className="mt-3 text-2xl font-extrabold sm:text-3xl">{course.title}</h1>
        <p className="mt-2 max-w-3xl text-muted">{course.description}</p>
        {teacher && <p className="mt-2 text-sm text-muted">Taught by <span className="font-semibold text-text">{teacher.full_name}</span>{teacher.institution && ` · ${teacher.institution}`}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          {isStaff && <Link to={`/teacher/courses/${course.id}`} className="btn-primary"><Settings2 className="h-4 w-4" /> Manage course</Link>}
          {isStudent && !enrolled && <button className="btn-primary" onClick={enrol} disabled={enrolling}><Plus className="h-4 w-4" /> Enrol in this course</button>}
          {isStudent && enrolled && <>
            <Link to={`/student/tutor?course=${course.id}`} className="btn-primary"><Bot className="h-4 w-4" /> Ask the tutor</Link>
            <Link to="/student/quizzes" className="btn-secondary"><ListChecks className="h-4 w-4" /> Practise</Link>
          </>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="card card-pad">
          <h2 className="mb-4 font-bold">Topics</h2>
          {topics.length ? (
            <ol className="space-y-2">
              {topics.map((t, i) => (
                <li key={t.id} id={`topic-${t.id}`} className={`rounded-xl border p-3 ${focusTopic === t.id ? 'border-accent bg-primary/10' : 'border-border'}`}>
                  <p className="text-sm font-semibold">{i + 1}. {t.name}</p>
                  {t.description && <p className="text-xs text-muted">{t.description}</p>}
                  {t.prerequisites.length > 0 && <p className="mt-1 text-xs text-muted">Builds on: {t.prerequisites.join(', ')}</p>}
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-muted">No topics yet.</p>}
        </section>

        <section className="card card-pad">
          <h2 className="mb-4 font-bold">Learning materials</h2>
          {!isStaff && !enrolled ? (
            <EmptyState icon={Lock} title="Enrol to see the materials">Textbooks, slides, notes and quizzes are available to enrolled students.</EmptyState>
          ) : resources.length ? (
            <ul className="divide-y divide-border">
              {resources.map((r) => (
                <li key={r.id}>
                  <Link to={`/resources/${r.id}`} className="flex items-center gap-3 py-3 hover:text-accent">
                    <BookOpen className="h-4 w-4 shrink-0 text-accent" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{r.title}</span>
                      <span className="block truncate text-xs text-muted">{topics.find((t) => t.id === r.topic_id)?.name ?? r.subject}</span></span>
                    <span className="chip">{typeLabel(r.resource_type)}</span>
                    <DifficultyBadge value={r.difficulty} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No materials uploaded yet.</p>}
          {(isStaff || enrolled) && quizzes.length > 0 && (
            <>
              <h3 className="mb-2 mt-6 text-sm font-bold">Quizzes</h3>
              <ul className="space-y-2">
                {quizzes.map((z) => (
                  <li key={z.id} className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                    <span>{z.title}</span>
                    {isStudent ? <Link className="link" to={`/student/quizzes?quiz=${z.id}`}>Start</Link> : <span className="chip">{z.is_published ? 'Published' : 'Draft'}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
