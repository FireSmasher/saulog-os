import { useState } from 'react'
import '../styles/move.css'
import { localTime } from '../lib/day'
import { ACTIVITY_KINDS, addActivity, deleteActivity, type ActivityKind, type ActivityLog } from '../lib/activity'
import { CloseIcon } from './Icons'

const LABEL: Record<ActivityKind, string> = { walk: 'Walk', run: 'Run', bike: 'Bike', row: 'Row', stairs: 'Stairs', other: 'Other' }
const QUICK = [10, 20, 30, 45]

type Api = {
  add: typeof addActivity
  remove: typeof deleteActivity
}
const realApi: Api = { add: addActivity, remove: deleteActivity }

// Dev only: ?demo keeps everything in memory. import.meta.env.DEV is false in the build,
// so lib/demo.ts is never shipped.
const DEMO = import.meta.env.DEV && new URLSearchParams(location.search).has('demo')
async function getApi(): Promise<Api> {
  if (!DEMO) return realApi
  const m = await import('../lib/demo')
  return m.demoMove
}

type Props = {
  activity: ActivityLog[]
  steps: number | null // today's steps from Apple Health, if any
  today: string
  onChange: (rows: ActivityLog[]) => void
  onToast: (text: string, action?: { label: string; run: () => void }) => void
}

// Digits (and one dot for km) only, so the number pad never leaves junk in the field.
const clean = (v: string, decimal: boolean) => {
  const t = v.replace(decimal ? /[^0-9.,]/g : /[^0-9]/g, '').replace(',', '.')
  return decimal ? t.replace(/^(\d*\.?\d*).*$/, '$1') : t
}

export function Move({ activity, steps, today, onChange, onToast }: Props) {
  const [kind, setKind] = useState<ActivityKind>('walk')
  const [minutes, setMinutes] = useState('')
  const [km, setKm] = useState('')
  const [busy, setBusy] = useState(false)

  const mins = Number(minutes)
  const ready = mins > 0 && mins <= 1440
  const todays = activity.filter((a) => a.date === today)

  async function log() {
    if (!ready || busy) return
    setBusy(true)
    const distance = Number(km) > 0 ? Number(km) : null
    try {
      const api = await getApi()
      const saved = await api.add({ date: today, time: localTime(), kind, minutes: mins, distance_km: distance })
      const rows = [...activity, saved]
      onChange(rows)
      setMinutes('')
      setKm('')
      onToast(`${LABEL[kind]} ${mins} min logged`, {
        label: 'Undo',
        run: () => {
          onChange(rows.filter((r) => r.id !== saved.id))
          void api.remove(saved.id).catch(() => {
            onChange(rows)
            onToast('Could not undo. Check your connection.')
          })
        },
      })
    } catch {
      onToast('Not saved. Check your connection and tap again.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(a: ActivityLog) {
    onChange(activity.filter((r) => r.id !== a.id))
    try {
      await (await getApi()).remove(a.id)
    } catch {
      onChange(activity)
      onToast('Could not delete. Check your connection.')
    }
  }

  return (
    <section className="glass card move" aria-label="Move">
      <h2 className="card-title">Move</h2>
      <div className="move-kinds" role="group" aria-label="Kind">
        {ACTIVITY_KINDS.map((k) => (
          <button key={k} className={k === kind ? 'move-chip on' : 'move-chip'} aria-pressed={k === kind} onClick={() => setKind(k)}>
            {LABEL[k]}
          </button>
        ))}
      </div>
      <div className="move-quick" role="group" aria-label="Quick minutes">
        {QUICK.map((q) => (
          <button key={q} className={String(q) === minutes ? 'move-chip on' : 'move-chip'} onClick={() => setMinutes(String(q))}>
            {q}
          </button>
        ))}
      </div>
      <div className="move-row">
        <label className="move-field">
          <input
            aria-label="Minutes"
            inputMode="numeric"
            pattern="[0-9]*"
            enterKeyHint="done"
            placeholder="0"
            value={minutes}
            onChange={(e) => setMinutes(clean(e.target.value, false))}
          />
          <small>min</small>
        </label>
        <label className="move-field">
          <input
            aria-label="Kilometres, optional"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            enterKeyHint="done"
            placeholder="0"
            value={km}
            onChange={(e) => setKm(clean(e.target.value, true))}
          />
          <small>km</small>
        </label>
        <button className="btn move-log" disabled={!ready || busy} onClick={log}>
          Log
        </button>
      </div>
      {todays.length > 0 && (
        <ul className="move-list">
          {todays.map((a) => (
            <li key={a.id}>
              <span className="move-what">{LABEL[a.kind]}</span>
              <span className="move-num">
                {a.minutes ?? 0} min{a.distance_km ? ` · ${a.distance_km} km` : ''}
              </span>
              <button className="move-x" aria-label={`Delete ${LABEL[a.kind]} ${a.minutes ?? 0} minutes`} onClick={() => void remove(a)}>
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      {steps != null && steps > 0 && <p className="small muted move-steps">Steps today: {steps.toLocaleString('en-GB')}</p>}
    </section>
  )
}
