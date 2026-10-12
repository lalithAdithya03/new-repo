import { Database } from 'lucide-react';
import { Link } from 'react-router-dom';

/** Shown instead of auth-backed pages until Supabase environment variables are configured. */
export function SetupNotice() {
  return (
    <div className="grid min-h-[70vh] place-items-center p-6">
      <div className="card card-pad max-w-lg">
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-warning/15 text-warning"><Database className="h-5 w-5" /></span>
        <h1 className="text-xl font-bold">Connect Supabase to continue</h1>
        <p className="mt-2 text-sm text-muted">
          Sign-in, dashboards and search need a Supabase project. Copy <code>.env.example</code> to <code>.env.local</code>,
          set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, apply the SQL in
          <code> supabase/migrations</code>, then restart <code>npm run dev</code>. Full steps are in the README.
        </p>
        <Link to="/" className="btn-secondary mt-5">Back to home</Link>
      </div>
    </div>
  );
}
