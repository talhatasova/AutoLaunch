-- Storage for app logos and screenshots.
--
-- Both buckets are PUBLIC on read: apps.logo_url / apps.screenshot_url hold
-- public URLs, and those same URLs are handed to third-party directories during
-- submission, so they must resolve without a Supabase session.
--
-- Write access is private and folder-scoped. Object path convention:
--
--     {user_id}/{app_id}/{filename}
--
-- The first path segment is the owner's auth.uid(). Every write policy below
-- pins that segment, so a user can only ever write inside their own prefix.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'app-logos',
    'app-logos',
    true,
    2 * 1024 * 1024, -- 2 MB
    array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon']
  ),
  (
    'app-screenshots',
    'app-screenshots',
    true,
    8 * 1024 * 1024, -- 8 MB
    array['image/png', 'image/jpeg', 'image/webp']
  )
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Policies on storage.objects (RLS is already enabled on that table by Supabase)
-- ---------------------------------------------------------------------------

-- Read. The buckets are public so the CDN serves these anyway; the explicit
-- SELECT policy is what makes the Storage API list/download endpoints work.
create policy "app media is publicly readable"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id in ('app-logos', 'app-screenshots'));

create policy "users upload app media into their own folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id in ('app-logos', 'app-screenshots')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Upsert (replacing a logo) needs INSERT + SELECT + UPDATE. The SELECT policy
-- above covers the read half; without this UPDATE policy an overwrite fails
-- silently rather than erroring.
create policy "users replace their own app media"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id in ('app-logos', 'app-screenshots')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id in ('app-logos', 'app-screenshots')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "users delete their own app media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id in ('app-logos', 'app-screenshots')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
