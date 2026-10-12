import { supabase } from './supabase';
import { must } from './useAsync';
import { getEnrolledCourses, getTopics } from './api';
import type { Activity, QuizAttempt, Resource, StudyGoal, Topic, TopicMastery } from './types';

export interface MasteryRow { topic: Topic; courseTitle: string; mastery: TopicMastery | null }

/** Everything the student dashboard and progress page need, in parallel. */
export async function loadStudentOverview(studentId: string) {
  const enrollments = await getEnrolledCourses(studentId);
  const courseIds = enrollments.map((e) => e.course.id);
  const [topics, mastery, attempts, resources, goals, activity] = await Promise.all([
    getTopics(courseIds),
    supabase.from('topic_mastery').select('*').eq('student_id', studentId).then(must) as Promise<TopicMastery[]>,
    supabase.from('quiz_attempts').select('*').eq('student_id', studentId).eq('status', 'submitted')
      .order('submitted_at', { ascending: false }).limit(20).then(must) as Promise<QuizAttempt[]>,
    courseIds.length
      ? supabase.from('resources').select('*').in('course_id', courseIds).order('created_at', { ascending: false }).limit(30).then(must) as Promise<Resource[]>
      : Promise.resolve([] as Resource[]),
    supabase.from('study_goals').select('*').eq('student_id', studentId).order('done').order('due_on', { nullsFirst: false }).then(must) as Promise<StudyGoal[]>,
    supabase.from('activity_log').select('*').eq('user_id', studentId).order('created_at', { ascending: false }).limit(12).then(must) as Promise<Activity[]>,
  ]);
  const titleOf = new Map(enrollments.map((e) => [e.course.id, e.course.title]));
  const masteryRows: MasteryRow[] = topics.map((t) => ({
    topic: t, courseTitle: titleOf.get(t.course_id) ?? '', mastery: mastery.find((m) => m.topic_id === t.id) ?? null,
  }));
  return { enrollments, topics, masteryRows, attempts, resources, goals, activity };
}

/** Weak topics: practised and below 50%, or prerequisites of practised topics never touched. */
export function weakTopics(rows: MasteryRow[]) {
  return rows.filter((r) => r.mastery && r.mastery.p_mastery < 0.5).sort((a, b) => a.mastery!.p_mastery - b.mastery!.p_mastery);
}
