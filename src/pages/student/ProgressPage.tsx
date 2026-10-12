import { Link } from 'react-router-dom';
import { BarChart3, Flame, Target, TrendingUp } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useAsync } from '@/lib/useAsync';
import { loadStudentOverview, weakTopics } from '@/lib/studentData';
import { pct, timeAgo } from '@/lib/format';
import { PageHeader, SectionCard, StatCard } from '@/components/ui/PageHeader';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Spinner';
import { ProgressBar, masteryTone } from '@/components/ui/ProgressBar';

export default function ProgressPage() {
  const { profile } = useAuth();
  const { data, error, loading, reload } = useAsync(() => loadStudentOverview(profile!.id), [profile?.id]);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <SkeletonRows rows={5} />;

  const attempts = [...data.attempts].reverse();
  const practised = data.masteryRows.filter((r) => r.mastery);
  const weak = weakTopics(data.masteryRows);
  const totalCorrect = practised.reduce((a, r) => a + r.mastery!.correct, 0);
  const totalAnswered = practised.reduce((a, r) => a + r.mastery!.attempts, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Progress" subtitle="Mastery is estimated per topic with Bayesian knowledge tracing and updates after every answer." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Study streak" value={`${profile?.study_streak ?? 0} days`} icon={<Flame className="h-5 w-5" />} />
        <StatCard label="Answers correct" value={totalAnswered ? pct(totalCorrect / totalAnswered) : '–'} icon={<TrendingUp className="h-5 w-5" />} hint={`${totalCorrect} of ${totalAnswered}`} />
        <StatCard label="Topics practised" value={`${practised.length}/${data.masteryRows.length}`} icon={<Target className="h-5 w-5" />} />
      </div>

      {!data.enrollments.length ? (
        <EmptyState icon={BarChart3} title="No progress yet" action={<Link to="/student/courses" className="btn-primary">Browse courses</Link>}>Enrol in a course and take a quiz to see your progress.</EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <SectionCard title="Mastery by topic" icon={<TrendingUp className="h-4 w-4 text-accent" />}>
            {data.enrollments.map(({ course }) => {
              const rows = data.masteryRows.filter((r) => r.topic.course_id === course.id);
              return (
                <div key={course.id} className="mb-6 last:mb-0">
                  <p className="mb-3 text-sm font-semibold">{course.title}</p>
                  {rows.length ? (
                    <ul className="space-y-3">
                      {rows.map((r) => (
                        <li key={r.topic.id}>
                          <div className="mb-1 flex justify-between gap-2 text-sm">
                            <span>{r.topic.name}{r.topic.prerequisites.length > 0 && <span className="text-xs text-muted"> · needs {r.topic.prerequisites.join(', ')}</span>}</span>
                            <span className="shrink-0 text-muted">{r.mastery ? `${pct(Number(r.mastery.p_mastery))} · ${r.mastery.correct}/${r.mastery.attempts}` : '—'}</span>
                          </div>
                          <ProgressBar value={r.mastery ? Number(r.mastery.p_mastery) : 0} label={`${r.topic.name} mastery`} />
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-muted">This course has no topics yet.</p>}
                </div>
              );
            })}
          </SectionCard>

          <div className="space-y-6">
            <SectionCard title="Score history" icon={<BarChart3 className="h-4 w-4 text-accent" />}>
              {attempts.length ? (
                <>
                  <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Bar chart of quiz scores over time">
                    {attempts.map((a) => {
                      const v = a.max_score ? (a.score ?? 0) / a.max_score : 0;
                      return <div key={a.id} className={`flex-1 rounded-t-md ${masteryTone(v)}`} style={{ height: `${Math.max(6, v * 100)}%` }} title={`${a.score}/${a.max_score} · ${timeAgo(a.submitted_at)}`} />;
                    })}
                  </div>
                  <p className="mt-2 text-xs text-muted">Last {attempts.length} attempts, oldest on the left.</p>
                </>
              ) : <p className="text-sm text-muted">No quiz attempts yet.</p>}
            </SectionCard>

            <SectionCard title="Recommended revision" icon={<Target className="h-4 w-4 text-warning" />}>
              {weak.length ? (
                <ul className="space-y-2 text-sm">
                  {weak.map((r) => (
                    <li key={r.topic.id} className="flex items-center justify-between gap-2">
                      <span>{r.topic.name} <span className="text-danger">({pct(Number(r.mastery!.p_mastery))})</span></span>
                      <Link className="link text-xs" to={`/search?q=${encodeURIComponent(r.topic.name)}&type=passage`}>Revise</Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted">Nothing flagged. Keep practising to stay sharp.</p>}
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
}
