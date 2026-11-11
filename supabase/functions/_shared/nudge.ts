// SYNCED COPY for the Deno Edge Functions. Source: next/src/lib/nudge.ts (the source wins).
// Do not edit here. Edit the source, then run `cd next && node scripts/check-shared.mjs --write`.
// Imports that leave this folder point at ../../../next/src/lib/. `npm test` fails when this
// file and the source differ apart from this header and the import paths.
// ---- end sync header ----
// Smart reminders (W3): the pure engine. No network, no React, no Date.now() inside the
// logic: the clock comes in as `now`, randomness as `rng`. The server sender (W7) copies
// this file to supabase/functions/_shared and calls nextPush() every 15 minutes.
//
// Rules (docs/SOCIAL-PLAN.md, Rulings 11 Nov 2026, and docs/research/2026-11-11-duolingo.md):
// - One reminder per goal per day at the time he usually does it (median of 42 days; with
//   little data 23.5 h after the last log; else a default). streak_saver may fire twice.
// - No quiet hours (iOS Focus delivers silently). Never two pushes within 60 minutes.
//   Never the same kind twice in a row before the person logs something.
// - Backoff: when pushes get no log, reminders keep coming once a day for up to 7 days,
//   day 8 brings one "pausing" message, then silence, then one last check-in around day 18.
//   Any new log resets everything.
// - Message choice: softmax over success rates shrunk toward the pool mean (prior 20 sends),
//   minus a recency penalty 0.017 x 0.5^(days since sent / 15). Reward = a log of that goal
//   within 2 h of the push.
import { addDays, hhmm, minutes, slotOf } from '../../../next/src/lib/day.ts'
import { todaySplit, type WorkoutRow } from '../../../next/src/lib/buhat.ts'
import { MILESTONES } from '../../../next/src/lib/rewards.ts'
import type { IsoDate, IsoTime, Timestamp } from '../../../next/src/lib/types-social.ts'

// ---------- Names shared with W7 and the database (notification_events.goal) ----------

export const GOALS = ['breakfast', 'lunch', 'dinner', 'workout', 'walk', 'streak_saver', 'friend', 'backoff'] as const
export type Goal = (typeof GOALS)[number]
export const HABIT_GOALS = ['breakfast', 'lunch', 'dinner', 'workout', 'walk'] as const
export type HabitGoal = (typeof HABIT_GOALS)[number]
export const MEAL_GOALS = ['breakfast', 'lunch', 'dinner'] as const
export type MealGoal = (typeof MEAL_GOALS)[number]

export const TONES = ['friendly', 'cheeky', 'coach', 'savage'] as const
export type Tone = (typeof TONES)[number]
export const FRIEND_EVENTS = ['workout_done', 'streak_milestone', 'passed_you'] as const
export type FriendEventKind = (typeof FRIEND_EVENTS)[number]
export type BackoffStage = 'pause' | 'last'

// ---------- Numbers ----------

export const DEFAULT_TZ = 'Europe/Berlin'
export const DEFAULT_TIMES: Record<HabitGoal, IsoTime> = {
  breakfast: '08:00',
  lunch: '13:00',
  dinner: '19:30',
  workout: '18:00',
  walk: '12:30',
}
export const HABIT_WINDOW_DAYS = 42
export const MIN_MEDIAN_DAYS = 5 // research: median when there are 5 or more days
export const FALLBACK_AFTER_MIN = 23.5 * 60 // first reminder 23.5 h after the last log
// How long after the usual time a goal stays due (a missed slot still gets its chance
// when the 60 minute gap pushed it back, but a 13:00 lunch is not nagged at 22:00).
export const DUE_WINDOW_MIN: Record<HabitGoal, number> = { breakfast: 180, lunch: 180, dinner: 180, workout: 180, walk: 240 }
export const GAP_MIN = 60
export const STREAK_SAVER_FIRST_H = 3
export const STREAK_SAVER_SECOND_H = 1
export const STREAK_SAVER_MIN_STREAK = 2
export const DEFAULT_STEP_GOAL = 8000
export const LEARN_MIN_DAYS = 21 // under 3 weeks of workout history: use the 2-day gap rule
export const WORKOUT_GAP_DAYS = 2
export const FRIEND_FRESH_MIN = 180 // a friend's big moment is news for 3 h
// Backoff, counted from the day of the first push that got no log (that day = day 1).
export const BACKOFF = { dailyUntilDay: 7, pauseDay: 8, lastDay: 18, lastUntilDay: 25 }
export const SUCCESS_WINDOW_MIN = 120
export const PRIOR_SENDS = 20
export const RECENCY_PENALTY = 0.017
export const RECENCY_HALF_LIFE_DAYS = 15
export const TEMPERATURE = 0.02
export const NO_REPEAT_DAYS = 3 // a template sent to this person in the last 3 days sleeps

