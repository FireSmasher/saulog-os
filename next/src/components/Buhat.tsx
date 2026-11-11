import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import '../styles/buhat.css'
import { localDate } from '../lib/day'
import {
  exerciseState,
  fmtKg,
  GUIDE,
  groupWords,
  isBest,
  sameExercise,
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
  saveSets: (row: WorkoutRow | null, split: string, exercise: string, sets: WSet[], date: string) => Promise<WorkoutRow | null>
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

// Typed numbers: comma or point, iOS shows the number pad (decimal for kg, digits for reps).
export function parseNum(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'))
  return text.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null
}

function NumField({ label, value, decimal, onChange }: { label: string; value: number; decimal: boolean; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(String(value))
  }, [value])
  return (
    <input
      className="num-field"
      aria-label={label}
      inputMode={decimal ? 'decimal' : 'numeric'}
      pattern={decimal ? '[0-9]*[.,]?[0-9]*' : '[0-9]*'}
      enterKeyHint="done"
      value={text}
      onFocus={(e) => {
        focused.current = true
        e.currentTarget.select()
      }}
      onBlur={() => {
        focused.current = false
        setText(String(value))
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      onChange={(e) => {
        setText(e.target.value)
        const n = parseNum(e.target.value)
        if (n !== null && (decimal || (Number.isInteger(n) && n > 0))) onChange(Math.round(n * 100) / 100)
      }}
    />
  )
}

function Stepper({ label, unit, value, decimal, onStep, onSet }: {
  label: string
  unit: string
  value: number
  decimal: boolean
  onStep: (dir: -1 | 1) => void
  onSet: (n: number) => void
}) {
  return (
    <div className="set-stepper">
      <button aria-label={`Less ${label}`} onClick={() => onStep(-1)}>
        <MinusIcon />
      </button>
      <label className="num-wrap">
        <NumField label={label} value={value} decimal={decimal} onChange={onSet} />
        <small>{unit}</small>
      </label>
      <button aria-label={`More ${label}`} onClick={() => onStep(1)}>
        <PlusIcon />
      </button>
    </div>
  )
}

type Draft = { w: string; r: string }
const draftOf = (sets: WSet[]): Draft[] => sets.map((x) => ({ w: String(x.weight), r: String(x.reps) }))

// Log by hand: any exercise, any day, any number of sets. An exercise already logged
// that day opens with its sets so a wrong one can be fixed.
function ManualSheet({ rows, names, start, today, onClose, onSave }: {
  rows: WorkoutRow[]
  names: string[]
  start: { name: string; date: string }
  today: string
  onClose: () => void
  onSave: (row: WorkoutRow | null, exercise: string, sets: WSet[], date: string) => Promise<boolean>
}) {
  const [name, setName] = useState(start.name)
  const [date, setDate] = useState(start.date)
  const [sets, setSets] = useState<Draft[]>([{ w: '', r: '' }])
  const [busy, setBusy] = useState(false)
  const existing = useMemo(
    () => (name.trim() ? rows.filter((r) => r.date === date && sameExercise({ ex: name, sets: '', cue: '' }, r.exercise)).at(-1) ?? null : null),
    [rows, name, date],
  )
  const loaded = useRef<string | null>(null)
  useEffect(() => {
    if (existing && loaded.current !== existing.id) {
      loaded.current = existing.id
      setSets(draftOf(existing.sets))
    } else if (!existing && loaded.current) {
      loaded.current = null
      setSets([{ w: '', r: '' }])
    }
  }, [existing])

  const parsed = sets.map((d) => ({ weight: parseNum(d.w), reps: parseNum(d.r) }))
  const filled = parsed.filter((p) => p.weight !== null || p.reps !== null)
  const bad = filled.some((p) => p.weight === null || p.reps === null || !Number.isInteger(p.reps) || p.reps < 1)
  const clean: WSet[] = filled.filter(() => !bad).map((p) => ({ weight: p.weight!, reps: p.reps! }))
  const canSave = !busy && name.trim() !== '' && !bad && (clean.length > 0 || existing !== null)

  function put(i: number, field: keyof Draft, v: string) {
    setSets((xs) => xs.map((x, j) => (j === i ? { ...x, [field]: v } : x)))
  }

  async function save() {
    if (!canSave) return
    setBusy(true)
    const ok = await onSave(existing, existing?.exercise ?? name.trim(), clean, date)
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet manual-sheet" role="dialog" aria-label="Log by hand" onClick={(e) => e.stopPropagation()}>
        <span className="sheet-grip" />
        <h2 className="sheet-title">Log by hand</h2>
        <label className="field manual-full">
          Exercise
          <input list="buhat-names" value={name} placeholder="DB Bench Press" autoCapitalize="words" onChange={(e) => setName(e.target.value)} />
          <datalist id="buhat-names">
            {names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
        <label className="field manual-full">
          Day
          <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        {existing && <span className="small muted manual-full">Already logged that day: {setsLabel(existing.sets)}. Saving replaces it.</span>}
        <div className="manual-sets manual-full">
          {sets.map((d, i) => (
            <div className="manual-set" key={i}>
              <span className="small muted">Set {i + 1}</span>
              <label className="manual-num">
                <input aria-label={`Set ${i + 1} kg`} inputMode="decimal" placeholder="kg" value={d.w} onChange={(e) => put(i, 'w', e.target.value)} />
                <small>kg</small>
              </label>
              <span className="muted">×</span>
              <label className="manual-num">
                <input aria-label={`Set ${i + 1} reps`} inputMode="numeric" pattern="[0-9]*" placeholder="reps" value={d.r} onChange={(e) => put(i, 'r', e.target.value)} />
                <small>reps</small>
              </label>
              <button className="manual-x" aria-label={`Remove set ${i + 1}`} onClick={() => setSets((xs) => xs.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
          <button
            className="way manual-add"
            onClick={() => setSets((xs) => [...xs, { w: xs.at(-1)?.w ?? '', r: '' }])}
          >
            + Add set
          </button>
        </div>
        {bad && <span className="small muted manual-full">Each set needs kg and whole reps.</span>}
        <button className="btn sheet-btn" disabled={!canSave} onClick={() => void save()}>
          {busy ? 'Saving' : existing && !clean.length ? 'Remove this exercise' : 'Save'}
        </button>
        <button className="link-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
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
  const [manual, setManual] = useState<{ name: string; date: string } | null>(null)
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
    const step = field === 'weight' ? (shown.weight >= 40 ? 2.5 : shown.weight < 10 ? 0.5 : 1) : 1
    setEdit({ ...shown, [field]: Math.max(field === 'weight' ? 0 : 1, Math.round((shown[field] + dir * step) * 10) / 10) })
  }

  function setTo(field: 'weight' | 'reps', n: number) {
    if (!shown) return
    setEdit({ ...shown, [field]: n })
  }

  // Today's rows that are not in this session's plan (a swap, an extra), shown under the list.
  const extras = useMemo(
    () => (rows ? rows.filter((x) => x.date === today && x.sets.length && !GUIDE[split].some((it) => sameExercise(it, x.exercise))) : []),
    [rows, today, split],
  )
  const names = useMemo(() => {
    const all = [...Object.values(GUIDE).flatMap((g) => g.flatMap((it) => [it.ex, ...(it.alt ?? [])])), ...(rows ?? []).map((x) => x.exercise)]
    const seen = new Map<string, string>()
    for (const n of all) if (!seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n)
    return [...seen.values()].sort((a, b) => a.localeCompare(b))
  }, [rows])

  async function saveManual(row: WorkoutRow | null, exercise: string, sets: WSet[], date: string): Promise<boolean> {
    if (!rows) return false
    const daySplit = row?.split ?? rows.find((x) => x.date === date && ORDER.includes(x.split as SplitName))?.split ?? split
    try {
      const saved = await api.saveSets(row, daySplit, exercise, sets, date)
      const next = row ? (saved ? rows.map((x) => (x.id === saved.id ? saved : x)) : rows.filter((x) => x.id !== row.id)) : saved ? [...rows, saved] : rows
      setRows(next)
      api.writeCache(next)
      setEdit(null)
      setEditing(false)
      if (saved && kain && !kain.workoutDays.includes(date)) {
        const k = { ...kain, workoutDays: [...kain.workoutDays, date] }
        api.writeKain(k)
        setKain(k)
      }
      onToast(saved ? `Saved ${exercise} ${setsLabel(saved.sets)}` : `Removed ${exercise}`)
      return true
    } catch {
      onToast('Not saved. Check your connection and try again.')
      return false
    }
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
              <Stepper label="weight" unit="kg" decimal value={shown.weight} onStep={(d) => change('weight', d)} onSet={(n) => setTo('weight', n)} />
              <Stepper label="reps" unit="reps" decimal={false} value={shown.reps} onStep={(d) => change('reps', d)} onSet={(n) => setTo('reps', n)} />
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
                } else setManual({ name: s.row?.exercise ?? s.item.ex, date: today })
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
          {extras.map((x) => (
            <button key={x.id} className="ex-row" onClick={() => setManual({ name: x.exercise, date: today })}>
              <span className="ex-dot done">
                <CheckIcon />
              </span>
              <span className="ex-text">
                <span className="food-name">{x.exercise}</span>
                <span className="food-sub">Also today · {setsLabel(x.sets)}</span>
              </span>
            </button>
          ))}
        </section>
      )}
      {rows && (
        <button className="way manual-open" onClick={() => setManual({ name: '', date: today })}>
          <PlusIcon /> Log by hand
        </button>
      )}
      {rows && manual && (
        <ManualSheet rows={rows} names={names} start={manual} today={today} onClose={() => setManual(null)} onSave={saveManual} />
      )}
      {footer}
    </>
  )
}
