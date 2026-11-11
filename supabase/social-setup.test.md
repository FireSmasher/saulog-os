# social-setup.sql: security test (about 2 minutes)

Proves that a stranger cannot read your rows and a crew-mate can. It uses three fake
users: A stands in for you, B is a crew-mate, C is a stranger. Your real rows are not
touched. The last step deletes the fake users and everything they made.

Run it only after `next-setup.sql` and `social-setup.sql` have both run.

## Steps

1. Supabase > SQL Editor > New query.
2. Paste the whole block below. Click Run.
3. Good result: one row that says `ALL PASS`.
4. Bad result: a red error that starts with `FAIL:`. It names what leaked. Then run the
   cleanup block at the bottom, and send the error text to Sevro.

If step 2 fails on the very first insert into `auth.users`, make three users by hand
instead: Authentication > Users > Add user (any test addresses), then replace the three
fake ids in the block with theirs.

```sql
reset role;
insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000000c3')
on conflict (id) do nothing;

-- 1. A logs things
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', false);
insert into public.profiles (display_name) values ('Test A');
insert into public.food_logs (id, date, time, name, grams, kcal, protein, carb, fat)
  values ('00000000-0000-4000-8000-00000000f001', '2026-11-11', '08:00', 'test oats', 80, 300, 10, 50, 5);
insert into public.workout_logs (id, date, time, split, exercise, sets)
  values ('00000000-0000-4000-8000-00000000e001', '2026-11-11', '18:00', 'Upper', 'test press', '[]');
insert into public.activity_logs (id, date, time, kind, minutes)
  values ('00000000-0000-4000-8000-00000000a001', '2026-11-11', '12:30', 'walk', 30);
insert into public.health_logs (date, steps) values ('2026-11-11', 9000);
insert into public.day_marks (date, kind) values ('2026-11-10', 'rest');
insert into public.user_settings (kcal_target, protein_target, savage_mode) values (2000, 160, true);
select length(public.create_widget_token()) as widget_token_length;

-- 2. C (stranger) sees nothing of A and cannot touch A
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c3', false);
do $$
declare n int;
begin
  select (select count(*) from public.food_logs) + (select count(*) from public.workout_logs)
       + (select count(*) from public.activity_logs) + (select count(*) from public.health_logs)
       + (select count(*) from public.day_marks) + (select count(*) from public.profiles)
       + (select count(*) from public.user_settings) + (select count(*) from public.widget_tokens)
    into n;
  if n <> 0 then raise exception 'FAIL: stranger can read % of A''s rows', n; end if;
  begin
    insert into public.kudos (target_table, target_id) values ('workout_logs', '00000000-0000-4000-8000-00000000e001');
    raise exception 'FAIL: stranger gave kudos';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.comments (target_table, target_id, body) values ('food_logs', '00000000-0000-4000-8000-00000000f001', 'hi');
    raise exception 'FAIL: stranger commented';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.friend_nudges (to_user) values ('00000000-0000-4000-8000-0000000000a1');
    raise exception 'FAIL: stranger nudged';
  exception when insufficient_privilege then null; end;
  begin
    perform public.join_crew('WRONGCODE123');
    raise exception 'FAIL: wrong invite code worked';
  exception when no_data_found then null; end;
  update public.food_logs set kcal = 1 where id = '00000000-0000-4000-8000-00000000f001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: stranger edited A''s food row'; end if;
end $$;

-- 3. A makes a crew, B joins with the code (twice: same crew)
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', false);
select set_config('test.code', public.create_crew('Test crew'), false);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', false);
do $$
declare first_id uuid; second_id uuid;
begin
  first_id := public.join_crew(current_setting('test.code'));
  second_id := public.join_crew(lower(current_setting('test.code')));
  if first_id is distinct from second_id then raise exception 'FAIL: join_crew not idempotent'; end if;
end $$;
insert into public.profiles (display_name) values ('Test B');

-- 4. B (crew-mate) reads A, cannot write A, can cheer A
do $$
declare n int;
begin
  if (select count(*) from public.food_logs where user_id = '00000000-0000-4000-8000-0000000000a1') <> 1 then raise exception 'FAIL: crew-mate cannot read food_logs'; end if;
  if (select count(*) from public.workout_logs where user_id = '00000000-0000-4000-8000-0000000000a1') <> 1 then raise exception 'FAIL: crew-mate cannot read workout_logs'; end if;
  if (select count(*) from public.activity_logs where user_id = '00000000-0000-4000-8000-0000000000a1') <> 1 then raise exception 'FAIL: crew-mate cannot read activity_logs'; end if;
  if (select count(*) from public.health_logs where user_id = '00000000-0000-4000-8000-0000000000a1') <> 1 then raise exception 'FAIL: crew-mate cannot read health_logs'; end if;
  if (select count(*) from public.day_marks where user_id = '00000000-0000-4000-8000-0000000000a1') <> 1 then raise exception 'FAIL: crew-mate cannot read day_marks'; end if;
  if (select count(*) from public.profiles) <> 2 then raise exception 'FAIL: crew-mate cannot read profiles'; end if;
  if (select count(*) from public.user_settings) <> 1 then raise exception 'FAIL: crew-mate cannot read user_settings'; end if;
  if (select count(*) from public.crew_members) <> 2 then raise exception 'FAIL: crew-mate cannot read crew_members'; end if;
  if (select count(*) from public.widget_tokens) <> 0 then raise exception 'FAIL: crew-mate can read widget_tokens'; end if;
  begin
    insert into public.food_logs (user_id, date, time, name, grams, kcal, protein, carb, fat)
      values ('00000000-0000-4000-8000-0000000000a1', '2026-11-11', '09:00', 'fake', 1, 1, 1, 1, 1);
    raise exception 'FAIL: crew-mate wrote a food row as A';
  exception when insufficient_privilege then null; end;
  update public.workout_logs set notes = 'x' where user_id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: crew-mate edited A''s workout'; end if;
  delete from public.food_logs where user_id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: crew-mate deleted A''s food'; end if;
  insert into public.kudos (target_table, target_id) values ('workout_logs', '00000000-0000-4000-8000-00000000e001');
  insert into public.comments (target_table, target_id, body) values ('workout_logs', '00000000-0000-4000-8000-00000000e001', 'strong session');
  insert into public.friend_nudges (to_user) values ('00000000-0000-4000-8000-0000000000a1');
  begin
    insert into public.friend_nudges (to_user) values ('00000000-0000-4000-8000-0000000000a1');
    raise exception 'FAIL: two nudges on one day';
  exception when unique_violation then null; end;
end $$;

-- 5. Stranger still sees none of it
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c3', false);
do $$
begin
  if (select count(*) from public.crews) + (select count(*) from public.crew_members)
     + (select count(*) from public.kudos) + (select count(*) from public.comments)
     + (select count(*) from public.food_logs) + (select count(*) from public.profiles) <> 0
  then raise exception 'FAIL: stranger sees crew data'; end if;
end $$;

-- 6. A (row owner) deletes B's comment on A's workout
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', false);
do $$
declare n int;
begin
  if (select count(*) from public.kudos where target_owner = '00000000-0000-4000-8000-0000000000a1') <> 1 then raise exception 'FAIL: A cannot see kudos'; end if;
  delete from public.comments where target_id = '00000000-0000-4000-8000-00000000e001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: row owner cannot delete a comment'; end if;
end $$;

-- 7. Cleanup: removes only the three fake users and what they made
reset role;
select set_config('request.jwt.claim.sub', '', false);
delete from public.crews where created_by = '00000000-0000-4000-8000-0000000000a1';
delete from auth.users where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000c3');
select 'ALL PASS' as result;
```

## Cleanup only (if a step failed halfway)

```sql
reset role;
delete from public.crews where created_by = '00000000-0000-4000-8000-0000000000a1';
delete from auth.users where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000c3');
```

The fake ids are all zeros on purpose, so they can never match a real account.
