// KEEP IN SYNC. Deno copy of the pure STREAK part of next/src/lib/rewards.ts (function
// `rewards`: streak, best, freezes, frozen, todayCounts) plus `addDays` from next/src/lib/day.ts.
// XP, levels and milestones are left out on purpose: the widget only needs the streak.
// If the streak rules change in next/src/lib/rewards.ts, change them here too, or the widget
// will show a different number than the app.
//
// Rules: any food row, workout row, activity row or rest/sick mark makes a day count. One
// freeze is earned at every 7 streak days, at most 2 held. A missed day with a freeze held
// uses it. Today not counted yet never breaks anything until it is over.

// Same result as day.ts addDays, but in UTC so the server time zone cannot matter.
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n, 12))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

export type StreakResult = {
  streak: number
  best: number
  freezes: number // held now
  frozen: Set<string> // days a freeze covered
  todayCounts: boolean
}

type Input = {
  loggedDays: Set<string> // days with any food row
  workoutDays?: Set<string> // days with a workout or activity row
  restDays?: Set<string>
  today: string
}

export function streakOf({ loggedDays, workoutDays = new Set(), restDays = new Set(), today }: Input): StreakResult {
  const counted = (date: string) => loggedDays.has(date) || workoutDays.has(date) || restDays.has(date)
  const allDates = [...loggedDays, ...workoutDays, ...restDays].filter((d) => d <= today).sort()
  const empty: StreakResult = { streak: 0, best: 0, freezes: 0, frozen: new Set(), todayCounts: false }
  if (!allDates.length) return empty

  let streak = 0
  let best = 0
  let freezes = 0
  const frozen = new Set<string>()
  for (let day = allDates[0]; day <= today; day = addDays(day, 1)) {
    const isToday = day === today
    if (counted(day)) {
      streak++
      best = Math.max(best, streak)
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
  return { streak, best, freezes, frozen, todayCounts: counted(today) }
}
