import { supabase, loadTargets, type Targets } from './supabase'
import { addDays, localTime, streak, type FoodLog } from './day'

export const COLUMNS = 'id, date, time, name, grams, kcal, protein, carb, fat, is_restaurant, item_type, item_id'
const PAGE = 1000 // Supabase returns at most 1,000 rows per request
export const HISTORY_DAYS = 42 // six weeks for usual foods and usual meal times

export function toLog(r: Record<string, unknown>): FoodLog {
  return {
    id: String(r.id),
    date: String(r.date),
    time: String(r.time).slice(0, 5),
    name: String(r.name ?? ''),
    grams: Number(r.grams),
    kcal: Number(r.kcal),
    protein: Number(r.protein),
    carb: Number(r.carb),
    fat: Number(r.fat),
    is_restaurant: Boolean(r.is_restaurant),
    item_type: r.item_type == null ? null : String(r.item_type),
    item_id: r.item_id == null ? null : String(r.item_id),
  }
}

// Six weeks of rows, today included.
async function loadHistory(today: string): Promise<FoodLog[]> {
  const out: FoodLog[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('food_logs')
      .select(COLUMNS)
      .gte('date', addDays(today, -HISTORY_DAYS))
      .lte('date', today)
      .order('date', { ascending: true })
      .order('time', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data ?? []).map(toLog))
    if (!data || data.length < PAGE) return out
  }
}

// Every logged day, newest first, only as far back as the streak needs.
async function loadLoggedDates(today: string): Promise<string[]> {
  const dates = new Set<string>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('food_logs')
      .select('date')
      .lte('date', today)
      .order('date', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    for (const r of rows) dates.add(String(r.date))
    if (rows.length < PAGE) break
    const oldest = String(rows[rows.length - 1].date)
    if (oldest < addDays(today, -(streak(dates, today) + 1))) break // the streak ends inside this page
  }
  return [...dates]
}

export type KainData = {
  today: string
  history: FoodLog[]
  loggedDates: string[]
  targets: Targets | null
  savedAt: number
}

export async function loadKain(today: string): Promise<KainData> {
  const [history, loggedDates, targets] = await Promise.all([
    loadHistory(today),
    loadLoggedDates(today),
    loadTargets(),
  ])
  return { today, history, loggedDates, targets, savedAt: Date.now() }
}

// One tap on a usual food: a copy of that exact past row, logged now.
export async function logAgain(template: FoodLog, today: string): Promise<FoodLog> {
  const { data, error } = await supabase
    .from('food_logs')
    .insert({
      date: today,
      time: localTime(),
      name: template.name,
      grams: template.grams,
      kcal: template.kcal,
      protein: template.protein,
      carb: template.carb,
      fat: template.fat,
      is_restaurant: template.is_restaurant,
      item_type: template.item_type,
      item_id: template.item_id,
    })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return toLog(data)
}

export async function deleteLogs(ids: string[]): Promise<void> {
  const { error } = await supabase.from('food_logs').delete().in('id', ids)
  if (error) throw error
}

export async function deleteLog(id: string): Promise<void> {
  const { error } = await supabase.from('food_logs').delete().eq('id', id)
  if (error) throw error
}

// The last good load, shown at once on the next open while fresh data comes in.
const cacheKey = (userId: string) => `saulog-next-kain:${userId}`

export function readCache(userId: string): KainData | null {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(userId)) || 'null') as KainData | null
  } catch {
    return null
  }
}

export function writeCache(userId: string, data: KainData): void {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(data))
  } catch {
    // Storage full or blocked: the app still works, it just loads from the network.
  }
}

export function clearCache(userId: string): void {
  localStorage.removeItem(cacheKey(userId))
}
