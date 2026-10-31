// Pure logic for logging a meal: the food library, search, the spoken-grams parser and
// the plate maths. No network, no React, tested by `npm test`.
import type { FoodLog } from './day'

export type Per100 = { kcal: number; protein: number; carb: number; fat: number }

export type Food = Per100 & {
  name: string
  barcode?: string
  mine?: number // how many days he logged it in the history window (0 = library only)
  lastGrams?: number
}

export type Source = 'said' | 'photo' | 'barcode' | 'search' | 'typed'

export type PlateItem = {
  key: string
  name: string
  grams: number
  per100: Per100
  source: Source
  // true when a number is not from him: grams guessed from the photo, or nutrition
  // estimated by the AI because no food in his library matched.
  gramsGuess: boolean
  nutritionGuess: boolean
  barcode?: string
  unmatched?: boolean // no nutrition at all yet: he has to pick a food
}

const round1 = (n: number) => Math.round(n * 10) / 10

// ---------- Library ----------

// data/foods.json rows: [name, kcal, protein, carb, fat, barcode] per 100 g.
export type LibraryRow = [string, number, number, number, number, string]

export function libraryFromRows(rows: LibraryRow[]): Food[] {
  return rows.map(([name, kcal, protein, carb, fat, barcode]) => ({
    name, kcal, protein, carb, fat, ...(barcode ? { barcode } : {}),
  }))
}

// His own foods, from his past rows: nutrition per 100 g worked back from what he logged.
export function foodsFromHistory(history: FoodLog[]): Food[] {
  const byName = new Map<string, { latest: FoodLog; days: Set<string> }>()
  for (const l of history) {
    if (!(l.grams > 0)) continue
    const key = norm(l.name)
    if (!key) continue
    const cur = byName.get(key)
    if (!cur) byName.set(key, { latest: l, days: new Set([l.date]) })
    else {
      cur.days.add(l.date)
      if (l.date + l.time > cur.latest.date + cur.latest.time) cur.latest = l
    }
  }
  return [...byName.values()].map(({ latest: l, days }) => ({
    name: l.name,
    kcal: round1((l.kcal / l.grams) * 100),
    protein: round1((l.protein / l.grams) * 100),
    carb: round1((l.carb / l.grams) * 100),
    fat: round1((l.fat / l.grams) * 100),
    mine: days.size,
    lastGrams: l.grams,
    ...(l.item_id && /^\d{8,14}$/.test(l.item_id) ? { barcode: l.item_id } : {}),
  }))
}

export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9% ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Plural to singular, enough for food words ("eggs" -> "egg", "berries" -> "berry").
function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.length > 4 && w.endsWith('oes')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

const STOP = new Set(['of', 'the', 'a', 'an', 'some', 'with', 'and', 'my', 'i', 'had', 'ate', 'about', 'around', 'like'])

function words(s: string): string[] {
  return norm(s).split(' ').filter((w) => w && !STOP.has(w)).map(stem)
}

// Every query word must appear in the name (start of a word counts more). His own
// foods rank first, then shorter names, so "chicken" finds his usual chicken breast.
export function search(foods: Food[], query: string, limit = 12): Food[] {
  const q = words(query)
  if (!q.length) return []
  const scored: { f: Food; s: number }[] = []
  for (const f of foods) {
    const w = words(f.name)
    let s = 0
    let ok = true
    for (const t of q) {
      if (w.includes(t)) s += 3
      else if (w.some((x) => x.startsWith(t))) s += 2
      else if (t.length >= 4 && w.some((x) => x.includes(t))) s += 1
      else {
        ok = false
        break
      }
    }
    if (!ok) continue
    if (f.mine) s += 4 + Math.min(f.mine, 10) / 2
    s -= Math.max(0, w.length - q.length) * 0.35
    scored.push({ f, s })
  }
  return scored.sort((a, b) => b.s - a.s || a.f.name.length - b.f.name.length).slice(0, limit).map((x) => x.f)
}

export function bestMatch(foods: Food[], name: string): Food | null {
  return search(foods, name, 1)[0] ?? null
}

// Scanners report the same product as UPC-A (12 digits) or EAN-13 with a leading 0.
export function barcodeVariants(code: string): string[] {
  const c = code.trim()
  const out = [c]
  if (c.length === 12) out.push('0' + c)
  if (c.length === 13 && c.startsWith('0')) out.push(c.slice(1))
  return out
}

export function findBarcode(foods: Food[], code: string): Food | null {
  const v = barcodeVariants(code)
  // His own row first: it carries his usual grams.
  return foods.find((f) => f.mine && f.barcode && v.includes(f.barcode)) ?? foods.find((f) => f.barcode && v.includes(f.barcode)) ?? null
}

// ---------- Spoken grams ----------

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100, half: 0.5,
}

// Typical weight of one piece, for "two eggs" with no grams said.
const PIECE: [RegExp, number][] = [
  [/egg/, 60], [/banana/, 120], [/apple/, 180], [/orange/, 150], [/slice|toast|bread/, 40],
  [/tortilla|wrap/, 60], [/kiwi/, 75], [/bar\b|protein bar/, 50], [/scoop|whey|shake/, 30],
  [/croissant/, 60], [/bagel/, 95], [/date/, 8], [/clementine|mandarin/, 70], [/potato/, 170],
]

export type Said = { name: string; grams: number; gramsGuess: boolean }

