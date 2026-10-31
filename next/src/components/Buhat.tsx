import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import '../styles/buhat.css'
import { localDate } from '../lib/day'
import {
  exerciseState,
  fmtKg,
  GUIDE,
  groupWords,
  isBest,
  ORDER,
  restSeconds,
  setsLabel,
  todaySplit,
  workedToday,
  type SplitName,
  type WorkoutRow,
  type WSet,
} from '../lib/buhat'
import type { KainData } from '../lib/food'
import { gain as gainOf } from '../lib/rewards'
import { rewardsOf, type ToastAction } from './Kain'
import { BodyMap } from './BodyMap'
import { CheckIcon, FlameIcon, MedalIcon, MinusIcon, PlusIcon } from './Icons'

export type BuhatApi = {
  load: () => Promise<WorkoutRow[]>
  saveSet: (row: WorkoutRow | null, split: string, exercise: string, set: WSet, date: string) => Promise<WorkoutRow>
  removeLastSet: (row: WorkoutRow) => Promise<WorkoutRow | null>
  readCache: () => WorkoutRow[] | null
  writeCache: (rows: WorkoutRow[]) => void
  readKain: () => KainData | null
  writeKain: (d: KainData) => void
}

type Props = { api: BuhatApi; footer?: ReactNode; onToast: (text: string, action?: ToastAction) => void }

type Rest = { endAt: number; total: number; best: { name: string; set: WSet } | null }
const REST_KEY = 'saulog-next-rest'

function todayLabel(date = new Date()): string {
  return `${date.toLocaleDateString('en-GB', { weekday: 'long' })}, ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`

function Stepper({ label, value, onChange }: { label: string; value: string; onChange: (dir: -1 | 1) => void }) {
  return (
    <div className="set-stepper">
      <button aria-label={`Less ${label}`} onClick={() => onChange(-1)}>
        <MinusIcon />
      </button>
      <span>{value}</span>
      <button aria-label={`More ${label}`} onClick={() => onChange(1)}>
        <PlusIcon />
      </button>
    </div>
  )
}

function RestTimer({ rest, upNext, onAdjust, onSkip, onLogNext }: {
  rest: Rest
  upNext: { label: string; set: WSet } | null
  onAdjust: (s: number) => void
  onSkip: () => void
  onLogNext: () => void
}) {
  const [now, setNow] = useState(Date.now())
  const buzzed = useRef(false)
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [])
  const left = Math.max(0, (rest.endAt - now) / 1000)
  useEffect(() => {
    if (left <= 0 && !buzzed.current) {
      buzzed.current = true
      navigator.vibrate?.([200, 100, 200])
    }
  }, [left])
  const r = 92
  const c = 2 * Math.PI * r
  const frac = rest.total > 0 ? left / rest.total : 0
  return (
    <>
      {rest.best && (
        <div className="best-banner">
          <span className="best-icon">
            <MedalIcon />
          </span>
          <span className="best-text">
            <small>New best</small>
            <strong>
              {rest.best.name} {fmtKg(rest.best.set.weight)} × {rest.best.set.reps}
            </strong>
          </span>
          <span className="best-xp">+25 XP</span>
        </div>
      )}
      <section className="glass rest-card" aria-label="Rest timer">
        <span className="rest-label">{left > 0 ? 'Rest' : 'Rest done. Go'}</span>
        <div className="rest-ring">
          <svg viewBox="0 0 200 200">
            <circle className="rest-track" cx="100" cy="100" r={r} />
            <circle className="rest-arc" cx="100" cy="100" r={r} strokeDasharray={`${frac * c} ${c}`} />
          </svg>
          <span className="rest-time">
            <strong>{mmss(Math.ceil(left))}</strong>
            <small>of {mmss(rest.total)}</small>
          </span>
        </div>
        <div className="rest-actions">
          <button className="way" onClick={() => onAdjust(-15)}>
            −15 s
          </button>
          <button className="way" onClick={() => onAdjust(15)}>
            +15 s
          </button>
          <button className="way" onClick={onSkip}>
            Skip
          </button>
        </div>
      </section>
      {upNext && (
        <section className="glass upnext">
          <div>
            <span className="small muted">Up next · {upNext.label}</span>
            <strong className="upnext-set">
              {fmtKg(upNext.set.weight)} × {upNext.set.reps}
            </strong>
          </div>
          <button className="check-btn accent" aria-label="Log this set" onClick={onLogNext}>
            <CheckIcon />
          </button>
        </section>
      )}
    </>
  )
}

