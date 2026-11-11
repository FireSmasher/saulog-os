// Supabase Edge Function: widget (Saulog OS / Apoy). Feeds the Scriptable streak widget.
// GET ?t=<token>. The token is hashed (sha256 hex) and looked up in widget_tokens with the
// service role. Only that person's dates are read. The reply holds numbers only: no names,
// no rows. A wrong or missing token gets an empty 404.
//
// Deploy with JWT verification OFF: dashboard > Edge Functions > Deploy a new function >
// Via Editor, name "widget", paste this file and supabase/functions/_shared/rewards.ts
// (the CLI bundles the import; in the editor paste the shared code in place of the import).
// Then on its Details page turn "Enforce JWT verification" OFF. The widget has no login,
// the token is the proof. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by
// Supabase itself and are never written in this file.
// Keep supabase/functions/_shared/rewards.ts in sync with next/src/lib/rewards.ts.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { addDays, streakOf } from '../_shared/rewards.ts'

const DEFAULT_TZ = 'Europe/Berlin'
const HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' }

function localNow(tz: string): { date: string; hour: number; minute: number } {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date())
  } catch {
    return localNow(DEFAULT_TZ)
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24, minute: Number(get('minute')) }
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const notFound = () => new Response(null, { status: 404 })

Deno.serve(async (req) => {
  if (req.method !== 'GET') return notFound()
  const token = new URL(req.url).searchParams.get('t') ?? ''
  if (!/^[0-9a-f]{64}$/.test(token)) return notFound()

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const { data: row } = await db.from('widget_tokens').select('user_id').eq('token_hash', await sha256Hex(token)).maybeSingle()
  if (!row) return notFound()
  const userId = row.user_id as string

  const { data: settings } = await db.from('user_settings').select('timezone').eq('user_id', userId).maybeSingle()
  const now = localNow((settings?.timezone as string | undefined) || DEFAULT_TZ)

  // Dates only, newest 800 days, paged because the API returns at most 1000 rows a call.
  async function dates(table: string): Promise<Set<string>> {
    const out = new Set<string>()
    const since = addDays(now.date, -800)
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await db
        .from(table)
        .select('date')
        .eq('user_id', userId)
        .gte('date', since)
        .order('date', { ascending: false })
        .range(from, from + 999)
      if (error || !data) break
      for (const r of data) out.add(r.date as string)
      if (data.length < 1000) break
    }
    return out
  }

  const [food, workouts, activity, rest] = await Promise.all([
    dates('food_logs'), dates('workout_logs'), dates('activity_logs'), dates('day_marks'),
  ])
  const r = streakOf({
    loggedDays: food,
    workoutDays: new Set([...workouts, ...activity]),
    restDays: rest,
    today: now.date,
  })

  const hoursLeft = Math.max(0, Math.round(((24 * 60 - (now.hour * 60 + now.minute)) / 60) * 10) / 10)
  const body = {
    streak: r.streak,
    doneToday: r.todayCounts,
    freezes: r.freezes,
    atRisk: !r.todayCounts && r.streak > 0 && now.hour >= 18,
    hoursLeft,
    updatedAt: new Date().toISOString(),
  }
  return new Response(JSON.stringify(body), { status: 200, headers: HEADERS })
})
