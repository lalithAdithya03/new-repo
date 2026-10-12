-- Hardening from the Supabase security advisor.
-- Pin search_path on helper functions so callers cannot shadow the objects they use.
alter function public.keywords_text(text[]) set search_path = public;
alter function public.touch_updated_at() set search_path = public;
alter function public.any_word_tsquery(text) set search_path = public;
alter function public.difficulty_rank(public.difficulty) set search_path = public;
alter function public.storage_course_id(text) set search_path = public;

-- Trigger functions only run from their triggers; nobody needs to call them over the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;
