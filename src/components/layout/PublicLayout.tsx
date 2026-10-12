import { Link, NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth, dashboardFor } from '@/auth/AuthProvider';
import { Logo } from '@/components/ui/Logo';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';

export function PublicHeader() {
  const { profile } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/75 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="ml-6 hidden items-center gap-1 text-sm md:flex" aria-label="Primary">
          <a href="/#features" className="btn-ghost">Features</a>
          <a href="/#how-it-works" className="btn-ghost">How it works</a>
          <NavLink to="/search" className="btn-ghost">Search</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitcher />
          {profile ? (
            <Link to={dashboardFor(profile.role)} className="btn-primary">Open dashboard</Link>
          ) : (
            <>
              <Link to="/student/login" className="btn-secondary hidden sm:inline-flex">Student login</Link>
              <Link to="/teacher/login" className="btn-primary">Teacher login</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-surface/50">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-1">
          <Logo />
          <p className="mt-3 text-sm text-muted">AI-powered personalized learning, grounded in your own course material.</p>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold">Platform</p>
          <ul className="space-y-2 text-sm text-muted">
            <li><a className="hover:text-text" href="/#features">Features</a></li>
            <li><a className="hover:text-text" href="/#how-it-works">How it works</a></li>
            <li><Link className="hover:text-text" to="/search">Search the catalogue</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold">Accounts</p>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link className="hover:text-text" to="/student/login">Student login</Link></li>
            <li><Link className="hover:text-text" to="/student/register">Create a student account</Link></li>
            <li><Link className="hover:text-text" to="/teacher/login">Teacher login</Link></li>
            <li><Link className="hover:text-text" to="/teacher/onboarding">Teacher onboarding</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-sm font-semibold">Support</p>
          <ul className="space-y-2 text-sm text-muted">
            <li><Link className="hover:text-text" to="/forgot-password">Reset your password</Link></li>
            <li><a className="hover:text-text" href="mailto:support@macroai.example">support@macroai.example</a></li>
            <li><a className="hover:text-text" href="https://github.com/lalithAdithya03/Pandora-AI" target="_blank" rel="noreferrer">Documentation</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-muted">© {year} Macro AI · Knowledge Without Boundaries</div>
    </footer>
  );
}

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
