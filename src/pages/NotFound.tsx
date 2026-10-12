import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';

export default function NotFound() {
  return (
    <PublicLayout>
      <div className="mx-auto grid min-h-[60vh] max-w-lg place-items-center px-4 text-center">
        <div>
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-accent"><Compass className="h-7 w-7" /></span>
          <h1 className="text-2xl font-bold">Page not found</h1>
          <p className="mt-2 text-sm text-muted">The page you were looking for doesn't exist or has moved.</p>
          <Link to="/" className="btn-primary mt-6">Back to home</Link>
        </div>
      </div>
    </PublicLayout>
  );
}
