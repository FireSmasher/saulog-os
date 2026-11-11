import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays } from './day.ts'
import { gain, levelFor, moveXp, rewards, summarise, type DaySummary } from './rewards.ts'

const day = (date: string, protein = 100): DaySummary => ({ date, slots: { lunch: 5 }, protein })
const run = (start: string, n: number, skip: number[] = []) =>
  Array.from({ length: n }, (_, i) => addDays(start, i)).filter((_, i) => !skip.includes(i)).map((d) => day(d))

test('levels cost 125 x level', () => {
  assert.deepEqual(levelFor(0), { level: 1, into: 0, cost: 125 })
  assert.deepEqual(levelFor(124), { level: 1, into: 124, cost: 125 })
  assert.deepEqual(levelFor(125), { level: 2, into: 0, cost: 250 })
  assert.deepEqual(levelFor(750 + 340), { level: 4, into: 340, cost: 500 })
})

test('summarise counts foods per meal', () => {
  const s = summarise([
    { date: '2026-10-31', time: '08:00', protein: 10 },
    { date: '2026-10-31', time: '08:01', protein: 20 },
    { date: '2026-10-31', time: '13:00', protein: 5 },
  ])
  assert.deepEqual(s, [{ date: '2026-10-31', slots: { breakfast: 2, lunch: 1 }, protein: 35 }])
})

test('streak counts days, today pending does not break it', () => {
  const r = rewards({ days: run('2026-10-20', 11), today: '2026-10-31', proteinTarget: 160 })
  assert.equal(r.streak, 11)
  assert.equal(r.todayCounts, false)
})

test('a freeze covers one missed day by itself, then it is used up', () => {
  // 7 days earns a freeze, day 8 missed (covered), days 9-10 logged
  const r = rewards({ days: run('2026-10-01', 10, [7]), today: '2026-10-10', proteinTarget: 160 })
  assert.equal(r.streak, 9)
  assert.equal(r.freezes, 0)
  assert.ok(r.frozen.has('2026-10-08'))
  // two missed in a row with one freeze: the second breaks it
  const b = rewards({ days: run('2026-10-01', 12, [7, 8]), today: '2026-10-12', proteinTarget: 160 })
  assert.equal(b.streak, 3)
  assert.equal(b.best, 7)
})

test('freezes cap at 2 and rest days count', () => {
  const r = rewards({ days: run('2026-09-01', 30), today: '2026-09-30', proteinTarget: 160 })
  assert.equal(r.freezes, 2)
  const rest = rewards({ days: run('2026-10-01', 3, [1]), restDays: new Set(['2026-10-02']), today: '2026-10-03', proteinTarget: 160 })
  assert.equal(rest.streak, 3)
})

test('XP: 10 per meal + 1 per food (max 5), protein +10, 7-day bonus +50', () => {
  const one = rewards({ days: [day('2026-10-31', 170)], today: '2026-10-31', proteinTarget: 160 })
  assert.equal(one.xp, 15 + 10)
  const week = rewards({ days: run('2026-10-01', 7), today: '2026-10-07', proteinTarget: 160 })
  assert.equal(week.xp, 7 * 15 + 50)
})

test('gain reports what one save changed', () => {
  const days = run('2026-10-01', 6)
  const before = rewards({ days, today: '2026-10-07', proteinTarget: 160 })
  const after = rewards({ days: [...days, day('2026-10-07')], today: '2026-10-07', proteinTarget: 160 })
  const g = gain(before, after)
  assert.equal(g.xp, 15 + 50)
  assert.equal(g.dayNowSafe, true)
  assert.equal(g.milestone, 7)
  assert.equal(g.freezeEarned, true)
  assert.equal(g.streak, 7)
})

test('an activity day counts for the streak like a food day', () => {
  const act = new Map([['2026-10-02', { minutes: 20, steps: 0 }]])
  const r = rewards({ days: [day('2026-10-01'), day('2026-10-03')], activity: act, today: '2026-10-03', proteinTarget: 160 })
  assert.equal(r.streak, 3)
  const only = rewards({ days: [], activity: act, today: '2026-10-02', proteinTarget: 160 })
  assert.equal(only.streak, 1)
  assert.equal(only.todayCounts, true)
})

test('move XP: max(minutes / 2, steps / 500), floored, capped at 30', () => {
  assert.equal(moveXp(undefined), 0)
  assert.equal(moveXp({ minutes: 25, steps: 0 }), 12)
  assert.equal(moveXp({ minutes: 10, steps: 6420 }), 12)
  assert.equal(moveXp({ minutes: 0, steps: 499 }), 0)
  assert.equal(moveXp({ minutes: 120, steps: 0 }), 30)
  assert.equal(moveXp({ minutes: 0, steps: 30000 }), 30)
  const r = rewards({ days: [], activity: new Map([['2026-10-01', { minutes: 40, steps: 0 }]]), today: '2026-10-01', proteinTarget: 160 })
  assert.equal(r.xp, 20)
})

test('steps give XP on a logged day but never keep a streak alone', () => {
  const base = { days: [], workoutDays: new Set(['2026-11-10']), today: '2026-11-11', proteinTarget: 160 }
  const plain = rewards(base)
  const withSteps = rewards({ ...base, steps: new Map([['2026-11-10', 8000], ['2026-11-11', 9000]]) })
  assert.equal(withSteps.xp - plain.xp, 16) // 8000 / 500 on the workout day; today has no log
  assert.equal(withSteps.todayCounts, false)
})
