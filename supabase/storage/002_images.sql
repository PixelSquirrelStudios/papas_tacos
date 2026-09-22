begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists images_public_read on storage.objects;
create policy images_public_read on storage.objects for select to anon, authenticated
using (bucket_id = 'images');

drop policy if exists images_admin_insert on storage.objects;
create policy images_admin_insert on storage.objects for insert to authenticated
with check (bucket_id = 'images' and name ~ '^(menu|events|testimonials)/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|avif)$' and (select private.is_admin()));

drop policy if exists images_admin_update on storage.objects;
create policy images_admin_update on storage.objects for update to authenticated
using (bucket_id = 'images' and (select private.is_admin()))
with check (bucket_id = 'images' and name ~ '^(menu|events|testimonials)/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|avif)$' and (select private.is_admin()));

drop policy if exists images_admin_delete on storage.objects;
create policy images_admin_delete on storage.objects for delete to authenticated
using (bucket_id = 'images' and (select private.is_admin()));

commit;