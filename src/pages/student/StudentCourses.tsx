import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Check, GraduationCap, Plus, Search } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { getEnrolledCourses, recordActivity } from '@/lib/api';
import { must, useAsync } from '@/lib/useAsync';
import type { Course } from '@/lib/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { DifficultyBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Spinner';

export default function StudentCourses() {
  const { profile } = useAuth();
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const enrolled = useAsync(() => getEnrolledCourses(profile!.id), [profile?.id]);
  const catalogue = useAsync(async () => must(await supabase.from('courses').select('*').eq('is_published', true).order('title')) as Course[], []);

  const enrolledIds = new Set(enrolled.data?.map((e) => e.course.id));
  const visible = (catalogue.data ?? []).filter((c) =>
    !filter || `${c.title} ${c.subject} ${c.code ?? ''}`.toLowerCase().includes(filter.toLowerCase()));

  const enrol = async (c: Course) => {
    setBusy(c.id); setError(null);
    const { error: e } = await supabase.from('course_enrollments').insert({ course_id: c.id, student_id: profile!.id });
    setBusy(null);
    if (e) { setError(e.message); return; }
    recordActivity('enrolled', `Enrolled in ${c.title}`, `/courses/${c.id}`);
    enrolled.reload();
  };

  return (
    <div>
      <PageHeader title="My courses" subtitle="Your enrolled courses and the course catalogue." />
      {enrolled.error && <ErrorState message={enrolled.error} onRetry={enrolled.reload} />}
      <h2 className="mb-3 text-lg font-bold">Enrolled</h2>
      {enrolled.loading ? <SkeletonRows rows={2} /> : enrolled.data?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {enrolled.data.map(({ course }) => (
            <Link key={course.id} to={`/courses/${course.id}`} className="card card-pad transition hover:-translate-y-0.5 hover:border-accent/60">
              <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-fg"><BookOpen className="h-5 w-5" /></span>
              <p className="font-bold">{course.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{course.description}</p>
              <div className="mt-3 flex gap-2"><span className="chip">{course.subject}</span><DifficultyBadge value={course.difficulty} /></div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={GraduationCap} title="You're not enrolled in any courses yet">Pick a course from the catalogue below to get started.</EmptyState>
      )}

      <div className="mb-3 mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold">Course catalogue</h2>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Filter courses" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter courses" />
        </div>
      </div>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {catalogue.loading ? <SkeletonRows rows={3} /> : catalogue.error ? <ErrorState message={catalogue.error} onRetry={catalogue.reload} /> : visible.length ? (
        <div className="grid gap-3">
          {visible.map((c) => (
            <div key={c.id} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <Link to={`/courses/${c.id}`} className="font-semibold hover:text-accent">{c.title}</Link>
                <p className="line-clamp-1 text-sm text-muted">{c.code && `${c.code} · `}{c.subject} · {c.description}</p>
              </div>
              <DifficultyBadge value={c.difficulty} />
              {enrolledIds.has(c.id) ? (
                <span className="btn-secondary pointer-events-none"><Check className="h-4 w-4 text-success" /> Enrolled</span>
              ) : (
                <button className="btn-primary" onClick={() => enrol(c)} disabled={busy === c.id}><Plus className="h-4 w-4" /> Enrol</button>
              )}
            </div>
          ))}
        </div>
      ) : <EmptyState icon={Search} title="No courses found">{filter ? 'Try a different filter.' : 'No courses have been published yet.'}</EmptyState>}
    </div>
  );
}
