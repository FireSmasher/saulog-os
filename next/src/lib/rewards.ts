// Rewards (phase 4): streak with automatic freezes, XP and levels, milestones. Pure and
// worked out again from his rows every time, so nothing extra has to be stored and the
// numbers can never drift from what he actually logged.
//
// Rules (flow-nudge study, Edwin's picks 31 Oct 2026):
// - Logging counts: a day with any food row is a streak day. A marked rest or sick day
//   counts too. A workout day counts (Buhat).
// - Freezes: one earned at every 7 streak days, at most 2 held. A missed day with a freeze
//   held uses it by itself and the streak carries on. No freeze: the streak starts again.
// - Today not logged yet never breaks anything until it is over.
// - XP per day: each meal logged is 10 XP plus 1 per food (up to 5); protein target hit
//   +10; workout day +15. Streak milestones: +50 at every 7 days, +150 at 30, +500 at
//   100, +2000 at 365.
// - Level L costs 125 x L XP to finish (L1 125, L2 250, L3 375, L4 500, ...).
// - Never red, never loss copy: a broken streak just starts again.
import { addDays, slotOf, type FoodLog, type SlotId } from './day.ts'

export type DaySummary = { date: string; slots: Partial<Record<SlotId, number>>; protein: number }

export function summarise(rows: Pick<FoodLog, 'date' | 'time' | 'protein'>[]): DaySummary[] {
  const map = new Map<string, DaySummary>()
  for (const r of rows) {
    const d = map.get(r.date) ?? { date: r.date, slots: {}, protein: 0 }
    const s = slotOf(r.time)
    d.slots[s] = (d.slots[s] ?? 0) + 1
    d.protein += r.protein
    map.set(r.date, d)
  }
  return [...map.values()]
    .map((d) => ({ ...d, protein: Math.round(d.protein) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function dayXp(d: DaySummary | undefined, proteinTarget: number, workout: boolean): number {
  let xp = 0
  if (d) {
    for (const n of Object.values(d.slots)) xp += 10 + Math.min(n ?? 0, 5)
    if (proteinTarget > 0 && d.protein >= proteinTarget) xp += 10
  }
  if (workout) xp += 15
  return xp
}

export const MILESTONES = [7, 30, 100, 365]

export function milestoneXp(streakDay: number): number {
  let xp = 0
  if (streakDay > 0 && streakDay % 7 === 0) xp += 50
  if (streakDay === 30) xp += 150
  if (streakDay === 100) xp += 500
  if (streakDay === 365) xp += 2000
  return xp
}

export type Level = { level: number; into: number; cost: number }

export function levelFor(xp: number): Level {
  let level = 1
  let left = Math.max(0, Math.floor(xp))
  while (left >= 125 * level) {
    left -= 125 * level
    level++
  }
  return { level, into: left, cost: 125 * level }
}

export type Rewards = {
  streak: number
  best: number
  freezes: number // held now
  frozen: Set<string> // days a freeze covered
  xp: number
  level: Level
  todayCounts: boolean
}

type Input = {
  days: DaySummary[]
  workoutDays?: Set<string>
  restDays?: Set<string>
  today: string
  proteinTarget: number
}

export function rewards({ days, workoutDays = new Set(), restDays = new Set(), today, proteinTarget }: Input): Rewards {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const counted = (date: string) => byDate.has(date) || workoutDays.has(date) || restDays.has(date)
  const allDates = [...byDate.keys(), ...workoutDays, ...restDays].filter((d) => d <= today).sort()
  const empty: Rewards = { streak: 0, best: 0, freezes: 0, frozen: new Set(), xp: 0, level: levelFor(0), todayCounts: false }
  if (!allDates.length) return empty

  let streak = 0
  let best = 0
  let freezes = 0
  let xp = 0
  const frozen = new Set<string>()
  for (let day = allDates[0]; day <= today; day = addDays(day, 1)) {
    const isToday = day === today
    if (counted(day)) {
      streak++
      best = Math.max(best, streak)
      xp += dayXp(byDate.get(day), proteinTarget, workoutDays.has(day)) + milestoneXp(streak)
      if (streak % 7 === 0) freezes = Math.min(2, freezes + 1)
    } else if (isToday) {
      // not over yet
    } else if (freezes > 0 && streak > 0) {
      freezes--
      frozen.add(day)
    } else {
      streak = 0
    }
  }
  return { streak, best, freezes, frozen, xp, level: levelFor(xp), todayCounts: counted(today) }
}

// What one save changed, for the just-logged sheet.
export type Gain = {
  xp: number
  levelUp: number | null // the new level, if he reached one
  dayNowSafe: boolean // this save made today count
  streak: number
  milestone: number | null // 7, 30, 100 or 365 if this save reached it
  freezeEarned: boolean
}

export function gain(before: Rewards, after: Rewards): Gain {
  const milestone = after.streak !== before.streak && MILESTONES.includes(after.streak) ? after.streak : null
  return {
    xp: Math.max(0, after.xp - before.xp),
    levelUp: after.level.level > before.level.level ? after.level.level : null,
    dayNowSafe: !before.todayCounts && after.todayCounts,
    streak: after.streak,
    milestone,
    freezeEarned: after.freezes > before.freezes,
  }
}
