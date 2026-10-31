// Supabase Edge Function: push-daily (Saulog OS next, phase 6).
// Called every 15 minutes by pg_cron (supabase/next-cron.sql). For each phone that turned
// the reminder on: once his local time passes the reminder time, if he has logged no
// food today, send ONE push. Never more than one a day; nothing at all if he logged.
//
// Deploy: dashboard > Edge Functions > Deploy a new function > Via Editor, name
// "push-daily", paste this file, then on its Details page turn "Enforce JWT verification"
// OFF (the cron job proves itself with CRON_SECRET instead).
// Secrets (Edge Functions > Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET,
// from next/.secrets/push.env on the Mac. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// provided by Supabase itself.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

const SUBJECT = 'https://firesmasher.github.io/saulog-os/next/'

type Sub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; remind_at: string; tz: string; last_sent_on: string | null }

function localNow(tz: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}` }
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('no', { status: 401 })

  const pub = Deno.env.get('VAPID_PUBLIC_KEY')
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!pub || !priv) return new Response('VAPID keys missing', { status: 503 })
  webpush.setVapidDetails(SUBJECT, pub, priv)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const { data: subs, error } = await db.from('push_subscriptions').select('*')
  if (error) return new Response(error.message, { status: 500 })

  const report: string[] = []
  for (const s of (subs ?? []) as Sub[]) {
    const now = localNow(s.tz || 'Europe/Berlin')
    if (s.last_sent_on === now.date) continue
    const late = minutes(now.time) - minutes(s.remind_at.slice(0, 5))
    if (late < 0 || late > 180) continue // only in the 3 hours after his time

    const { count } = await db
      .from('food_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', s.user_id)
      .eq('date', now.date)
    await db.from('push_subscriptions').update({ last_sent_on: now.date }).eq('id', s.id)
    if ((count ?? 0) > 0) {
      report.push(`${s.id}: logged already`)
      continue
    }
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: 'Kain', body: 'Nothing logged yet today. One photo keeps your streak going.', url: './' }),
        { TTL: 3 * 3600, urgency: 'normal' },
      )
      report.push(`${s.id}: sent`)
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('id', s.id) // phone unsubscribed
      report.push(`${s.id}: failed ${code ?? String(e)}`)
    }
  }
  return new Response(JSON.stringify({ checked: subs?.length ?? 0, report }), { headers: { 'Content-Type': 'application/json' } })
})
