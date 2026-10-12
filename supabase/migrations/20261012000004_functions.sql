-- Application RPCs: search, tutor retrieval, adaptive quizzes, grading, activity.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- OR-semantics full-text query: matches rows sharing ANY meaningful word, ranked by overlap.
create or replace function public.any_word_tsquery(p_query text)
returns tsquery language sql immutable as $$
  select case
    when p_query is null or plainto_tsquery('english', p_query)::text = '' then null
    else replace(plainto_tsquery('english', p_query)::text, ' & ', ' | ')::tsquery
  end
$$;

-- Daily study streak, updated whenever a student does real study work.
create or replace function public.bump_streak(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
  set study_streak = case
        when last_active_on = current_date then study_streak
        when last_active_on = current_date - 1 then study_streak + 1
        else 1 end,
      last_active_on = current_date
  where id = p_user;
end $$;
revoke execute on function public.bump_streak(uuid) from public, anon, authenticated;

create or replace function public.record_activity(p_kind text, p_title text, p_link text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  insert into public.activity_log (user_id, kind, title, link)
  values (auth.uid(), p_kind, left(p_title, 200), left(p_link, 300));
  if p_kind in ('opened_resource', 'tutor_question', 'quiz_submitted') then
    perform public.bump_streak(auth.uid());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Application-wide search (SECURITY INVOKER: RLS decides what each user can find)
-- Keyword search today; a semantic (pgvector) branch can be added as another UNION arm
-- or blended into "rank" without changing the client contract.
-- ---------------------------------------------------------------------------
create or replace function public.search_content(
  p_query text,
  p_course_id uuid default null,
  p_subject text default null,
  p_kinds text[] default null,          -- course, topic, quiz, passage, or a resource_type
  p_difficulty public.difficulty default null,
  p_limit int default 40
)
returns table (
  id uuid, kind text, title text, subject text, description text,
  course_id uuid, course_title text, difficulty public.difficulty,
  source text, location text, link text, rank real
)
language sql stable security invoker set search_path = public as $$
  with q as (
    select websearch_to_tsquery('english', coalesce(p_query, '')) as ts,
           public.any_word_tsquery(p_query) as anyts,
           '%' || replace(replace(lower(trim(coalesce(p_query, ''))), '%', '\%'), '_', '\_') || '%' as pat
  ),
  hits as (
    -- Courses
    select c.id, 'course'::text as kind, c.title, c.subject, left(c.description, 220) as description,
           c.id as course_id, c.title as course_title, c.difficulty,
           coalesce(c.code, 'Course') as source, null::text as location,
           '/courses/' || c.id as link,
           (ts_rank(c.search, q.ts) * 2 + case when lower(c.title) like q.pat then 1 else 0 end)::real as rank
    from public.courses c, q
    where c.search @@ q.ts or lower(c.title) like q.pat or lower(c.subject) like q.pat or lower(coalesce(c.code, '')) like q.pat
    union all
    -- Topics / concepts
    select t.id, 'topic', t.name, c.subject, left(t.description, 220), c.id, c.title, c.difficulty,
           c.title, null, '/courses/' || c.id || '?topic=' || t.id,
           (ts_rank(t.search, q.ts) * 2 + case when lower(t.name) like q.pat then 1 else 0 end)::real
    from public.topics t join public.courses c on c.id = t.course_id, q
    where t.search @@ q.ts or lower(t.name) like q.pat
    union all
    -- Resources (textbooks, PDFs, slides, notes, videos, links)
    select r.id, r.resource_type::text, r.title, r.subject, left(r.description, 220), c.id, c.title, r.difficulty,
           coalesce(nullif(r.description, ''), c.title), null, '/resources/' || r.id,
           (ts_rank(r.search, q.ts) * 2 + case when lower(r.title) like q.pat then 1 else 0 end
             + case when exists (select 1 from unnest(r.keywords) k where lower(k) like q.pat) then 0.5 else 0 end)::real
    from public.resources r join public.courses c on c.id = r.course_id, q
    where r.search @@ q.ts or lower(r.title) like q.pat
       or exists (select 1 from unnest(r.keywords) k where lower(k) like q.pat)
    union all
    -- Quizzes and revision sets
    select z.id, 'quiz', z.title, c.subject, left(z.description, 220), c.id, c.title, z.difficulty,
           c.title, null, '/student/quizzes?quiz=' || z.id,
           (ts_rank(z.search, q.ts) * 2 + case when lower(z.title) like q.pat then 1 else 0 end)::real
    from public.quizzes z join public.courses c on c.id = z.course_id, q
    where z.search @@ q.ts or lower(z.title) like q.pat
    union all
    -- Passages inside material (concepts and keywords), best few per resource
    select * from (
      select distinct on (ch.resource_id)
             ch.id, 'passage'::text, r.title || ' · ' || ch.location_label, r.subject,
             ts_headline('english', ch.content, coalesce(q.anyts, q.ts), 'MaxWords=30, MinWords=12, StartSel=«, StopSel=»'),
             c.id, c.title, r.difficulty, r.title, ch.location_label,
             '/resources/' || r.id || '?chunk=' || ch.id,
             ts_rank_cd(ch.search, coalesce(q.anyts, q.ts))::real
      from public.resource_chunks ch
      join public.resources r on r.id = ch.resource_id
      join public.courses c on c.id = ch.course_id, q
      where ch.search @@ q.ts
      order by ch.resource_id, ts_rank_cd(ch.search, q.ts) desc
    ) passages
  )
  select h.id, h.kind, h.title, h.subject, h.description, h.course_id, h.course_title, h.difficulty,
         h.source, h.location, h.link, h.rank
  from hits h
  where length(trim(coalesce(p_query, ''))) >= 2
    and (p_course_id is null or h.course_id = p_course_id)
    and (p_subject is null or lower(h.subject) = lower(p_subject))
    and (p_kinds is null or h.kind = any (p_kinds))
    and (p_difficulty is null or h.difficulty = p_difficulty)
  order by h.rank desc, h.title
  limit least(greatest(coalesce(p_limit, 40), 1), 100)
$$;

-- ---------------------------------------------------------------------------
-- Tutor retrieval (SECURITY INVOKER: only chunks the caller may read)
-- ---------------------------------------------------------------------------
create or replace function public.match_chunks(
  p_query text,
  p_course_id uuid default null,
  p_resource_id uuid default null,
  p_limit int default 8
)
returns table (
  id uuid, resource_id uuid, resource_title text, resource_type public.resource_type,
  course_id uuid, topic_name text, location_kind text, location_label text,
  page_number int, seconds int, content text, rank real
)
language sql stable security invoker set search_path = public as $$
  select ch.id, ch.resource_id, r.title, r.resource_type, ch.course_id, ch.topic_name,
         ch.location_kind, ch.location_label, ch.page_number, ch.seconds, ch.content,
         ts_rank_cd(ch.search, public.any_word_tsquery(p_query))::real as rank
  from public.resource_chunks ch
  join public.resources r on r.id = ch.resource_id
  where public.any_word_tsquery(p_query) is not null
    and ch.search @@ public.any_word_tsquery(p_query)
    and (p_course_id is null or ch.course_id = p_course_id)
    and (p_resource_id is null or ch.resource_id = p_resource_id)
  order by rank desc
  limit least(greatest(coalesce(p_limit, 8), 1), 30)
$$;

-- ---------------------------------------------------------------------------
-- Quizzes
-- ---------------------------------------------------------------------------

-- Public (answer-free) shape of a question.
create or replace function public.question_public_json(q public.questions)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', q.id, 'type', q.question_type, 'prompt', q.prompt, 'options', q.options,
    'difficulty', q.difficulty, 'topic_id', q.topic_id,
    'topic_name', (select name from public.topics t where t.id = q.topic_id),
    'source_resource_id', q.source_resource_id, 'source_location', q.source_location
  )
$$;
revoke execute on function public.question_public_json(public.questions) from public, anon;

create or replace function public.difficulty_rank(d public.difficulty)
returns int language sql immutable as $$
  select case d when 'easy' then 0 when 'medium' then 1 else 2 end
$$;

-- Adaptive practice: picks unseen questions first, matched to the student's mastery per topic
-- (mastery < 0.4 -> easy, < 0.7 -> medium, else hard), weighting weak topics more heavily.
create or replace function public.start_adaptive_attempt(
  p_course_id uuid,
  p_topic_id uuid default null,
  p_count int default 5,
  p_difficulty text default 'auto'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_attempt uuid;
begin
  if v_uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not (public.is_enrolled(p_course_id) or public.is_course_staff(p_course_id)) then
    raise exception 'You are not enrolled in this course' using errcode = '42501';
  end if;
  if p_difficulty not in ('auto', 'easy', 'medium', 'hard') then
    raise exception 'Unknown difficulty %', p_difficulty;
  end if;
  p_count := least(greatest(coalesce(p_count, 5), 1), 30);

  select array_agg(id) into v_ids from (
    select q.id
    from public.questions q
    left join public.quizzes z on z.id = q.quiz_id
    left join public.topic_mastery m on m.student_id = v_uid and m.topic_id = q.topic_id
    where q.course_id = p_course_id
      and q.is_active
      and (q.quiz_id is null or z.is_published)
      and (p_topic_id is null or q.topic_id = p_topic_id)
    order by
      -- 1. avoid repeats: unseen first, then least recently answered
      (select max(a.created_at) from public.attempt_answers a where a.student_id = v_uid and a.question_id = q.id) asc nulls first,
      -- 2. closest to the target difficulty
      abs(public.difficulty_rank(q.difficulty) - case
            when p_difficulty = 'easy' then 0 when p_difficulty = 'medium' then 1 when p_difficulty = 'hard' then 2
            when coalesce(m.p_mastery, 0.3) < 0.4 then 0 when coalesce(m.p_mastery, 0.3) < 0.7 then 1 else 2 end),
      -- 3. weak topics more likely
      random() * (1.1 - coalesce(m.p_mastery, 0.3)) desc
    limit p_count
  ) picked;

  if v_ids is null then
    raise exception 'No questions are available for this selection yet';
  end if;

  insert into public.quiz_attempts (student_id, course_id, topic_id, mode, requested_difficulty, question_ids)
  values (v_uid, p_course_id, p_topic_id, 'adaptive', p_difficulty, v_ids)
  returning id into v_attempt;

  return jsonb_build_object(
    'attempt_id', v_attempt,
    'questions', (select jsonb_agg(public.question_public_json(q) order by array_position(v_ids, q.id))
                  from public.questions q where q.id = any (v_ids))
  );
end $$;

-- Teacher-authored quiz: every active question in a published quiz.
create or replace function public.start_quiz_attempt(p_quiz_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_quiz public.quizzes;
  v_ids uuid[];
  v_attempt uuid;
begin
  if v_uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into v_quiz from public.quizzes where id = p_quiz_id;
  if not found or not ((v_quiz.is_published and public.is_enrolled(v_quiz.course_id)) or public.is_course_staff(v_quiz.course_id)) then
    raise exception 'Quiz not found or not available to you' using errcode = '42501';
  end if;
  select array_agg(id order by created_at) into v_ids from public.questions where quiz_id = p_quiz_id and is_active;
  if v_ids is null then raise exception 'This quiz has no questions yet'; end if;

  insert into public.quiz_attempts (student_id, course_id, quiz_id, topic_id, mode, requested_difficulty, question_ids)
  values (v_uid, v_quiz.course_id, v_quiz.id, v_quiz.topic_id, 'quiz', v_quiz.difficulty::text, v_ids)
  returning id into v_attempt;

  return jsonb_build_object(
    'attempt_id', v_attempt, 'quiz_title', v_quiz.title,
    'questions', (select jsonb_agg(public.question_public_json(q) order by array_position(v_ids, q.id))
                  from public.questions q where q.id = any (v_ids))
  );
end $$;

-- Grades an attempt server-side, stores answers, updates BKT mastery and returns the review
-- (correct answers and explanations are revealed only now, and only for this attempt).
-- p_answers: {"<question id>": {"option": 2} | {"text": "..."} | {"value": 7}}
create or replace function public.submit_quiz_attempt(p_attempt_id uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_attempt public.quiz_attempts;
  v_q public.questions;
  v_k public.question_keys;
  v_resp jsonb;
  v_ok boolean;
  v_score int := 0;
  v_results jsonb := '[]'::jsonb;
  v_p numeric; v_post numeric; v_guess numeric;
  v_slip constant numeric := 0.10;
  v_learn constant numeric := 0.15;
begin
  select * into v_attempt from public.quiz_attempts where id = p_attempt_id for update;
  if not found or v_attempt.student_id is distinct from v_uid then
    raise exception 'Attempt not found' using errcode = '42501';
  end if;
  if v_attempt.status = 'submitted' then
    raise exception 'This attempt was already submitted';
  end if;

  for v_q in select * from public.questions where id = any (v_attempt.question_ids)
             order by array_position(v_attempt.question_ids, id) loop
    select * into v_k from public.question_keys where question_id = v_q.id;
    v_resp := coalesce(p_answers -> v_q.id::text, '{}'::jsonb);

    v_ok := case v_q.question_type
      when 'mcq' then (v_resp ->> 'option') ~ '^\d+$' and (v_resp ->> 'option')::int = v_k.correct_option
      when 'short' then exists (
        select 1 from unnest(v_k.accepted_answers) a
        where regexp_replace(lower(trim(a)), '\s+', ' ', 'g') = regexp_replace(lower(trim(coalesce(v_resp ->> 'text', ''))), '\s+', ' ', 'g')
      )
      when 'numerical' then (v_resp ->> 'value') ~ '^-?\d+(\.\d+)?$' and v_k.numeric_answer is not null and
        abs((v_resp ->> 'value')::numeric - v_k.numeric_answer) <= greatest(abs(v_k.numeric_answer) * v_k.tolerance, 1e-9)
    end;
    v_ok := coalesce(v_ok, false);
    if v_ok then v_score := v_score + 1; end if;

    insert into public.attempt_answers (attempt_id, question_id, student_id, response, is_correct)
    values (v_attempt.id, v_q.id, v_uid, v_resp, v_ok);

    -- Bayesian knowledge tracing update for the question's topic.
    if v_q.topic_id is not null then
      select p_mastery into v_p from public.topic_mastery where student_id = v_uid and topic_id = v_q.topic_id;
      v_p := coalesce(v_p, 0.3);
      v_guess := case when v_q.question_type = 'mcq' then 1.0 / greatest(jsonb_array_length(v_q.options), 2) else 0.05 end;
      v_post := case when v_ok
        then v_p * (1 - v_slip) / (v_p * (1 - v_slip) + (1 - v_p) * v_guess)
        else v_p * v_slip / (v_p * v_slip + (1 - v_p) * (1 - v_guess)) end;
      v_post := least(0.99, greatest(0.01, v_post + (1 - v_post) * v_learn));
      insert into public.topic_mastery (student_id, topic_id, course_id, p_mastery, attempts, correct, updated_at)
      values (v_uid, v_q.topic_id, v_q.course_id, v_post, 1, v_ok::int, now())
      on conflict (student_id, topic_id) do update
        set p_mastery = excluded.p_mastery,
            attempts = topic_mastery.attempts + 1,
            correct = topic_mastery.correct + v_ok::int,
            updated_at = now();
    end if;

    v_results := v_results || jsonb_build_object(
      'question', public.question_public_json(v_q),
      'response', v_resp,
      'is_correct', v_ok,
      'correct_option', v_k.correct_option,
      'accepted_answer', v_k.accepted_answers[1],
      'numeric_answer', v_k.numeric_answer,
      'explanation', v_k.explanation,
      'mastery', (select p_mastery from public.topic_mastery where student_id = v_uid and topic_id = v_q.topic_id)
    );
  end loop;

  update public.quiz_attempts
  set status = 'submitted', score = v_score, max_score = coalesce(array_length(question_ids, 1), 0), submitted_at = now()
  where id = v_attempt.id;

  insert into public.activity_log (user_id, kind, title, link)
  values (v_uid, 'quiz_submitted',
          'Scored ' || v_score || '/' || coalesce(array_length(v_attempt.question_ids, 1), 0) || ' in ' ||
          coalesce((select title from public.quizzes where id = v_attempt.quiz_id), 'adaptive practice'),
          '/student/quizzes?attempt=' || v_attempt.id);
  perform public.bump_streak(v_uid);

  return jsonb_build_object('attempt_id', v_attempt.id, 'score', v_score,
                            'max_score', coalesce(array_length(v_attempt.question_ids, 1), 0), 'results', v_results);
end $$;

-- Teacher analytics for one course (SECURITY INVOKER: RLS limits it to staff of that course).
create or replace function public.course_insights(p_course_id uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'students', (select count(*) from public.course_enrollments where course_id = p_course_id),
    'attempts', (select count(*) from public.quiz_attempts where course_id = p_course_id and status = 'submitted'),
    'avg_score', (select round(avg(score::numeric / nullif(max_score, 0)) * 100, 1)
                  from public.quiz_attempts where course_id = p_course_id and status = 'submitted'),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'topic_id', t.id, 'name', t.name,
        'avg_mastery', (select round(avg(m.p_mastery), 3) from public.topic_mastery m where m.topic_id = t.id),
        'students_struggling', (select count(*) from public.topic_mastery m where m.topic_id = t.id and m.p_mastery < 0.4)
      ) order by t.position, t.name)
      from public.topics t where t.course_id = p_course_id), '[]'::jsonb),
    'hardest_questions', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('question_id', q.id, 'prompt', left(q.prompt, 160),
               'answered', count(a.*), 'correct_rate', round(avg(a.is_correct::int)::numeric, 2)) as x
        from public.questions q join public.attempt_answers a on a.question_id = q.id
        where q.course_id = p_course_id
        group by q.id having count(a.*) >= 1
        order by avg(a.is_correct::int) asc, count(a.*) desc
        limit 5
      ) s), '[]'::jsonb)
  )
$$;

-- Function grants: API roles may call only these.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.search_content(text, uuid, text, text[], public.difficulty, int),
  public.any_word_tsquery(text)
  to anon, authenticated;
grant execute on function
  public.match_chunks(text, uuid, uuid, int),
  public.start_adaptive_attempt(uuid, uuid, int, text),
  public.start_quiz_attempt(uuid),
  public.submit_quiz_attempt(uuid, jsonb),
  public.course_insights(uuid),
  public.record_activity(text, text, text),
  public.redeem_teacher_invite(text),
  public.create_teacher_invite(text, text, int),
  public.admin_set_role(uuid, public.app_role),
  public.current_role_name(), public.is_admin(), public.is_teacher(),
  public.is_course_staff(uuid), public.is_enrolled(uuid), public.can_read_course_content(uuid),
  public.can_read_resource(uuid), public.teaches_student(uuid), public.in_own_attempt(uuid),
  public.difficulty_rank(public.difficulty)
  to authenticated;
grant execute on function public.check_teacher_invite(text, text) to anon, authenticated;
-- RLS helper functions are also evaluated for anon policies on courses/topics.
grant execute on function public.is_course_staff(uuid), public.is_admin() to anon;