const MIN_MS = 60_000
const DAY_MS = 86_400_000

// ---------- Time zone helpers (correct on clock-change days, whatever the server TZ) ----------

const formatters = new Map<string, Intl.DateTimeFormat>()

function wall(at: number, tz: string) {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    formatters.set(tz, f)
  }
  const p: Record<string, number> = {}
  for (const x of f.formatToParts(new Date(at))) if (x.type !== 'literal') p[x.type] = Number(x.value)
  return { y: p.year, mo: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second }
}

function offsetMs(at: number, tz: string): number {
  const w = wall(at, tz)
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(at / 1000) * 1000
}

// Local date, HH:MM and minute of the day of an instant in a time zone.
export function zoned(at: Date | number, tz = DEFAULT_TZ): { date: IsoDate; time: IsoTime; minute: number } {
  const w = wall(typeof at === 'number' ? at : at.getTime(), tz)
  const date = `${w.y}-${String(w.mo).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`
  return { date, time: hhmm(w.h * 60 + w.mi), minute: w.h * 60 + w.mi }
}

// The instant (ms) of a local date and time. A time skipped by the spring change lands an
// hour later; a time that happens twice in autumn takes the second (winter) one.
export function instantOf(date: IsoDate, time: IsoTime, tz = DEFAULT_TZ): number {
  const [y, m, d] = date.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, 0, minutes(time))
  const first = guess - offsetMs(guess, tz)
  return guess - offsetMs(first, tz)
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const u = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((u(to) - u(from)) / DAY_MS)
}

export function weekday(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 // Monday = 0
}

// ---------- Rows ----------

// One logged thing, flattened: a food row becomes its meal, a workout row 'workout', and
// any activity row (walk, run, bike, row, stairs, other) 'walk'.
export type LogRow = { goal: HabitGoal; date: IsoDate; time: IsoTime }

type Dated = { date: IsoDate; time: IsoTime }

export function toLogRows(src: { food?: Dated[]; workouts?: Dated[]; activity?: Dated[] }): LogRow[] {
  return [
    ...(src.food ?? []).map((r) => ({ goal: slotOf(r.time) as HabitGoal, date: r.date, time: r.time })),
    ...(src.workouts ?? []).map((r) => ({ goal: 'workout' as const, date: r.date, time: r.time })),
    ...(src.activity ?? []).map((r) => ({ goal: 'walk' as const, date: r.date, time: r.time })),
  ]
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Dinner logged after midnight sorts after the evening, as in day.ts.
const dayMinute = (goal: HabitGoal, time: IsoTime) => {
  const m = minutes(time)
  return goal === 'dinner' && m < 4 * 60 ? m + 1440 : m
}

// ---------- Usual times ----------

export type HabitTime = { goal: HabitGoal; time: IsoTime; source: 'median' | 'last_log' | 'default'; days: number }

export function habitTimes(rows: LogRow[], today: IsoDate): Record<HabitGoal, HabitTime> {
  const from = addDays(today, -HABIT_WINDOW_DAYS)
  const out = {} as Record<HabitGoal, HabitTime>
  for (const goal of HABIT_GOALS) {
    const mine = rows.filter((r) => r.goal === goal && r.date < today)
    const first = new Map<IsoDate, number>()
    for (const r of mine) {
      if (r.date < from) continue
      const m = dayMinute(goal, r.time)
      const prev = first.get(r.date)
      if (prev === undefined || m < prev) first.set(r.date, m)
    }
    const days = first.size
    if (days >= MIN_MEDIAN_DAYS) {
      out[goal] = { goal, time: hhmm(Math.round(median([...first.values()]) / 5) * 5), source: 'median', days }
      continue
    }
    const last = [...mine].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).at(-1)
    out[goal] = last
      ? { goal, time: hhmm(minutes(last.time) + FALLBACK_AFTER_MIN), source: 'last_log', days }
      : { goal, time: DEFAULT_TIMES[goal], source: 'default', days }
  }
  return out
}

