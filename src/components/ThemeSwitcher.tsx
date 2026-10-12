import { useEffect, useRef, useState } from 'react';
import { Check, Moon, Palette, Sun } from 'lucide-react';
import { THEMES } from '@/theme/themes';
import { useTheme } from '@/theme/ThemeProvider';

function Swatch({ colors }: { colors: [string, string, string] }) {
  return (
    <span className="flex h-6 w-10 overflow-hidden rounded-md border border-border" aria-hidden>
      {colors.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}
    </span>
  );
}

/** Full theme picker: five palettes, each with a dark and a light appearance. */
export function ThemePicker() {
  const { theme, mode, setTheme, setMode } = useTheme();
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Colour theme" className="grid gap-2">
        {THEMES.map((t) => {
          const active = t.id === theme;
          return (
            <button
              key={t.id}
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(t.id, t.id === theme ? mode : t.defaultMode)}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                active ? 'border-accent bg-primary/10' : 'border-border hover:border-accent/50 hover:bg-surface-2'}`}
            >
              <Swatch colors={t.swatch[active ? mode : t.defaultMode]} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t.name}</span>
                <span className="block truncate text-xs text-muted">{t.description}</span>
              </span>
              {active && <Check className="h-4 w-4 text-accent" aria-hidden />}
            </button>
          );
        })}
      </div>
      <div className="flex rounded-xl border border-border bg-surface-2 p-1" role="radiogroup" aria-label="Appearance">
        {(['dark', 'light'] as const).map((m) => (
          <button
            key={m}
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition ${
              mode === m ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'}`}
          >
            {m === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            {m === 'dark' ? 'Dark' : 'Light'}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Compact button + popover for the top bars. */
export function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        className="btn-secondary px-3"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Change colour theme"
        data-testid="theme-switcher"
      >
        <Palette className="h-4 w-4" />
        <span className="hidden md:inline">{THEMES.find((t) => t.id === theme)?.name}</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Theme" className="card absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] animate-fade-up p-3">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">Theme</p>
          <ThemePicker />
        </div>
      )}
    </div>
  );
}
