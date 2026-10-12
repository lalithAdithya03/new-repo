# Macro AI · Knowledge Without Boundaries

A personalised learning web app: students search their course material, ask an AI tutor that cites the exact page, slide or timestamp, and practise with adaptive quizzes; teachers upload and organise material, build quizzes and follow class progress.

Built with React 18 + Vite + TypeScript + Tailwind, on Supabase (Postgres, Auth, Row Level Security, Storage, Edge Functions). The original StudyMate prototype is kept unchanged at the bottom of this page.

## Quick start

```bash
npm install
cp .env.example .env.local     # fill in your Supabase URL and anon key
npm run dev                    # http://localhost:5173
```

Without a `.env.local` the public pages still render and protected pages show a setup notice. Full Supabase setup (migrations, auth settings, first admin, tutor function) is in [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md).

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck and production build into `dist/` |
| `npm test` | Unit tests (grounding engine, material parsing) |
| `npm run test:db` | Applies every migration to a throwaway Postgres and runs 60 RLS/security checks |
| `npm run test:e2e` | 21 Playwright browser tests against a running Supabase stack (see below) |

## Test accounts

Create them once your database is set up:

1. Register `student@macro.test` at `/student/register`, and `teacher@macro.test` the same way (it starts as a student).
2. In the Supabase SQL editor, run [`supabase/demo/demo_content.sql`](supabase/demo/demo_content.sql). It promotes the teacher, creates two courses with topics, materials, a quiz and an 18-question bank, and enrols the student. Change the two emails at the top to use your own accounts.
3. Make yourself an administrator: `update public.profiles set role = 'admin' where email = 'you@example.com';`. Admins invite teachers from `/admin`.

New teachers join at `/teacher/onboarding` with an invitation code from an admin. The code is bound to their email, single use, and expires.

## Features

- **Five themes** (Midnight Indigo, Ocean Breeze, Emerald Focus, Royal Purple, Light Minimal), each with dark and light modes. The choice is saved in the browser and on the user's profile.
- **Separate student and teacher portals** (`/student/login`, `/teacher/login`) with validation, show/hide password, password reset and logout. The role comes from the database, never from the form: signing in to the wrong portal is refused.
- **Route guards**: signed-out users go to the right login page and come back afterwards; the wrong role sees `/unauthorized`.
- **Search** across courses, topics, materials, quizzes and passages inside materials, with type/course/subject/difficulty filters. Results come from Supabase through RLS, so visitors see the public catalogue and students see only material from courses they are enrolled in.
- **AI tutor** that answers only from the student's course material, with clickable citations. Questions the material does not cover are labelled and not answered. The AI key stays in a Supabase Edge Function; without it the tutor runs in a clearly labelled demo mode that quotes the matching passages.
- **Adaptive quizzes**: MCQ, short answer and numerical; unseen questions first; difficulty follows per-topic mastery (Bayesian knowledge tracing). Grading happens in the database, and answer keys are never sent to students.
- **Student dashboard**: streak, mastery, weak topics, goals, recent activity. **Teacher dashboard**: courses, uploads (PDF text is extracted per page), topics, quiz builder, students and class insights.

## End-to-end tests

`npm run test:e2e` needs a Supabase stack with demo data. With Docker, use `supabase start`, apply the migrations and run `demo_content.sql`. Without Docker, `scripts/local-stack/` boots real Supabase Auth (GoTrue) and PostgREST against a local Postgres, plus a small gateway that emulates Storage and captures auth emails:

```bash
GOTRUE_BIN=/path/to/auth GOTRUE_MIGRATIONS=/path/to/migrations POSTGREST_BIN=/path/to/postgrest \
  scripts/local-stack/start.sh          # writes .env.local
scripts/local-stack/seed-demo.sh        # demo accounts (password Passw0rd!23) and content
npm run test:e2e
scripts/local-stack/stop.sh
```

