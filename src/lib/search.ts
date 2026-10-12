import { supabase } from './supabase';
import type { Difficulty, Profile, SearchResult } from './types';

export interface SearchFilters {
  courseId?: string | null;
  subject?: string | null;
  kinds?: string[] | null;
  difficulty?: Difficulty | null;
}

export const KIND_LABEL: Record<string, string> = {
  course: 'Course',
  topic: 'Topic',
  quiz: 'Quiz',
  passage: 'Passage',
  textbook: 'Textbook',
  pdf: 'PDF',
  slides: 'Slides',
  notes: 'Notes',
  video: 'Video',
  link: 'Link',
  other: 'Resource',
};

export const KIND_FILTERS: { value: string; label: string }[] = [
  { value: 'course', label: 'Courses' },
  { value: 'topic', label: 'Topics' },
  { value: 'textbook', label: 'Textbooks' },
  { value: 'pdf', label: 'PDFs' },
  { value: 'slides', label: 'Slides' },
  { value: 'notes', label: 'Notes' },
  { value: 'video', label: 'Videos' },
  { value: 'quiz', label: 'Quizzes' },
  { value: 'passage', label: 'Passages' },
];

/**
 * Keyword search over everything the signed-in user (or an anonymous visitor) may see.
 * Permissions are enforced by RLS inside the search_content() SQL function.
 * To add semantic search later, extend search_content (or add a sibling RPC) and merge here.
 */
export async function searchContent(query: string, filters: SearchFilters = {}): Promise<SearchResult[]> {
  const { data, error } = await supabase.rpc('search_content', {
    p_query: query,
    p_course_id: filters.courseId || null,
    p_subject: filters.subject || null,
    p_kinds: filters.kinds && filters.kinds.length ? filters.kinds : null,
    p_difficulty: filters.difficulty || null,
    p_limit: 50,
  });
  if (error) throw error;
  return (data ?? []) as SearchResult[];
}

/** Teachers (and admins) can also find students enrolled in their courses; RLS limits the rows. */
export async function searchStudents(query: string): Promise<Pick<Profile, 'id' | 'full_name' | 'email' | 'institution'>[]> {
  const q = query.trim().replace(/[%_,()]/g, ' ');
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, institution')
    .eq('role', 'student')
    .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(20);
  if (error) throw error;
  return data ?? [];
}
