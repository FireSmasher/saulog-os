-- Saulog OS (Apoy): smart reminders and the friend crew (11 Nov 2026). Safe to run more than once.
-- Run AFTER supabase/schema.sql and supabase/next-setup.sql (it adds policies to day_marks,
-- which next-setup.sql creates).
-- Run: cat supabase/social-setup.sql | pbcopy, then Supabase > SQL Editor > New query >
-- Cmd+V > Run. The "destructive operations" warning comes from "drop policy if exists" and
-- "drop trigger if exists": each dropped object is re-created on the next lines.
--
-- Security model (see docs/SOCIAL-PLAN.md, "friends see everything"):
-- - A user READS their own rows plus the rows of anyone who shares a crew with them.
-- - A user WRITES only their own rows. No existing owner policy is changed or dropped;
--   crew read access is a NEW, separate select policy (policies are OR-ed).
-- - Crew membership is only ever checked through SECURITY DEFINER helpers, so no policy on
--   crew_members ever queries crew_members under RLS (no recursion).
-- - Joining a crew only works through join_crew(code). There is no insert policy on
--   crews or crew_members.
-- - widget_tokens and notification_events are owner-only. The plain widget token is never
--   stored, only its sha256.

-- =====================================================================================
-- 1. Helpers
-- =====================================================================================

-- Crew tables come first because the helpers below read them.
create table if not exists public.crews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  invite_code text not null unique,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.crew_members (
  crew_id uuid not null references public.crews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);
create index if not exists crew_members_user_idx on public.crew_members (user_id);

-- True when the signed-in user and `other` are both in at least one crew.
-- SECURITY DEFINER: reads crew_members without RLS, which is what stops policy recursion.
create or replace function public.shares_crew(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.crew_members me
    join public.crew_members them on them.crew_id = me.crew_id
    where me.user_id = auth.uid()
      and them.user_id = other
  );
$$;

-- True when the signed-in user is a member of crew `cid`.
create or replace function public.is_crew_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.crew_members
    where crew_id = cid and user_id = auth.uid()
  );
$$;

-- True when the signed-in user is the owner of crew `cid`.
create or replace function public.is_crew_owner(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.crew_members
    where crew_id = cid and user_id = auth.uid() and role = 'owner'
  );
$$;

-- 12 characters from a 32-letter alphabet (no 0, O, 1, I): 60 random bits. Taken from the
-- random bytes of gen_random_uuid() (a strong random source), skipping the two bytes that
-- hold the uuid version and variant bits. 256 / 32 = 8, so "% 32" has no bias.
create or replace function public.new_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := uuid_send(gen_random_uuid());
  idx int[] := array[0, 1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 14];
  code text := '';
  i int;
begin
  foreach i in array idx loop
    code := code || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return code;
end;
$$;

alter table public.crews alter column invite_code set default public.new_invite_code();

-- =====================================================================================
-- 2. Tables
-- =====================================================================================

create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500),
  created_at timestamptz not null default now()
);

-- Per-person workout plans built in the app ("build their own").
create table if not exists public.custom_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  days jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists custom_plans_user_idx on public.custom_plans (user_id);

-- One row per person. Targets here are the ones each friend sets at sign-up. Edwin's
-- Nippard numbers still live in public.targets (written by scripts/push-targets.py).
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  timezone text not null default 'Europe/Berlin' check (char_length(timezone) between 1 and 64),
  savage_mode boolean not null default false,
  kcal_target numeric check (kcal_target is null or (kcal_target > 0 and kcal_target < 10000)),
  protein_target numeric check (protein_target is null or (protein_target > 0 and protein_target < 1000)),
  plan_choice text check (plan_choice is null or plan_choice in ('nippard', 'full_body_3', 'push_pull_legs', 'custom')),
  custom_plan_id uuid references public.custom_plans(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default (now() at time zone 'Europe/Berlin')::date,
  time text not null,
  kind text not null check (kind in ('walk', 'run', 'bike', 'row', 'stairs', 'other')),
  minutes numeric check (minutes is null or (minutes >= 0 and minutes <= 1440)),
  distance_km numeric check (distance_km is null or (distance_km >= 0 and distance_km <= 1000)),
  steps integer check (steps is null or (steps >= 0 and steps <= 200000)),
  source text not null default 'manual' check (source in ('manual', 'health')),
  created_at timestamptz not null default now()
);
create index if not exists activity_logs_user_date_idx on public.activity_logs (user_id, date);