The tests cover registration, login, logout, password reset by email link, teacher invitations, role redirects and guards, search permissions and filters, adaptive and teacher quizzes, the tutor (citations and "not covered"), PDF upload to search, all five themes with reload, and phone layouts.

## Status

Verified locally: the 60 database security checks, unit tests, production build, and all 21 browser tests against real Supabase Auth and PostgREST.

Not yet verified or not built:

- Nothing has been run against a hosted Supabase project. Storage was tested only through the local emulator.
- Real AI answers need `ANTHROPIC_API_KEY` set and the `tutor` function deployed. Locally only demo mode was exercised.
- Text is extracted from PDF, text, Markdown and VTT/SRT files. PPTX, DOCX, images and video are stored and searchable by title, description and keywords only; paste their notes or transcript to make them citeable.
- Search is keyword (Postgres full text), not semantic/vector search.

## Legacy prototype: StudyMate (single HTML file)

A source-grounded, adaptive study companion built for **Multimodal AI Hackathon 2026, Track D: Personalized Tutoring & Adaptive Learning** (brief: [`Track D.pdf`](Track%20D.pdf)).

StudyMate turns lecture transcripts, textbook pages and slides into a cited knowledge base, answers questions only from that material, quizzes the student adaptively, and tracks per-topic mastery.

### Run it

No build step or server. Open the file in a browser:

```
StudyMate – Source-Grounded Adaptive Study Companion.html
```

1. **Library** → click *Load sample course* (a small ML course), or upload your own `.txt/.md/.vtt/.srt` files.
2. **Tutor** → ask a question. Try "What is gradient descent?" and then "How do I bake sourdough?" (it should refuse).
3. **Assess** → run the *Diagnostic* quiz, then regular quizzes.
4. **Dashboard** → mastery per topic, course flow map, weak topics, study schedule.
5. **Evaluate** → retrieval/generation metrics and simulated-student runs.

State (sources + learner model) is saved in the browser's `localStorage`.

### Input format

Sources must already be converted to text. Markers define the source location of each unit:

| Marker | Meaning |
|---|---|
| `## Topic > Prereq1, Prereq2` | Declares a topic and its prerequisites |
| `[p.12]`, `[slide 4]`, `[00:12:30]` | Page / slide / video timestamp for the text that follows |
| `.vtt` / `.srt` cues | Timestamps taken automatically, grouped 4 cues per unit |
| `Figure: …` | Indexes a diagram caption as searchable text |
| `Q: … \| A: 7` | Adds a numerical problem with its answer key |

Text without headings goes into a `General` topic.

### What works today vs. the Track D brief

| Requirement | Status |
|---|---|
| Source-linked knowledge base (topics, prerequisites, page/slide/timestamp) | Done for pre-converted text |
| Ingest video, PDF, slides **without manual preprocessing** | **Not done**: input must be text with markers |
| Extract information from images/diagrams | **Partial**: only hand-written `Figure:` captions are indexed |
| Cited answers that open the exact source | Done (click a 🔗 chip to see the highlighted excerpt) |
| Decline off-material queries | Done (coverage threshold on key-term overlap) |
| MCQ / short answer / numerical quizzes with topic, source, difficulty tags | Done; MCQ and short answer are fill-in-the-blank only |
| Answer verification / cross-model validation | **Partial**: self-check that the answer appears in the source sentence; no second model |
| No repeated questions | Done (`asked` list) |
| Cited feedback, post-quiz report, misconceptions | Done (heuristic misconceptions) |
| Learner model + diagnostic for new students | Done (Bayesian knowledge tracing per topic) |
| Evaluation with RAGAS / DeepEval / TruLens | **Not done**: built-in lightweight proxies only |
| Simulated students (mastery gain, repetition rate) | Done (3 synthetic profiles vs. random baseline) |
| Course flow map, study schedule | Done |
| Hindi / Indian-language support, audio tutoring, revision material | Not done |
| Documentation | This README + [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Demo video | Not done |

### Docs

- [Architecture, grounding method and learner model](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
