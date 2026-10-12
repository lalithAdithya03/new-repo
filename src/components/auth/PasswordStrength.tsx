import { passwordStrength } from '@/lib/validation';

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const { score, label } = passwordStrength(password);
  const tone = score <= 1 ? 'bg-danger' : score === 2 ? 'bg-warning' : 'bg-success';
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < score ? tone : 'bg-surface-2'}`} />
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">Password strength: {label}</p>
    </div>
  );
}
