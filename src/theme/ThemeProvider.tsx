import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_THEME, STORAGE_KEY, THEMES, isThemeId, type ThemeId, type ThemeMode } from './themes';

interface ThemeState {
  theme: ThemeId;
  mode: ThemeMode;
  setTheme: (theme: ThemeId, mode?: ThemeMode) => void;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function readStored(): { theme: ThemeId; mode: ThemeMode } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (raw && isThemeId(raw.theme) && (raw.mode === 'dark' || raw.mode === 'light')) return raw;
  } catch {
    /* ignore unreadable storage */
  }
  return { theme: DEFAULT_THEME, mode: 'dark' };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(readStored);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = state.theme;
    root.dataset.mode = state.mode;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* private mode: theme still applies for this visit */
    }
  }, [state]);

  const setTheme = useCallback((theme: ThemeId, mode?: ThemeMode) => {
    setState({ theme, mode: mode ?? THEMES.find((t) => t.id === theme)!.defaultMode });
  }, []);
  const setMode = useCallback((mode: ThemeMode) => setState((s) => ({ ...s, mode })), []);

  const value = useMemo(() => ({ ...state, setTheme, setMode }), [state, setTheme, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
