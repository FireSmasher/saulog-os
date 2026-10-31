// Dev only (npm run dev, then add ?demo to the address): made-up rows so the screen can be
// checked without signing in. App.tsx imports this behind import.meta.env.DEV, so it never
// ships in the built app.
import { addDays, localDate, localTime, type FoodLog } from './day'
import type { KainApi } from '../components/Kain'
import type { KainData } from './food'
import { toRow } from './plate'
import { summarise } from './rewards'

const FOODS: Record<string, [number, number, number, number, number]> = {
  // name: grams, kcal, protein, carb, fat
  'Oats, rolled': [60, 228, 8, 39, 4],
  Skyr: [250, 158, 28, 10, 0.5],
  'Chicken breast': [200, 330, 62, 0, 7],
  'Rice, cooked': [250, 325, 6, 70, 1],
  Broccoli: [150, 51, 4, 7, 0.6],
  'Eggs, whole': [120, 172, 15, 1, 12],
  'Whey shake': [35, 135, 27, 3, 2],
}

let n = 0
function row(date: string, time: string, name: string): FoodLog {
  const [grams, kcal, protein, carb, fat] = FOODS[name]
  return {
    id: `demo-${n++}`, date, time, name, grams, kcal, protein, carb, fat,
    is_restaurant: false, item_type: 'food', item_id: name,
  }
}

function build(today: string): KainData {
  const history: FoodLog[] = []
  const loggedDates: string[] = []
  for (let i = 42; i >= 1; i--) {
    if (i === 13) continue // one missed day, so the streak is 12
    const d = addDays(today, -i)
    loggedDates.push(d)
    history.push(row(d, '08:10', 'Oats, rolled'), row(d, '08:12', 'Skyr'))
    history.push(row(d, i % 3 ? '13:05' : '12:50', 'Chicken breast'), row(d, '13:06', 'Rice, cooked'))
    if (i % 2) history.push(row(d, '13:07', 'Broccoli'))
    history.push(row(d, '19:40', 'Eggs, whole'), row(d, '21:00', 'Whey shake'))
  }
  history.push(row(today, '08:05', 'Oats, rolled'), row(today, '08:06', 'Skyr'))
  void loggedDates
  return { today, history, days: summarise(history), restDays: [], workoutDays: [], targets: { kcal: 2000, protein: 160 }, savedAt: Date.now() }
}

export const demoApi: KainApi = {
  load: async (today) => build(today || localDate()),
  logAgain: async (t, today) => ({ ...t, id: `demo-${n++}`, date: today, time: localTime() }),
  deleteLog: async () => {},
  deleteLogs: async () => {},
  markRestDay: async () => {},
  saveMeal: async (items, date, time) =>
    items.map((i) => ({
      ...toRow(i, date, time), id: `demo-${n++}`, item_type: 'food', item_id: i.name,
    })),
  readCache: () => null,
  writeCache: () => {},
}
