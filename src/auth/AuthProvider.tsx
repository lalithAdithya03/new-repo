import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Profile, Role } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { decodeTheme, encodeTheme } from '@/theme/themes';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** True until the stored session (and its profile) has been checked. */
  loading: boolean;
  /** False while the profile for the current session is being fetched. */
  profileReady: boolean;
  /** Set when the auth event was a password-recovery link. */
  recovering: boolean;
  refreshProfile: () => Promise<Profile | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export function dashboardFor(role: Role | undefined | null) {
  return role === 'teacher' || role === 'admin' ? '/teacher/dashboard' : '/student/dashboard';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [recovering, setRecovering] = useState(false);
  const [profileReady, setProfileReady] = useState(true);
  const { theme, mode, setTheme } = useTheme();
  const themeSynced = useRef<string | null>(null);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setProfileReady(true);
      return null;
    }
    setProfileReady(false);
    try {
      const p = await fetchProfile(s.user.id);
      setProfile(p);
      return p;
    } catch {
      setProfile(null);
      return null;
    } finally {
      setProfileReady(true);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(s);
      if (s) setProfileReady(false);
      // Defer the query so it doesn't run inside the auth callback (supabase-js recommendation).
      setTimeout(() => loadProfile(s), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Theme follows the user across devices: apply the saved one at sign-in, save changes after.
  useEffect(() => {
    if (!profile) {
      themeSynced.current = null;
      return;
    }
    const current = encodeTheme(theme, mode);
    if (themeSynced.current === null) {
      themeSynced.current = profile.id;
      const saved = decodeTheme(profile.preferred_theme);
      if (saved && profile.preferred_theme !== current) {
        setTheme(saved.theme, saved.mode);
        return;
      }
    }
    if (profile.preferred_theme !== current) {
      supabase.from('profiles').update({ preferred_theme: current }).eq('id', profile.id)
        .then(({ error }) => { if (!error) setProfile((p) => (p ? { ...p, preferred_theme: current } : p)); });
    }
  }, [profile, theme, mode, setTheme]);

  const value = useMemo<AuthState>(() => ({
    session,
    user: session?.user ?? null,
    profile,
    loading,
    profileReady,
    recovering,
    refreshProfile: () => loadProfile(session),
    signOut: async () => {
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
      setRecovering(false);
    },
  }), [session, profile, loading, profileReady, recovering, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
