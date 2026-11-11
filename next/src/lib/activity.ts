// Network side of Move: own activity rows (last 42 days), steps from health_logs, add, delete.
import { myId, supabase } from './supabase'
import { addDays } from './day'
import { ACTIVITY_KINDS, type ActivityKind, type ActivityLog } from './types-social'

export { ACTIVITY_KINDS }
export type { ActivityKind, ActivityLog }

const DAYS = 42
const COLUMNS = 'id, user_id, date, time, kind, minutes, distance_km, steps, source, created_at'

function toRow(r: Record<string, unknown>): ActivityLog {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    date: String(r.date),
    time: String(r.time).slice(0, 5),
    kind: r.kind as ActivityKind,
    minutes: num(r.minutes),
    distance_km: num(r.distance_km),
    steps: num(r.steps),
    source: r.source === 'health' ? 'health' : 'manual',
    created_at: String(r.created_at),
  }
}

export async function loadActivity(today: string): Promise<ActivityLog[]> {
  const me = await myId()
  const { data, error } = await supabase
    .from('activity_logs')
    .select(COLUMNS)
    .eq('user_id', me)
    .gte('date', addDays(today, -DAYS))
    .order('date', { ascending: true })
    .order('time', { ascending: true })
  if (error) throw error
  return (data ?? []).map(toRow)
}

// Steps per day from Apple Health (the Shortcut writes health_logs). Own rows only.
export async function loadSteps(today: string): Promise<Record<string, number>> {
  const me = await myId()
  const { data, error } = await supabase
    .from('health_logs')
    .select('date, steps')
    .eq('user_id', me)
    .gte('date', addDays(today, -DAYS))
  if (error) throw error
  const out: Record<string, number> = {}
  for (const r of data ?? []) if (r.steps != null && Number(r.steps) > 0) out[String(r.date)] = Number(r.steps)
  return out
}

export type NewActivity = { date: string; time: string; kind: ActivityKind; minutes: number; distance_km?: number | null }

export async function addActivity(a: NewActivity): Promise<ActivityLog> {
  const { data, error } = await supabase
    .from('activity_logs')
    .insert({ date: a.date, time: a.time, kind: a.kind, minutes: a.minutes, distance_km: a.distance_km ?? null, source: 'manual' })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return toRow(data)
}

export async function deleteActivity(id: string): Promise<void> {
  const { error } = await supabase.from('activity_logs').delete().eq('id', id)
  if (error) throw error
}

const cacheKey = (u: string) => `saulog-next-activity:${u}`
export const readActivityCache = (u: string): ActivityLog[] | null => {
  try {
    const d = JSON.parse(localStorage.getItem(cacheKey(u)) || 'null')
    return Array.isArray(d) ? d : null
  } catch {
    return null
  }
}
export const writeActivityCache = (u: string, rows: ActivityLog[]) => {
  try {
    localStorage.setItem(cacheKey(u), JSON.stringify(rows))
  } catch {
    // storage full: fine
  }
}
