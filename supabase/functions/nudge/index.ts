// Supabase Edge Function: nudge (Apoy smart reminders, W7). Replaces push-daily.
// pg_cron calls it every 15 minutes (supabase/nudge-setup.sql) with the x-cron-secret header.
// For each person with a push subscription it reads ONLY that person's rows (and, for crew
// news, each crew-mate's rows one person at a time), asks the pure engine (_shared/nudge.ts)
// for the one push to send now, sends it to that person's phones and logs it in
// notification_events. One person failing never stops the run.
//
// Deploy with the CLI (it bundles the imports, including the pure files in next/src/lib):
//   supabase functions deploy nudge --no-verify-jwt
// "Enforce JWT verification" must be OFF: the cron job proves itself with CRON_SECRET.
// Secrets (Edge Functions > Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET.
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY come from Supabase itself.
// No key, id or name is written in this file.
import webpush from 'npm:web-push@3.6.7'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import {
  DEFAULT_TZ,
  HABIT_WINDOW_DAYS,
  SUCCESS_WINDOW_MIN,
  nextPush,
  rewardFor,
  toLogRows,
  weekday,
  zoned,
  type FriendEvent,
  type Goal,
  type LogRow,
  type NudgeState,
  type SendRecord,
  type SentPush,
} from '../_shared/nudge.ts'
import { POOL } from '../_shared/nudge-messages.ts'
import { MILESTONES, dayXp, moveXp, rewards, summarise } from '../../../next/src/lib/rewards.ts'
import { addDays } from '../../../next/src/lib/day.ts'
import type { WorkoutRow } from '../../../next/src/lib/buhat.ts'

// Same subject the old push-daily used (the app's own public address).
const SUBJECT = 'https://firesmasher.github.io/saulog-os/next/'

// ---------- Limits (runaway guards on top of the engine's own rules) ----------
const MAX_USERS = 50 // people per run
const MAX_SUBS_PER_USER = 5 // phones per person
const MAX_MATES = 20 // crew-mates read per person
const MAX_PER_DAY = 8 // the engine has no hard daily cap (ruling); this only stops a bug
const RACE_GAP_MIN = 55 // re-checked right before sending, in case two runs overlap
const STREAK_LOOKBACK_DAYS = 400 // dates only, so long streaks and milestones are right
const EVENTS_DAYS = 30
const FINISHED_AFTER_MIN = 30 // a crew-mate's workout counts as finished 30 min after the last set
const PAGE = 1000
const MAX_ROWS = 10_000 // per table per person
const PUSH_TTL_S = 2 * 3600
const MIN_MS = 60_000

// ---------- Rows ----------

type Err = { message: string } | null
type Res<T> = { data: T[] | null; error: Err }
type Db = SupabaseClient

type FoodRow = { date: string; time: string; protein: number; kcal: number; created_at: string }
type WorkRow = { date: string; time: string; split: string; created_at: string }
type ActRow = { date: string; time: string; minutes: number | null; steps: number | null; created_at: string }
type Person = { food: FoodRow[]; workouts: WorkRow[]; activity: ActRow[]; rest: Map<string, string>; health: Map<string, number> }
type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }
type EventRow = { id: string; sent_at: string; goal: string; template_id: string; friend_id: string | null; logged_after: boolean | null }
type Settings = { timezone: string | null; savage_mode: boolean | null; kcal_target: number | null; protein_target: number | null }

const short = (id: string) => id.slice(0, 8)
const iso = (ms: number) => new Date(ms).toISOString()
const hm = (t: string) => String(t ?? '').slice(0, 5)
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

function validTz(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TZ
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz })
    return tz
  } catch {
    return DEFAULT_TZ
  }
}

