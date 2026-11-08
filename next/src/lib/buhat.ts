// Buhat (phase 5): pure logic. The guide, which session is next, the pre-filled next set,
// true bests, and which muscles worked. Tested by `npm test`.

export type WSet = { weight: number; reps: number }
export type WorkoutRow = { id: string; date: string; time: string; split: string; exercise: string; sets: WSet[] }

export type SplitName = 'Full Body' | 'Upper' | 'Lower'
export type GuideItem = { ex: string; alt?: string[]; sets: string; cue: string }

// Nippard block 2, Full Body / Upper / Lower, from 2 Nov 2026. Copied from the old app's
// WORKOUT_GUIDE (app.js); source of truth is Nippard/02_TRAINING/CURRENT BLOCK.md.
// Update all three together.
export const GUIDE: Record<SplitName, GuideItem[]> = {
  'Full Body': [
    { ex: 'Leg Press', sets: '3 x 8-10', cue: 'Legs first, every Full Body day' },
    { ex: 'Low-Incline DB Press', alt: ['DB Bench Press'], sets: '3 x 8-10', cue: 'Bench at 30 degrees' },
    { ex: 'One-Arm Lat Pulldown', alt: ['One-Arm Lat Pulldown Machine'], sets: '3 x 10-12 /side', cue: '' },
    { ex: 'Cable Fly', sets: '2 x 12-15', cue: 'Pair A: fly, then the lateral raise, rest 60-90 s' },
    { ex: 'Single-Arm Cable Lateral Raise', sets: '2 x 12-15 /side', cue: 'Pair B with the fly, stay strict' },
    { ex: 'Seated Leg Curl', sets: '2 x 12-15', cue: 'Seated, never lying' },
  ],
  Upper: [
    { ex: 'Barbell Bench Press', sets: '3 x 8', cue: '40 kg, 2 reps short of failure, stop at any back pain' },
    { ex: 'Seated Cable Row', alt: ['Seated Pulley'], sets: '3 x 10-12', cue: '' },
    { ex: 'Single-Arm Cable Lateral Raise', sets: '2 x 12-15 /side', cue: 'Stay strict' },
    { ex: 'Overhead Cable Tricep Extension', alt: ['Tricep Extension'], sets: '2 x 10-12', cue: 'Pair A: triceps, then the curl, rest 60-90 s' },
    { ex: 'Cable Curl', alt: ['Cable curls'], sets: '2 x 10-12', cue: 'Pair B with the triceps' },
  ],
  Lower: [
    { ex: 'Leg Press', sets: '3 x 10-12', cue: '' },
    { ex: 'Leg Extension', sets: '3 x 12-15', cue: 'Recline the seat. Pair A: extension, then the curl' },
    { ex: 'Seated Leg Curl', sets: '3 x 12-15', cue: 'Pair B with the extension, seated never lying' },
    { ex: 'Standing Calf Raise', sets: '3 x 15-20', cue: 'Pause at the bottom. Pair A: calves, then abduction' },
    { ex: 'Hip Abduction', alt: ['Abduction'], sets: '2 x 12-15', cue: 'Pair B with the calves' },
  ],
}
export const ORDER: SplitName[] = ['Full Body', 'Upper', 'Lower']

export type Target = { sets: number; lo: number; hi: number; perSide: boolean }

export function parseTarget(s: string): Target {
  const m = s.match(/(\d+)\s*x\s*(\d+)(?:\s*-\s*(\d+))?/)
  const sets = m ? Number(m[1]) : 3
  const lo = m ? Number(m[2]) : 8
  const hi = m && m[3] ? Number(m[3]) : lo
  return { sets, lo, hi, perSide: /side/.test(s) }
}

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function sameExercise(item: GuideItem, name: string): boolean {
  const k = key(name)
  return [item.ex, ...(item.alt ?? [])].some((n) => key(n) === k)
}

// Run the sessions in order and resume where he left off; never pick by preference.
// Today already started: stay on that session. Otherwise the one after the last done.
export function todaySplit(rows: WorkoutRow[], today: string): SplitName {
  const todays = rows.filter((r) => r.date === today && ORDER.includes(r.split as SplitName))
  if (todays.length) return todays[todays.length - 1].split as SplitName
  const past = rows
    .filter((r) => r.date < today && ORDER.includes(r.split as SplitName))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const last = past[past.length - 1]
  if (!last) return 'Full Body'
  return ORDER[(ORDER.indexOf(last.split as SplitName) + 1) % ORDER.length]
}

