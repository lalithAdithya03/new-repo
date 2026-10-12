export function masteryTone(p: number) {
  return p < 0.4 ? 'bg-danger' : p < 0.7 ? 'bg-warning' : 'bg-success';
}

export function ProgressBar({ value, label, className = '' }: { value: number; label?: string; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={className}>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={`h-full rounded-full transition-all duration-500 ${masteryTone(value)}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
