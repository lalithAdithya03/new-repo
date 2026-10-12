import { supabase } from './supabase';
import { must } from './useAsync';
import type { Course, Resource, Topic } from './types';

/** Best-effort activity logging (also advances the study streak server-side). */
export async function recordActivity(kind: string, title: string, link?: string) {
  await supabase.rpc('record_activity', { p_kind: kind, p_title: title, p_link: link ?? null });
}

export async function getEnrolledCourses(studentId: string) {
  const rows = must(await supabase
    .from('course_enrollments')
    .select('enrolled_at, last_opened_at, course:courses(*)')
    .eq('student_id', studentId)
    .order('last_opened_at', { ascending: false, nullsFirst: false }));
  return (rows as unknown as { enrolled_at: string; last_opened_at: string | null; course: Course | null }[])
    .filter((r) => r.course) as { enrolled_at: string; last_opened_at: string | null; course: Course }[];
}

export async function getTopics(courseIds: string[]) {
  if (!courseIds.length) return [] as Topic[];
  return must(await supabase.from('topics').select('*').in('course_id', courseIds).order('position')) as Topic[];
}

/** Courses a teacher owns or co-teaches (admins: every course). */
export async function getTeacherCourses(teacherId: string, isAdmin: boolean) {
  let q = supabase.from('courses').select('*').order('created_at', { ascending: false });
  if (!isAdmin) {
    const staff = must(await supabase.from('course_staff').select('course_id').eq('teacher_id', teacherId)) as { course_id: string }[];
    const ids = staff.map((s) => s.course_id);
    q = ids.length ? q.or(`teacher_id.eq.${teacherId},id.in.(${ids.join(',')})`) : q.eq('teacher_id', teacherId);
  }
  return must(await q) as Course[];
}

export async function getResources(courseIds: string[]) {
  if (!courseIds.length) return [] as Resource[];
  return must(await supabase.from('resources').select('*').in('course_id', courseIds).order('created_at', { ascending: false })) as Resource[];
}