export const e1rm = (s: WSet) => s.weight * (1 + s.reps / 30)

export function setsLabel(sets: WSet[]): string {
  if (!sets.length) return ''
  const w = sets.every((s) => s.weight === sets[0].weight)
  return w ? `${fmtKg(sets[0].weight)} × ${sets.map((s) => s.reps).join(', ')}` : sets.map((s) => `${fmtKg(s.weight)} × ${s.reps}`).join(', ')
}

export const fmtKg = (w: number) => `${Number.isInteger(w) ? w : Math.round(w * 10) / 10} kg`

export type ExerciseState = {
  item: GuideItem
  target: Target
  row: WorkoutRow | null // today's row for this exercise
  done: WSet[]
  last: WSet[] // the last session's sets before today
  complete: boolean
  next: WSet | null // pre-filled next set (null when complete)
  nudge: string // why the pre-fill is what it is, in plain words
}

// Double progression: when every set last time reached the top of the range, add
// weight and go back to the bottom of the range. Otherwise repeat last time's set.
export function exerciseState(item: GuideItem, rows: WorkoutRow[], today: string, split?: string): ExerciseState {
  const target = parseTarget(item.sets)
  const mine = rows.filter((r) => sameExercise(item, r.exercise))
  const row = mine.filter((r) => r.date === today).sort((a, b) => a.time.localeCompare(b.time)).at(-1) ?? null
  const done = row?.sets ?? []
  // Same session type first (Leg Press is 8-10 on Full Body days, 10-12 on Lower days).
  const past = mine.filter((r) => r.date < today && r.sets.length).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const lastRow = (split ? past.filter((r) => r.split === split).at(-1) : undefined) ?? past.at(-1)
  const last = lastRow?.sets ?? []
  const complete = done.length >= target.sets
  let next: WSet | null = null
  let nudge = ''
  if (!complete) {
    const i = done.length
    if (done.length) {
      next = { ...done[done.length - 1] }
      nudge = 'Same as your last set'
    } else if (last.length) {
      const allTop = last.length >= target.sets && last.slice(0, target.sets).every((s) => s.reps >= target.hi)
      if (allTop) {
        const step = last[0].weight >= 40 ? 5 : 2.5
        next = { weight: last[0].weight + step, reps: target.lo }
        nudge = `Up ${step} kg: you hit ${target.hi} on every set last time`
      } else {
        next = { ...(last[i] ?? last[last.length - 1]) }
        nudge = 'Same as last time. Beat it by one rep if you can'
      }
    } else {
      const cueKg = item.cue.match(/(\d+(?:\.\d+)?)\s*kg/)
      next = { weight: cueKg ? Number(cueKg[1]) : 20, reps: target.lo }
      nudge = cueKg ? 'Weight from the plan' : 'First time: pick a weight you can do cleanly'
    }
  }
  return { item, target, row, done, last, complete, next, nudge }
}

// A true best: more estimated strength than every earlier set of this exercise ever.
// The first time doing an exercise is not a best (nothing to beat).
export function isBest(rows: WorkoutRow[], item: GuideItem, set: WSet, excludeRowSets: WSet[] = []): boolean {
  const earlier = rows.filter((r) => sameExercise(item, r.exercise)).flatMap((r) => r.sets)
  const pool = [...earlier, ...excludeRowSets]
  if (!pool.length) return false
  return e1rm(set) > Math.max(...pool.map(e1rm)) + 1e-9
}

// Count of best sets in his whole history, for XP (+25 each). A set counts when it beats
// every earlier set of the same exercise.
export function bestCount(rows: WorkoutRow[]): number {
  const sorted = [...rows].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  const top = new Map<string, number>()
  let n = 0
  for (const r of sorted) {
    const k = key(r.exercise)
    for (const s of r.sets) {
      if (!(s.weight > 0 && s.reps > 0)) continue
      const v = e1rm(s)
      const prev = top.get(k)
      if (prev !== undefined && v > prev + 1e-9) n++
      if (prev === undefined || v > prev) top.set(k, v)
    }
  }
  return n
}

export function restSeconds(t: Target): number {
  return t.lo >= 12 ? 90 : 135
}

// ---------- Muscles ----------

export type Muscle =
  | 'chest' | 'deltoids' | 'triceps' | 'biceps' | 'forearm' | 'upper-back' | 'trapezius' | 'lower-back'
  | 'abs' | 'obliques' | 'quadriceps' | 'hamstring' | 'gluteal' | 'adductors' | 'calves' | 'tibialis'

