import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Bot, CheckCircle2, ClipboardList, FolderUp, GraduationCap, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';

const PANEL = {
  student: {
    badge: 'Student portal',
    icon: GraduationCap,
    heading: 'Learn from your own material, at your own pace.',
    points: [
      { icon: Bot, text: 'Ask the AI tutor and get answers cited to the exact page, slide or timestamp' },
      { icon: ClipboardList, text: 'Adaptive quizzes that target the topics you find hardest' },
      { icon: BarChart3, text: 'Track mastery per topic and keep your study streak going' },
    ],
  },
  teacher: {
    badge: 'Teacher portal',
    icon: ShieldCheck,
    heading: 'Run your courses and see where students struggle.',
    points: [
      { icon: FolderUp, text: 'Upload textbooks, PDFs, slides and notes, organised by topic and difficulty' },
      { icon: Sparkles, text: 'Build quizzes and a question bank for adaptive practice' },
      { icon: Search, text: 'Monitor topic-wise mastery and the questions students miss most' },
    ],
  },
};

export function AuthLayout({ variant, title, subtitle, children, footer }: {
  variant: 'student' | 'teacher'; title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode;
}) {
  const p = PANEL[variant];
  const Icon = p.icon;
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="hero-gradient relative hidden flex-col justify-between overflow-hidden border-r border-border bg-surface p-10 lg:flex">
        <Logo />
        <div className="max-w-md animate-fade-up">
          <span className="chip mb-4 border-accent/40 text-accent"><Icon className="h-3.5 w-3.5" /> {p.badge}</span>
          <h2 className="text-4xl font-extrabold leading-tight">{p.heading}</h2>
          <ul className="mt-8 space-y-4">
            {p.points.map(({ icon: I, text }) => (
              <li key={text} className="flex gap-3 text-sm text-text/90">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface/80 text-accent"><I className="h-4 w-4" /></span>
                <span className="pt-2">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted"><CheckCircle2 className="h-4 w-4" /> Secured by Supabase Auth and row-level security</p>
      </aside>

      <div className="flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6">
          <div className="lg:hidden"><Logo /></div>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/" className="btn-ghost hidden sm:inline-flex">Home</Link>
            <ThemeSwitcher />
          </div>
        </div>
        <div className="flex flex-1 items-start justify-center px-4 pb-12 pt-4 sm:items-center sm:px-6">
          <div className="w-full max-w-md animate-fade-up">
            <span className="chip mb-3 border-accent/40 text-accent lg:hidden"><Icon className="h-3.5 w-3.5" /> {p.badge}</span>
            <h1 className="text-3xl font-extrabold">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
            <div className="card card-pad mt-6">{children}</div>
            {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