// ---------- Training days ----------

export type TrainingPlan = { learned: boolean; weekdays: number[]; lastWorkout: IsoDate | null }

// The weekdays he usually trains: over the last 6 weeks, a weekday on which he trained at
// least half the time (and at least twice). Under 3 weeks of history nothing is learned.
export function trainingDays(workoutRows: { date: IsoDate }[], today: IsoDate): TrainingPlan {
  const dates = new Set(workoutRows.map((r) => r.date).filter((d) => d < today))
  const sorted = [...dates].sort()
  const lastWorkout = sorted.at(-1) ?? null
  if (!sorted.length || daysBetween(sorted[0], today) < LEARN_MIN_DAYS) return { learned: false, weekdays: [], lastWorkout }
  const windowStart = addDays(today, -HABIT_WINDOW_DAYS)
  const start = sorted[0] > windowStart ? sorted[0] : windowStart
  const seen = Array(7).fill(0)
  const trained = Array(7).fill(0)
  for (let d = start; d < today; d = addDays(d, 1)) {
    const w = weekday(d)
    seen[w]++
    if (dates.has(d)) trained[w]++
  }
  const weekdays = [0, 1, 2, 3, 4, 5, 6].filter((w) => trained[w] >= 2 && trained[w] / seen[w] >= 0.5)
  return { learned: weekdays.length > 0, weekdays, lastWorkout }
}

// Learned plan: due on his weekdays. Otherwise: due on the second day without a workout.
export function workoutDue(plan: TrainingPlan, today: IsoDate): boolean {
  if (plan.learned) return plan.weekdays.includes(weekday(today))
  return plan.lastWorkout === null || daysBetween(plan.lastWorkout, today) >= WORKOUT_GAP_DAYS
}

// ---------- State and candidates ----------

// A push already sent. friend_id is needed for "one push per friend per day"; when it is
// missing on a friend push, that push blocks every friend push for the rest of the day.
export type SentPush = { sent_at: Timestamp; goal: Goal | string; template_id: string; friend_id?: string | null }

export type FriendEvent = {
  friend_id: string
  friend: string // display name; only the first word is shown
  kind: FriendEventKind
  at: Timestamp
  session?: string // workout_done
  streak?: number // streak_milestone
}

export type NudgeState = {
  tz?: string
  savage: boolean
  logs: LogRow[] // his own rows, history and today
  workouts: WorkoutRow[] // for training days and the next session name
  streak: number // from rewards(); runs through yesterday until today is logged
  sends: SentPush[] // his notification_events
  restToday?: boolean // a marked rest or sick day counts as logged
  steps?: number | null // today's steps when Health sent them
  stepGoal?: number
  kcalLeft?: number | null
  friendEvents?: FriendEvent[]
}

export type Candidate = {
  goal: Goal
  vars: Record<string, string>
  phase: 'normal' | 'daily' | 'backoff'
  stage?: BackoffStage
  event?: FriendEventKind
  friendId?: string
}

