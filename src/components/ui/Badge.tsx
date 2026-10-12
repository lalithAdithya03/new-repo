import type { Difficulty } from '@/lib/types';

const diffStyle: Record<Difficulty, string> = {
  easy: 'border-success/40 bg-success/10 text-success',
  medium: 'border-warning/40 bg-warning/10 text-warning',
  hard: 'border-danger/40 bg-danger/10 text-danger',
};

export function DifficultyBadge({ value }: { value: Difficulty }) {
  return <span className={`chip capitalize ${diffStyle[value]}`}>{value}</span>;
}

export function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`chip ${className}`}>{children}</span>;
}
