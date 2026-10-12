-- Private bucket for course materials. Object names are "<course_id>/<random>-<file name>".
-- Files are opened through short-lived signed URLs, never public links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-materials', 'course-materials', false, 52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/markdown', 'text/vtt', 'application/x-subrip',
    'image/png', 'image/jpeg', 'image/webp',
    'video/mp4', 'video/webm', 'audio/mpeg'
  ]
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- First path segment as a course id, or null when it is not a uuid.
create or replace function public.storage_course_id(p_name text)
returns uuid language sql immutable as $$
  select case when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end
$$;

-- Readers: course staff, or enrolled students when the file belongs to a published resource.
create or replace function public.can_read_course_file(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.storage_course_id(p_name) is not null and (
    public.is_course_staff(public.storage_course_id(p_name))
    or exists (
      select 1 from public.resources r
      where r.storage_path = p_name and r.is_published and public.is_enrolled(r.course_id)
    )
  )
$$;

grant execute on function public.storage_course_id(text), public.can_read_course_file(text) to authenticated;

create policy "course-materials: read" on storage.objects for select to authenticated
  using (bucket_id = 'course-materials' and public.can_read_course_file(name));

create policy "course-materials: staff upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'course-materials' and public.storage_course_id(name) is not null
              and public.is_course_staff(public.storage_course_id(name)));

create policy "course-materials: staff update" on storage.objects for update to authenticated
  using (bucket_id = 'course-materials' and public.is_course_staff(public.storage_course_id(name)))
  with check (bucket_id = 'course-materials' and public.storage_course_id(name) is not null
              and public.is_course_staff(public.storage_course_id(name)));

create policy "course-materials: staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'course-materials' and public.is_course_staff(public.storage_course_id(name)));