-- One row per push sent. Written by the nudge Edge Function (service role). The owner can
-- read them and set opened_at (service worker reports an open); nothing else.
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sent_at timestamptz not null default now(),
  goal text not null,
  template_id text not null,
  savage boolean not null default false,
  opened_at timestamptz,
  logged_after boolean,
  created_at timestamptz not null default now()
);
create index if not exists notification_events_user_sent_idx on public.notification_events (user_id, sent_at desc);

-- push_subscriptions is already in next-setup.sql; nothing to add here.

-- One widget token per person. Only the sha256 hex of the token is stored. Made with
-- create_widget_token(); the widget Edge Function (service role) looks the hash up.
create table if not exists public.widget_tokens (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

-- target_owner is filled by a trigger from the target row, never by the client.
create table if not exists public.kudos (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target_table text not null check (target_table in ('food_logs', 'workout_logs', 'activity_logs', 'health_logs')),
  target_id uuid not null,
  target_owner uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (from_user, target_table, target_id)
);
create index if not exists kudos_target_idx on public.kudos (target_table, target_id);
create index if not exists kudos_owner_idx on public.kudos (target_owner, created_at desc);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  author uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target_table text not null check (target_table in ('food_logs', 'workout_logs', 'activity_logs', 'health_logs')),
  target_id uuid not null,
  target_owner uuid references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists comments_target_idx on public.comments (target_table, target_id, created_at);

-- "Nudge a friend": max once a day per pair (unique below).
create table if not exists public.friend_nudges (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  date date not null default (now() at time zone 'Europe/Berlin')::date,
  created_at timestamptz not null default now(),
  unique (from_user, to_user, date),
  check (from_user <> to_user)
);
create index if not exists friend_nudges_to_date_idx on public.friend_nudges (to_user, date);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews(id) on delete cascade,
  kind text not null check (kind in ('train_x', 'protein_x', 'move_minutes', 'log_meals')),
  goal_number integer not null check (goal_number > 0 and goal_number <= 100000),
  starts date not null,
  ends date not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (ends >= starts and ends - starts <= 62)
);
create index if not exists challenges_crew_idx on public.challenges (crew_id, ends);