const fmtNum = (n: number) => Math.round(n).toLocaleString('en-GB')
export const firstName = (name: string) => (name.trim().split(/\s+/)[0] ?? '').slice(0, 12)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Which nudges may go out now, best first. The sender sends the first one (if any).
export function candidates(state: NudgeState, now: Date): Candidate[] {
  const tz = state.tz ?? DEFAULT_TZ
  const nowMs = now.getTime()
  const { date: today, minute: nowMin } = zoned(nowMs, tz)
  const sends = state.sends
    .map((s) => ({ ...s, at: Date.parse(s.sent_at) }))
    .filter((s) => s.at <= nowMs)
    .sort((a, b) => a.at - b.at)
  const lastSend = sends.at(-1)
  if (lastSend && nowMs - lastSend.at < GAP_MIN * MIN_MS) return []

  const logs = state.logs.filter((l) => instantOf(l.date, l.time, tz) <= nowMs)
  const lastLog = Math.max(-Infinity, ...logs.map((l) => instantOf(l.date, l.time, tz)))
  const unacted = sends.filter((s) => s.at > lastLog && s.goal !== 'friend')
  const firstUnactedDate = unacted.length ? zoned(unacted[0].at, tz).date : today
  const day = daysBetween(firstUnactedDate, today) + 1 // day 1 = the first ignored push
  const sentToday = sends.filter((s) => zoned(s.at, tz).date === today)
  const habits = habitTimes(logs, today)

  // Day 8 on: one pause message, silence, one last check-in, silence.
  if (day >= BACKOFF.pauseDay) {
    if (nowMin < minutes(habits.dinner.time)) return []
    const backoffs = unacted.filter((s) => s.goal === 'backoff')
    if (day < BACKOFF.lastDay) return backoffs.length ? [] : [{ goal: 'backoff', vars: {}, phase: 'backoff', stage: 'pause' }]
    const lastSent = backoffs.some((s) => daysBetween(firstUnactedDate, zoned(s.at, tz).date) + 1 >= BACKOFF.lastDay)
    if (day <= BACKOFF.lastUntilDay && !lastSent) return [{ goal: 'backoff', vars: {}, phase: 'backoff', stage: 'last' }]
    return []
  }

  const daily = day > 1
  if (daily && sentToday.length) return [] // days 2 to 7: one reminder a day
  const phase = daily ? 'daily' : 'normal'

  const loggedToday = new Set(logs.filter((l) => l.date === today).map((l) => l.goal))
  const anyToday = loggedToday.size > 0 || state.restToday === true
  const streakVars: Record<string, string> = state.streak >= 2 ? { streak: String(state.streak) } : {}
  const out: Candidate[] = []

  // Streak saver: a streak of 2+ days and nothing counts today yet, 3 h and 1 h before
  // local midnight (Edwin 11 Nov: a 1-day streak has too little to lose).
  const midnight = instantOf(addDays(today, 1), '00:00', tz)
  const left = midnight - nowMs
  if (!anyToday && state.streak >= STREAK_SAVER_MIN_STREAK && left <= STREAK_SAVER_FIRST_H * 3_600_000) {
    const n = sentToday.filter((s) => s.goal === 'streak_saver').length
    if (n === 0 || (n === 1 && left <= STREAK_SAVER_SECOND_H * 3_600_000)) {
      const hoursLeft = String(Math.min(STREAK_SAVER_FIRST_H, Math.max(1, Math.ceil(left / 3_600_000))))
      out.push({ goal: 'streak_saver', vars: { ...streakVars, hoursLeft }, phase })
    }
  }

  const due = (g: HabitGoal) => {
    const at = minutes(habits[g].time)
    return nowMin >= at && nowMin < at + DUE_WINDOW_MIN[g]
  }

  if (!loggedToday.has('workout') && due('workout') && workoutDue(trainingDays(state.workouts, today), today)) {
    out.push({ goal: 'workout', vars: { ...streakVars, session: todaySplit(state.workouts, today) }, phase })
  }

  // A meal he logged on under 3 of the last 10+ food days is one he skips: no nag.
  const windowStart = addDays(today, -HABIT_WINDOW_DAYS)
  const foodDays = new Set(
    logs.filter((l) => (MEAL_GOALS as readonly string[]).includes(l.goal) && l.date >= windowStart && l.date < today).map((l) => l.date),
  ).size
  const meals = [...MEAL_GOALS].sort((a, b) => minutes(habits[a].time) - minutes(habits[b].time))
  for (const meal of meals) {
    if (loggedToday.has(meal) || !due(meal)) continue
    if (foodDays >= 10 && habits[meal].days < 3) continue
    const vars: Record<string, string> = { ...streakVars, meal, Meal: cap(meal) }
    if (state.kcalLeft != null && state.kcalLeft > 0) vars.kcalLeft = fmtNum(state.kcalLeft)
    out.push({ goal: meal, vars, phase })
  }

  const stepGoal = state.stepGoal ?? DEFAULT_STEP_GOAL
  if (!loggedToday.has('walk') && due('walk') && (state.steps == null || state.steps < stepGoal)) {
    const vars: Record<string, string> = { ...streakVars }
    if (state.steps != null) vars.steps = fmtNum(state.steps)
    out.push({ goal: 'walk', vars, phase })
  }

  // Friends: big moments only, one push per friend per day, never while he is backing off.
  if (!daily) {
    const friendToday = sentToday.filter((s) => s.goal === 'friend')
    const blockedAll = friendToday.some((s) => !s.friend_id)
    const done = new Set(friendToday.map((s) => s.friend_id))
    const events = [...(state.friendEvents ?? [])].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    for (const e of events) {
      const at = Date.parse(e.at)
      if (blockedAll || done.has(e.friend_id) || at > nowMs || nowMs - at > FRIEND_FRESH_MIN * MIN_MS) continue
      const vars: Record<string, string> = { friend: firstName(e.friend) }
      if (e.kind === 'workout_done') {
        if (!e.session) continue
        vars.session = e.session
      } else if (e.kind === 'streak_milestone') {
        if (!e.streak || !(MILESTONES.includes(e.streak) || e.streak % 100 === 0)) continue
        vars.friendStreak = String(e.streak)
      }
      done.add(e.friend_id)
      out.push({ goal: 'friend', vars, phase, event: e.kind, friendId: e.friend_id })
    }
  }

  // Once a day per goal (streak_saver handled above), and never the same kind twice in a
  // row before he logs something.
  const lastUnacted = unacted.at(-1)?.goal
  return out.filter((c) => {
    if (c.goal === 'friend') return true
    if (c.goal !== 'streak_saver' && sentToday.some((s) => s.goal === c.goal)) return false
    if (c.goal === lastUnacted && !(c.goal === 'streak_saver' && !daily)) return false
    return true
  })
}

