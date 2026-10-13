-- RealLife Live — storage buckets and policies (requires Supabase's `storage` schema).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('thumbnails', 'thumbnails', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('recordings', 'recordings', false, null, null)
on conflict (id) do nothing;

-- Users may write only inside their own folder: <bucket>/<user id>/<file>.
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy thumbnails_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);
create policy thumbnails_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'thumbnails' and (storage.foldername(name))[1] = auth.uid()::text);

-- Recordings bucket is private: a host may read/delete their own files; everyone else gets
-- short-lived signed URLs minted by an Edge Function after an authorization check (Milestone 5).
create policy recordings_read_own on storage.objects for select to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
create policy recordings_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