// Pages through a query so a long history is never cut at the 1000 row API limit.
async function paged<T>(make: (from: number, to: number) => PromiseLike<Res<T>>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await make(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return out
}

// A table that may not exist yet on the live project (day_marks, health_logs): empty, logged.
async function optional<T>(name: string, run: () => Promise<T[]>): Promise<T[]> {
  try {
    return await run()
  } catch (e) {
    console.warn(`nudge: ${name} unreadable, treated as empty: ${msg(e)}`)
    return []
  }
}

// Every query here filters on this one person's user_id (the service role skips RLS).
async function loadPerson(db: Db, uid: string, since: string): Promise<Person> {
  const food = await paged<FoodRow>((a, b) =>
    db.from('food_logs').select('date,time,protein,kcal,created_at').eq('user_id', uid).gte('date', since).order('created_at').order('id').range(a, b) as unknown as PromiseLike<Res<FoodRow>>,
  )
  const workouts = await paged<WorkRow>((a, b) =>
    db.from('workout_logs').select('date,time,split,created_at').eq('user_id', uid).gte('date', since).order('created_at').order('id').range(a, b) as unknown as PromiseLike<Res<WorkRow>>,
  )
  const activity = await paged<ActRow>((a, b) =>
    db.from('activity_logs').select('date,time,minutes,steps,created_at').eq('user_id', uid).gte('date', since).order('created_at').order('id').range(a, b) as unknown as PromiseLike<Res<ActRow>>,
  )
  const marks = await optional('day_marks', () =>
    paged<{ date: string; created_at: string }>((a, b) =>
      db.from('day_marks').select('date,created_at').eq('user_id', uid).gte('date', since).order('date').range(a, b) as unknown as PromiseLike<Res<{ date: string; created_at: string }>>,
    ),
  )
  const health = await optional('health_logs', () =>
    paged<{ date: string; steps: number | null }>((a, b) =>
      db.from('health_logs').select('date,steps').eq('user_id', uid).gte('date', since).order('date').range(a, b) as unknown as PromiseLike<Res<{ date: string; steps: number | null }>>,
    ),
  )
  return {
    food: food.map((r) => ({ ...r, time: hm(r.time), protein: Number(r.protein) || 0, kcal: Number(r.kcal) || 0 })),
    workouts: workouts.map((r) => ({ ...r, time: hm(r.time) })),
    activity: activity.map((r) => ({ ...r, time: hm(r.time) })),
    rest: new Map(marks.map((m) => [m.date, m.created_at])),
    health: new Map(health.filter((h) => h.steps != null).map((h) => [h.date, Number(h.steps)])),
  }
}

function moveMap(rows: ActRow[]): Map<string, { minutes: number; steps: number }> {
  const m = new Map<string, { minutes: number; steps: number }>()
  for (const r of rows) {
    const d = m.get(r.date) ?? { minutes: 0, steps: 0 }
    d.minutes += Number(r.minutes) || 0
    d.steps += Number(r.steps) || 0
    m.set(r.date, d)
  }
  return m
}

// Same streak the app shows: next/src/lib/rewards.ts on the same kinds of rows.
function streakFor(p: Person, today: string, proteinTarget: number) {
  return rewards({
    days: summarise(p.food),
    workoutDays: new Set(p.workouts.map((r) => r.date)),
    restDays: new Set(p.rest.keys()),
    activity: moveMap(p.activity),
    steps: p.health,
    today,
    proteinTarget,
  })
}

// Weekly crew table XP (Monday to today, Berlin), as rewards() counts a day. `before` drops
// rows saved at or after that instant, to see the table as it was before a log.
function weekXp(p: Person, from: string, to: string, proteinTarget: number, before = Infinity): number {
  const keep = (r: { date: string; created_at: string }) => r.date >= from && r.date <= to && Date.parse(r.created_at) < before
  const days = new Map(summarise(p.food.filter(keep)).map((d) => [d.date, d]))
  const work = new Set(p.workouts.filter(keep).map((r) => r.date))
  const move = moveMap(p.activity.filter(keep))
  let xp = 0
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const rested = p.rest.has(d) && Date.parse(p.rest.get(d) ?? '') < before
    if (!days.has(d) && !work.has(d) && !move.has(d) && !rested) continue
    const m = move.get(d)
    xp += dayXp(days.get(d), proteinTarget, work.has(d)) + moveXp({ minutes: m?.minutes ?? 0, steps: Math.max(m?.steps ?? 0, p.health.get(d) ?? 0) })
  }
  return xp
}

