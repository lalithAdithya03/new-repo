-- Signup handling, role protection and secure teacher onboarding.

-- Every new auth user gets a profile. The role is decided HERE, server-side:
--   * no invite code            -> student
--   * valid teacher invite code -> teacher (code must match the invited email, be unexpired and unused)
--   * invalid invite code       -> signup is rejected, so nobody silently ends up with the wrong role
-- Anything the client puts in user metadata such as {"role": "teacher"} is ignored.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_code text := nullif(trim(new.raw_user_meta_data ->> 'invite_code'), '');
  v_invite public.teacher_invitations;
  v_role public.app_role := 'student';
begin
  if v_code is not null then
    select * into v_invite
    from public.teacher_invitations
    where code_hash = encode(extensions.digest(v_code, 'sha256'), 'hex')
      and lower(email) = lower(new.email)
      and not revoked
      and accepted_at is null
      and expires_at > now()
    for update;

    if not found then
      raise exception 'Invalid or expired teacher invitation code for this email'
        using errcode = 'P0001';
    end if;
    v_role := 'teacher';
  end if;

  insert into public.profiles (id, email, full_name, role, institution)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    v_role,
    coalesce(v_invite.institution, nullif(trim(new.raw_user_meta_data ->> 'institution'), ''))
  );

  if v_invite.id is not null then
    update public.teacher_invitations
    set accepted_at = now(), accepted_by = new.id
    where id = v_invite.id;
  end if;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync when a user changes their email through Supabase Auth.
create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Clients (the anon/authenticated API roles) may edit their own name/institution/avatar,
-- but never their role, email or streak. Trusted SECURITY DEFINER functions run as the
-- function owner, so they pass this check; admins may change roles.
create or replace function public.guard_profile_update()
-- SECURITY INVOKER on purpose: current_user must be the caller's role.
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Only an administrator can change a role' using errcode = '42501';
    end if;
    if new.email is distinct from old.email
       or new.study_streak is distinct from old.study_streak
       or new.last_active_on is distinct from old.last_active_on
       or new.id is distinct from old.id then
      raise exception 'This profile field is managed by the server' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Course ownership can only be transferred by an administrator.
create or replace function public.guard_course_owner()
-- SECURITY INVOKER on purpose: current_user must be the caller's role.
returns trigger language plpgsql set search_path = public as $$
begin
  if new.teacher_id is distinct from old.teacher_id
     and current_user in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'Only an administrator can transfer a course' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger courses_guard_owner before update on public.courses
  for each row execute function public.guard_course_owner();

-- ---------------------------------------------------------------------------
-- Teacher invitations
-- ---------------------------------------------------------------------------

-- Admin creates an invitation and receives the code ONCE. Only its hash is stored.
create or replace function public.create_teacher_invite(p_email text, p_institution text default null, p_valid_days int default 14)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_code text;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can invite teachers' using errcode = '42501';
  end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email address';
  end if;
  v_code := 'MAC-' || upper(encode(extensions.gen_random_bytes(12), 'hex'));
  insert into public.teacher_invitations (email, institution, code_hash, invited_by, expires_at)
  values (lower(trim(p_email)), p_institution, encode(extensions.digest(v_code, 'sha256'), 'hex'), auth.uid(),
          now() + make_interval(days => greatest(1, least(p_valid_days, 90))));
  return v_code;
end $$;

-- Lets the onboarding page tell a teacher their code is wrong before they create an account.
-- Returns only true/false; codes carry 96 bits of randomness so guessing is not practical.
create or replace function public.check_teacher_invite(p_email text, p_code text)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.teacher_invitations
    where code_hash = encode(extensions.digest(trim(p_code), 'sha256'), 'hex')
      and lower(email) = lower(trim(p_email))
      and not revoked and accepted_at is null and expires_at > now()
  )
$$;

-- An already-registered user (e.g. a student account) redeems an invitation sent to their email.
create or replace function public.redeem_teacher_invite(p_code text)
returns public.app_role language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_invite public.teacher_invitations;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select email into v_email from public.profiles where id = v_uid;

  select * into v_invite from public.teacher_invitations
  where code_hash = encode(extensions.digest(trim(p_code), 'sha256'), 'hex')
    and lower(email) = lower(v_email)
    and not revoked and accepted_at is null and expires_at > now()
  for update;
  if not found then
    raise exception 'Invalid or expired teacher invitation code for this account';
  end if;

  update public.profiles
  set role = case when role = 'admin' then role else 'teacher' end,
      institution = coalesce(v_invite.institution, institution)
  where id = v_uid;
  update public.teacher_invitations set accepted_at = now(), accepted_by = v_uid where id = v_invite.id;
  return (select role from public.profiles where id = v_uid);
end $$;

-- Admin-only: assign a role directly (e.g. promote an approved teacher or another admin).
create or replace function public.admin_set_role(p_user_id uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can assign roles' using errcode = '42501';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
end $$;
