import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, Bot, BookOpen, ChevronsLeft, ChevronsRight, GraduationCap, LayoutDashboard, ListChecks,
  LogOut, Menu, Search, Settings, ShieldCheck, Users, X,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { Logo, LogoMark } from '@/components/ui/Logo';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { SearchBar } from '@/components/search/SearchBar';

interface NavItem { to: string; label: string; icon: typeof BookOpen }

const STUDENT_NAV: NavItem[] = [
  { to: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/student/courses', label: 'My courses', icon: BookOpen },
  { to: '/student/tutor', label: 'AI Tutor', icon: Bot },
  { to: '/student/quizzes', label: 'Quizzes', icon: ListChecks },
  { to: '/student/progress', label: 'Progress', icon: BarChart3 },
  { to: '/search', label: 'Search', icon: Search },
];
const TEACHER_NAV: NavItem[] = [
  { to: '/teacher/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/teacher/courses', label: 'Courses', icon: GraduationCap },
  { to: '/teacher/students', label: 'Students', icon: Users },
  { to: '/search', label: 'Search', icon: Search },
];

const COLLAPSE_KEY = 'macro.sidebar.collapsed';

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
}

function UserMenu() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!profile) return null;
  const logout = async () => {
    const role = profile.role;
    await signOut();
    navigate(role === 'student' ? '/student/login?signedOut=1' : '/teacher/login?signedOut=1', { replace: true });
  };
  return (
    <div className="relative" ref={ref}>
      <button className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-surface-2" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Account menu">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-fg">{initials(profile.full_name)}</span>
        <span className="hidden text-left leading-tight lg:block">
          <span className="block max-w-[10rem] truncate text-sm font-semibold">{profile.full_name}</span>
          <span className="block text-xs capitalize text-muted">{profile.role}</span>
        </span>
      </button>
      {open && (
        <div className="card absolute right-0 z-50 mt-2 w-60 animate-fade-up p-2" role="menu">
          <div className="border-b border-border px-3 pb-2 pt-1">
            <p className="truncate text-sm font-semibold">{profile.full_name}</p>
            <p className="truncate text-xs text-muted">{profile.email}</p>
          </div>
          <button role="menuitem" className="btn-ghost mt-1 w-full justify-start" onClick={() => { setOpen(false); navigate('/settings'); }}>
            <Settings className="h-4 w-4" /> Settings & profile
          </button>
          <button role="menuitem" className="btn-ghost w-full justify-start text-danger hover:text-danger" onClick={logout} data-testid="logout">
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

function SidebarLinks({ items, collapsed, onNavigate }: { items: NavItem[]; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          title={collapsed ? label : undefined}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              isActive ? 'bg-primary text-primary-fg shadow-sm' : 'text-muted hover:bg-surface-2 hover:text-text'
            } ${collapsed ? 'justify-center px-0' : ''}`}
        >
          <Icon className="h-5 w-5 shrink-0" aria-hidden />
          <span className={collapsed ? 'sr-only' : ''}>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ } }, [collapsed]);
  useEffect(() => setMobileOpen(false), [location.pathname]);

  const isTeacher = profile?.role === 'teacher' || profile?.role === 'admin';
  const items = [...(isTeacher ? TEACHER_NAV : STUDENT_NAV)];
  if (profile?.role === 'admin') items.push({ to: '/admin', label: 'Administration', icon: ShieldCheck });
  items.push({ to: '/settings', label: 'Settings', icon: Settings });
  const home = isTeacher ? '/teacher/dashboard' : '/student/dashboard';

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface/70 p-3 backdrop-blur transition-[width] duration-200 lg:flex ${collapsed ? 'w-[76px]' : 'w-64'}`}>
        <div className={`mb-6 flex items-center px-1 pt-1 ${collapsed ? 'justify-center' : ''}`}>
          {collapsed ? <LogoMark /> : <Logo to={home} />}
        </div>
        <SidebarLinks items={items} collapsed={collapsed} />
        <div className="mt-auto">
          {!collapsed && (
            <div className="mb-3 rounded-xl border border-border bg-surface-2 p-3 text-xs text-muted">
              Signed in as <span className="font-semibold capitalize text-text">{profile?.role}</span>
              {profile?.institution && <> · {profile.institution}</>}
            </div>
          )}
          <button className="btn-ghost w-full" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} data-testid="collapse-sidebar">
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-fade-up flex-col bg-surface p-4">
            <div className="mb-6 flex items-center justify-between">
              <Logo to={home} />
              <button className="btn-ghost p-2" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
            </div>
            <SidebarLinks items={items} collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button className="btn-ghost p-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu" data-testid="open-menu">
              <Menu className="h-5 w-5" />
            </button>
            <div className="lg:hidden"><Logo to={home} compact /></div>
            <div className="hidden max-w-xl flex-1 md:block">
              {location.pathname !== '/search' && <SearchBar />}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button className="btn-ghost p-2 md:hidden" aria-label="Search" onClick={() => navigate('/search')}>
                <Search className="h-5 w-5" />
              </button>
              <ThemeSwitcher />
              <UserMenu />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children ?? <Outlet />}</main>
      </div>
    </div>
  );
}