// "200 grams chicken breast, 60 g oats and two eggs" ->
// [{chicken breast 200}, {oats 60}, {eggs 120 (guess)}]
export function parseSpoken(text: string): Said[] {
  const cleaned = text
    .toLowerCase()
    .replace(/(\d),(\d{3})\b/g, '$1$2') // 1,200 -> 1200
    .replace(/(\d),(\d)/g, '$1.$2') // 1,5 -> 1.5
  const parts = cleaned
    .split(/,|;|\.\s|\n|\band then\b|\bthen\b|\bplus\b|\band\b|\bwith\b|\balso\b/)
    .map((p) => p.trim())
    .filter(Boolean)
  const out: Said[] = []
  for (const part of parts) {
    let rest = ` ${part} `
    let grams: number | null = null
    let pieces: number | null = null
    // number words to digits: "two hundred" -> 200, "a hundred and fifty" handled by split
    rest = rest.replace(/\b(a|an|one|two|three|four|five|six|seven|eight|nine)\s+hundred\b/g, (_m, w: string) => ` ${NUMBER_WORDS[w] * 100} `)
    rest = rest.replace(/\b(half)\s+(a\s+)?(kilo|kg)\b/g, ' 500 g ')
    rest = rest.replace(
      /\b(a|an|one|two|three|four|five|half)\s+(heaped\s+|level\s+)?(tablespoons?|tbsp|spoons?|teaspoons?|tsp|cups?|scoops?)\b/g,
      (_m, w: string, _h: string, u: string) => ` ${NUMBER_WORDS[w]} ${u} `,
    )
    const m = rest.match(
      /(\d+(?:\.\d+)?)\s*(kilograms?|kilos?|kg|grams?|gramm|gr|g|millilit(?:er|re)s?|ml|lit(?:er|re)s?|l|tablespoons?|tbsp|spoons?|teaspoons?|tsp|cups?|scoops?)?\b/,
    )
    if (m) {
      const n = parseFloat(m[1])
      const unit = m[2] ?? ''
      // Kitchen measures: a tablespoon of oil is about 14 g, of most things about 15 g.
      if (/^(tablespoon|tbsp|spoon)/.test(unit)) grams = n * 15
      else if (/^(teaspoon|tsp)/.test(unit)) grams = n * 5
      else if (/^cup/.test(unit)) grams = n * 240
      else if (/^scoop/.test(unit)) grams = n * 30
      else if (/^k/.test(unit)) grams = n * 1000
      else if (/^l|^lit/.test(unit)) grams = n * 1000
      else if (unit) grams = n
      else if (n > 20) grams = n // a bare big number is grams
      else pieces = n
      rest = rest.replace(m[0], ' ')
    } else {
      const w = rest.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|a|an|half)\b/)
      if (w) {
        pieces = NUMBER_WORDS[w[1]]
        rest = rest.replace(w[0], ' ')
      }
    }
    const name = rest
      .replace(/\b(of|the|some|i had|i ate|had|ate|about|around|roughly|like|piece|pieces|portion|portions|grams?)\b/g, ' ')
      .replace(/[^a-z0-9äöüß%' -]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!name || name.length < 2) continue
    if (grams !== null) out.push({ name, grams: Math.round(grams), gramsGuess: false })
    else {
      const per = PIECE.find(([re]) => re.test(name))?.[1]
      const count = pieces ?? 1
      out.push({ name, grams: Math.round(count * (per ?? 100)), gramsGuess: true })
    }
  }
  return out
}

// ---------- Plate maths ----------

let keySeq = 0
export const newKey = () => `p${Date.now().toString(36)}${(keySeq++).toString(36)}`

export function itemFromFood(food: Food, grams: number, source: Source, gramsGuess = false): PlateItem {
  return {
    key: newKey(),
    name: food.name,
    grams,
    per100: { kcal: food.kcal, protein: food.protein, carb: food.carb, fat: food.fat },
    source,
    gramsGuess,
    nutritionGuess: false,
    ...(food.barcode ? { barcode: food.barcode } : {}),
  }
}

export function itemFromSaid(foods: Food[], s: Said): PlateItem {
  const f = bestMatch(foods, s.name)
  if (f) return itemFromFood(f, s.grams, 'said', s.gramsGuess)
  return {
    key: newKey(), name: s.name, grams: s.grams, per100: { kcal: 0, protein: 0, carb: 0, fat: 0 },
    source: 'said', gramsGuess: s.gramsGuess, nutritionGuess: false, unmatched: true,
  }
}

export function itemNumbers(i: PlateItem): Per100 {
  const f = i.grams / 100
  return {
    kcal: round1(i.per100.kcal * f),
    protein: round1(i.per100.protein * f),
    carb: round1(i.per100.carb * f),
    fat: round1(i.per100.fat * f),
  }
}

export function plateTotals(items: PlateItem[]): Per100 {
  return items.reduce(
    (t, i) => {
      const n = itemNumbers(i)
      return { kcal: t.kcal + n.kcal, protein: t.protein + n.protein, carb: t.carb + n.carb, fat: t.fat + n.fat }
    },
    { kcal: 0, protein: 0, carb: 0, fat: 0 },
  )
}

export function sourceNote(i: PlateItem): string {
  const parts: string[] = []
  if (i.source === 'said') parts.push('said')
  if (i.source === 'photo') parts.push('photo')
  if (i.source === 'barcode') parts.push('barcode')
  if (i.source === 'search') parts.push('search')
  if (i.gramsGuess) parts.push('grams guessed')
  if (i.nutritionGuess) parts.push('AI estimate')
  return `saulog-next: ${parts.join(', ')}`
}

// The row that goes into food_logs. Same columns the old app writes.
export function toRow(i: PlateItem, date: string, time: string) {
  const n = itemNumbers(i)
  return {
    date, time, name: i.name, grams: i.grams, notes: sourceNote(i),
    kcal: n.kcal, protein: n.protein, carb: n.carb, fat: n.fat,
    is_restaurant: false, item_type: 'food', item_id: i.barcode ?? norm(i.name),
  }
}
