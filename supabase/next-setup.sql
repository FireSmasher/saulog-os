-- Saulog OS next: extra tables for the new app (31 Oct 2026). Safe to run more than once.
-- Run: cat supabase/next-setup.sql | pbcopy, then Supabase > SQL Editor > New query >
-- Cmd+V > Run. It only ADDS things: no table, column or row of the old app is changed.
-- The "destructive operations" warning comes from the word "drop" in "drop policy if
-- exists": each dropped policy is re-created on the next line.

-- ---------- Phase 3: meal photo thumbnails (320 px; the full photo is never kept) ----------

create table if not exists public.food_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  time text not null,
  path text not null,
  log_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.food_photos enable row level security;
drop policy if exists "food_photos: owner all" on public.food_photos;
create policy "food_photos: owner all" on public.food_photos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private bucket; each user can only touch files under a folder named with their own id.
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;

drop policy if exists "meal-photos: owner read" on storage.objects;
create policy "meal-photos: owner read" on storage.objects
  for select using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "meal-photos: owner write" on storage.objects;
create policy "meal-photos: owner write" on storage.objects
  for insert with check (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "meal-photos: owner delete" on storage.objects;
create policy "meal-photos: owner delete" on storage.objects
  for delete using (bucket_id = 'meal-photos' and (storage.foldername(name))[1] = auth.uid()::text);
