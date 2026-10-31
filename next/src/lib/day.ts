// Pure logic for Kain today: no network, no React, so it can be tested with `npm test`.
// Every date here is a LOCAL calendar date (YYYY-MM-DD) and every time is local HH:MM,
// the same text the food_logs table stores.

export type FoodLog = {
  id: string
  date: string
  time: string
  name: string
  grams: number
  kcal: number
  protein: number
  carb: number
  fat: number
  is_restaurant: boolean
  item_type: string | null
  item_id: string | null
}

export type SlotId = 'breakfast' | 'lunch' | 'dinner'

// food_logs has no meal column, so a meal is decided by the time it was logged.
// Lunch from 11:00, dinner from 16:00. Anything before 04:00 still counts as dinner.
export const SLOTS: { id: SlotId; label: string; from: number; fallback: string }[] = [
  { id: 'breakfast', label: 'Breakfast', from: 4 * 60, fallback: '08:00' },
  { id: 'lunch', label: 'Lunch', from: 11 * 60, fallback: '13:00' },
  { id: 'dinner', label: 'Dinner', from: 16 * 60, fallback: '19:30' },
]

export function minutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function hhmm(total: number): string {
  const t = ((Math.round(total) % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export function slotOf(time: string): SlotId {
  const m = minutes(time)
  if (m >= SLOTS[2].from || m < SLOTS[0].from) return 'dinner'
  if (m >= SLOTS[1].from) return 'lunch'
  return 'breakfast'
}

export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function localTime(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Calendar arithmetic at noon, so a summer-time change never skips or repeats a day.
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return localDate(new Date(y, m - 1, d + n, 12))
}

// ---------- Totals and meals ----------

export type Totals = { kcal: number; protein: number }

export function totals(logs: FoodLog[]): Totals {
  return logs.reduce((t, l) => ({ kcal: t.kcal + l.kcal, protein: t.protein + l.protein }), { kcal: 0, protein: 0 })
}

export type Meal = { id: SlotId; label: string; logs: FoodLog[]; totals: Totals }

export function meals(todayLogs: FoodLog[]): Meal[] {
  const sorted = [...todayLogs].sort((a, b) => dayOrder(a.time) - dayOrder(b.time))
  return SLOTS.map((s) => {
    const logs = sorted.filter((l) => slotOf(l.time) === s.id)
    return { id: s.id, label: s.label, logs, totals: totals(logs) }
  }).filter((m) => m.logs.length > 0)
}

// After-midnight snacks sort after the evening, not before breakfast.
function dayOrder(time: string): number {
  const m = minutes(time)
  return m < SLOTS[0].from ? m + 1440 : m
}

// ---------- Streak ----------

// Logging counts: any day with at least one food row is a streak day. Today not logged
// yet does not break it; the streak runs through yesterday until midnight.
export function streak(loggedDates: Set<string>, today: string): number {
  let day = loggedDates.has(today) ? today : addDays(today, -1)
  let n = 0
  while (loggedDates.has(day)) {
    n++
    day = addDays(day, -1)
  }
  return n
}

export type WeekDot = { letter: string; date: string; isToday: boolean; state: 'done' | 'today' | 'missed' | 'future' }

// Monday to Sunday of this week.
export function week(loggedDates: Set<string>, today: string): WeekDot[] {
  const [y, m, d] = today.split('-').map(Number)
  const weekday = (new Date(y, m - 1, d, 12).getDay() + 6) % 7 // Monday = 0
  const monday = addDays(today, -weekday)
  return 'MTWTFSS'.split('').map((letter, i) => {
    const date = addDays(monday, i)
    const state =
      loggedDates.has(date) ? 'done' : date === today ? 'today' : date > today ? 'future' : 'missed'
    return { letter, date, isToday: date === today, state }
  })
}

// ---------- Usual times and next meal ----------

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export type SlotHabit = { id: SlotId; label: string; usual: string; days: number }

// For each meal: on how many past days he logged it, and the median time of the
// first entry. Fewer than 3 days of history falls back to a plain default time.
export function habits(history: FoodLog[], today: string): SlotHabit[] {
  const first = new Map<string, number>() // "date|slot" -> earliest minute
  for (const l of history) {
    if (l.date >= today) continue
    const key = `${l.date}|${slotOf(l.time)}`
    const m = dayOrder(l.time)
    const prev = first.get(key)
    if (prev === undefined || m < prev) first.set(key, m)
  }
  return SLOTS.map((s) => {
    const times = [...first.entries()].filter(([k]) => k.endsWith('|' + s.id)).map(([, m]) => m)
    const usual = times.length >= 3 ? hhmm(Math.round(median(times) / 5) * 5) : s.fallback
    return { id: s.id, label: s.label, usual, days: times.length }
  })
}

export type NextCard = { title: string; detail: string; slot: SlotId | null }

// The card names the meal to log now: the current meal if it is not logged yet, else
// the next one he usually eats. After dinner it offers a snack.
export function nextCard(todayLogs: FoodLog[], hist: SlotHabit[], now: string): NextCard {
  const done = new Set(todayLogs.map((l) => slotOf(l.time)))
  const current = slotOf(now)
  const order: SlotId[] = ['breakfast', 'lunch', 'dinner']
  const late = minutes(now) < SLOTS[0].from // after midnight
  const startAt = late ? order.length : order.indexOf(current)
  // With a week or more of history, a meal he logged on fewer than 3 days is one he
  // usually skips, so the card does not push it.
  const enoughHistory = Math.max(...hist.map((h) => h.days)) >= 7
  for (let i = startAt; i < order.length; i++) {
    const id = order[i]
    const h = hist.find((x) => x.id === id)!
    const skipped = enoughHistory && h.days < 3
    if (done.has(id) || skipped) continue
    const lower = h.label.toLowerCase()
    const detail =
      i === startAt
        ? `You usually eat around ${h.usual}. Snap, say the grams.`
        : `Next one, usually around ${h.usual}. Snap, say the grams.`
    return { title: `Log ${lower}`, detail, slot: id }
  }
  return { title: 'Log a snack', detail: 'Anything else today? Snap, say the grams.', slot: null }
}

// ---------- Usual foods ----------

export type Usual = { key: string; name: string; grams: number; template: FoodLog; count: number }

// Foods he logged most often in this meal over the history window, each with the gram
// amount he uses most. Tapping one copies that exact past row (same grams, same numbers).
export function usualFoods(history: FoodLog[], slot: SlotId | null, today: string, limit = 6): Usual[] {
  const pool = history.filter((l) => l.date < today && (slot === null || slotOf(l.time) === slot))
  const byName = new Map<string, FoodLog[]>()
  for (const l of pool) {
    const key = l.name.trim().toLowerCase()
    if (!key) continue
    byName.set(key, [...(byName.get(key) ?? []), l])
  }
  const out: Usual[] = []
  for (const [key, logs] of byName) {
    const days = new Set(logs.map((l) => l.date)).size
    if (days < 2) continue
    const gramCount = new Map<number, number>()
    for (const l of logs) gramCount.set(l.grams, (gramCount.get(l.grams) ?? 0) + 1)
    const grams = [...gramCount.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
    const template = logs
      .filter((l) => l.grams === grams)
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0]
    out.push({ key, name: template.name, grams, template, count: days })
  }
  return out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit)
}

// ---------- Formatting ----------

export const fmt = (n: number) => Math.round(n).toLocaleString('en-GB')

export function gramsLabel(g: number): string {
  return `${Number.isInteger(g) ? g : Math.round(g * 10) / 10} g`
}

export function percent(value: number, target: number): number {
  return target > 0 ? Math.round((value / target) * 100) : 0
}
