import { supabase, loadTargets, type Targets } from './supabase'
import { addDays, localTime, type FoodLog } from './day'
import { summarise, type DaySummary } from './rewards'

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

// Every day he ever logged, as a small summary (meals, foods, protein) for the streak
// and XP. Only three short columns, paged 1,000 rows at a time.
async function loadAllDays(today: string): Promise<DaySummary[]> {
  const rows: { date: string; time: string; protein: number }[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('food_logs')
      .select('date, time, protein')
      .lte('date', today)
      .order('date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    for (const r of data ?? []) rows.push({ date: String(r.date), time: String(r.time).slice(0, 5), protein: Number(r.protein) })
    if (!data || data.length < PAGE) break
  }
  return summarise(rows)
}

// Rest or sick days he marked. Table day_marks comes from supabase/next-setup.sql; until it
// exists the marks live on this phone only.
const LOCAL_REST = 'saulog-next-rest-days'
const localRest = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_REST) || '[]') as string[]
  } catch {
    return []
  }
}

async function loadRestDays(): Promise<string[]> {
  const { data, error } = await supabase.from('day_marks').select('date').eq('kind', 'rest')
  if (error) return localRest()
  return [...new Set([...localRest(), ...(data ?? []).map((r) => String(r.date))])]
}

export async function markRestDay(date: string): Promise<void> {
  localStorage.setItem(LOCAL_REST, JSON.stringify([...new Set([...localRest(), date])]))
  await supabase.from('day_marks').upsert({ date, kind: 'rest' }, { onConflict: 'user_id,date' })
}

export type KainData = {
  today: string
  history: FoodLog[]
  days: DaySummary[] // all time, for streak and XP
  restDays: string[]
  workoutDays: string[] // filled by Buhat (phase 5)
  targets: Targets | null
  savedAt: number
}

export async function loadKain(today: string): Promise<KainData> {
  const [history, days, restDays, targets, workoutDays] = await Promise.all([
    loadHistory(today),
    loadAllDays(today),
    loadRestDays(),
    loadTargets(),
    loadWorkoutDays(today),
  ])
  return { today, history, days, restDays, workoutDays, targets, savedAt: Date.now() }
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

// Days with at least one set logged (workout_logs, written by the old app and Buhat).
async function loadWorkoutDays(today: string): Promise<string[]> {
  const dates = new Set<string>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('workout_logs').select('date').lte('date', today).order('date').range(from, from + PAGE - 1)
    if (error) return [...dates]
    for (const r of data ?? []) dates.add(String(r.date))
    if (!data || data.length < PAGE) break
  }
  return [...dates]
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
    const d = JSON.parse(localStorage.getItem(cacheKey(userId)) || 'null') as KainData | null
    return d && Array.isArray(d.days) && Array.isArray(d.workoutDays) ? d : null // older cache shape: reload
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
