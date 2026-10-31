import { useEffect, useState } from 'react'
import { disablePush, enablePush, pushState, savedRemindAt, type PushState } from '../lib/push'

const TIMES = ['12:00', '14:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00']

// One reminder a day, only if nothing is logged by then. Never more.
export function Reminder() {
  const [state, setState] = useState<PushState | null>(null)
  const [time, setTime] = useState(savedRemindAt)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    void pushState().then(setState).catch(() => setState('unsupported'))
  }, [])

  async function turnOn(at = time) {
    setBusy(true)
    setNote('')
    try {
      setState(await enablePush(at))
    } catch {
      setNote('The server part is not set up yet. It starts working once the setup paste is done.')
    } finally {
      setBusy(false)
    }
  }

  async function turnOff() {
    setBusy(true)
    try {
      await disablePush()
      setState('off')
    } finally {
      setBusy(false)
    }
  }

  if (!state || state === 'unsupported') return null
  return (
    <section className="glass card reminder" aria-label="Daily reminder">
      <h2 className="card-title">Daily reminder</h2>
      {state === 'needs-home-screen' && (
        <p className="small muted">To get a reminder, open this page in Safari, tap Share, then Add to Home Screen, and open it from there.</p>
      )}
      {state === 'blocked' && <p className="small muted">Notifications are off. Turn them on in iPhone Settings, Notifications, Saulog OS.</p>}
      {(state === 'off' || state === 'on') && (
        <>
          <p className="small muted">
            {state === 'on' ? `On at ${time}. ` : ''}One nudge a day, only if nothing is logged by then.
          </p>
          <div className="reminder-row">
            <select
              value={time}
              aria-label="Reminder time"
              onChange={(e) => {
                setTime(e.target.value)
                if (state === 'on') void turnOn(e.target.value)
              }}
            >
              {TIMES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            {state === 'on' ? (
              <button className="btn btn-quiet" disabled={busy} onClick={turnOff}>
                Turn off
              </button>
            ) : (
              <button className="btn" disabled={busy} onClick={() => void turnOn()}>
                Turn on
              </button>
            )}
          </div>
        </>
      )}
      {note && <p className="small muted">{note}</p>}
    </section>
  )
}
