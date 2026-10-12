import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  icon?: ReactNode;
}

export function Field({ label, error, hint, icon, id, className = '', ...rest }: FieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;
  return (
    <div>
      <label htmlFor={inputId} className="label">{label}</label>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">{icon}</span>}
        <input
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={`input ${icon ? 'pl-10' : ''} ${error ? 'input-error' : ''} ${className}`}
          {...rest}
        />
      </div>
      {error ? (
        <p id={`${inputId}-err`} className="mt-1.5 text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <div id={`${inputId}-hint`} className="mt-1.5 text-xs text-muted">{hint}</div>
      ) : null}
    </div>
  );
}

export function PasswordField(props: Omit<FieldProps, 'type'>) {
  const [show, setShow] = useState(false);
  const auto = useId();
  const inputId = props.id ?? auto;
  const { label, error, hint, className = '', ...rest } = props;
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;
  return (
    <div>
      <label htmlFor={inputId} className="label">{label}</label>
      <div className="relative">
        <input
          {...rest}
          id={inputId}
          type={show ? 'text' : 'password'}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={`input pr-11 ${error ? 'input-error' : ''} ${className}`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted hover:bg-surface hover:text-text"
          aria-label={show ? 'Hide password' : 'Show password'}
          aria-pressed={show}
          aria-controls={inputId}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error ? (
        <p id={`${inputId}-err`} className="mt-1.5 text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <div id={`${inputId}-hint`} className="mt-1.5 text-xs text-muted">{hint}</div>
      ) : null}
    </div>
  );
}