// ---------- Crew big moments ----------

async function crewEvents(db: Db, uid: string, me: Person, myProtein: number, now: Date): Promise<FriendEvent[]> {
  const nowMs = now.getTime()
  const mine = await db.from('crew_members').select('crew_id').eq('user_id', uid)
  if (mine.error) throw new Error(mine.error.message)
  const crewIds = [...new Set(((mine.data ?? []) as { crew_id: string }[]).map((r) => r.crew_id))]
  if (!crewIds.length) return []
  // Only the crews this person is in; each mate's rows are then read one mate at a time.
  const mates = await db.from('crew_members').select('user_id').in('crew_id', crewIds).neq('user_id', uid).limit(MAX_MATES * 4)
  if (mates.error) throw new Error(mates.error.message)
  const mateIds = [...new Set(((mates.data ?? []) as { user_id: string }[]).map((r) => r.user_id))].slice(0, MAX_MATES)

  const tableToday = zoned(now, DEFAULT_TZ).date // the table runs Monday 00:00 Berlin
  const weekStart = addDays(tableToday, -weekday(tableToday))
  const myWeek = weekXp(me, weekStart, tableToday, myProtein)
  const out: FriendEvent[] = []

  for (const mate of mateIds) {
    try {
      const prof = await db.from('profiles').select('display_name').eq('user_id', mate).maybeSingle()
      if (prof.error) throw new Error(prof.error.message)
      const name = String((prof.data as { display_name?: string } | null)?.display_name ?? '').trim()
      if (!name) continue // no name, no friend push
      const set = await db.from('user_settings').select('timezone,protein_target').eq('user_id', mate).maybeSingle()
      if (set.error) throw new Error(set.error.message)
      const s = (set.data ?? {}) as Partial<Settings>
      const mateToday = zoned(now, validTz(s.timezone)).date
      const protein = Number(s.protein_target) || 0
      const p = await loadPerson(db, mate, addDays(mateToday, -STREAK_LOOKBACK_DAYS))

      // Finished a workout today: no new set for 30 minutes.
      const todays = p.workouts.filter((r) => r.date === mateToday).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      const lastSet = todays.at(-1)
      if (lastSet && nowMs - Date.parse(lastSet.created_at) >= FINISHED_AFTER_MIN * MIN_MS) {
        out.push({ friend_id: mate, friend: name, kind: 'workout_done', at: lastSet.created_at, session: lastSet.split })
      }

      // Streak milestone reached today: news from the first log that made today count.
      const st = streakFor(p, mateToday, protein)
      if (st.todayCounts && (MILESTONES.includes(st.streak) || st.streak % 100 === 0)) {
        const firsts = [
          ...p.food.filter((r) => r.date === mateToday).map((r) => r.created_at),
          ...todays.map((r) => r.created_at),
          ...p.activity.filter((r) => r.date === mateToday).map((r) => r.created_at),
          ...(p.rest.has(mateToday) ? [p.rest.get(mateToday) ?? ''] : []),
        ]
          .map((t) => Date.parse(t))
          .filter((t) => Number.isFinite(t))
          .sort((a, b) => a - b)
        if (firsts.length) out.push({ friend_id: mate, friend: name, kind: 'streak_milestone', at: iso(firsts[0]), streak: st.streak })
      }

      // Passed this person on the weekly table with their latest log.
      const weekRows = [...p.food, ...p.workouts, ...p.activity].filter((r) => r.date >= weekStart && r.date <= tableToday)
      const latest = Math.max(-Infinity, ...weekRows.map((r) => Date.parse(r.created_at)).filter((t) => Number.isFinite(t)))
      if (Number.isFinite(latest)) {
        const after = weekXp(p, weekStart, tableToday, protein)
        const before = weekXp(p, weekStart, tableToday, protein, latest)
        if (after > myWeek && before <= myWeek) out.push({ friend_id: mate, friend: name, kind: 'passed_you', at: iso(latest) })
      }
    } catch (e) {
      console.error(`nudge: crew-mate ${short(mate)} of ${short(uid)} skipped: ${msg(e)}`)
    }
  }
  return out
}

