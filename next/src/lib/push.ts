// Push reminder (phase 6): one a day, at the time he picks, only if nothing is logged yet.
// The phone subscribes here; the Edge Function push-daily decides and sends.
// iPhone rule: web push only works from the Home Screen app (iOS 16.4+).
import { supabase } from './supabase'

// Public half of the VAPID key pair. The private half is only in Supabase secrets.
export const VAPID_PUBLIC_KEY = 'BNlWwayKCYwijQU0wQpnviR8YfIalVXq0tED_Sr-NHrI5qV0u1DIAJg7_TuXI8gjbxxbFgQpvc6SZlL_0ZaYQdE'

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export type PushState = 'on' | 'off' | 'blocked' | 'needs-home-screen' | 'unsupported'

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return isStandalone() ? 'unsupported' : 'needs-home-screen'
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// Must be called from inside a tap (the permission prompt needs it).
export async function enablePush(remindAt: string): Promise<PushState> {
  if (!pushSupported()) return isStandalone() ? 'unsupported' : 'needs-home-screen'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off'
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }))
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      remind_at: remindAt,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin',
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
  localStorage.setItem('saulog-next-remind-at', remindAt)
  return 'on'
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
}

export const savedRemindAt = () => localStorage.getItem('saulog-next-remind-at') || '20:00'
