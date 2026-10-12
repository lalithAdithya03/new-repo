-- Macro AI core schema.
-- Roles live in public.profiles.role and are only ever set by trusted database code
-- (signup trigger, invitation redemption, admins). The client cannot choose its role.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Profiles and roles
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('student', 'teacher', 'admin');
create type public.difficulty as enum ('easy', 'medium', 'hard');
create type public.resource_type as enum ('textbook', 'pdf', 'slides', 'notes', 'video', 'link', 'other');
create type public.question_type as enum ('mcq', 'short', 'numerical');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.app_role not null default 'student',
  institution text,
  avatar_url text,
  preferred_theme text check (preferred_theme is null or preferred_theme ~ '^[a-z-]+:(light|dark)$'),
  study_streak int not null default 0 check (study_streak >= 0),
  last_active_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);

-- Helpers used by RLS policies. SECURITY DEFINER so they can read profiles without
-- recursing into the profiles policies; search_path pinned to avoid hijacking.
create or replace function public.current_role_name()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.is_teacher()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('teacher', 'admin'))
$$;

-- ---------------------------------------------------------------------------
-- Teacher invitations (secure onboarding)
-- ---------------------------------------------------------------------------
create table public.teacher_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  institution text,
  code_hash text not null unique,       -- sha256 of the invite code; the code itself is never stored
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index teacher_invitations_email_idx on public.teacher_invitations (lower(email));

-- ---------------------------------------------------------------------------
-- Courses, topics, enrolments
-- ---------------------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 140),
  code text,
  subject text not null default 'General',
  description text not null default '',
  difficulty public.difficulty not null default 'medium',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(subject, '') || ' ' || coalesce(code, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored
);
create index courses_teacher_idx on public.courses (teacher_id);
create index courses_search_idx on public.courses using gin (search);

-- Extra co-teachers / permissions an administrator can grant.
create table public.course_staff (
  course_id uuid not null references public.courses (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (course_id, teacher_id)
);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '',
  prerequisites text[] not null default '{}',
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (course_id, name),
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored
);
create index topics_course_idx on public.topics (course_id);
create index topics_search_idx on public.topics using gin (search);

create table public.course_enrollments (
  course_id uuid not null references public.courses (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  last_opened_at timestamptz,
  primary key (course_id, student_id)
);
create index course_enrollments_student_idx on public.course_enrollments (student_id);

-- ---------------------------------------------------------------------------
-- Learning resources and source chunks
-- ---------------------------------------------------------------------------
-- array_to_string is only STABLE; generated columns need an IMMUTABLE expression.
create or replace function public.keywords_text(p text[])
returns text language sql immutable parallel safe as $$ select coalesce(array_to_string(p, ' '), '') $$;

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  topic_id uuid references public.topics (id) on delete set null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '',
  resource_type public.resource_type not null default 'notes',
  subject text not null default 'General',
  difficulty public.difficulty not null default 'medium',
  keywords text[] not null default '{}',
  storage_path text,              -- object name inside the course-materials bucket
  external_url text check (external_url is null or external_url ~* '^https?://'),
  mime_type text,
  size_bytes bigint,
  page_count int,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', public.keywords_text(keywords) || ' ' || coalesce(subject, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored
);
create index resources_course_idx on public.resources (course_id);
create index resources_search_idx on public.resources using gin (search);

-- Text extracted from a resource, one row per page / slide / timestamp / section.
-- These are what the tutor cites.
create table public.resource_chunks (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  topic_name text not null default 'General',
  location_kind text not null default 'section' check (location_kind in ('page', 'slide', 'timestamp', 'section')),
  location_label text not null,   -- e.g. "p.12", "slide 4", "00:12:30"
  page_number int,
  seconds int,
  position int not null default 0,
  content text not null check (char_length(content) > 0),
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(topic_name, '')), 'B') ||
    to_tsvector('english', coalesce(content, ''))
  ) stored
);
create index resource_chunks_resource_idx on public.resource_chunks (resource_id, position);
create index resource_chunks_course_idx on public.resource_chunks (course_id);
create index resource_chunks_search_idx on public.resource_chunks using gin (search);

