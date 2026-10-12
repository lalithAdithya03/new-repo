# Supabase setup for Macro AI

These steps connect the app to your own Supabase project. The migrations have been applied to a hosted Supabase project and pass the Supabase security advisor apart from the intentional items noted below. The same SQL is tested on PostgreSQL 16 with Supabase Auth and PostgREST.

## 1. Create the database objects

Apply the six migrations in `supabase/migrations/` in filename order, either with the CLI:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

or by pasting each file into **SQL Editor** and running it.

| Migration | Creates |
|---|---|
| `…01_core_schema.sql` | Tables: profiles, teacher_invitations, courses, course_staff, topics, course_enrollments, resources, resource_chunks, quizzes, questions, question_keys, quiz_attempts, attempt_answers, topic_mastery, study_goals, activity_log, tutor_conversations, tutor_messages; full-text indexes |
| `…02_auth_roles.sql` | Signup trigger that creates a profile (student by default, teacher only with a valid invitation), role protection, invitation functions |
| `…03_rls_policies.sql` | Row Level Security on every table |
| `…04_functions.sql` | Search, tutor retrieval, adaptive quiz start/submit with server-side grading, course insights |
| `…05_storage.sql` | Private `course-materials` bucket (50 MB limit) and its access policies |
| `…06_hardening.sql` | Pins search_path on helper functions and blocks direct calls to the signup triggers |

## 2. Auth settings

In **Authentication → URL Configuration**:

- **Site URL**: your app URL, e.g. `https://macro.example.com` (or `http://localhost:5173` for development).
- **Redirect URLs**: add `<site>/reset-password*`, `<site>/student/login*` and `<site>/teacher/login*`.

In **Authentication → Providers → Email**, keep email sign-in on. "Confirm email" can stay on (recommended): the app shows a "check your inbox" screen and a resend button. Set up custom SMTP before launch, because Supabase's built-in mailer is rate-limited.

## 3. Environment variables

Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from **Project Settings → API**. Only the anon (public) key goes in the frontend. The service-role key is never needed by the app.

## 4. First administrator and teachers

1. Register your own account at `/student/register`.
2. In SQL Editor: `update public.profiles set role = 'admin' where email = 'you@example.com';`
3. Sign in at `/teacher/login` and open `/admin` to create teacher invitations. Each code is shown once, works only for the invited email, expires (14 days by default) and can be revoked. Only its SHA-256 hash is stored.
4. The teacher signs up at `/teacher/onboarding` with the code. Someone who already has a student account redeems the code under **Settings → Teacher access**.

Admins can also change a role directly with `select public.admin_set_role('<user uuid>', 'teacher');`.

## 5. AI tutor (optional)

Without this step the tutor works in demo mode: it finds the relevant passages and quotes them with citations, and says when a question isn't covered.

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy tutor
```

`TUTOR_MODEL` can override the model (default `claude-opus-5-5`). The function runs as the signed-in user, so it can only read passages that user may see, and it is instructed to answer only from those passages with `[n]` citations.

## 6. Demo content (optional)

Register `student@macro.test` and `teacher@macro.test` (or edit the two emails at the top of the file), then run `supabase/demo/demo_content.sql` in SQL Editor. It creates two published courses, topics, four materials with page/slide/timestamp passages, a teacher quiz and an 18-question practice bank, and enrols the student in one course.

## Security model in short

- Roles live in `profiles.role` and change only through the signup trigger, an invitation, or an admin. Clients cannot update their own role, email or streak.
- Students read material only for published courses they are enrolled in. Teachers manage only courses they own or co-teach.
- Answer keys live in `question_keys`, which students cannot read; quizzes are graded inside `submit_quiz_attempt`.
- Search and tutor retrieval run with the caller's permissions, so results respect RLS.
- `npm run test:db` checks all of the above (60 assertions) on a throwaway database.

## Security advisor notes

After setup, the advisor still lists two kinds of items on purpose:

- **`teacher_directory` is a security definer view.** It exposes only the id, name and institution of teachers so students can see who teaches a course. Profiles are otherwise private, so a security invoker view would return no teachers.
- **Signed-in users can execute SECURITY DEFINER functions.** These are the app's RPCs (quizzes, invitations, access checks). Each one checks `auth.uid()` and the caller's role itself.
