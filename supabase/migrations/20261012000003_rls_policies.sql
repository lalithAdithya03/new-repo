-- Row Level Security. Every table in public has RLS enabled and explicit policies.
-- Tables without a policy for an operation deny that operation to API clients.

-- ---------------------------------------------------------------------------
-- Access helpers (SECURITY DEFINER so policies don't recurse into each other)
-- ---------------------------------------------------------------------------
create or replace function public.is_course_staff(p_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.courses c where c.id = p_course_id and c.teacher_id = auth.uid())
      or exists (select 1 from public.course_staff s where s.course_id = p_course_id and s.teacher_id = auth.uid())
$$;

create or replace function public.is_enrolled(p_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.course_enrollments e
    join public.courses c on c.id = e.course_id
    where e.course_id = p_course_id and e.student_id = auth.uid() and c.is_published
  )
$$;

create or replace function public.can_read_course_content(p_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_course_staff(p_course_id) or public.is_enrolled(p_course_id)
$$;

create or replace function public.can_read_resource(p_resource_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.resources r
    where r.id = p_resource_id
      and (public.is_course_staff(r.course_id) or (r.is_published and public.is_enrolled(r.course_id)))
  )
$$;

-- Teacher may see a student's profile when the student is enrolled in one of their courses.
create or replace function public.teaches_student(p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.course_enrollments e
    where e.student_id = p_student_id and public.is_course_staff(e.course_id)
  )
$$;

-- Question ids that appear in the caller's own attempts (for reviewing results).
create or replace function public.in_own_attempt(p_question_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.quiz_attempts a
    where a.student_id = auth.uid() and p_question_id = any (a.question_ids)
  )
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.teacher_invitations enable row level security;
alter table public.courses enable row level security;
alter table public.course_staff enable row level security;
alter table public.topics enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.resources enable row level security;
alter table public.resource_chunks enable row level security;
alter table public.quizzes enable row level security;
alter table public.questions enable row level security;
alter table public.question_keys enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.attempt_answers enable row level security;
alter table public.topic_mastery enable row level security;
alter table public.study_goals enable row level security;
alter table public.activity_log enable row level security;
alter table public.tutor_conversations enable row level security;
alter table public.tutor_messages enable row level security;

-- Anonymous visitors only get the public course catalogue (for the landing-page search).
revoke all on all tables in schema public from anon;
grant select on public.courses, public.topics to anon;
-- search_content() is SECURITY INVOKER and also reads these; with no anon policy RLS returns zero rows.
grant select on public.resources, public.resource_chunks, public.quizzes to anon;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy "profiles: read own" on public.profiles for select to authenticated
  using (id = auth.uid());
create policy "profiles: admins read all" on public.profiles for select to authenticated
  using (public.is_admin());
create policy "profiles: teachers read their students" on public.profiles for select to authenticated
  using (role = 'student' and public.teaches_student(id));
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles: admins update" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "profiles: admins delete" on public.profiles for delete to authenticated
  using (public.is_admin());
-- No insert policy: profiles are created only by the handle_new_user trigger.

-- Public teacher card (name/institution only, never email) for course pages.
create view public.teacher_directory with (security_barrier = true) as
  select id, full_name, institution from public.profiles where role in ('teacher', 'admin');
revoke all on public.teacher_directory from anon;
grant select on public.teacher_directory to authenticated;

-- ---------------------------------------------------------------------------
-- teacher_invitations: admins only (creation goes through create_teacher_invite)
-- ---------------------------------------------------------------------------
create policy "invitations: admins read" on public.teacher_invitations for select to authenticated
  using (public.is_admin());
create policy "invitations: admins update" on public.teacher_invitations for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "invitations: admins delete" on public.teacher_invitations for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------------
create policy "courses: published catalogue" on public.courses for select to anon, authenticated
  using (is_published);
create policy "courses: staff read" on public.courses for select to authenticated
  using (public.is_course_staff(id));
create policy "courses: teachers create own" on public.courses for insert to authenticated
  with check (public.is_teacher() and (teacher_id = auth.uid() or public.is_admin()));
create policy "courses: staff update" on public.courses for update to authenticated
  using (public.is_course_staff(id)) with check (public.is_course_staff(id));
create policy "courses: owner deletes" on public.courses for delete to authenticated
  using (teacher_id = auth.uid() or public.is_admin());

-- course_staff: granted by admins
create policy "course_staff: staff read" on public.course_staff for select to authenticated
  using (public.is_course_staff(course_id));
create policy "course_staff: admins write" on public.course_staff for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- topics
-- ---------------------------------------------------------------------------
create policy "topics: published course topics" on public.topics for select to anon, authenticated
  using (exists (select 1 from public.courses c where c.id = course_id and c.is_published));
create policy "topics: staff read" on public.topics for select to authenticated
  using (public.is_course_staff(course_id));
create policy "topics: staff write" on public.topics for all to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));

