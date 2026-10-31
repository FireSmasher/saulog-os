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

-- ---------- Phase 4: rest or sick days that keep the streak ----------

create table if not exists public.day_marks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  kind text not null default 'rest',
  created_at timestamptz not null default now(),
  unique (user_id, date)
);
alter table public.day_marks enable row level security;
drop policy if exists "day_marks: owner all" on public.day_marks;
create policy "day_marks: owner all" on public.day_marks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Phase 6: daily reminder subscriptions ----------
-- One row per phone. The app writes its own row; push-daily (service role) reads all.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  remind_at text not null default '20:00',
  tz text not null default 'Europe/Berlin',
  last_sent_on date,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push_subscriptions: owner all" on public.push_subscriptions;
create policy "push_subscriptions: owner all" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
