import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bestCount, exerciseState, GUIDE, groupWords, isBest, parseTarget, setsLabel, todaySplit, workedToday, type WorkoutRow } from './buhat.ts'

let n = 0
const row = (date: string, split: string, exercise: string, sets: [number, number][], time = '18:00'): WorkoutRow => ({
  id: String(n++), date, time, split, exercise, sets: sets.map(([weight, reps]) => ({ weight, reps })),
})

test('targets', () => {
  assert.deepEqual(parseTarget('3 x 8-10'), { sets: 3, lo: 8, hi: 10, perSide: false })
  assert.deepEqual(parseTarget('2 x 12-15 /side'), { sets: 2, lo: 12, hi: 15, perSide: true })
  assert.deepEqual(parseTarget('3 x 8'), { sets: 3, lo: 8, hi: 8, perSide: false })
})

test('sessions run in order and resume', () => {
  assert.equal(todaySplit([], '2026-11-02'), 'Full Body')
  assert.equal(todaySplit([row('2026-11-02', 'Full Body', 'Leg Press', [[80, 10]])], '2026-11-04'), 'Upper')
  assert.equal(todaySplit([row('2026-11-04', 'Upper', 'Cable Curl', [[20, 10]]), row('2026-11-02', 'Full Body', 'Leg Press', [[80, 10]])], '2026-11-06'), 'Lower')
  assert.equal(todaySplit([row('2026-11-06', 'Lower', 'Leg Press', [[80, 10]])], '2026-11-08'), 'Full Body')
  assert.equal(todaySplit([row('2026-11-08', 'Upper', 'Cable Curl', [[20, 10]])], '2026-11-08'), 'Upper') // started today
  assert.equal(todaySplit([row('2026-10-30', 'Push', 'Bench', [[40, 8]])], '2026-11-02'), 'Full Body') // old splits
})

test('next set: repeat last time, or add weight after hitting the top on every set', () => {
  const lp = GUIDE['Full Body'][0] // Leg Press 3 x 8-10
  const a = exerciseState(lp, [row('2026-10-30', 'Full Body', 'Leg Press', [[80, 10], [80, 9], [80, 9]])], '2026-11-02')
  assert.deepEqual(a.next, { weight: 80, reps: 10 })
  const b = exerciseState(lp, [row('2026-10-30', 'Full Body', 'Leg Press', [[80, 10], [80, 10], [80, 10]])], '2026-11-02')
  assert.deepEqual(b.next, { weight: 85, reps: 8 })
  const bench = GUIDE.Upper[0]
  assert.deepEqual(exerciseState(bench, [], '2026-11-02').next, { weight: 40, reps: 8 }) // from the cue
  const c = exerciseState(lp, [row('2026-11-02', 'Full Body', 'Leg Press', [[80, 10], [80, 10], [80, 9]])], '2026-11-02')
  assert.equal(c.complete, true)
  assert.equal(c.next, null)
})

test('last time prefers the same session type', () => {
  const lower = GUIDE.Lower[0]
  const rows = [row('2026-10-28', 'Lower', 'Leg Press', [[90, 12]]), row('2026-10-30', 'Full Body', 'Leg Press', [[80, 10]])]
  assert.equal(exerciseState(lower, rows, '2026-11-02', 'Lower').last[0].weight, 90)
  assert.equal(exerciseState(lower, rows, '2026-11-02').last[0].weight, 80)
})

test('alternative names count as the same exercise', () => {
  const pull = GUIDE['Full Body'][2]
  const s = exerciseState(pull, [row('2026-10-30', 'Full Body', 'One-Arm Lat Pulldown Machine', [[35, 12]])], '2026-11-02')
  assert.equal(s.last.length, 1)
})

test('true bests only', () => {
  const lp = GUIDE['Full Body'][0]
  const hist = [row('2026-10-30', 'Full Body', 'Leg Press', [[80, 10]])]
  assert.equal(isBest(hist, lp, { weight: 80, reps: 10 }), false)
  assert.equal(isBest(hist, lp, { weight: 80, reps: 11 }), true)
  assert.equal(isBest([], lp, { weight: 80, reps: 10 }), false) // first time is not a best
  assert.equal(bestCount([...hist, row('2026-11-02', 'Full Body', 'Leg Press', [[80, 11], [80, 10], [85, 10]])]), 2)
})

test('muscles worked and labels', () => {
  const w = workedToday(['Leg Press', 'Cable Fly'])
  assert.ok(w.main.has('quadriceps') && w.main.has('chest'))
  assert.ok(w.helper.has('deltoids') && !w.helper.has('chest'))
  assert.equal(groupWords(w.main), 'Chest · Legs')
  assert.equal(setsLabel([{ weight: 80, reps: 10 }, { weight: 80, reps: 9 }]), '80 kg × 10, 9')
})