-- ---------------------------------------------------------------------------
-- Quizzes, questions, answer keys
-- ---------------------------------------------------------------------------
create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  topic_id uuid references public.topics (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 140),
  description text not null default '',
  difficulty public.difficulty not null default 'medium',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored
);
create index quizzes_course_idx on public.quizzes (course_id);
create index quizzes_search_idx on public.quizzes using gin (search);

-- Question text and options. Correct answers live in question_keys, which students can never read.
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  quiz_id uuid references public.quizzes (id) on delete set null,
  topic_id uuid references public.topics (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  question_type public.question_type not null default 'mcq',
  prompt text not null check (char_length(prompt) between 5 and 2000),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  difficulty public.difficulty not null default 'medium',
  source_resource_id uuid references public.resources (id) on delete set null,
  source_location text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (question_type <> 'mcq' or jsonb_array_length(options) between 2 and 6)
);
create index questions_course_idx on public.questions (course_id, topic_id, difficulty);
create index questions_quiz_idx on public.questions (quiz_id);

create table public.question_keys (
  question_id uuid primary key references public.questions (id) on delete cascade,
  correct_option int,             -- index into questions.options for mcq
  accepted_answers text[] not null default '{}',  -- short answer, compared case/space-insensitively
  numeric_answer numeric,
  tolerance numeric not null default 0.01 check (tolerance >= 0),  -- relative tolerance for numerical
  explanation text not null default ''
);

-- ---------------------------------------------------------------------------
-- Attempts, answers, mastery
-- ---------------------------------------------------------------------------
create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  quiz_id uuid references public.quizzes (id) on delete set null,
  topic_id uuid references public.topics (id) on delete set null,
  mode text not null default 'adaptive' check (mode in ('quiz', 'adaptive')),
  requested_difficulty text not null default 'auto' check (requested_difficulty in ('auto', 'easy', 'medium', 'hard')),
  question_ids uuid[] not null default '{}',
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted')),
  score int,
  max_score int,
  started_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index quiz_attempts_student_idx on public.quiz_attempts (student_id, started_at desc);
create index quiz_attempts_course_idx on public.quiz_attempts (course_id);

create table public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  response jsonb not null default '{}'::jsonb,
  is_correct boolean not null,
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);
create index attempt_answers_student_q_idx on public.attempt_answers (student_id, question_id);

-- Bayesian knowledge tracing estimate per student and topic (same model as StudyMate).
create table public.topic_mastery (
  student_id uuid not null references public.profiles (id) on delete cascade,
  topic_id uuid not null references public.topics (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  p_mastery numeric not null default 0.3 check (p_mastery between 0 and 1),
  attempts int not null default 0,
  correct int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (student_id, topic_id)
);
create index topic_mastery_course_idx on public.topic_mastery (course_id);

-- ---------------------------------------------------------------------------
-- Student goals, activity, tutor history
-- ---------------------------------------------------------------------------
create table public.study_goals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  due_on date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index study_goals_student_idx on public.study_goals (student_id);

create table public.activity_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('opened_resource', 'quiz_submitted', 'tutor_question', 'enrolled', 'uploaded', 'created_course', 'created_quiz')),
  title text not null,
  link text,
  created_at timestamptz not null default now()
);
create index activity_log_user_idx on public.activity_log (user_id, created_at desc);

create table public.tutor_conversations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  resource_id uuid references public.resources (id) on delete set null,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tutor_conversations_student_idx on public.tutor_conversations (student_id, updated_at desc);

create table public.tutor_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.tutor_conversations (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  grounding text check (grounding in ('grounded', 'partial', 'not_covered', 'demo')),
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index tutor_messages_conv_idx on public.tutor_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger courses_touch before update on public.courses for each row execute function public.touch_updated_at();
create trigger resources_touch before update on public.resources for each row execute function public.touch_updated_at();
create trigger quizzes_touch before update on public.quizzes for each row execute function public.touch_updated_at();
create trigger tutor_conversations_touch before update on public.tutor_conversations for each row execute function public.touch_updated_at();
