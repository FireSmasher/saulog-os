import { createClient } from '@supabase/supabase-js'

// Same project and key as the old app (config.js). The publishable key is meant to be
// public; Row Level Security in supabase/schema.sql is what keeps each user's rows private.
// Never put a service_role key in this app.
export const SUPABASE_URL = 'https://dmyelqbeifdirjpqvhsl.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_oaRcQ24PWSG56ntbdGBDWg_mIeCcul8'

// This app keeps its own session (storage key below). It never reuses the old app's
// 'sb_session' tokens: Supabase rotates refresh tokens, so sharing one would sign the
// old app out.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'saulog-next-auth',
  },
})

// The old app (same site) remembers the email it signed in with. Reading it only
// fills in the email box; no token is touched.
export function rememberedEmail(): string {
  try {
    const old = JSON.parse(localStorage.getItem('sb_session') || 'null') as { email?: string } | null
    return old?.email ?? ''
  } catch {
    return ''
  }
}

export type Targets = { kcal: number; protein: number }

export async function loadTargets(): Promise<Targets | null> {
  const { data, error } = await supabase.from('targets').select('kcal, protein').limit(1).maybeSingle()
  if (error) throw error
  return data ? { kcal: Number(data.kcal), protein: Number(data.protein) } : null
}

// The signed-in user's id. Every read of a log table filters on it: once friends share a
// crew, the database also returns their rows, and those must never mix into his own.
export async function myId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new Error('Signed out')
  return id
}
