import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, Plus } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { getTeacherCourses } from '@/lib/api';
import { useAsync } from '@/lib/useAsync';
import { timeAgo } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { DifficultyBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { CourseForm } from '@/components/teacher/CourseForm';

export default function TeacherCourses() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const courses = useAsync(() => getTeacherCourses(profile!.id, profile!.role === 'admin'), [profile?.id]);

  return (
    <div>
      <PageHeader title="Courses" subtitle="Create courses, upload materials, and build assessments."
        actions={<button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New course</button>} />
      {courses.loading ? <SkeletonRows /> : courses.error ? <ErrorState message={courses.error} onRetry={courses.reload} /> : courses.data?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.data.map((c) => (
            <Link key={c.id} to={`/teacher/courses/${c.id}`} className="card card-pad transition hover:-translate-y-0.5 hover:border-accent/60">
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold">{c.title}</p>
                <span className={`chip ${c.is_published ? 'text-success' : 'text-warning'}`}>{c.is_published ? 'Published' : 'Draft'}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{c.description || 'No description yet.'}</p>
              <div className="mt-3 flex flex-wrap gap-2"><span className="chip">{c.subject}</span><DifficultyBadge value={c.difficulty} /></div>
              <p className="mt-3 text-xs text-muted">Created {timeAgo(c.created_at)}</p>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={GraduationCap} title="No courses yet" action={<button className="btn-primary" onClick={() => setCreating(true)}>Create a course</button>}>Your courses will appear here.</EmptyState>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="New course">
        <CourseForm teacherId={profile!.id} onSaved={(c) => { setCreating(false); navigate(`/teacher/courses/${c.id}`); }} />
      </Modal>
    </div>
  );
}
