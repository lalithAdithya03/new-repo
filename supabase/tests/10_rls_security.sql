-- Security tests for roles, RLS, RPCs and storage policies.
-- Run by scripts/test-db.sh against a throwaway database. Each check raises on failure.
\set QUIET on
\pset tuples_only on

create or replace function pg_temp.login(p_email text) returns void language plpgsql as $$
begin
  perform set_config('role', 'none', false);
  perform set_config('request.jwt.claims',
    (select json_build_object('sub', id, 'role', 'authenticated')::text from public.profiles where email = p_email), false);
end $$;

create or replace function pg_temp.expect(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FAILED: %', p_msg; end if;
  raise notice 'ok  %', p_msg;
end $$;

-- ---------------------------------------------------------------- signup and roles
insert into auth.users (email, raw_user_meta_data) values
  ('admin@macro.test', '{"full_name":"Ada Admin"}'),
  ('teacher@macro.test', '{"full_name":"Tara Teacher"}'),
  ('student@macro.test', '{"full_name":"Sam Student"}'),
  ('other.student@macro.test', '{"full_name":"Olu Other"}'),
  ('sneaky@macro.test', '{"full_name":"Sneaky","role":"teacher"}');
update public.profiles set role = 'admin' where email = 'admin@macro.test';   -- bootstrap admin (SQL editor)

select pg_temp.expect((select role from public.profiles where email = 'sneaky@macro.test') = 'student',
  'signup metadata {"role":"teacher"} is ignored: account is a student');

do $$ begin
  insert into auth.users (email, raw_user_meta_data) values ('fake@macro.test', '{"invite_code":"MAC-NOTREAL"}');
  raise exception 'FAILED: signup with a bogus invite code must be rejected';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok  signup with an invalid teacher invite code is rejected';
end $$;

-- Admin issues an invite; the code works only once and only for the invited email.
select pg_temp.login('admin@macro.test');
set role authenticated;
create temp table invite as select public.create_teacher_invite('new.teacher@macro.test', 'North High') as code;
reset role;
select pg_temp.expect(public.check_teacher_invite('new.teacher@macro.test', (select code from invite)), 'invite code validates for the invited email');
select pg_temp.expect(not public.check_teacher_invite('someone.else@macro.test', (select code from invite)), 'invite code does not validate for another email');
select pg_temp.expect((select count(*) from public.teacher_invitations where code_hash = (select code from invite)) = 0, 'raw invite code is not stored');
insert into auth.users (email, raw_user_meta_data)
  select 'new.teacher@macro.test', jsonb_build_object('full_name', 'Nia New', 'invite_code', code) from invite;
select pg_temp.expect((select role from public.profiles where email = 'new.teacher@macro.test') = 'teacher', 'valid invite creates a teacher account');
select pg_temp.expect((select institution from public.profiles where email = 'new.teacher@macro.test') = 'North High', 'invite institution copied to profile');
select pg_temp.expect(not public.check_teacher_invite('new.teacher@macro.test', (select code from invite)), 'invite code cannot be reused');

-- Students cannot create invites or change roles.
select pg_temp.login('student@macro.test');
set role authenticated;
do $$ begin
  perform public.create_teacher_invite('me@macro.test');
  raise exception 'FAILED: student created an invite';
exception when insufficient_privilege then raise notice 'ok  student cannot create teacher invitations';
end $$;
do $$ begin
  update public.profiles set role = 'teacher' where id = auth.uid();
  raise exception 'FAILED: student promoted themselves';
exception when insufficient_privilege then raise notice 'ok  student cannot change their own role';
end $$;
do $$ begin
  perform public.admin_set_role(auth.uid(), 'admin');
  raise exception 'FAILED: student used admin_set_role';
exception when insufficient_privilege then raise notice 'ok  student cannot call admin_set_role';
end $$;
update public.profiles set full_name = 'Sam S. Student' where id = auth.uid();
select pg_temp.expect((select full_name from public.profiles where id = auth.uid()) = 'Sam S. Student', 'student can edit their own name');
select pg_temp.expect((select count(*) from public.profiles) = 1, 'student sees only their own profile');
do $$ begin
  insert into public.courses (teacher_id, title) values (auth.uid(), 'Student course');
  raise exception 'FAILED: student created a course';
exception when insufficient_privilege then raise notice 'ok  student cannot create courses';
end $$;
reset role;

-- ---------------------------------------------------------------- demo content (as owner)
\ir ../demo/demo_content.sql
reset role;

-- Unpublished draft course owned by the teacher.
insert into public.courses (teacher_id, title, code, subject, is_published)
select id, 'Draft: Advanced Optimisation', 'ML201', 'Computer Science', false from public.profiles where email = 'teacher@macro.test';
create temp table ids as select (select id from public.courses where code = 'ML201') as ml201,
                                (select id from public.courses where code = 'ML101') as ml101;
grant select on ids to authenticated;

-- ---------------------------------------------------------------- anonymous visitor
select set_config('request.jwt.claims', '', false);
set role anon;
select pg_temp.expect((select count(*) from public.courses) = 2, 'anon sees only the 2 published courses');
select pg_temp.expect((select count(*) from public.resources) = 0, 'anon sees no resources');
select pg_temp.expect((select count(*) from public.resource_chunks) = 0, 'anon sees no resource text');
select pg_temp.expect((select count(*) from public.search_content('machine learning')) >= 1, 'anon search finds the public course');
select pg_temp.expect((select count(*) from public.search_content('gradient') where kind not in ('course', 'topic')) = 0,
  'anon search returns no resources, passages or quizzes');
do $$ begin
  perform public.match_chunks('gradient');
  raise exception 'FAILED: anon called match_chunks';
exception when insufficient_privilege then raise notice 'ok  anon cannot call tutor retrieval';
end $$;
reset role;

-- ---------------------------------------------------------------- enrolled student
select pg_temp.login('student@macro.test');
set role authenticated;
select pg_temp.expect((select count(*) from public.courses) = 2, 'student sees published courses but not drafts');
select pg_temp.expect((select count(*) from public.resources) = 3, 'student sees the 3 resources of their enrolled course only');
select pg_temp.expect((select count(*) from public.resource_chunks where content ilike '%velocity%') = 0,
  'student cannot read material from a course they are not enrolled in');
select pg_temp.expect((select count(*) from public.question_keys) = 0, 'student cannot read any answer keys');
select pg_temp.expect((select count(*) from public.questions) = 0, 'student cannot browse the question bank directly');
select pg_temp.expect((select count(*) from public.quizzes) = 1, 'student sees the published quiz of their course');
select pg_temp.expect((select count(*) from public.search_content('gradient descent') where kind = 'passage') >= 1,
  'search finds passages in enrolled material');
select pg_temp.expect((select count(*) from public.search_content('velocity') where kind in ('passage', 'notes')) = 0,
  'search hides material from non-enrolled courses');
select pg_temp.expect((select count(*) from public.search_content('validation', p_kinds => array['slides'])) = 1,
  'search resource-type filter works');
select pg_temp.expect((select count(*) from public.match_chunks('what is gradient descent')) >= 2, 'tutor retrieval returns cited chunks');
select pg_temp.expect((select count(*) from public.match_chunks('bake sourdough bread')) = 0, 'tutor retrieval finds nothing off-material');

do $$ begin
  insert into public.course_enrollments (course_id, student_id) select ml201, auth.uid() from ids;
  raise exception 'FAILED: enrolled in a draft course';
exception when insufficient_privilege then raise notice 'ok  student cannot enrol in an unpublished course';
end $$;
do $$ begin
  insert into public.topic_mastery (student_id, topic_id, course_id, p_mastery)
  select auth.uid(), t.id, t.course_id, 0.99 from public.topics t limit 1;
  raise exception 'FAILED: student wrote their own mastery';
exception when insufficient_privilege then raise notice 'ok  student cannot write mastery directly';
end $$;
do $$ begin
  insert into public.quiz_attempts (student_id, course_id, score, max_score, status)
  select auth.uid(), id, 10, 10, 'submitted' from public.courses where code = 'ML101';
  raise exception 'FAILED: student forged an attempt';
exception when insufficient_privilege then raise notice 'ok  student cannot forge quiz attempts';
end $$;
do $$ begin
  perform public.start_adaptive_attempt((select id from public.courses where code = 'PHY110'), null, 3, 'auto');
  raise exception 'FAILED: quiz started in a non-enrolled course';
exception when insufficient_privilege then raise notice 'ok  student cannot start quizzes in a non-enrolled course';
end $$;

-- Adaptive attempt: answer-free questions, server grading, mastery, no repeats.
create temp table att1 as
  select public.start_adaptive_attempt((select id from public.courses where code = 'ML101'), null, 5, 'auto') as j;
select pg_temp.expect(jsonb_array_length((select j -> 'questions' from att1)) = 5, 'adaptive attempt returns 5 questions');
select pg_temp.expect((select j::text from att1) not like '%correct_option%' and (select j::text from att1) not like '%explanation%',
  'started attempt contains no answers or explanations');
select pg_temp.expect((select bool_and(q ->> 'difficulty' = 'easy') from att1, jsonb_array_elements(j -> 'questions') q),
  'new student (mastery 0.3) gets easy questions');
create temp table res1 as
  select public.submit_quiz_attempt((select (j ->> 'attempt_id')::uuid from att1),
         (select jsonb_object_agg(q ->> 'id', '{"option": 0}'::jsonb) from att1, jsonb_array_elements(j -> 'questions') q)) as r;
select pg_temp.expect((select (r ->> 'max_score')::int from res1) = 5, 'submission graded server-side');
select pg_temp.expect((select r -> 'results' -> 0 ? 'explanation' from res1), 'results reveal explanations after submission');
select pg_temp.expect((select count(*) from public.topic_mastery) >= 1, 'mastery recorded for the student');
select pg_temp.expect((select count(*) from public.questions) = 5, 'student can now read the 5 questions they answered');
select pg_temp.expect((select study_streak from public.profiles where id = auth.uid()) = 1, 'study streak started');
do $$ begin
  perform public.submit_quiz_attempt((select (j ->> 'attempt_id')::uuid from att1), '{}'::jsonb);
  raise exception 'FAILED: resubmitted an attempt';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok  an attempt cannot be submitted twice';
end $$;
create temp table att2 as
  select public.start_adaptive_attempt((select id from public.courses where code = 'ML101'), null, 5, 'auto') as j;
select pg_temp.expect(not exists (
    select 1 from att1, jsonb_array_elements(att1.j -> 'questions') a, att2, jsonb_array_elements(att2.j -> 'questions') b
    where a ->> 'id' = b ->> 'id'), 'next attempt does not repeat questions while unseen ones remain');
reset role;

-- Another student cannot see or submit the first student's attempt.
select pg_temp.login('other.student@macro.test');
set role authenticated;
select pg_temp.expect((select count(*) from public.quiz_attempts) = 0, 'students cannot see each other''s attempts');
select pg_temp.expect((select count(*) from public.topic_mastery) = 0, 'students cannot see each other''s mastery');
select pg_temp.expect((select count(*) from public.resources) = 0, 'non-enrolled student sees no resources');
do $$ begin
  perform public.submit_quiz_attempt((select (j ->> 'attempt_id')::uuid from att2), '{}'::jsonb);
  raise exception 'FAILED: submitted another student''s attempt';
exception when insufficient_privilege then raise notice 'ok  students cannot submit someone else''s attempt';
end $$;
insert into public.course_enrollments (course_id, student_id) select id, auth.uid() from public.courses where code = 'PHY110';
select pg_temp.expect((select count(*) from public.resources) = 1, 'after self-enrolling the student sees that course''s resources');
reset role;

-- ---------------------------------------------------------------- teachers
select pg_temp.login('teacher@macro.test');
set role authenticated;
select pg_temp.expect((select count(*) from public.courses) = 3, 'teacher sees their courses including drafts');
select pg_temp.expect((select count(*) from public.question_keys) = 18, 'teacher reads answer keys of their own questions');
select pg_temp.expect((select count(*) from public.profiles where role = 'student') = 2, 'teacher sees profiles of their enrolled students');
select pg_temp.expect((select (public.course_insights((select id from public.courses where code = 'ML101')) ->> 'students')::int) = 1,
  'course insights count enrolled students');
select pg_temp.expect((select count(*) from public.topic_mastery) >= 1, 'teacher sees mastery for their courses');
insert into storage.objects (bucket_id, name)
  select 'course-materials', id || '/abc-notes.pdf' from public.courses where code = 'ML101';
update public.resources set storage_path = (select name from storage.objects limit 1) where title = 'Textbook: ML Basics';
reset role;

select pg_temp.login('new.teacher@macro.test');
set role authenticated;
select pg_temp.expect((select count(*) from public.courses) = 2, 'another teacher sees only the published catalogue');
select pg_temp.expect((select count(*) from public.resources) = 0, 'another teacher cannot read someone else''s resources');
select pg_temp.expect((select count(*) from public.question_keys) = 0, 'another teacher cannot read someone else''s answer keys');
select pg_temp.expect((select count(*) from public.profiles) = 1, 'another teacher cannot see students they don''t teach');
update public.courses set title = 'Hijacked' where code = 'ML101';
select pg_temp.expect((select count(*) from public.courses where title = 'Hijacked') = 0, 'another teacher cannot edit someone else''s course');
do $$ begin
  insert into storage.objects (bucket_id, name) select 'course-materials', id || '/evil.pdf' from public.courses where code = 'ML101';
  raise exception 'FAILED: uploaded into another teacher''s course';
exception when insufficient_privilege then raise notice 'ok  teachers cannot upload into other teachers'' courses';
end $$;
insert into public.courses (teacher_id, title, code, subject) values (auth.uid(), 'Chemistry Basics', 'CH100', 'Chemistry');
select pg_temp.expect((select count(*) from public.courses where code = 'CH100') = 1, 'invited teacher can create a course');
do $$ begin
  insert into public.courses (teacher_id, title) select teacher_id, 'Impersonated' from public.courses where code = 'ML101';
  raise exception 'FAILED: created a course for another teacher';
exception when insufficient_privilege then
  raise notice 'ok  teachers cannot create courses owned by someone else';
end $$;
reset role;

-- ---------------------------------------------------------------- storage reads
select pg_temp.login('student@macro.test');
set role authenticated;
select pg_temp.expect((select count(*) from storage.objects) = 1, 'enrolled student can read the file of a published resource');
do $$ begin
  insert into storage.objects (bucket_id, name) select 'course-materials', id || '/student.pdf' from public.courses where code = 'ML101';
  raise exception 'FAILED: student uploaded course material';
exception when insufficient_privilege then raise notice 'ok  students cannot upload course materials';
end $$;
reset role;
select pg_temp.login('other.student@macro.test');
set role authenticated;
select pg_temp.expect((select count(*) from storage.objects) = 0, 'non-enrolled student cannot read course files');
reset role;

-- An existing student redeems an invitation sent to their own email.
select pg_temp.login('admin@macro.test');
set role authenticated;
create temp table invite2 as select public.create_teacher_invite('other.student@macro.test') as code;
reset role;
select pg_temp.login('sneaky@macro.test');
set role authenticated;
do $$ begin
  perform public.redeem_teacher_invite((select code from invite2));
  raise exception 'FAILED: redeemed an invite addressed to someone else';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok  an invite cannot be redeemed by a different account';
end $$;
reset role;
select pg_temp.login('other.student@macro.test');
set role authenticated;
select pg_temp.expect(public.redeem_teacher_invite((select code from invite2)) = 'teacher', 'existing account upgraded by its own invite');
reset role;