type Work = { main: Muscle[]; helper: Muscle[] }

// Hand-made for his block (checked against standard exercise anatomy). Anything else falls
// back to keywords in the name.
const MAP: Record<string, Work> = {
  'leg press': { main: ['quadriceps', 'gluteal'], helper: ['adductors', 'hamstring'] },
  'low incline db press': { main: ['chest'], helper: ['deltoids', 'triceps'] },
  'db bench press': { main: ['chest'], helper: ['deltoids', 'triceps'] },
  'one arm lat pulldown': { main: ['upper-back'], helper: ['biceps', 'forearm'] },
  'one arm lat pulldown machine': { main: ['upper-back'], helper: ['biceps', 'forearm'] },
  'cable fly': { main: ['chest'], helper: ['deltoids'] },
  'seated leg curl': { main: ['hamstring'], helper: ['calves'] },
  'single arm cable lateral raise': { main: ['deltoids'], helper: ['trapezius'] },
  'barbell bench press': { main: ['chest'], helper: ['triceps', 'deltoids'] },
  'seated db overhead press': { main: ['deltoids'], helper: ['triceps', 'trapezius'] },
  'seated cable row': { main: ['upper-back'], helper: ['biceps', 'trapezius', 'forearm'] },
  'seated pulley': { main: ['upper-back'], helper: ['biceps', 'trapezius', 'forearm'] },
  't bar row': { main: ['upper-back', 'trapezius'], helper: ['biceps', 'lower-back'] },
  'lever row': { main: ['upper-back', 'trapezius'], helper: ['biceps', 'lower-back'] },
  'overhead cable tricep extension': { main: ['triceps'], helper: [] },
  'tricep extension': { main: ['triceps'], helper: [] },
  'cable curl': { main: ['biceps'], helper: ['forearm'] },
  'cable curls': { main: ['biceps'], helper: ['forearm'] },
  'leg extension': { main: ['quadriceps'], helper: [] },
  'standing calf raise': { main: ['calves'], helper: [] },
  'hip abduction': { main: ['gluteal'], helper: [] },
  abduction: { main: ['gluteal'], helper: [] },
}

const WORDS: [RegExp, Work][] = [
  [/bench|chest|fly|push ?up|dip/, { main: ['chest'], helper: ['triceps', 'deltoids'] }],
  [/overhead press|shoulder press|lateral|raise|delt/, { main: ['deltoids'], helper: ['triceps'] }],
  [/row|pulldown|pull ?up|chin/, { main: ['upper-back'], helper: ['biceps'] }],
  [/curl/, { main: ['biceps'], helper: ['forearm'] }],
  [/tricep|pushdown|skull/, { main: ['triceps'], helper: [] }],
  [/squat|leg press|lunge/, { main: ['quadriceps', 'gluteal'], helper: ['hamstring'] }],
  [/deadlift|rdl|hip thrust/, { main: ['hamstring', 'gluteal'], helper: ['lower-back'] }],
  [/calf/, { main: ['calves'], helper: [] }],
  [/crunch|plank|ab/, { main: ['abs'], helper: ['obliques'] }],
]

export function musclesFor(exercise: string): Work {
  const k = key(exercise)
  if (MAP[k]) return MAP[k]
  return WORDS.find(([re]) => re.test(k))?.[1] ?? { main: [], helper: [] }
}

// Today's map: main beats helper when an exercise trains a muscle and another only helps.
export function workedToday(exercises: string[]): { main: Set<Muscle>; helper: Set<Muscle> } {
  const main = new Set<Muscle>()
  const helper = new Set<Muscle>()
  for (const e of exercises) {
    const w = musclesFor(e)
    w.main.forEach((m) => main.add(m))
    w.helper.forEach((m) => helper.add(m))
  }
  main.forEach((m) => helper.delete(m))
  return { main, helper }
}

export function groupWords(main: Set<Muscle>): string {
  const g: [string, Muscle[]][] = [
    ['Chest', ['chest']],
    ['Shoulders', ['deltoids']],
    ['Back', ['upper-back', 'trapezius', 'lower-back']],
    ['Arms', ['biceps', 'triceps', 'forearm']],
    ['Core', ['abs', 'obliques']],
    ['Legs', ['quadriceps', 'hamstring', 'gluteal', 'adductors', 'calves', 'tibialis']],
  ]
  return g.filter(([, ms]) => ms.some((m) => main.has(m))).map(([w]) => w).join(' · ')
}