create table if not exists public.challenge_members (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index if not exists challenge_members_user_idx on public.challenge_members (user_id);

-- XP spend ledger: one bought streak freeze per row. Crew-mates read it to compute XP.
create table if not exists public.freeze_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null default (now() at time zone 'Europe/Berlin')::date,
  xp_cost integer not null default 200 check (xp_cost > 0),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- Indexes on log tables made elsewhere (schema.sql has food, workout, health; day_marks has
-- unique (user_id, date) which is already an index). Repeated here harmlessly.
create index if not exists food_logs_user_date_idx on public.food_logs (user_id, date);
create index if not exists workout_logs_user_date_idx on public.workout_logs (user_id, date);
create index if not exists health_logs_user_date_idx on public.health_logs (user_id, date);

-- =====================================================================================
-- 3. Target owner for kudos and comments
-- =====================================================================================

-- Owner of a log row, as the CALLER sees it. SECURITY INVOKER on purpose: RLS on the log
-- tables applies, so it returns null for any row the caller cannot read (a stranger's).
create or replace function public.target_owner_of(tbl text, rid uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select case tbl
    when 'food_logs' then (select user_id from public.food_logs where id = rid)
    when 'workout_logs' then (select user_id from public.workout_logs where id = rid)
    when 'activity_logs' then (select user_id from public.activity_logs where id = rid)
    when 'health_logs' then (select user_id from public.health_logs where id = rid)
  end;
$$;

-- BEFORE INSERT: overwrite whatever the client sent with the real owner. Runs before the
-- RLS with-check, so the insert policies below can rely on target_owner.
create or replace function public.set_target_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.target_owner := public.target_owner_of(new.target_table, new.target_id);
  if new.target_owner is null then
    raise exception 'target row not found or not visible' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists kudos_set_target_owner on public.kudos;
create trigger kudos_set_target_owner before insert on public.kudos
  for each row execute function public.set_target_owner();
drop trigger if exists comments_set_target_owner on public.comments;
create trigger comments_set_target_owner before insert on public.comments
  for each row execute function public.set_target_owner();

-- =====================================================================================
-- 4. Functions the app calls (supabase.rpc)
-- =====================================================================================

-- Create a crew, make the caller its owner, return the invite code.
create or replace function public.create_crew(crew_name text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  cid uuid;
  code text;
  tries int := 0;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if crew_name is null or char_length(btrim(crew_name)) not between 1 and 40 then
    raise exception 'crew name must be 1 to 40 characters' using errcode = '22023';
  end if;
  loop
    tries := tries + 1;
    begin
      code := public.new_invite_code();
      insert into public.crews (name, invite_code, created_by)
      values (btrim(crew_name), code, me)
      returning id into cid;
      exit;
    exception when unique_violation then
      if tries >= 5 then raise; end if;
    end;
  end loop;
  insert into public.crew_members (crew_id, user_id, role) values (cid, me, 'owner');
  return code;
end;
$$;

-- Join a crew by invite code. Idempotent: a member calling it again gets the same id.
-- Max 10 members per crew. The crew row is locked so two joins cannot both take seat 10.
create or replace function public.join_crew(code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  cid uuid;
  members int;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select id into cid from public.crews
  where invite_code = upper(btrim(code))
  for update;
  if cid is null then
    raise exception 'no crew with that code' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.crew_members where crew_id = cid and user_id = me) then
    return cid;
  end if;
  select count(*) into members from public.crew_members where crew_id = cid;
  if members >= 10 then
    raise exception 'crew is full (10 members)' using errcode = '53400';
  end if;
  insert into public.crew_members (crew_id, user_id, role) values (cid, me, 'member');
  return cid;
end;
$$;

-- Make (or replace) the caller's widget token. Returns the plain token ONCE; only its
-- sha256 is stored. 64 hex characters from two random uuids (about 244 random bits).
create or replace function public.create_widget_token()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  token text;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.widget_tokens (user_id, token_hash, created_at)
  values (me, encode(sha256(convert_to(token, 'UTF8')), 'hex'), now())
  on conflict (user_id) do update
    set token_hash = excluded.token_hash, created_at = excluded.created_at;
  return token;
end;
$$;

revoke all on function public.shares_crew(uuid) from public, anon;
revoke all on function public.is_crew_member(uuid) from public, anon;
revoke all on function public.is_crew_owner(uuid) from public, anon;
revoke all on function public.new_invite_code() from public, anon;
revoke all on function public.target_owner_of(text, uuid) from public, anon;
revoke all on function public.create_crew(text) from public, anon;
revoke all on function public.join_crew(text) from public, anon;
revoke all on function public.create_widget_token() from public, anon;
grant execute on function public.shares_crew(uuid) to authenticated, service_role;
grant execute on function public.is_crew_member(uuid) to authenticated, service_role;
grant execute on function public.is_crew_owner(uuid) to authenticated, service_role;
grant execute on function public.new_invite_code() to authenticated, service_role;
grant execute on function public.target_owner_of(text, uuid) to authenticated, service_role;
grant execute on function public.create_crew(text) to authenticated;
grant execute on function public.join_crew(text) to authenticated;
grant execute on function public.create_widget_token() to authenticated;

-- =====================================================================================
-- 5. Row Level Security
-- =====================================================================================

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.custom_plans enable row level security;
alter table public.crews enable row level security;
alter table public.crew_members enable row level security;
alter table public.activity_logs enable row level security;
alter table public.notification_events enable row level security;
alter table public.widget_tokens enable row level security;
alter table public.kudos enable row level security;
alter table public.comments enable row level security;
alter table public.friend_nudges enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;
alter table public.freeze_purchases enable row level security;

-- ---- Existing tables: ADD a crew read policy. Owner policies stay exactly as they are. ----

drop policy if exists "food_logs: crew select" on public.food_logs;
create policy "food_logs: crew select" on public.food_logs
  for select to authenticated using (public.shares_crew(user_id));

drop policy if exists "workout_logs: crew select" on public.workout_logs;
create policy "workout_logs: crew select" on public.workout_logs
  for select to authenticated using (public.shares_crew(user_id));

drop policy if exists "health_logs: crew select" on public.health_logs;
create policy "health_logs: crew select" on public.health_logs
  for select to authenticated using (public.shares_crew(user_id));

drop policy if exists "day_marks: crew select" on public.day_marks;
create policy "day_marks: crew select" on public.day_marks
  for select to authenticated using (public.shares_crew(user_id));

-- ---- profiles: own plus crew read, own write ----
drop policy if exists "profiles: read own or crew" on public.profiles;
create policy "profiles: read own or crew" on public.profiles
  for select to authenticated using (auth.uid() = user_id or public.shares_crew(user_id));
drop policy if exists "profiles: owner insert" on public.profiles;
create policy "profiles: owner insert" on public.profiles
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "profiles: owner update" on public.profiles;
create policy "profiles: owner update" on public.profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "profiles: owner delete" on public.profiles;
create policy "profiles: owner delete" on public.profiles
  for delete to authenticated using (auth.uid() = user_id);

-- ---- user_settings: own plus crew read, own write ----
drop policy if exists "user_settings: read own or crew" on public.user_settings;
create policy "user_settings: read own or crew" on public.user_settings
  for select to authenticated using (auth.uid() = user_id or public.shares_crew(user_id));
drop policy if exists "user_settings: owner insert" on public.user_settings;
create policy "user_settings: owner insert" on public.user_settings
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "user_settings: owner update" on public.user_settings;
create policy "user_settings: owner update" on public.user_settings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "user_settings: owner delete" on public.user_settings;
create policy "user_settings: owner delete" on public.user_settings
  for delete to authenticated using (auth.uid() = user_id);

-- ---- custom_plans: own plus crew read, own write ----
drop policy if exists "custom_plans: read own or crew" on public.custom_plans;
create policy "custom_plans: read own or crew" on public.custom_plans
  for select to authenticated using (auth.uid() = user_id or public.shares_crew(user_id));
drop policy if exists "custom_plans: owner insert" on public.custom_plans;
create policy "custom_plans: owner insert" on public.custom_plans
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "custom_plans: owner update" on public.custom_plans;
create policy "custom_plans: owner update" on public.custom_plans
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "custom_plans: owner delete" on public.custom_plans;
create policy "custom_plans: owner delete" on public.custom_plans
  for delete to authenticated using (auth.uid() = user_id);

-- ---- crews: members read; owner renames or deletes; create only via create_crew() ----
drop policy if exists "crews: members select" on public.crews;
create policy "crews: members select" on public.crews
  for select to authenticated using (public.is_crew_member(id));
drop policy if exists "crews: owner update" on public.crews;
create policy "crews: owner update" on public.crews
  for update to authenticated using (public.is_crew_owner(id)) with check (public.is_crew_owner(id));
drop policy if exists "crews: owner delete" on public.crews;
create policy "crews: owner delete" on public.crews
  for delete to authenticated using (public.is_crew_owner(id));

-- ---- crew_members: members of the same crew read; leave yourself, owner removes others ----
-- Join only via join_crew(). Every check goes through a SECURITY DEFINER helper, so these
-- policies never read crew_members under RLS (no recursion).
drop policy if exists "crew_members: crew select" on public.crew_members;
create policy "crew_members: crew select" on public.crew_members
  for select to authenticated using (public.is_crew_member(crew_id));
drop policy if exists "crew_members: leave or owner removes" on public.crew_members;
create policy "crew_members: leave or owner removes" on public.crew_members
  for delete to authenticated using (auth.uid() = user_id or public.is_crew_owner(crew_id));

-- ---- activity_logs: own plus crew read, own write ----
drop policy if exists "activity_logs: read own or crew" on public.activity_logs;
create policy "activity_logs: read own or crew" on public.activity_logs
  for select to authenticated using (auth.uid() = user_id or public.shares_crew(user_id));
drop policy if exists "activity_logs: owner insert" on public.activity_logs;
create policy "activity_logs: owner insert" on public.activity_logs
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "activity_logs: owner update" on public.activity_logs;
create policy "activity_logs: owner update" on public.activity_logs
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "activity_logs: owner delete" on public.activity_logs;
create policy "activity_logs: owner delete" on public.activity_logs
  for delete to authenticated using (auth.uid() = user_id);

-- ---- notification_events: owner only. Owner may set opened_at (column grant below). ----
drop policy if exists "notification_events: owner select" on public.notification_events;
create policy "notification_events: owner select" on public.notification_events
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "notification_events: owner update" on public.notification_events;
create policy "notification_events: owner update" on public.notification_events
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---- widget_tokens: owner only. Made via create_widget_token(); owner can see and revoke. ----
drop policy if exists "widget_tokens: owner select" on public.widget_tokens;
create policy "widget_tokens: owner select" on public.widget_tokens
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "widget_tokens: owner delete" on public.widget_tokens;
create policy "widget_tokens: owner delete" on public.widget_tokens
  for delete to authenticated using (auth.uid() = user_id);

-- ---- kudos: read own, to me, or from a crew-mate; give only to a crew-mate's row ----
drop policy if exists "kudos: read own or crew" on public.kudos;
create policy "kudos: read own or crew" on public.kudos
  for select to authenticated using (
    auth.uid() = from_user or auth.uid() = target_owner or public.shares_crew(from_user)
  );
drop policy if exists "kudos: give to crew-mate" on public.kudos;
create policy "kudos: give to crew-mate" on public.kudos
  for insert to authenticated with check (
    auth.uid() = from_user
    and target_owner is not null
    and target_owner <> auth.uid()
    and public.shares_crew(target_owner)
  );
drop policy if exists "kudos: giver deletes" on public.kudos;
create policy "kudos: giver deletes" on public.kudos
  for delete to authenticated using (auth.uid() = from_user);

-- ---- comments: read own, on my rows, or by a crew-mate; write on own or crew-mate rows;
--      delete by the author OR the owner of the target row; edit body by the author ----
drop policy if exists "comments: read own or crew" on public.comments;
create policy "comments: read own or crew" on public.comments
  for select to authenticated using (
    auth.uid() = author or auth.uid() = target_owner or public.shares_crew(author)
  );
drop policy if exists "comments: write on own or crew-mate row" on public.comments;
create policy "comments: write on own or crew-mate row" on public.comments
  for insert to authenticated with check (
    auth.uid() = author
    and target_owner is not null
    and (target_owner = auth.uid() or public.shares_crew(target_owner))
  );
drop policy if exists "comments: author edits" on public.comments;
create policy "comments: author edits" on public.comments
  for update to authenticated using (auth.uid() = author) with check (auth.uid() = author);
drop policy if exists "comments: author or row owner deletes" on public.comments;
create policy "comments: author or row owner deletes" on public.comments
  for delete to authenticated using (auth.uid() = author or auth.uid() = target_owner);

-- ---- friend_nudges: sender and receiver read; send only to a crew-mate, once a day ----
drop policy if exists "friend_nudges: sender or receiver select" on public.friend_nudges;
create policy "friend_nudges: sender or receiver select" on public.friend_nudges
  for select to authenticated using (auth.uid() = from_user or auth.uid() = to_user);
drop policy if exists "friend_nudges: send to crew-mate" on public.friend_nudges;
create policy "friend_nudges: send to crew-mate" on public.friend_nudges
  for insert to authenticated with check (
    auth.uid() = from_user and to_user <> auth.uid() and public.shares_crew(to_user)
  );

-- ---- challenges: crew members read; a member creates for their crew; creator edits ----
drop policy if exists "challenges: crew select" on public.challenges;
create policy "challenges: crew select" on public.challenges
  for select to authenticated using (public.is_crew_member(crew_id));
drop policy if exists "challenges: member creates" on public.challenges;
create policy "challenges: member creates" on public.challenges
  for insert to authenticated with check (auth.uid() = created_by and public.is_crew_member(crew_id));
drop policy if exists "challenges: creator updates" on public.challenges;
create policy "challenges: creator updates" on public.challenges
  for update to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by and public.is_crew_member(crew_id));
drop policy if exists "challenges: creator deletes" on public.challenges;
create policy "challenges: creator deletes" on public.challenges
  for delete to authenticated using (auth.uid() = created_by);

-- ---- challenge_members: crew read; join or leave yourself ----
-- The subquery reads challenges under ITS RLS (crew members only); challenges' policies
-- never read challenge_members, so there is no loop.
drop policy if exists "challenge_members: crew select" on public.challenge_members;
create policy "challenge_members: crew select" on public.challenge_members
  for select to authenticated using (
    exists (select 1 from public.challenges c where c.id = challenge_id)
  );
drop policy if exists "challenge_members: join self" on public.challenge_members;
create policy "challenge_members: join self" on public.challenge_members
  for insert to authenticated with check (
    auth.uid() = user_id
    and exists (select 1 from public.challenges c where c.id = challenge_id)
  );
drop policy if exists "challenge_members: leave self" on public.challenge_members;
create policy "challenge_members: leave self" on public.challenge_members
  for delete to authenticated using (auth.uid() = user_id);

-- ---- freeze_purchases: own plus crew read (needed to compute XP), own insert only ----
drop policy if exists "freeze_purchases: read own or crew" on public.freeze_purchases;
create policy "freeze_purchases: read own or crew" on public.freeze_purchases
  for select to authenticated using (auth.uid() = user_id or public.shares_crew(user_id));
drop policy if exists "freeze_purchases: owner insert" on public.freeze_purchases;
create policy "freeze_purchases: owner insert" on public.freeze_purchases
  for insert to authenticated with check (auth.uid() = user_id);

-- =====================================================================================
-- 6. Grants (RLS still decides which rows; see the note at the end of schema.sql)
-- =====================================================================================

-- next-setup.sql has no grants for its three tables. If "Automatically expose new tables"
-- is off, the app gets 42501 on them (found by the local test, 11 Nov). Granted here;
-- their owner-only policies from next-setup.sql still decide the rows.
grant select, insert, update, delete on public.day_marks to authenticated, service_role;
grant select, insert, update, delete on public.food_photos to authenticated, service_role;
grant select, insert, update, delete on public.push_subscriptions to authenticated, service_role;

grant select, insert, update, delete on public.profiles to authenticated, service_role;
grant select, insert, update, delete on public.user_settings to authenticated, service_role;
grant select, insert, update, delete on public.custom_plans to authenticated, service_role;
grant select, update, delete on public.crews to authenticated;
grant select, insert, update, delete on public.crews to service_role;
grant select, delete on public.crew_members to authenticated;
grant select, insert, update, delete on public.crew_members to service_role;
grant select, insert, update, delete on public.activity_logs to authenticated, service_role;
grant select on public.notification_events to authenticated;
revoke update on public.notification_events from authenticated;
grant update (opened_at) on public.notification_events to authenticated;
grant select, insert, update, delete on public.notification_events to service_role;
grant select, delete on public.widget_tokens to authenticated;
grant select, insert, update, delete on public.widget_tokens to service_role;
grant select, insert, delete on public.kudos to authenticated;
grant select, insert, update, delete on public.kudos to service_role;
grant select, insert, delete on public.comments to authenticated;
revoke update on public.comments from authenticated;
grant update (body) on public.comments to authenticated;
grant select, insert, update, delete on public.comments to service_role;
grant select, insert on public.friend_nudges to authenticated;
grant select, insert, update, delete on public.friend_nudges to service_role;
grant select, insert, update, delete on public.challenges to authenticated, service_role;
grant select, insert, delete on public.challenge_members to authenticated;
grant select, insert, update, delete on public.challenge_members to service_role;
grant select, insert on public.freeze_purchases to authenticated;
grant select, insert, update, delete on public.freeze_purchases to service_role;

-- crews.name is the only column a crew owner may change (not the code, not created_by).
revoke update on public.crews from authenticated;
grant update (name) on public.crews to authenticated;
