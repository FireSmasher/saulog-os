// Run: npm test (node's own test runner, Berlin time zone). No packages needed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addDays,
  habits,
  meals,
  nextCard,
  percent,
  slotOf,
  streak,
  usualFoods,
  week,
  type FoodLog,
} from './day.ts'

let n = 0
const log = (date: string, time: string, name = 'Skyr', grams = 250, kcal = 158, protein = 28): FoodLog => ({
  id: String(n++), date, time, name, grams, kcal, protein, carb: 0, fat: 0,
  is_restaurant: false, item_type: 'food', item_id: name,
})

test('meal is decided by the time', () => {
  assert.equal(slotOf('03:59'), 'dinner')
  assert.equal(slotOf('04:00'), 'breakfast')
  assert.equal(slotOf('10:59'), 'breakfast')
  assert.equal(slotOf('11:00'), 'lunch')
  assert.equal(slotOf('15:59'), 'lunch')
  assert.equal(slotOf('16:00'), 'dinner')
})

test('days step over the 25 Oct 2026 clock change', () => {
  assert.equal(addDays('2026-10-26', -1), '2026-10-25')
  assert.equal(addDays('2026-10-25', -1), '2026-10-24')
  assert.equal(addDays('2026-03-29', 1), '2026-03-30')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
})

test('streak counts logged days and survives an unlogged today', () => {
  const days = new Set(['2026-10-28', '2026-10-29', '2026-10-30'])
  assert.equal(streak(days, '2026-10-31'), 3) // today not logged yet
  days.add('2026-10-31')
  assert.equal(streak(days, '2026-10-31'), 4)
  assert.equal(streak(new Set(['2026-10-29']), '2026-10-31'), 0) // yesterday missed
})

test('week runs Monday to Sunday with the right states', () => {
  const dots = week(new Set(['2026-10-26', '2026-10-27', '2026-10-29']), '2026-10-31')
  assert.deepEqual(dots.map((d) => d.date)[0], '2026-10-26')
  assert.deepEqual(
    dots.map((d) => d.state),
    ['done', 'done', 'missed', 'done', 'missed', 'today', 'future'],
  )
})

test('usual meal time is the median first entry, with a fallback', () => {
  const hist = [
    log('2026-10-27', '12:40'), log('2026-10-27', '13:30'),
    log('2026-10-28', '13:00'),
    log('2026-10-29', '13:20'),
    log('2026-10-30', '08:00'),
  ]
  const h = habits(hist, '2026-10-31')
  assert.equal(h.find((x) => x.id === 'lunch')!.usual, '13:00')
  assert.equal(h.find((x) => x.id === 'lunch')!.days, 3)
  assert.equal(h.find((x) => x.id === 'breakfast')!.usual, '08:00') // 1 day only: fallback
})

test('next card: current meal first, then the next, then a snack', () => {
  const hist = habits([], '2026-10-31')
  assert.equal(nextCard([], hist, '12:10').title, 'Log lunch')
  assert.equal(nextCard([log('2026-10-31', '12:30')], hist, '14:00').title, 'Log dinner')
  assert.equal(nextCard([log('2026-10-31', '19:30')], hist, '20:00').title, 'Log a snack')
  assert.equal(nextCard([], hist, '01:30').title, 'Log a snack')
})

test('next card skips a meal he usually skips', () => {
  const hist: FoodLog[] = []
  for (let i = 1; i <= 10; i++) {
    const d = addDays('2026-10-31', -i)
    hist.push(log(d, '13:00'), log(d, '19:00'))
  }
  const h = habits(hist, '2026-10-31')
  assert.equal(nextCard([], h, '08:30').title, 'Log lunch')
})

test('usual foods: most-used grams, at least two days, today left out', () => {
  const hist = [
    log('2026-10-28', '08:00', 'Oats', 60, 228, 8),
    log('2026-10-29', '08:00', 'Oats', 60, 228, 8),
    log('2026-10-30', '08:00', 'Oats', 80, 304, 11),
    log('2026-10-30', '08:01', 'Banana', 120, 107, 1), // one day only
    log('2026-10-31', '08:00', 'Toast', 50, 130, 4), // today
    log('2026-10-28', '13:00', 'Chicken', 200, 330, 62),
    log('2026-10-29', '13:00', 'Chicken', 200, 330, 62),
  ]
  const u = usualFoods(hist, 'breakfast', '2026-10-31')
  assert.deepEqual(u.map((x) => [x.name, x.grams]), [['Oats', 60]])
  assert.equal(u[0].template.kcal, 228)
  assert.equal(usualFoods(hist, null, '2026-10-31').length, 2)
})

test('meals group by time and keep after-midnight food last', () => {
  const m = meals([log('2026-10-31', '00:30', 'Late'), log('2026-10-31', '08:00', 'A'), log('2026-10-31', '20:00', 'B')])
  assert.deepEqual(m.map((x) => x.label), ['Breakfast', 'Dinner'])
  assert.deepEqual(m[1].logs.map((l) => l.name), ['B', 'Late'])
  assert.equal(m[1].totals.kcal, 316)
})

test('percent', () => {
  assert.equal(percent(760, 2000), 38)
  assert.equal(percent(10, 0), 0)
})
