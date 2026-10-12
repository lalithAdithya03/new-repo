import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Users, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { getTeacherCourses } from '@/lib/api';
import { must, useAsync } from '@/lib/useAsync';
import { pct, timeAgo } from '@/lib/format';
import type { QuizAttempt, Topic, TopicMastery } from '@/lib/types';
import { PageHeader, SectionCard } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Spinner';
import { ProgressBar } from '@/components/ui/ProgressBar';

export default function TeacherStudents() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const selected = params.get('student');
  const [filter, setFilter] = useState('');

  const { data, error, loading, reload } = useAsync(async () => {
    const courses = await getTeacherCourses(profile!.id, profile!.role === 'admin');
    const ids = courses.map((c) => c.id);
    if (!ids.length) return { courses, enr: [], attempts: [], mastery: [], topics: [] };
    const [enr, attempts, mastery, topics] = await Promise.all([
      supabase.from('course_enrollments').select('course_id, enrolled_at, student:profiles(id, full_name, email)').in('course_id', ids).then(must) as Promise<{ course_id: string; enrolled_at: string; student: { id: string; full_name: string; email: string } | null }[]>,
      supabase.from('quiz_attempts').select('*').in('course_id', ids).eq('status', 'submitted').order('submitted_at', { ascending: false }).then(must) as Promise<QuizAttempt[]>,
      supabase.from('topic_mastery').select('*').in('course_id', ids).then(must) as Promise<TopicMastery[]>,
      supabase.from('topics').select('*').in('course_id', ids).then(must) as Promise<Topic[]>,
    ]);
    return { courses, enr, attempts, mastery, topics };
  }, [profile?.id]);

  const students = useMemo(() => {
    const map = new Map<string, { id: string; full_name: string; email: string; courses: string[] }>();
    data?.enr.forEach((e) => {
      if (!e.student) return;
      const s = map.get(e.student.id) ?? { ...e.student, courses: [] };
      s.courses.push(data.courses.find((c) => c.id === e.course_id)?.title ?? '');
      map.set(e.student.id, s);
    });
    return [...map.values()].filter((s) => !filter || `${s.full_name} ${s.email}`.toLowerCase().includes(filter.toLowerCase()));
  }, [data, filter]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  const sel = students.find((s) => s.id === selected) ?? (selected && data ? data.enr.find((e) => e.student?.id === selected)?.student : null);

  return (
    <div>
      <PageHeader title="Students" subtitle="Students enrolled in your courses, their results and topic progress." />
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input className="input pl-9" placeholder="Search students by name or email" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search students" />
      </div>
      {loading ? <SkeletonRows rows={4} /> : !students.length ? (
        <EmptyState icon={Users} title={filter ? 'No students match' : 'No students yet'}>{filter ? 'Try another name.' : 'Students appear here once they enrol in your published courses.'}</EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="card divide-y divide-border">
            {students.map((s) => {
              const at = data!.attempts.filter((a) => a.student_id === s.id);
              const avg = at.length ? at.reduce((a, x) => a + (x.score ?? 0) / (x.max_score || 1), 0) / at.length : null;
              return (
                <button key={s.id} onClick={() => setParams({ student: s.id })} className={`flex w-full items-center gap-3 p-4 text-left transition hover:bg-surface-2 ${selected === s.id ? 'bg-primary/10' : ''}`}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-sm font-bold text-accent">{s.full_name[0]?.toUpperCase()}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{s.full_name}</span><span className="block truncate text-xs text-muted">{s.courses.join(', ')}</span></span>
                  <span className="text-right text-xs text-muted"><span className="block font-semibold text-text">{pct(avg)}</span>{at.length} quizzes</span>
                </button>
              );
            })}
          </div>
          {sel ? (
            <SectionCard title={sel.full_name} action={<button className="btn-ghost p-2" onClick={() => setParams({})} aria-label="Close"><X className="h-4 w-4" /></button>}>
              <p className="-mt-3 mb-4 text-sm text-muted">{sel.email}</p>
              <h3 className="mb-2 text-sm font-semibold">Topic mastery</h3>
              {data!.mastery.filter((m) => m.student_id === sel.id).length ? (
                <ul className="mb-6 space-y-3">
                  {data!.mastery.filter((m) => m.student_id === sel.id).sort((a, b) => a.p_mastery - b.p_mastery).map((m) => (
                    <li key={m.topic_id}>
                      <div className="mb-1 flex justify-between text-sm"><span>{data!.topics.find((t) => t.id === m.topic_id)?.name}</span><span className="text-muted">{pct(Number(m.p_mastery))} · {m.correct}/{m.attempts}</span></div>
                      <ProgressBar value={Number(m.p_mastery)} />
                    </li>
                  ))}
                </ul>
              ) : <p className="mb-6 text-sm text-muted">No quiz answers yet.</p>}
              <h3 className="mb-2 text-sm font-semibold">Assessment results</h3>
              {data!.attempts.filter((a) => a.student_id === sel.id).length ? (
                <ul className="space-y-2 text-sm">
                  {data!.attempts.filter((a) => a.student_id === sel.id).map((a) => (
                    <li key={a.id} className="flex justify-between"><span className="text-muted">{data!.courses.find((c) => c.id === a.course_id)?.title} · {a.mode === 'quiz' ? 'quiz' : 'adaptive'} · {timeAgo(a.submitted_at)}</span><span className="font-semibold">{a.score}/{a.max_score}</span></li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">No submissions yet.</p>}
            </SectionCard>
          ) : <div className="hidden lg:block"><EmptyState icon={Users} title="Select a student">See their topic mastery and assessment results.</EmptyState></div>}
        </div>
      )}
    </div>
  );
}