// ---------- One person ----------

async function runUser(db: Db, uid: string, subs: Sub[], now: Date, rng: () => number): Promise<string> {
  const nowMs = now.getTime()
  const set = await db.from('user_settings').select('timezone,savage_mode,kcal_target,protein_target').eq('user_id', uid).maybeSingle()
  if (set.error) throw new Error(`user_settings: ${set.error.message}`)
  const st = (set.data ?? {}) as Partial<Settings>
  const tz = validTz(st.timezone)
  const today = zoned(now, tz).date
  const protein = Number(st.protein_target) || 0

  const me = await loadPerson(db, uid, addDays(today, -STREAK_LOOKBACK_DAYS))
  const since = addDays(today, -HABIT_WINDOW_DAYS)
  const recentFood = me.food.filter((r) => r.date >= since)
  const recentWork = me.workouts.filter((r) => r.date >= since)
  const recentAct = me.activity.filter((r) => r.date >= since)
  const logs: LogRow[] = toLogRows({ food: recentFood, workouts: recentWork, activity: recentAct })
  const workouts: WorkoutRow[] = recentWork.map((r) => ({ id: '', date: r.date, time: r.time, split: r.split, exercise: '', sets: [] }))

  const ev = await db
    .from('notification_events')
    .select('id,sent_at,goal,template_id,friend_id,logged_after')
    .eq('user_id', uid)
    .gte('sent_at', iso(nowMs - EVENTS_DAYS * 86_400_000))
    .order('sent_at')
  if (ev.error) throw new Error(`notification_events: ${ev.error.message}`)
  const events = (ev.data ?? []) as EventRow[]

  // Rewards first: every push whose 2 h window is over gets logged_after filled in.
  for (const e of events) {
    if (e.logged_after !== null || Date.parse(e.sent_at) + SUCCESS_WINDOW_MIN * MIN_MS > nowMs) continue
    const won = rewardFor(e.sent_at, e.goal as Goal, logs, tz)
    const up = await db.from('notification_events').update({ logged_after: won }).eq('id', e.id).eq('user_id', uid).is('logged_after', null)
    if (up.error) throw new Error(`logged_after: ${up.error.message}`)
    e.logged_after = won
  }

  let friendEvents: FriendEvent[] = []
  try {
    friendEvents = await crewEvents(db, uid, me, protein, now)
  } catch (e) {
    console.error(`nudge: crew news for ${short(uid)} skipped: ${msg(e)}`)
  }

  const kcalToday = me.food.filter((r) => r.date === today).reduce((n, r) => n + r.kcal, 0)
  const kcalTarget = Number(st.kcal_target) || 0
  const sends: SentPush[] = events.map((e) => ({ sent_at: e.sent_at, goal: e.goal, template_id: e.template_id, friend_id: e.friend_id }))
  const state: NudgeState = {
    tz,
    savage: st.savage_mode === true,
    logs,
    workouts,
    streak: streakFor(me, today, protein).streak,
    sends,
    restToday: me.rest.has(today),
    steps: me.health.get(today) ?? null,
    kcalLeft: kcalTarget ? kcalTarget - kcalToday : null,
    friendEvents,
  }
  const history: SendRecord[] = events.map((e) => ({ template_id: e.template_id, sent_at: e.sent_at, logged_after: e.logged_after, user_id: uid }))
  const push = nextPush(state, now, POOL, history, rng, uid)
  if (!push) return `${short(uid)}: nothing due`

  // Runaway guards.
  const sentToday = events.filter((e) => zoned(Date.parse(e.sent_at), tz).date === today).length
  if (sentToday >= MAX_PER_DAY) return `${short(uid)}: daily guard (${sentToday})`
  const last = await db.from('notification_events').select('sent_at').eq('user_id', uid).order('sent_at', { ascending: false }).limit(1)
  if (last.error) throw new Error(`race check: ${last.error.message}`)
  const lastAt = Date.parse(((last.data ?? []) as { sent_at: string }[])[0]?.sent_at ?? '')
  if (Number.isFinite(lastAt) && nowMs - lastAt < RACE_GAP_MIN * MIN_MS) return `${short(uid)}: sent by another run`

  const goal = push.candidate.goal
  const ins = await db
    .from('notification_events')
    .insert({
      user_id: uid,
      goal,
      template_id: push.template.id,
      savage: push.template.tone === 'savage',
      friend_id: goal === 'friend' ? (push.candidate.friendId ?? null) : null,
    })
    .select('id')
    .single()
  if (ins.error) throw new Error(`insert event: ${ins.error.message}`)
  const eventId = (ins.data as { id: string }).id

  const payload = JSON.stringify({
    title: push.title,
    body: push.body,
    url: './',
    event_id: eventId,
    tag: `apoy-${goal}`,
    // Lets the service worker report the tap; both are public values.
    api: Deno.env.get('SUPABASE_URL') ?? null,
    key: Deno.env.get('SUPABASE_ANON_KEY') ?? null,
  })
  let delivered = 0
  for (const s of subs.slice(0, MAX_SUBS_PER_USER)) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: PUSH_TTL_S, urgency: 'normal' })
      delivered++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) {
        const del = await db.from('push_subscriptions').delete().eq('id', s.id).eq('user_id', uid)
        console.warn(`nudge: removed dead subscription ${short(s.id)} (${code})${del.error ? `, delete failed: ${del.error.message}` : ''}`)
      } else {
        console.error(`nudge: send to ${short(s.id)} failed: ${code ?? msg(e)}`)
      }
    }
  }
  if (!delivered) {
    // Nothing reached a phone: drop the row so caps and the bandit do not count it.
    await db.from('notification_events').delete().eq('id', eventId).eq('user_id', uid)
    return `${short(uid)}: ${goal} not delivered`
  }
  return `${short(uid)}: sent ${goal} ${push.template.id} to ${delivered}`
}