export function Buhat({ api, footer, onToast }: Props) {
  const [rows, setRows] = useState<WorkoutRow[] | null>(() => api.readCache())
  const [error, setError] = useState('')
  const [override, setOverride] = useState<SplitName | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [edit, setEdit] = useState<WSet | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rest, setRest] = useState<Rest | null>(() => {
    try {
      const r = JSON.parse(localStorage.getItem(REST_KEY) || 'null') as Rest | null
      return r && r.endAt > Date.now() - 60_000 ? r : null
    } catch {
      return null
    }
  })
  const [kain, setKain] = useState<KainData | null>(() => api.readKain())
  const today = localDate()

  const refresh = useCallback(async () => {
    try {
      const fresh = await api.load()
      setRows(fresh)
      api.writeCache(fresh)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [api])

  useEffect(() => {
    void refresh()
    const onVisible = () => document.visibilityState === 'visible' && (void refresh(), setKain(api.readKain()))
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh, api])

  useEffect(() => {
    if (rest) localStorage.setItem(REST_KEY, JSON.stringify(rest))
    else localStorage.removeItem(REST_KEY)
  }, [rest])

  const split = override ?? (rows ? todaySplit(rows, today) : 'Full Body')
  const states = useMemo(() => (rows ? GUIDE[split].map((item) => exerciseState(item, rows, today, split)) : []), [rows, split, today])
  const firstOpen = states.findIndex((s) => !s.complete)
  const curIndex = selected !== null && states[selected] && !states[selected].complete ? selected : firstOpen
  const cur = curIndex >= 0 ? states[curIndex] : null
  const shown = edit ?? cur?.next ?? null
  const worked = useMemo(() => workedToday(states.filter((s) => s.done.length).map((s) => s.item.ex)), [states])
  const r = kain ? rewardsOf(kain, today) : null
  const allDone = states.length > 0 && firstOpen === -1
  const setsToday = states.reduce((t, s) => t + s.done.length, 0)
  const nextSplit = ORDER[(ORDER.indexOf(split) + 1) % ORDER.length]

  // The newest set logged today, for Undo.
  const lastToday = useMemo(() => {
    if (!rows) return null
    const t = rows.filter((x) => x.date === today && x.sets.length)
    return t.sort((a, b) => a.time.localeCompare(b.time)).at(-1) ?? null
  }, [rows, today])

  function change(field: 'weight' | 'reps', dir: -1 | 1) {
    if (!shown) return
    const step = field === 'weight' ? (shown.weight >= 40 ? 2.5 : 1) : 1
    setEdit({ ...shown, [field]: Math.max(field === 'weight' ? 0 : 1, Math.round((shown[field] + dir * step) * 10) / 10) })
  }

  async function logSet(set: WSet | null = shown) {
    if (!cur || !set || !rows || saving) return
    setSaving(true)
    const best = isBest(rows, cur.item, set)
    try {
      const saved = await api.saveSet(cur.row, split, cur.row?.exercise ?? cur.item.ex, set, today)
      navigator.vibrate?.(15)
      const next = cur.row ? rows.map((x) => (x.id === saved.id ? saved : x)) : [...rows, saved]
      setRows(next)
      api.writeCache(next)
      setEdit(null)
      setEditing(false)
      // Streak and XP live in Kain's saved day; a workout day counts too.
      if (kain) {
        const before = rewardsOf(kain, today)
        const k = { ...kain, workoutDays: [...new Set([...kain.workoutDays, today])], workoutBests: kain.workoutBests + (best ? 1 : 0) }
        const g = gainOf(before, rewardsOf(k, today))
        api.writeKain(k)
        setKain(k)
        if (g.dayNowSafe && g.streak) onToast(`Workout day · +${g.xp} XP · Day ${g.streak} is safe`)
      }
      const doneNow = saved.sets.length >= cur.target.sets
      const moreLeft = states.some((s, i) => i !== curIndex && !s.complete)
      if (!doneNow || moreLeft || best) {
        const total = restSeconds(cur.target)
        setRest({ endAt: Date.now() + total * 1000, total, best: best ? { name: cur.item.ex, set } : null })
      }
      if (doneNow) setSelected(null)
    } catch {
      onToast('Set not saved. Check your connection and tap again.')
    } finally {
      setSaving(false)
    }
  }

  async function undoLast() {
    if (!lastToday || !rows) return
    try {
      const after = await api.removeLastSet(lastToday)
      const next = after ? rows.map((x) => (x.id === after.id ? after : x)) : rows.filter((x) => x.id !== lastToday.id)
      setRows(next)
      api.writeCache(next)
      setRest(null)
      onToast('Last set removed')
    } catch {
      onToast('Could not undo. Check your connection.')
    }
  }

  const upNext = cur && cur.next ? { label: `set ${cur.done.length + 1} of ${cur.target.sets}`, set: shown ?? cur.next } : null

  return (
    <>
      <header className="header">
        <div>
          <p className="header-date">{todayLabel()}</p>
          <h1 className="header-title">Buhat</h1>
        </div>
        {r && (
          <div className="header-pills">
            <span className={r.streak > 0 ? 'pill pill-reward' : 'pill'}>
              <FlameIcon />
              {r.streak}
            </span>
            <span className="pill">Lv {r.level.level}</span>
          </div>
        )}
      </header>

      <div className="split-chips" role="group" aria-label="Session">
        {ORDER.map((s) => (
          <button
            key={s}
            className={s === split ? 'when-chip on' : 'when-chip'}
            onClick={() => {
              setOverride(s === (rows ? todaySplit(rows, today) : 'Full Body') ? null : s)
              setSelected(null)
              setEdit(null)
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {error && !rows && <section className="glass card small muted">Could not load your workouts: {error}</section>}
      {!rows && !error && <section className="glass card small muted">Loading your workouts</section>}

      {rows && rest ? (
        <RestTimer
          rest={rest}
          upNext={upNext}
          onAdjust={(s) => setRest((x) => x && { ...x, endAt: x.endAt + s * 1000, total: Math.max(15, x.total + s) })}
          onSkip={() => setRest(null)}
          onLogNext={() => {
            setRest(null)
            void logSet()
          }}
        />
      ) : rows && cur && shown ? (
        <section className="next-set" aria-label="Next set">
          <div className="next-set-top">
            <span>
              Next set · {cur.done.length + 1} of {cur.target.sets}
            </span>
            <span>
              {split} · {curIndex + 1} of {states.length}
            </span>
          </div>
          <div className="next-set-main">
            <div className="next-set-text">
              <span className="next-set-name">{cur.item.ex}</span>
              <button className="next-set-big" onClick={() => setEditing((e) => !e)} aria-label="Change weight or reps">
                {fmtKg(shown.weight).replace(' kg', '')}
                <small> kg</small> × {shown.reps}
              </button>
              <span className="next-set-last">
                {cur.last.length ? `Last time ${setsLabel(cur.last)}` : cur.item.cue || cur.nudge}
                {cur.target.perSide ? ' · each side' : ''}
              </span>
            </div>
            <button className="check-btn" aria-label="Log this set" disabled={saving} onClick={() => void logSet()}>
              <CheckIcon />
            </button>
          </div>
          {editing && (
            <div className="next-set-edit">
              <Stepper label="weight" value={fmtKg(shown.weight)} onChange={(d) => change('weight', d)} />
              <Stepper label="reps" value={`${shown.reps} reps`} onChange={(d) => change('reps', d)} />
            </div>
          )}
          {!editing && cur.nudge && cur.last.length > 0 && <span className="next-set-nudge">{cur.nudge}</span>}
        </section>
      ) : rows && allDone ? (
        <section className="next-set done" aria-label="Session done">
          <div className="next-set-top">
            <span>Done for today</span>
            <span>{setsToday} sets</span>
          </div>
          <span className="next-set-name">{split} is in the book</span>
          <span className="next-set-last">Next time: {nextSplit}</span>
        </section>
      ) : null}

      {rows && lastToday && !rest && (
        <button className="link-btn undo-set" onClick={undoLast}>
          Undo last set ({lastToday.exercise} {fmtKg(lastToday.sets.at(-1)!.weight)} × {lastToday.sets.at(-1)!.reps})
        </button>
      )}

      {rows && (
        <section className="glass card worked" aria-label="Worked today">
          <div className="worked-head">
            <h2 className="card-title">Worked today</h2>
            <span className="small muted">{groupWords(worked.main) || 'Nothing yet'}</span>
          </div>
          <BodyMap main={worked.main} helper={worked.helper} />
          <div className="legend">
            <span><i className="lg-main" /> Main</span>
            <span><i className="lg-helper" /> Helper</span>
            <span><i className="lg-rest" /> Rest</span>
          </div>
        </section>
      )}

      {rows && (
        <section className="glass ex-list" aria-label={`${split} exercises`}>
          {states.map((s, i) => (
            <button
              key={s.item.ex + i}
              className={i === curIndex && !rest ? 'ex-row current' : 'ex-row'}
              onClick={() => {
                if (!s.complete) {
                  setSelected(i)
                  setEdit(null)
                  setRest(null)
                }
              }}
            >
              <span className={s.complete ? 'ex-dot done' : i === curIndex ? 'ex-dot now' : 'ex-dot'}>{s.complete && <CheckIcon />}</span>
              <span className="ex-text">
                <span className="food-name">{s.item.ex}</span>
                <span className="food-sub">
                  {s.done.length
                    ? s.complete
                      ? setsLabel(s.done)
                      : `Set ${s.done.length + 1} of ${s.target.sets} · ${setsLabel(s.done)}`
                    : i === curIndex
                      ? `Set 1 of ${s.target.sets}`
                      : s.item.sets.replace(' x ', ' × ')}
                </span>
              </span>
            </button>
          ))}
        </section>
      )}
      {footer}
    </>
  )
}
