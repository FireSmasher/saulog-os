// Network side of logging a meal: the food library file, live barcode lookup, the AI
// draft (Edge Function food-parse), saving rows and the photo thumbnail.
import { supabase } from './supabase'
import { toLog, COLUMNS } from './food'
import type { FoodLog } from './day'
import {
  bestMatch,
  barcodeVariants,
  libraryFromRows,
  newKey,
  toRow,
  type Food,
  type LibraryRow,
  type PlateItem,
} from './plate'

let library: Promise<Food[]> | null = null

export function loadLibrary(): Promise<Food[]> {
  if (!library) {
    library = fetch(import.meta.env.BASE_URL + 'data/foods.json')
      .then((r) => (r.ok ? (r.json() as Promise<LibraryRow[]>) : []))
      .then(libraryFromRows)
      .catch(() => {
        library = null
        return []
      })
  }
  return library
}

// OpenFoodFacts, only when the code is not in his library.
export async function lookupBarcodeLive(code: string): Promise<Food | null> {
  for (const c of barcodeVariants(code)) {
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(c)}.json?fields=code,product_name,brands,nutriments`,
      )
      if (!res.ok) continue
      const data = await res.json()
      const p = data.product
      if (!p) continue
      const n = p.nutriments ?? {}
      const kcal = n['energy-kcal_100g'] ?? (n.energy_100g != null ? n.energy_100g / 4.184 : null)
      if (kcal == null || n.proteins_100g == null) continue
      const brand = String(p.brands ?? '').split(',')[0].trim()
      let name = String(p.product_name ?? '').trim()
      if (!name) continue
      if (brand && !name.toLowerCase().includes(brand.toLowerCase())) name = `${name} (${brand})`
      const r1 = (x: unknown) => Math.round(Number(x ?? 0) * 10) / 10
      return { name, kcal: r1(kcal), protein: r1(n.proteins_100g), carb: r1(n.carbohydrates_100g), fat: r1(n.fat_100g), barcode: code }
    } catch {
      // offline or blocked: try the next variant, then give up
    }
  }
  return null
}

// ---------- Photo ----------

export type Photo = { ai: string; thumb: Blob; preview: string }

async function drawScaled(file: File, max: number): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas
}

const toBlob = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('photo'))), 'image/jpeg', q))

// A 1024 px copy for the AI and a 320 px thumbnail to keep. The full photo is never stored.
export async function preparePhoto(file: File): Promise<Photo> {
  const big = await drawScaled(file, 1024)
  const ai = big.toDataURL('image/jpeg', 0.8).split(',')[1]
  const small = await drawScaled(file, 320)
  const thumb = await toBlob(small, 0.75)
  return { ai, thumb, preview: URL.createObjectURL(thumb) }
}

// ---------- AI draft ----------

type AiItem = {
  name: string
  grams: number
  grams_said: boolean
  kcal_100g: number
  protein_100g: number
  carb_100g: number
  fat_100g: number
  seen_in_photo: boolean
}

export type AiResult = { items: PlateItem[] } | { error: string }

// Each AI food is matched to his library first (his own numbers win); only foods with no
// match keep the AI's estimate, and are marked as such.
export async function askAi(foods: Food[], photo: Photo | null, transcript: string, onPlate: string[]): Promise<AiResult> {
  const { data, error } = await supabase.functions.invoke('food-parse', {
    body: { image: photo?.ai, transcript, onPlate },
  })
  if (error) {
    let code = 'unreachable'
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx) code = ((await ctx.json()) as { error?: string }).error ?? code
    } catch {
      // keep "unreachable"
    }
    return { error: code }
  }
  const items: PlateItem[] = []
  for (const a of ((data as { items?: AiItem[] })?.items ?? []).filter((x) => x && x.name && x.grams > 0)) {
    const match = bestMatch(foods, a.name)
    const source = a.grams_said ? 'said' : 'photo'
    const usable = match && match.mine // his own food: trust his numbers
    const libraryClose = match && !match.mine && a.kcal_100g > 0 && Math.abs(match.kcal - a.kcal_100g) / a.kcal_100g < 0.35
    const food = usable || libraryClose ? match! : null
    items.push({
      key: newKey(),
      name: food ? food.name : a.name,
      grams: Math.round(a.grams),
      per100: food
        ? { kcal: food.kcal, protein: food.protein, carb: food.carb, fat: food.fat }
        : { kcal: a.kcal_100g, protein: a.protein_100g, carb: a.carb_100g, fat: a.fat_100g },
      source,
      gramsGuess: !a.grams_said,
      nutritionGuess: !food,
      ...(food?.barcode ? { barcode: food.barcode } : {}),
    })
  }
  return { items }
}

// ---------- Save ----------

export async function saveMeal(items: PlateItem[], date: string, time: string, photo: Photo | null): Promise<FoodLog[]> {
  const { data, error } = await supabase.from('food_logs').insert(items.map((i) => toRow(i, date, time))).select(COLUMNS)
  if (error) throw error
  const saved = (data ?? []).map(toLog)
  if (photo) void saveThumb(photo, date, time, saved.map((s) => s.id))
  return saved
}

// Best effort: needs the meal-photos bucket and food_photos table from
// supabase/next-setup.sql. Until those exist this quietly does nothing.
async function saveThumb(photo: Photo, date: string, time: string, logIds: string[]) {
  try {
    const { data: u } = await supabase.auth.getUser()
    if (!u.user) return
    const path = `${u.user.id}/${date}/${time.replace(':', '')}-${Date.now().toString(36)}.jpg`
    const up = await supabase.storage.from('meal-photos').upload(path, photo.thumb, { contentType: 'image/jpeg' })
    if (up.error) return
    await supabase.from('food_photos').insert({ date, time, path, log_ids: logIds })
  } catch {
    // not set up yet
  }
}
