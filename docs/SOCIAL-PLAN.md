# Saulog OS: smart reminders, friends, levels, streak widget

Architect: Sevro (Opus), 11 Nov 2026. Workers build from this file only. Read it whole.
Rulings by Edwin (11 Nov, do not re-ask): Scriptable widget (no paid Apple account);
friends see EVERYTHING; under 10 friends, all iPhone; activity from Strava plus a manual
tap-to-log for any kind (walk, run, bike, row, stairs, other).

## Rulings, question rounds 11 Nov (Edwin's answers, binding)

Models: HYBRID. Opus for W2, W3, W7 (and W5). Sonnet for W4 and W6.
Activity: tap-to-log plus Apple Health Shortcut (steps 12:00, 18:00, 21:30). No Strava.
Reminders:
- Kinds: meals, workout, walk, streak saver.
- Volume: match Duolingo (research doc), no hard low cap; Edwin has high tolerance. Never two
  within 60 min, never the same kind twice before the person acts.
- NO quiet hours. Be smart with timing. iOS Focus/Sleep already delivers silently, so send anyway.
- Workout days learned from history (weekdays usually trained); under 3 weeks of data:
  remind when 2 days without a workout.
- Tone: mix, the bandit picks. Very witty, direct, persistent, true. "Savage mode" per person
  (on for Edwin, friends choose at sign-up): swearing allowed, Goggins or Ramsay energy.
  Hard rule from Edwin: "it must be constructive criticism though, no bullying at all.
  bullying is not tolerated". So: roast the excuse, never the person; no body, weight or
  food shaming; no slurs; never quote or name a real person. Every message ends pointing
  at one concrete action. Clean versions exist for every savage message.
Friends:
- Invite link only (crew code). Friends see everything.
- Kudos (push to owner), nudge a friend (max once a day per pair), comments (writer or
  post owner can delete), friend challenges: train X times, hit protein X days,
  move X minutes, log every meal (5 days, like Friends Quests).
- Pushes about friends: big moments only (finished workout, streak milestone, passed you on
  the table), max one per friend per day.
- Each friend sets own calorie and protein targets at sign-up (weight, height, goal).
- Workout plans: pick a starter (Edwin's Nippard block, 3-day full body, push pull legs)
  or build their own; Log by hand always works.
Levels:
- Weekly crew table resets Monday 00:00 Berlin. Winner: crown for the next week, +100 XP,
  hall of fame.
- Streak freezes: earned (1 per 7 days in a row, hold max 2) AND buyable for 200 XP.
- Move XP: higher of minutes (1 per 2 min) or steps (1 per 500), max 30 a day.
Widget: Scriptable, streak only: flame, day count, done today or not, looks worse toward
midnight when not done.
Name: "Apoy". FULL rename including the URL (repo becomes apoy). New icon at the same time (Edwin 11 Nov: "Apoy flame", "With the Apoy rename"): an 8-bit pixel-art fire with food and muscle in it (Edwin 11 Nov: "make it fire 8bit pixelated with food and muscle"); draft shown to him before it ships; replaces the pink S icon (next/public/icons, apple-touch-icon). One remove and re-add covers icon plus URL. Do it LAST: first the old
app's "Send N unsent logs" and Quarters checked, then rename, then Edwin reinstalls from
the new URL. The local folder name never changes.
Order: Edwin first (reminders, Move, Health, widget), then friends (sign-up, crew, feed,
kudos, comments, challenges), then the rename.

## Facts found while planning (11 Nov)

- The 31 Oct server paste (`supabase/next-setup.sql`, two Edge Functions, cron) was never run:
  `push_subscriptions`, `day_marks`, `food_photos` return 404. No reminder has ever been sent.
- Strava API is subscriber-only (docs/strava-setup.md, dead end since 9 Sep). Activity source
  instead: manual log now, Apple Health Shortcut later (`health_logs` exists, 0 rows,
  docs/apple-health-shortcut.md). Strava only if Edwin subscribes.
- Supabase: food_logs last row 2026-10-04 (55 rows), workout_logs 59 rows. Habit times must
  fall back to sensible defaults when there is little data.
- Sign-in is email + password only. There is no sign-up screen. Friends need one.
- The repo is PUBLIC. Never commit a key, token, friend email or name.

## Design rules (from Duolingo, to be confirmed by W1 with sources)

1. One reminder per goal per day, at the time he usually does it (learned per user, per goal).
2. Messages rotate from a pool; a message used recently is less likely (novelty); pick by
   which messages led to a log within 2 h (simple bandit). Log every send.
3. A late "streak at risk" nudge (about 3 h before midnight) only when nothing is logged today.
4. Back off when ignored (W1, reported pattern): daily reminders for up to 7 days without a
   log; day 8 one "these don't seem to be working, pausing" message, then silence; one last
   check-in around day 18; nothing after that until the next log restarts it.
   W1 numbers for rule 2 (KDD 2020, confirmed): reward = a log within 2 h of the push;
   recency penalty 0.017 x 0.5^(days since that message was sent / 15); pick by softmax.
   With under 10 people, shrink each message's score hard toward the pool average (prior of
   about 20 sends) so one lucky send does not decide. First reminder time with no history:
   23.5 h after the last log (reported), else the defaults in W3.
   Widget (confirmed): only streak and done or not done today; the flame looks worse toward
   midnight when not done. Streak needs one log only (confirmed).
   Full research: docs/research/2026-11-11-duolingo.md.
5. Hard caps: max 3 pushes a day per person, none 22:30 to 07:30 local, never two within 90 min.
6. Friends: "Ana just finished Upper" goes out at most once a day per friend, and never in
   quiet hours.

