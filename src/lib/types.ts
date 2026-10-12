export type Role = 'student' | 'teacher' | 'admin';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type ResourceType = 'textbook' | 'pdf' | 'slides' | 'notes' | 'video' | 'link' | 'other';
export type QuestionType = 'mcq' | 'short' | 'numerical';

export const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
  { value: 'textbook', label: 'Textbook' },
  { value: 'pdf', label: 'PDF' },
  { value: 'slides', label: 'Lecture slides' },
  { value: 'notes', label: 'Notes' },
  { value: 'video', label: 'Video / transcript' },
  { value: 'link', label: 'Web link' },
  { value: 'other', label: 'Other' },
];
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  institution: string | null;
  avatar_url: string | null;
  preferred_theme: string | null;
  study_streak: number;
  last_active_on: string | null;
  created_at: string;
}

export interface Course {
  id: string;
  teacher_id: string;
  title: string;
  code: string | null;
  subject: string;
  description: string;
  difficulty: Difficulty;
  is_published: boolean;
  created_at: string;
}

export interface Topic {
  id: string;
  course_id: string;
  name: string;
  description: string;
  prerequisites: string[];
  position: number;
}

export interface Resource {
  id: string;
  course_id: string;
  topic_id: string | null;
  owner_id: string;
  title: string;
  description: string;
  resource_type: ResourceType;
  subject: string;
  difficulty: Difficulty;
  keywords: string[];
  storage_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  page_count: number | null;
  is_published: boolean;
  created_at: string;
}

export type LocationKind = 'page' | 'slide' | 'timestamp' | 'section';

export interface ResourceChunk {
  id: string;
  resource_id: string;
  course_id: string;
  topic_name: string;
  location_kind: LocationKind;
  location_label: string;
  page_number: number | null;
  seconds: number | null;
  position: number;
  content: string;
}

export interface MatchedChunk extends Omit<ResourceChunk, 'position'> {
  resource_title: string;
  resource_type: ResourceType;
  rank: number;
}

export interface Quiz {
  id: string;
  course_id: string;
  topic_id: string | null;
  created_by: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  is_published: boolean;
  created_at: string;
}

export interface Question {
  id: string;
  course_id: string;
  quiz_id: string | null;
  topic_id: string | null;
  question_type: QuestionType;
  prompt: string;
  options: string[];
  difficulty: Difficulty;
  source_resource_id: string | null;
  source_location: string | null;
  is_active: boolean;
  created_at: string;
}

/** Answer-free question as returned by start_* RPCs. */
export interface PublicQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  options: string[];
  difficulty: Difficulty;
  topic_id: string | null;
  topic_name: string | null;
  source_resource_id: string | null;
  source_location: string | null;
}

export interface StartedAttempt {
  attempt_id: string;
  quiz_title?: string;
  questions: PublicQuestion[];
}

export type AnswerResponse = { option?: number; text?: string; value?: number };

export interface GradedItem {
  question: PublicQuestion;
  response: AnswerResponse;
  is_correct: boolean;
  correct_option: number | null;
  accepted_answer: string | null;
  numeric_answer: number | null;
  explanation: string;
  mastery: number | null;
}

export interface GradedAttempt {
  attempt_id: string;
  score: number;
  max_score: number;
  results: GradedItem[];
}

export interface QuizAttempt {
  id: string;
  student_id: string;
  course_id: string;
  quiz_id: string | null;
  topic_id: string | null;
  mode: 'quiz' | 'adaptive';
  status: 'in_progress' | 'submitted';
  score: number | null;
  max_score: number | null;
  started_at: string;
  submitted_at: string | null;
}

export interface TopicMastery {
  student_id: string;
  topic_id: string;
  course_id: string;
  p_mastery: number;
  attempts: number;
  correct: number;
  updated_at: string;
}

export interface StudyGoal {
  id: string;
  student_id: string;
  title: string;
  due_on: string | null;
  done: boolean;
  created_at: string;
}

export interface Activity {
  id: number;
  user_id: string;
  kind: string;
  title: string;
  link: string | null;
  created_at: string;
}

export interface SearchResult {
  id: string;
  kind: string;
  title: string;
  subject: string;
  description: string;
  course_id: string;
  course_title: string;
  difficulty: Difficulty;
  source: string;
  location: string | null;
  link: string;
  rank: number;
}

export type Grounding = 'grounded' | 'partial' | 'not_covered' | 'demo';

export interface Citation {
  n: number;
  chunk_id: string;
  resource_id: string;
  resource_title: string;
  resource_type: ResourceType;
  location_kind: LocationKind;
  location_label: string;
  topic_name: string;
  excerpt: string;
}

export interface TutorMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  grounding: Grounding | null;
  citations: Citation[];
  created_at: string;
}

export interface TutorConversation {
  id: string;
  student_id: string;
  course_id: string | null;
  resource_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}
