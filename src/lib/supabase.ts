import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set (see .env.example). */
export const isSupabaseConfigured = Boolean(url && anonKey && !url.includes('your-project-ref'));

// Only the public anon key is ever used in the browser. Row Level Security decides what it can do.
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'public-anon-key-missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const TUTOR_FUNCTION = (import.meta.env.VITE_TUTOR_FUNCTION as string | undefined) || 'tutor';
export const MATERIALS_BUCKET = 'course-materials';
