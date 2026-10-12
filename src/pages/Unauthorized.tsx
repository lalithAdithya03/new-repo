import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth, dashboardFor } from '@/auth/AuthProvider';
import { PublicLayout } from '@/components/layout/PublicLayout';

export default function Unauthorized() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const state = useLocation().state as { from?: string } | null;
  return (
    <PublicLayout>
      <div className="mx-auto grid min-h-[60vh] max-w-lg place-items-center px-4 text-center">
        <div>
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-danger/15 text-danger"><ShieldAlert className="h-7 w-7" /></span>
          <h1 className="text-2xl font-bold">You don't have access to this page</h1>
          <p className="mt-2 text-sm text-muted">
            {state?.from ? <><code>{state.from}</code> is </> : 'This area is '}
            only available to {state?.from?.startsWith('/student') ? 'students' : state?.from?.startsWith('/admin') ? 'administrators' : 'teachers'}.
            {profile && <> You are signed in as a <strong>{profile.role}</strong>.</>}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link to={profile ? dashboardFor(profile.role) : '/'} className="btn-primary">
              {profile ? 'Go to my dashboard' : 'Back to home'}
            </Link>
            {profile && (
              <button className="btn-secondary" onClick={async () => { await signOut(); navigate('/', { replace: true }); }}>
                Sign out and switch account
              </button>
            )}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
