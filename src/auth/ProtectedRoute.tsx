import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '@/lib/types';
import { isSupabaseConfigured } from '@/lib/supabase';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { SetupNotice } from '@/components/SetupNotice';
import { dashboardFor, useAuth } from './AuthProvider';

interface Props {
  /** Roles allowed in. Omit to allow any signed-in user. Admins may enter teacher areas. */
  roles?: Role[];
  children: ReactNode;
}

/**
 * Client-side guard for routes. It only decides what to render: the data behind every page is
 * protected by Row Level Security in the database, so bypassing this guard reveals nothing.
 */
export function ProtectedRoute({ roles, children }: Props) {
  const { session, profile, loading, profileReady, signOut } = useAuth();
  const location = useLocation();

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (loading || (session && !profileReady)) return <FullPageSpinner label="Checking your session…" />;
  if (session && !profile) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="card card-pad max-w-md text-center">
          <h1 className="text-xl font-bold">We couldn't load your profile</h1>
          <p className="mt-2 text-sm text-muted">
            Your account exists but has no Macro AI profile, or the database could not be reached. If you are the
            administrator, check that the migrations in supabase/migrations were applied.
          </p>
          <button className="btn-primary mt-5" onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
    );
  }

  if (!session || !profile) {
    const wantsTeacher = location.pathname.startsWith('/teacher') || location.pathname.startsWith('/admin');
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`${wantsTeacher ? '/teacher' : '/student'}/login?next=${next}`} replace />;
  }

  if (roles && !roles.includes(profile.role) && !(profile.role === 'admin' && roles.includes('teacher'))) {
    return <Navigate to="/unauthorized" replace state={{ from: location.pathname, home: dashboardFor(profile.role) }} />;
  }
  return <>{children}</>;
}
