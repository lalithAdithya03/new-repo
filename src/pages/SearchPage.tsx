import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SearchX, Users, Search as SearchIcon } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { AppShell } from '@/components/layout/AppShell';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { SearchBar } from '@/components/search/SearchBar';
import { SearchResultCard } from '@/components/search/SearchResults';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { KIND_FILTERS, searchContent, searchStudents } from '@/lib/search';
import { getEnrolledCourses, getTeacherCourses } from '@/lib/api';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { DIFFICULTIES, type Difficulty, type SearchResult } from '@/lib/types';

function SearchContent() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const kinds = params.getAll('type');
  const courseId = params.get('course');
  const subject = params.get('subject');
  const difficulty = params.get('difficulty') as Difficulty | null;
  const isTeacher = profile?.role === 'teacher' || profile?.role === 'admin';

  const update = (patch: Record<string, string | string[] | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      next.delete(k);
      if (Array.isArray(v)) v.forEach((x) => next.append(k, x));
      else if (v) next.set(k, v);
    }
    setParams(next, { replace: false });
  };

  const courses = useAsync(async () => {
    if (!profile) return [];
    if (isTeacher) return (await getTeacherCourses(profile.id, profile.role === 'admin')).map((c) => ({ id: c.id, title: c.title, subject: c.subject }));
    return (await getEnrolledCourses(profile.id)).map((e) => ({ id: e.course.id, title: e.course.title, subject: e.course.subject }));
  }, [profile?.id]);

  const results = useAsync<SearchResult[]>(
    () => (q.trim().length >= 2 && isSupabaseConfigured ? searchContent(q, { courseId, subject, kinds, difficulty }) : Promise.resolve([])),
    [q, courseId, subject, kinds.join(','), difficulty],
  );
  const students = useAsync(() => (isTeacher && q.trim().length >= 2 ? searchStudents(q) : Promise.resolve([])), [q, isTeacher]);

  const subjects = useMemo(() => {
    const s = new Set<string>();
    courses.data?.forEach((c) => s.add(c.subject));
    results.data?.forEach((r) => s.add(r.subject));
    if (subject) s.add(subject);
    return [...s].sort();
  }, [courses.data, results.data, subject]);

  const toggleKind = (k: string) => update({ type: kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k] });
  const hasFilters = kinds.length || courseId || subject || difficulty;

  // Teachers manage quizzes on the course page; students take them on the quizzes page.
  const linkFor = (r: SearchResult) => (r.kind === 'quiz' && isTeacher ? `/teacher/courses/${r.course_id}?tab=quizzes` : r.link);

  return (
    <div>
      <h1 className="text-2xl font-bold sm:text-3xl">Search</h1>
      <p className="mt-1 text-sm text-muted">
        {profile ? 'Courses, topics, materials, passages and quizzes you have access to.' : 'Searching the public course catalogue. Sign in to search inside course materials.'}
      </p>
      <div className="mt-5"><SearchBar initial={q} size="lg" autoFocus={!q} onSearch={(term) => update({ q: term })} /></div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Resource type filters">
        {KIND_FILTERS.map((k) => (
          <button key={k.value} onClick={() => toggleKind(k.value)} aria-pressed={kinds.includes(k.value)}
            className={`chip cursor-pointer transition ${kinds.includes(k.value) ? 'border-accent bg-primary/15 text-text' : 'hover:border-accent/50'}`}>
            {k.label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <select className="input" aria-label="Filter by course" value={courseId ?? ''} onChange={(e) => update({ course: e.target.value || null })} disabled={!profile}>
          <option value="">{profile ? 'All my courses' : 'Sign in to filter by course'}</option>
          {courses.data?.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <select className="input" aria-label="Filter by subject" value={subject ?? ''} onChange={(e) => update({ subject: e.target.value || null })}>
          <option value="">All subjects</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input" aria-label="Filter by difficulty" value={difficulty ?? ''} onChange={(e) => update({ difficulty: e.target.value || null })}>
          <option value="">Any difficulty</option>
          {DIFFICULTIES.map((d) => <option key={d} value={d} className="capitalize">{d}</option>)}
        </select>
      </div>
      {hasFilters ? (
        <button className="link mt-2 text-sm" onClick={() => update({ type: [], course: null, subject: null, difficulty: null })}>Clear filters</button>
      ) : null}

      <div className="mt-6" aria-live="polite">
        {!isSupabaseConfigured ? (
          <Alert tone="warning" title="Search needs a Supabase connection">Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to search real course data.</Alert>
        ) : q.trim().length < 2 ? (
          <EmptyState icon={SearchIcon} title="Search across your learning">Try a topic like “gradient descent”, a course code, or a keyword. Press Enter to search.</EmptyState>
        ) : results.loading ? (
          <SkeletonRows rows={4} />
        ) : results.error ? (
          <ErrorState message={results.error} onRetry={results.reload} />
        ) : (
          <>
            {isTeacher && !!students.data?.length && (
              <section className="mb-6">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted"><Users className="h-4 w-4" /> Students</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {students.data.map((s) => (
                    <Link key={s.id} to={`/teacher/students?student=${s.id}`} className="card flex items-center gap-3 p-3 hover:border-accent/60">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-sm font-bold text-accent">{s.full_name[0]?.toUpperCase()}</span>
                      <span className="min-w-0"><span className="block truncate text-sm font-semibold">{s.full_name}</span><span className="block truncate text-xs text-muted">{s.email}</span></span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            <p className="mb-3 text-sm text-muted">{results.data?.length ?? 0} result{results.data?.length === 1 ? '' : 's'} for “{q}”</p>
            {results.data?.length ? (
              <div className="grid gap-3">{results.data.map((r) => <SearchResultCard key={`${r.kind}-${r.id}`} r={{ ...r, link: linkFor(r) }} />)}</div>
            ) : (
              <EmptyState icon={SearchX} title="No results found">
                Nothing matched “{q}”{hasFilters ? ' with these filters' : ''}. Check the spelling, try a broader term
                {hasFilters ? ', or clear the filters' : ''}.{!profile && ' Signing in lets you search inside your course materials.'}
              </EmptyState>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  const { profile } = useAuth();
  return profile ? (
    <AppShell><SearchContent /></AppShell>
  ) : (
    <PublicLayout><div className="mx-auto max-w-4xl px-4 py-10 sm:px-6"><SearchContent /></div></PublicLayout>
  );
}