// ---------- Templates and the bandit ----------

export type Template = {
  id: string // stable: notification_events.template_id
  goals: Goal[]
  tone: Tone
  title: string
  body: string
  twin?: string // savage only: the clean template with the same idea and placeholders
  stage?: BackoffStage
  event?: FriendEventKind
}

export const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1])

export function render(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (all, k: string) => vars[k] ?? all)
}

// Templates that fit this candidate: right goal, stage and event, savage only when he chose
// it, and every placeholder backed by real data.
export function eligible(pool: Template[], c: Candidate, savage: boolean): Template[] {
  return pool.filter(
    (t) =>
      t.goals.includes(c.goal) &&
      (savage || t.tone !== 'savage') &&
      t.stage === c.stage &&
      t.event === c.event &&
      placeholders(t.title + t.body).every((p) => p in c.vars),
  )
}

export type SendRecord = { template_id: string; sent_at: Timestamp; logged_after: boolean | null; user_id?: string }

// Reward for one push: did a log of that goal follow within 2 h? For streak_saver, friend
// and backoff any log counts.
export function rewardFor(sentAt: Timestamp, goal: Goal, logs: LogRow[], tz = DEFAULT_TZ): boolean {
  const at = Date.parse(sentAt)
  return logs.some((l) => {
    if ((HABIT_GOALS as readonly string[]).includes(goal) && l.goal !== goal) return false
    const t = instantOf(l.date, l.time, tz)
    return t >= at && t <= at + SUCCESS_WINDOW_MIN * MIN_MS
  })
}

