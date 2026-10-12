import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

type Tone = 'info' | 'success' | 'warning' | 'error';
const styles: Record<Tone, string> = {
  info: 'border-accent/40 bg-accent/10',
  success: 'border-success/40 bg-success/10',
  warning: 'border-warning/40 bg-warning/10',
  error: 'border-danger/40 bg-danger/10',
};
const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle };
const iconColor: Record<Tone, string> = { info: 'text-accent', success: 'text-success', warning: 'text-warning', error: 'text-danger' };

export function Alert({ tone = 'info', title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  const Icon = icons[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-xl border p-3.5 text-sm ${styles[tone]}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor[tone]}`} aria-hidden />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-text/90">{children}</div>}
      </div>
    </div>
  );
}