// ---------- The run ----------

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('no', { status: 401 })

  const pub = Deno.env.get('VAPID_PUBLIC_KEY')
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!pub || !priv) return new Response('VAPID keys missing', { status: 503 })
  webpush.setVapidDetails(SUBJECT, pub, priv)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  // The one query across people: who has a phone subscribed. Rows are then grouped per person.
  const { data, error } = await db.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth').order('created_at')
  if (error) return new Response(error.message, { status: 500 })
  const byUser = new Map<string, Sub[]>()
  for (const s of (data ?? []) as Sub[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s])

  const now = new Date()
  // One random source per run, from the platform's crypto generator.
  const buf = new Uint32Array(1)
  const rng = () => crypto.getRandomValues(buf)[0] / 4294967296

  const report: string[] = []
  for (const [uid, subs] of [...byUser].slice(0, MAX_USERS)) {
    try {
      report.push(await runUser(db, uid, subs, now, rng))
    } catch (e) {
      console.error(`nudge: ${short(uid)} failed: ${msg(e)}`)
      report.push(`${short(uid)}: failed`)
    }
  }
  console.log(`nudge: ${report.join(' | ')}`)
  return new Response(JSON.stringify({ at: now.toISOString(), users: byUser.size, report }), { headers: { 'Content-Type': 'application/json' } })
})