export type Scored = { id: string; sends: number; wins: number; rate: number; penalty: number; score: number; weight: number }

// history: every person's sends (for success rates). Recency and sleeping use only this
// person's sends (user_id === userId; with no userId the whole history is his).
export function templateWeights(pool: Template[], history: SendRecord[], now: Date, userId?: string): Scored[] {
  const nowMs = now.getTime()
  const ids = new Set(pool.map((t) => t.id))
  const stats = new Map(pool.map((t) => [t.id, { sends: 0, wins: 0, last: -Infinity }]))
  for (const r of history) {
    const s = stats.get(r.template_id)
    const at = Date.parse(r.sent_at)
    if (!s || !ids.has(r.template_id) || at > nowMs) continue
    if (r.logged_after !== null) {
      s.sends++
      if (r.logged_after) s.wins++
    }
    if (userId === undefined || r.user_id === userId) s.last = Math.max(s.last, at)
  }
  const all = [...stats.values()]
  const totalSends = all.reduce((n, s) => n + s.sends, 0)
  const mean = totalSends ? all.reduce((n, s) => n + s.wins, 0) / totalSends : 0
  const awake = pool.filter((t) => nowMs - stats.get(t.id)!.last >= NO_REPEAT_DAYS * DAY_MS)
  const use = new Set((awake.length ? awake : pool).map((t) => t.id))
  const scored = pool.map((t) => {
    const s = stats.get(t.id)!
    const rate = (s.wins + PRIOR_SENDS * mean) / (s.sends + PRIOR_SENDS)
    const days = (nowMs - s.last) / DAY_MS
    const penalty = Number.isFinite(days) ? RECENCY_PENALTY * 0.5 ** (days / RECENCY_HALF_LIFE_DAYS) : 0
    return { id: t.id, sends: s.sends, wins: s.wins, rate, penalty, score: rate - penalty, weight: 0 }
  })
  const top = Math.max(...scored.filter((s) => use.has(s.id)).map((s) => s.score))
  let sum = 0
  for (const s of scored) {
    s.weight = use.has(s.id) ? Math.exp((s.score - top) / TEMPERATURE) : 0
    sum += s.weight
  }
  for (const s of scored) s.weight = sum ? s.weight / sum : 0
  return scored
}

export function pickTemplate(pool: Template[], history: SendRecord[], now: Date, rng: () => number, userId?: string): Template | null {
  if (!pool.length) return null
  const w = templateWeights(pool, history, now, userId)
  let r = rng()
  for (let i = 0; i < pool.length; i++) {
    r -= w[i].weight
    if (r < 0) return pool[i]
  }
  return pool[pool.length - 1]
}

// Small seeded generator (mulberry32) for tests and for reproducible server runs.
export function seededRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Push = { candidate: Candidate; template: Template; title: string; body: string }

// The one push to send now, or null. W7 writes it to notification_events.
export function nextPush(
  state: NudgeState,
  now: Date,
  pool: Template[],
  history: SendRecord[],
  rng: () => number,
  userId?: string,
): Push | null {
  for (const c of candidates(state, now)) {
    const t = pickTemplate(eligible(pool, c, state.savage), history, now, rng, userId)
    if (t) return { candidate: c, template: t, title: render(t.title, c.vars), body: render(t.body, c.vars) }
  }
  return null
}
