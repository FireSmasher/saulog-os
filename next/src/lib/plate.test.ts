import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  barcodeVariants,
  findBarcode,
  foodsFromHistory,
  itemFromSaid,
  itemNumbers,
  parseSpoken,
  plateTotals,
  search,
  toRow,
  type Food,
} from './plate.ts'
import type { FoodLog } from './day.ts'

const lib: Food[] = [
  { name: 'Chicken breast, raw', kcal: 165, protein: 31, carb: 0, fat: 3.6 },
  { name: 'Chicken thigh, raw, skinless', kcal: 179, protein: 24, carb: 0, fat: 8.5 },
  { name: 'Oats, rolled', kcal: 380, protein: 13, carb: 60, fat: 7 },
  { name: 'Egg, whole, raw', kcal: 143, protein: 12.6, carb: 0.7, fat: 9.5 },
  { name: 'Skyr natur (Arla)', kcal: 63, protein: 11, carb: 4, fat: 0.2, barcode: '4000000000001' },
]

test('spoken grams: units, order, pieces', () => {
  assert.deepEqual(parseSpoken('200 grams chicken breast, 60 g oats and two eggs'), [
    { name: 'chicken breast', grams: 200, gramsGuess: false },
    { name: 'oats', grams: 60, gramsGuess: false },
    { name: 'eggs', grams: 120, gramsGuess: true },
  ])
  assert.deepEqual(parseSpoken('rice 250g'), [{ name: 'rice', grams: 250, gramsGuess: false }])
  assert.deepEqual(parseSpoken('half a kilo of skyr'), [{ name: 'skyr', grams: 500, gramsGuess: false }])
  assert.deepEqual(parseSpoken('two hundred grams of greek yogurt'), [{ name: 'greek yogurt', grams: 200, gramsGuess: false }])
  assert.deepEqual(parseSpoken('1,5 kg potatoes'), [{ name: 'potatoes', grams: 1500, gramsGuess: false }])
  assert.deepEqual(parseSpoken('300 ml milk'), [{ name: 'milk', grams: 300, gramsGuess: false }])
  assert.deepEqual(parseSpoken('a spoon of olive oil'), [{ name: 'olive oil', grams: 15, gramsGuess: false }])
  assert.deepEqual(parseSpoken('2 tsp honey'), [{ name: 'honey', grams: 10, gramsGuess: false }])
  assert.deepEqual(parseSpoken('one scoop whey'), [{ name: 'whey', grams: 30, gramsGuess: false }])
  assert.deepEqual(parseSpoken('a banana'), [{ name: 'banana', grams: 120, gramsGuess: true }])
})

test('search: every word must match, his foods first', () => {
  assert.equal(search(lib, 'chicken')[0].name, 'Chicken breast, raw')
  assert.equal(search(lib, 'eggs')[0].name, 'Egg, whole, raw')
  assert.equal(search(lib, 'chicken oats').length, 0)
  const mine: Food[] = [...lib, { name: 'Chicken thigh fillet', kcal: 180, protein: 25, carb: 0, fat: 9, mine: 6 }]
  assert.equal(search(mine, 'chicken')[0].name, 'Chicken thigh fillet')
})

test('said items match the library and keep his grams', () => {
  const i = itemFromSaid(lib, { name: 'chicken breast', grams: 200, gramsGuess: false })
  assert.equal(i.name, 'Chicken breast, raw')
  assert.deepEqual(itemNumbers(i), { kcal: 330, protein: 62, carb: 0, fat: 7.2 })
  const u = itemFromSaid(lib, { name: 'zzz unknown', grams: 50, gramsGuess: false })
  assert.equal(u.unmatched, true)
})

test('barcode variants and lookup', () => {
  assert.deepEqual(barcodeVariants('012345678905'), ['012345678905', '0012345678905'])
  assert.equal(findBarcode(lib, '4000000000001')?.name, 'Skyr natur (Arla)')
  assert.equal(findBarcode(lib, '999'), null)
})

test('history becomes his foods with per 100 g values', () => {
  const rows: FoodLog[] = [
    { id: '1', date: '2026-10-29', time: '08:00', name: 'Skyr', grams: 250, kcal: 158, protein: 28, carb: 10, fat: 0.5, is_restaurant: false, item_type: 'food', item_id: 'x' },
    { id: '2', date: '2026-10-30', time: '08:00', name: 'skyr', grams: 500, kcal: 316, protein: 56, carb: 20, fat: 1, is_restaurant: false, item_type: 'food', item_id: '4000000000001' },
  ]
  const f = foodsFromHistory(rows)
  assert.equal(f.length, 1)
  assert.equal(f[0].mine, 2)
  assert.equal(f[0].lastGrams, 500)
  assert.equal(f[0].kcal, 63.2)
  assert.equal(f[0].barcode, '4000000000001')
})

test('plate totals and the food_logs row', () => {
  const a = itemFromSaid(lib, { name: 'oats', grams: 60, gramsGuess: false })
  const b = itemFromSaid(lib, { name: 'chicken breast', grams: 100, gramsGuess: false })
  const t = plateTotals([a, b])
  assert.equal(Math.round(t.kcal), 393)
  const row = toRow(a, '2026-10-31', '08:00')
  assert.equal(row.kcal, 228)
  assert.equal(row.notes, 'saulog-next: said')
  assert.equal(row.item_type, 'food')
})
