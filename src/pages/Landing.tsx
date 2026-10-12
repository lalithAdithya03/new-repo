import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Bot, FolderOpen, GraduationCap, ListChecks, Quote, Search, ShieldCheck, Upload, UserCheck } from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { SearchBar } from '@/components/search/SearchBar';
import { ProgressBar } from '@/components/ui/ProgressBar';

const FEATURES = [
  { icon: Bot, title: 'AI Tutor', text: 'Ask questions about your course material and get explanations cited to the exact page, slide or video timestamp. Questions outside your material are flagged, never guessed.' },
  { icon: Search, title: 'Smart Search', text: 'One search across courses, textbooks, PDFs, slides, notes, topics and quizzes, filtered by subject, type and difficulty, and limited to what you are allowed to see.' },
  { icon: ListChecks, title: 'Adaptive Quizzes', text: 'Multiple-choice, short-answer and numerical questions that adapt to your mastery, avoid repeats and explain every answer with its source.' },
  { icon: FolderOpen, title: 'Course Materials', text: 'Teachers upload and organise learning resources by subject, topic and difficulty. Students open them right where the tutor cites them.' },
  { icon: BarChart3, title: 'Progress Tracking', text: 'Topic-by-topic mastery, weak-topic recommendations, study streaks and goals for students, and class-wide insights for teachers.' },
];

const STEPS = [
  { icon: UserCheck, title: 'Join', text: 'Students sign up and enrol in courses. Teachers join through an institution invitation.' },
  { icon: Upload, title: 'Upload', text: 'Teachers add textbooks, PDFs, slides and notes. Macro AI indexes them with page and slide locations.' },
  { icon: Bot, title: 'Learn', text: 'Students search, ask the AI tutor and follow citations back to the source.' },
  { icon: GraduationCap, title: 'Master', text: 'Adaptive quizzes update topic mastery and point to the material that needs revision.' },
];

export default function Landing() {
  return (
    <PublicLayout>
      <section className="hero-gradient relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-24">
          <div className="animate-fade-up">
            <span className="chip border-accent/40 text-accent"><ShieldCheck className="h-3.5 w-3.5" /> Source-grounded personalised learning</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] sm:text-5xl lg:text-6xl">
              Macro <span className="text-gradient">AI</span>
              <span className="mt-3 block text-2xl font-bold text-muted sm:text-3xl">Knowledge Without Boundaries.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted sm:text-lg">
              Upload your study materials, search everything in one place, ask an AI tutor that cites its sources, and
              practise with quizzes that adapt to what you know.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/student/login" className="btn-primary px-6 py-3 text-base">
                <GraduationCap className="h-5 w-5" /> Login as Student
              </Link>
              <Link to="/teacher/login" className="btn-secondary px-6 py-3 text-base">
                <ShieldCheck className="h-5 w-5" /> Login as Teacher
              </Link>
            </div>
            <div className="mt-8 max-w-xl">
              <SearchBar size="lg" placeholder="Search courses, topics, concepts…" />
              <p className="mt-2 text-xs text-muted">Visitors can search the public course catalogue. Sign in to search inside your course materials.</p>
            </div>
          </div>

          {/* Product preview */}
          <div className="relative hidden animate-fade-up lg:block" aria-hidden>
            <div className="card card-pad space-y-4 rotate-[1deg]">
              <div className="flex items-center gap-2 text-sm font-semibold"><Bot className="h-4 w-4 text-accent" /> AI Tutor</div>
              <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-fg">What does the learning rate control?</div>
              <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-border bg-surface-2 px-4 py-3 text-sm">
                <p>The learning rate controls the size of each step gradient descent takes downhill <span className="text-accent">[1]</span>.</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="chip"><Quote className="h-3 w-3" /> Textbook · p.20</span>
                  <span className="chip"><Quote className="h-3 w-3" /> Slides · slide 7</span>
                </div>
              </div>
            </div>
            <div className="card card-pad absolute -bottom-10 -left-10 w-64 -rotate-2 space-y-3">
              <p className="text-sm font-semibold">Topic mastery</p>
              {[['Gradient Descent', 0.82], ['Overfitting', 0.55], ['Neural Networks', 0.31]].map(([t, v]) => (
                <div key={t as string}>
                  <div className="mb-1 flex justify-between text-xs"><span>{t}</span><span className="text-muted">{Math.round((v as number) * 100)}%</span></div>
                  <ProgressBar value={v as number} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-extrabold sm:text-4xl">Everything you need to learn smarter</h2>
          <p className="mt-3 text-muted">Built for students and teachers, with every answer traceable to real course material.</p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }, i) => (
            <article key={title} className="card card-pad group transition hover:-translate-y-1 hover:border-accent/50" style={{ animationDelay: `${i * 60}ms` }}>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-accent transition group-hover:bg-primary group-hover:text-primary-fg">
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm text-muted">{text}</p>
            </article>
          ))}
          <article className="card card-pad flex flex-col justify-between bg-primary/10">
            <div>
              <h3 className="text-lg font-bold">Ready to start?</h3>
              <p className="mt-2 text-sm text-muted">Create a free student account in under a minute.</p>
            </div>
            <Link to="/student/register" className="btn-primary mt-5 w-fit">Create account <ArrowRight className="h-4 w-4" /></Link>
          </article>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-20 border-y border-border bg-surface/50">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-extrabold sm:text-4xl">How it works</h2>
          <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="card card-pad relative">
                <span className="absolute right-5 top-5 font-display text-4xl font-extrabold text-border">{i + 1}</span>
                <Icon className="h-6 w-6 text-accent" />
                <h3 className="mt-4 font-bold">{title}</h3>
                <p className="mt-1.5 text-sm text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="card hero-gradient flex flex-col items-start gap-6 overflow-hidden p-8 sm:p-12 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">Teaching a course?</h2>
            <p className="mt-2 max-w-xl text-muted">Teacher accounts are approved by your institution. Ask your administrator for an invitation, then set up your account.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/teacher/onboarding" className="btn-primary">Teacher onboarding</Link>
            <Link to="/teacher/login" className="btn-secondary">Teacher login</Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