-- ---------------------------------------------------------------------------
-- course_enrollments
-- ---------------------------------------------------------------------------
create policy "enrollments: student reads own" on public.course_enrollments for select to authenticated
  using (student_id = auth.uid());
create policy "enrollments: staff read" on public.course_enrollments for select to authenticated
  using (public.is_course_staff(course_id));
create policy "enrollments: student self-enrols in published course" on public.course_enrollments for insert to authenticated
  with check (
    student_id = auth.uid()
    and public.current_role_name() = 'student'
    and exists (select 1 from public.courses c where c.id = course_id and c.is_published)
  );
create policy "enrollments: student updates own" on public.course_enrollments for update to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "enrollments: student leaves or staff removes" on public.course_enrollments for delete to authenticated
  using (student_id = auth.uid() or public.is_course_staff(course_id));

-- ---------------------------------------------------------------------------
-- resources and chunks
-- ---------------------------------------------------------------------------
create policy "resources: enrolled students read published" on public.resources for select to authenticated
  using (is_published and public.is_enrolled(course_id));
create policy "resources: staff read" on public.resources for select to authenticated
  using (public.is_course_staff(course_id));
create policy "resources: staff create" on public.resources for insert to authenticated
  with check (public.is_course_staff(course_id) and owner_id = auth.uid());
create policy "resources: staff update" on public.resources for update to authenticated
  using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id));
create policy "resources: staff delete" on public.resources for delete to authenticated
  using (public.is_course_staff(course_id));

create policy "chunks: readers of the resource" on public.resource_chunks for select to authenticated
  using (public.can_read_resource(resource_id));
create policy "chunks: staff write" on public.resource_chunks for all to authenticated
  using (public.is_course_staff(course_id))
  with check (
    public.is_course_staff(course_id)
    and exists (select 1 from public.resources r where r.id = resource_id and r.course_id = resource_chunks.course_id)
  );

-- ---------------------------------------------------------------------------
-- quizzes, questions, answer keys
-- ---------------------------------------------------------------------------
create policy "quizzes: enrolled students read published" on public.quizzes for select to authenticated
  using (is_published and public.is_enrolled(course_id));
create policy "quizzes: staff all" on public.quizzes for all to authenticated
  using (public.is_course_staff(course_id))
  with check (public.is_course_staff(course_id));

-- Students only see question text for questions they were actually given (answer review).
-- Starting a quiz goes through start_* functions, which never return answer keys.
create policy "questions: students read own attempted" on public.questions for select to authenticated
  using (public.in_own_attempt(id));
create policy "questions: staff all" on public.questions for all to authenticated
  using (public.is_course_staff(course_id))
  with check (public.is_course_staff(course_id));

-- Answer keys: course staff only. No student policy exists, so students can never read them.
create policy "question_keys: staff all" on public.question_keys for all to authenticated
  using (exists (select 1 from public.questions q where q.id = question_id and public.is_course_staff(q.course_id)))
  with check (exists (select 1 from public.questions q where q.id = question_id and public.is_course_staff(q.course_id)));

-- ---------------------------------------------------------------------------
-- attempts, answers, mastery: read-only for clients; written by submit_quiz_attempt
-- ---------------------------------------------------------------------------
create policy "attempts: student reads own" on public.quiz_attempts for select to authenticated
  using (student_id = auth.uid());
create policy "attempts: staff read" on public.quiz_attempts for select to authenticated
  using (public.is_course_staff(course_id));

create policy "answers: student reads own" on public.attempt_answers for select to authenticated
  using (student_id = auth.uid());
create policy "answers: staff read" on public.attempt_answers for select to authenticated
  using (exists (select 1 from public.quiz_attempts a where a.id = attempt_id and public.is_course_staff(a.course_id)));

create policy "mastery: student reads own" on public.topic_mastery for select to authenticated
  using (student_id = auth.uid());
create policy "mastery: staff read" on public.topic_mastery for select to authenticated
  using (public.is_course_staff(course_id));

-- ---------------------------------------------------------------------------
-- personal data
-- ---------------------------------------------------------------------------
create policy "goals: own" on public.study_goals for all to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid());

create policy "activity: read own" on public.activity_log for select to authenticated
  using (user_id = auth.uid());
-- Inserts go through record_activity().

create policy "tutor conversations: own" on public.tutor_conversations for all to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid() and (course_id is null or public.can_read_course_content(course_id)));
create policy "tutor messages: own" on public.tutor_messages for all to authenticated
  using (student_id = auth.uid())
  with check (
    student_id = auth.uid()
    and exists (select 1 from public.tutor_conversations c where c.id = conversation_id and c.student_id = auth.uid())
  );
