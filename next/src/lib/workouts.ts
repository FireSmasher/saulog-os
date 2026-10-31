// Network side of Buhat: every strength row he has (old app and new), and saving a set.
// One row per exercise per day, `sets` = [{weight, reps}], same shape the old app writes.
import { supabase } from './supabase'
import { localTime } from './day'
import { musclesFor, type WorkoutRow, type WSet } from './buhat'

const PAGE = 1000

function toRow(r: Record<string, unknown>): WorkoutRow | null {
  if (!Array.isArray(r.sets)) return null // cardio rows keep an object here
  const sets = (r.sets as Record<string, unknown>[])
    .map((s) => ({ weight: Number(s.weight), reps: Number(s.reps) }))
    .filter((s) => Number.isFinite(s.weight) && s.reps > 0)
  return { id: String(r.id), date: String(r.date), time: String(r.time).slice(0, 5), split: String(r.split), exercise: String(r.exercise), sets }
}

export async function loadWorkouts(): Promise<WorkoutRow[]> {
  const out: WorkoutRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('workout_logs')
      .select('id, date, time, split, exercise, sets')
      .order('date', { ascending: true })
      .order('time', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    for (const r of data ?? []) {
      const w = toRow(r)
      if (w) out.push(w)
    }
    if (!data || data.length < PAGE) return out
  }
}

const MUSCLE_WORD: Record<string, string> = {
  chest: 'Chest', deltoids: 'Shoulders', triceps: 'Triceps', biceps: 'Biceps', 'upper-back': 'Back',
  trapezius: 'Back', quadriceps: 'Quads', hamstring: 'Hamstrings', gluteal: 'Glutes', calves: 'Calves',
}

// Adds the set to today's row for this exercise, or starts the row.
export async function saveSet(row: WorkoutRow | null, split: string, exercise: string, set: WSet, date: string): Promise<WorkoutRow> {
  if (row) {
    const sets = [...row.sets, set]
    const { error } = await supabase.from('workout_logs').update({ sets }).eq('id', row.id)
    if (error) throw error
    return { ...row, sets }
  }
  const main = musclesFor(exercise).main[0]
  const { data, error } = await supabase
    .from('workout_logs')
    .insert({ date, time: localTime(), split, exercise, muscle: main ? MUSCLE_WORD[main] ?? null : null, sets: [set], notes: 'saulog-next' })
    .select('id, date, time, split, exercise, sets')
    .single()
  if (error) throw error
  return toRow(data)!
}

// Undo the last set: shorter list, or the row goes when it was the only set.
export async function removeLastSet(row: WorkoutRow): Promise<WorkoutRow | null> {
  if (row.sets.length <= 1) {
    const { error } = await supabase.from('workout_logs').delete().eq('id', row.id)
    if (error) throw error
    return null
  }
  const sets = row.sets.slice(0, -1)
  const { error } = await supabase.from('workout_logs').update({ sets }).eq('id', row.id)
  if (error) throw error
  return { ...row, sets }
}

const cacheKey = (u: string) => `saulog-next-buhat:${u}`
export const readWorkoutCache = (u: string): WorkoutRow[] | null => {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(u)) || 'null')
  } catch {
    return null
  }
}
export const writeWorkoutCache = (u: string, rows: WorkoutRow[]) => {
  try {
    localStorage.setItem(cacheKey(u), JSON.stringify(rows))
  } catch {
    // storage full: fine
  }
}