## Levels and streaks (for a group under 10)

- Keep the existing per-person rules in `next/src/lib/rewards.ts` (streak, freezes, XP,
  level L costs 125 x L). Everything is recomputed from rows, nothing stored.
- Daily XP caps so friends cannot farm: meals max 4 counted a day, workout day once,
  activity 1 XP per 2 min, max 30 a day.
- Weekly crew table (Mon to Sun, Berlin time): XP this week, rank, last week's winner gets a
  crown on their avatar for the next week. No promotion tiers (too few people).
- Friend streak: two friends who both log on the same day keep a shared streak.
- Crew streak: days on which every member logged.
- Since friends see everything, the client computes everyone's XP from their rows.

## Work packages

Each worker: own git worktree (Agent isolation "worktree"), touches ONLY its files, runs
`cd next && npm test && npm run build` before finishing, does NOT push, does NOT run SQL
against the live project, does NOT touch secrets. Report: files changed, tests, what is unchecked.

| ID | What | Files (only these) | Depends on |
|---|---|---|---|
| W1 | Research Duolingo: reminder timing, message rotation (Yancey and Settles, KDD 2020 bandit paper), streak saver, backoff, leagues, friend streaks, widget states. Sources with links. No code. | `docs/research/2026-11-11-duolingo.md` | none |
| W2 | Schema and security: `profiles` (display name, tz), `crews` (name, invite_code), `crew_members`, `activity_logs` (date, time, kind, minutes, distance_km, source), `notification_events` (sent_at, goal, template, opened_at, logged_after), `widget_tokens` (hashed token). Row Level Security: a user reads their own rows plus rows of anyone sharing a crew, for food_logs, workout_logs, activity_logs, profiles, day_marks; writes only their own. `join_crew(code)` as security definer function. Idempotent SQL. | `supabase/social-setup.sql`, `next/src/lib/types-social.ts` | none |
| W3 | Pure reminder engine: habit time per goal (median of last 42 days, defaults 08:00, 13:00, 19:30 meals, 18:00 workout, 12:30 walk), candidate list, caps, quiet hours, backoff, template pick with novelty and success rate. Message pool (plain words, no guilt, no emoji walls). Unit tests with a fixed clock, Berlin time zone, the 29 Mar and 25 Oct clock changes. | `next/src/lib/nudge.ts`, `next/src/lib/nudge.test.ts`, `next/src/lib/nudge-messages.ts` | W1 (message tone), W2 types |
| W4 | Activity: "Move" card on Kain with kind chips (Walk, Run, Bike, Row, Stairs, Other), minutes number pad, optional km; list today; delete. Counts toward streak and XP (cap above). | `next/src/lib/activity.ts`, `next/src/components/Move.tsx`, `next/src/styles/move.css`, one import line in `Kain.tsx` | W2 |
| W5 | Friends: sign-up screen (email, password, display name), Crew screen (invite link with code, join), friends feed (each friend's today: meals, workout, activity), weekly crew table, friend and crew streaks. | `next/src/components/Crew.tsx`, `next/src/lib/crew.ts`, `next/src/lib/crew.test.ts`, `next/src/styles/crew.css`, tab entry in `TabBar.tsx` and `App.tsx` | W2, W4 |
| W6 | Widget: Edge Function `widget` (GET with token, returns streak, today done or not, XP, level, crew top 3), plus `scriptable/streak-widget.js` (small and medium sizes, colours from the app, flame state: done today, at risk after 18:00, frozen). Token made in Settings, shown once. | `supabase/functions/widget/index.ts`, `supabase/functions/_shared/rewards.ts` (copy of rewards.ts), `scriptable/streak-widget.js`, `next/src/components/WidgetToken.tsx` | W2 |
| W7 | Server reminder sender: replace push-daily with `nudge` (every 15 min, uses W3 logic copied to `_shared`, writes notification_events), service worker reports opens. | `supabase/functions/nudge/index.ts`, `supabase/functions/_shared/nudge.ts`, `next/sw/*`, `supabase/nudge-cron.sql` | W2, W3 |

W2 scope grows with the rulings: also `user_settings` (savage_mode, kcal and protein
targets, plan choice, timezone), `kudos`, `comments`, `friend_nudges`, `challenges` and
`challenge_members`, `freeze_purchases` (XP spend ledger), `custom_plans`. The schema
covers both phases now so no second migration is needed; the friend UI comes later.

Order: wave 1 = W1 (done), W2. Wave 2 = W3, W4, W6 plus the Health Shortcut steps.
Wave 3 = W7 (Edwin-only reminders live). Wave 4 = W5 and the social pieces. Wave 5 = rename.
Sevro reviews and merges every worktree, runs the full checks, screenshots on `?demo`,
commits and pushes (standing order), and keeps HANDOFF.md current.

## Edwin's part (only he can do these)

1. Run the paste: `supabase/next-setup.sql`, then `supabase/social-setup.sql` (after W2).
2. Deploy Edge Functions `nudge` and `widget` and paste the secrets (VAPID, CRON_SECRET).
3. Install Scriptable, paste the widget script, add the widget.
4. Send the invite link to friends.

## Mascots (rulings 12 Nov)

Accepted as rendered (design/mascots/blender/*). One per tab: tarsier on the streak card and
the app icon, carabao on Kain, eagle on Buhat. Mood follows the day: happy after a log, tired
late with nothing logged, fire on streak milestones. Built in AFTER W5, together with the
Apoy rename and icon (one rebuild).
