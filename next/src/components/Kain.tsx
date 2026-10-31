import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  addDays,
  SLOTS,
  slotOf,
  fmt,
  gramsLabel,
  habits,
  localDate,
  localTime,
  meals,
  nextCard,
  percent,
  totals,
  usualFoods,
  week,
  type FoodLog,
  type Usual,
  type WeekDot,
} from '../lib/day'
import { HISTORY_DAYS, type KainData } from '../lib/food'
import { gain as gainOf, rewards as rewardsFrom, summarise, type Gain } from '../lib/rewards'
import { JustLogged, Milestone, StreakSheet } from './Rewards'
import type { saveMeal } from '../lib/capture'
import { Capture, type CaptureMode } from './Capture'
import {
  BarcodeIcon,
  CameraIcon,
  CheckIcon,
  ChevronRightIcon,
  FlameIcon,
  MicIcon,
  PlusIcon,
  SearchIcon,
} from './Icons'

export type KainApi = {
  load: (today: string) => Promise<KainData>
  logAgain: (template: FoodLog, today: string) => Promise<FoodLog>
  deleteLog: (id: string) => Promise<void>
  readCache: () => KainData | null
  writeCache: (data: KainData) => void
  saveMeal: typeof saveMeal
  deleteLogs: (ids: string[]) => Promise<void>
  markRestDay: (date: string) => Promise<void>
}

// Streak and XP from all his days: the server summary for old days, his live rows for the
// last six weeks (so a save or an Undo shows at once).
function rewardsOf(d: KainData, today: string) {
  const cutoff = addDays(d.today, -HISTORY_DAYS)
  const days = [...d.days.filter((x) => x.date < cutoff), ...summarise(d.history)]
  return rewardsFrom({
    days,
    workoutDays: new Set(d.workoutDays),
    restDays: new Set(d.restDays),
    today,
    proteinTarget: d.targets?.protein ?? 0,
  })
}

const SEEN = 'saulog-next-milestones'
function firstTime(days: number, date: string): boolean {
  const key = `${days}:${date}`
  const seen = JSON.parse(localStorage.getItem(SEEN) || '[]') as string[]
  if (seen.includes(key)) return false
  localStorage.setItem(SEEN, JSON.stringify([...seen, key].slice(-20)))
  return true
}

type Sheet =
  | { kind: 'logged'; rows: FoodLog[]; gain: Gain }
  | { kind: 'streak' }
  | { kind: 'milestone'; days: number; freezeEarned: boolean }
  | null

export type ToastAction = { label: string; run: () => void }

type Props = {
  api: KainApi
  footer?: ReactNode
  onToast: (text: string, action?: ToastAction) => void
  plusSignal: number // goes up each time the + in the tab bar is tapped
}

function todayLabel(date = new Date()): string {
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' })
  const dayMonth = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${weekday}, ${dayMonth}`
}

// ---------- Pieces ----------

function Ring({ value, done }: { value: number; done: boolean }) {
  const r = 22.5
  const c = 2 * Math.PI * r
  const shown = Math.min(Math.max(value, 0), 100)
  return (
    <div className="ring" aria-hidden="true">
      <svg viewBox="0 0 52 52">
        <circle className="ring-track" cx="26" cy="26" r={r} />
        <circle
          className={done ? 'ring-arc ring-done' : 'ring-arc'}
          cx="26"
          cy="26"
          r={r}
          strokeDasharray={`${(shown / 100) * c} ${c}`}
        />
      </svg>
      <span className="ring-label">{value}%</span>
    </div>
  )
}

function Dot({ dot }: { dot: WeekDot }) {
  return (
    <div className={`dot dot-${dot.state}${dot.isToday ? ' is-today' : ''}`}>
      <span className="dot-mark">{dot.state === 'done' && <CheckIcon />}</span>
      <span className="dot-letter">{dot.letter}</span>
    </div>
  )
}

function UsualChip({ item, onTap }: { item: Usual; onTap: (u: Usual) => void }) {
  return (
    <button className="usual-chip" onClick={() => onTap(item)} aria-label={`Log ${item.name}, ${gramsLabel(item.grams)}`}>
      <span className="usual-name">{item.name}</span>
      <span className="usual-grams">{gramsLabel(item.grams)}</span>
      <span className="usual-plus">
        <PlusIcon />
      </span>
    </button>
  )
}

// ---------- Screen ----------

export function Kain({ api, footer, onToast, plusSignal }: Props) {
  const [data, setData] = useState<KainData | null>(() => api.readCache())
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => new Date())
  const [sheet, setSheet] = useState<Sheet>(null)
  const [afterSheet, setAfterSheet] = useState<Sheet>(null)
  const [capture, setCapture] = useState<{ mode: CaptureMode; file?: File } | null>(() => {
    // Dev only: ?demo&capture=voice opens the capture screen for screenshots.
    const m = import.meta.env.DEV ? new URLSearchParams(location.search).get('capture') : null
    return m ? { mode: m as CaptureMode } : null
  })
  const loading = useRef(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const lastPlus = useRef(plusSignal)

  useEffect(() => {
    if (plusSignal !== lastPlus.current) {
      lastPlus.current = plusSignal
      setCapture({ mode: 'plate' })
    }
  }, [plusSignal])

  // The camera has to open inside the tap itself (iOS rule), so the next-meal card
  // clicks a file input here and the capture screen opens with the photo in hand.
  const openCamera = () => cameraRef.current?.click()

  function applyRows(rows: FoodLog[]): Gain | null {
    if (!data) return null
    const before = rewardsOf(data, today)
    const next = { ...data, history: [...data.history, ...rows] }
    const after = rewardsOf(next, today)
    setData(next)
    api.writeCache(next)
    const g = gainOf(before, after)
    if (g.milestone && firstTime(g.milestone, today)) setAfterSheet({ kind: 'milestone', days: g.milestone, freezeEarned: g.freezeEarned })
    return g
  }

  function logged(rows: FoodLog[]) {
    setCapture(null)
    const g = applyRows(rows)
    if (g) setSheet({ kind: 'logged', rows, gain: g })
  }

  async function undoRows(rows: FoodLog[]) {
    const ids = new Set(rows.map((r) => r.id))
    setData((d) => d && { ...d, history: d.history.filter((l) => !ids.has(l.id)) })
    setAfterSheet(null)
    try {
      await api.deleteLogs([...ids])
    } catch {
      onToast('Could not undo. Check your connection.')
      void refresh()
    }
  }

  function closeSheet() {
    setSheet(afterSheet)
    setAfterSheet(null)
  }

  async function restToday() {
    setSheet(null)
    setData((d) => d && { ...d, restDays: [...new Set([...d.restDays, today])] })
    try {
      await api.markRestDay(today)
    } catch {
      // kept on this phone
    }
    onToast('Rest day saved. Your streak is safe today.')
  }



  const today = localDate(now)

  const refresh = useCallback(async () => {
    if (loading.current) return
    loading.current = true
    try {
      const fresh = await api.load(localDate())
      setData(fresh)
      setError('')
      api.writeCache(fresh)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      loading.current = false
    }
  }, [api])

  // Load on open, again whenever he comes back to the app, and keep the clock current
  // so the next-meal card and "today" roll over on their own.
  useEffect(() => {
    void refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setNow(new Date())
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    const tick = window.setInterval(() => setNow(new Date()), 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(tick)
    }
  }, [refresh])

  // Dev only: ?demo&sheet=logged|milestone|streak opens a reward screen for screenshots.
  const devSheet = useRef(import.meta.env.DEV ? new URLSearchParams(location.search).get('sheet') : null)
  useEffect(() => {
    if (!devSheet.current || !data) return
    const k = devSheet.current
    devSheet.current = null
    const rows = data.history.filter((l) => l.date === data.today)
    const g: Gain = { xp: 15, levelUp: null, dayNowSafe: true, streak: 13, milestone: null, freezeEarned: false }
    if (k === 'logged') setSheet({ kind: 'logged', rows, gain: g })
    if (k === 'milestone') setSheet({ kind: 'milestone', days: 7, freezeEarned: true })
    if (k === 'streak') setSheet({ kind: 'streak' })
  }, [data])

  // A cached day from yesterday is not today's: refetch when the date moves on.
  useEffect(() => {
    if (data && data.today !== today) void refresh()
  }, [data, today, refresh])

  const view = useMemo(() => {
    if (!data) return null
    const history = data.history
    const todayLogs = history.filter((l) => l.date === today)
    const r = rewardsOf(data, today)
    const dates = new Set([...data.days.map((d) => d.date), ...data.restDays, ...data.workoutDays])
    for (const l of history) dates.add(l.date)
    if (!todayLogs.length && !data.restDays.includes(today) && !data.workoutDays.includes(today)) dates.delete(today)
    const hist = habits(history, today)
    const card = nextCard(todayLogs, hist, localTime(now))
    return {
      eaten: totals(todayLogs),
      meals: meals(todayLogs),
      rewards: r,
      streak: r.streak,
      loggedToday: r.todayCounts,
      week: week(dates, today, r.frozen),
      card,
      hist,
      usual: usualFoods(history, card.slot, today),
    }
  }, [data, today, now])

  // One tap: the row shows at once, the save runs behind it, Undo removes it again.
  async function tapUsual(u: Usual) {
    if (!data) return
    const tempId = `temp-${Date.now()}`
    const temp: FoodLog = { ...u.template, id: tempId, date: today, time: localTime() }
    setData((d) => d && { ...d, history: [...d.history, temp] })
    try {
      const saved = await api.logAgain(u.template, today)
      const before = rewardsOf({ ...data }, today)
      const next = { ...data, history: [...data.history, saved] }
      const after = rewardsOf(next, today)
      setData((d) => {
        if (!d) return d
        const n = { ...d, history: d.history.map((l) => (l.id === tempId ? saved : l)) }
        api.writeCache(n)
        return n
      })
      const g = gainOf(before, after)
      if (g.milestone && firstTime(g.milestone, today)) setSheet({ kind: 'milestone', days: g.milestone, freezeEarned: g.freezeEarned })
      const extra = [g.xp ? `+${g.xp} XP` : '', g.dayNowSafe && g.streak ? `Day ${g.streak} is safe` : ''].filter(Boolean).join(' · ')
      onToast(`${u.name} ${gramsLabel(u.grams)} logged${extra ? ' · ' + extra : ''}`, {
        label: 'Undo',
        run: async () => {
          setData((d) => d && { ...d, history: d.history.filter((l) => l.id !== saved.id) })
          try {
            await api.deleteLog(saved.id)
          } catch {
            onToast('Could not undo. Check your connection.')
            void refresh()
          }
        },
      })
    } catch {
      setData((d) => d && { ...d, history: d.history.filter((l) => l.id !== tempId) })
      onToast('Not saved. Check your connection and tap again.')
    }
  }

  const header = (
    <header className="header">
      <div>
        <p className="header-date">{todayLabel(now)}</p>
        <h1 className="header-title">Kain</h1>
      </div>
      {view && (
        <div className="header-pills">
          <button
            className={view.streak > 0 ? 'pill pill-reward' : 'pill'}
            aria-label={`${view.streak} day streak. Open streak`}
            onClick={() => setSheet({ kind: 'streak' })}
          >
            <FlameIcon />
            {view.streak}
          </button>
          <button className="pill" aria-label={`Level ${view.rewards.level.level}`} onClick={() => setSheet({ kind: 'streak' })}>
            Lv {view.rewards.level.level}
          </button>
        </div>
      )}
    </header>
  )

  if (!data || !view) {
    return (
      <>
        {header}
        <section className="glass card small muted">
          {error ? `Could not load your day: ${error}` : 'Loading your day'}
        </section>
        {footer}
      </>
    )
  }

  const kcalTarget = data.targets?.kcal ?? 0
  const proteinTarget = data.targets?.protein ?? 0
  const kcalLeft = kcalTarget - view.eaten.kcal
  const kcalPct = percent(view.eaten.kcal, kcalTarget)
  const proteinPct = percent(view.eaten.protein, proteinTarget)
  const n = view.streak

  return (
    <>
      {header}

      {error && (
        <p className="small muted offline-note">Showing your last saved day. Could not refresh: {error}</p>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) setCapture({ mode: 'photo', file })
        }}
      />
      <button className="next-card" onClick={openCamera}>
        <span className="next-icon">
          <CameraIcon />
        </span>
        <span className="next-text">
          <span className="next-title">{view.card.title}</span>
          <span className="next-detail">{view.card.detail}</span>
        </span>
        <ChevronRightIcon className="next-chev" />
      </button>

      <div className="tiles">
        <section className="glass tile" aria-label="Calories">
          <Ring value={kcalPct} done={false} />
          <div className="tile-text">
            <span className="tile-label">Calories</span>
            {kcalTarget > 0 ? (
              <>
                <span className="number">{fmt(Math.abs(kcalLeft))}</span>
                <span className="tile-sub">
                  {kcalLeft >= 0 ? 'left of' : 'over'} {fmt(kcalTarget)}
                </span>
              </>
            ) : (
              <>
                <span className="number">{fmt(view.eaten.kcal)}</span>
                <span className="tile-sub">eaten, no target set</span>
              </>
            )}
          </div>
        </section>
        <section className="glass tile" aria-label="Protein">
          <Ring value={proteinPct} done={proteinTarget > 0 && proteinPct >= 100} />
          <div className="tile-text">
            <span className="tile-label">Protein</span>
            <span className="number">{gramsLabel(Math.round(view.eaten.protein))}</span>
            <span className="tile-sub">{proteinTarget > 0 ? `of ${gramsLabel(proteinTarget)}` : 'no target set'}</span>
          </div>
        </section>
      </div>

      <section className="glass week" aria-label="This week">
        <div className="week-text">
          <span className="week-title">{n > 0 ? `${n} ${n === 1 ? 'day' : 'days'} in a row` : 'Start a streak'}</span>
          <span className="tile-sub">
            {n === 0
              ? 'Log one meal today to start'
              : view.loggedToday
                ? 'Today counts'
                : `Log today to make it ${n + 1}`}
          </span>
        </div>
        <div className="dots">
          {view.week.map((d) => (
            <Dot key={d.date} dot={d} />
          ))}
        </div>
      </section>

      <div className="ways">
        <button className="way" onClick={() => setCapture({ mode: 'voice' })}>
          <MicIcon />
          Say it
        </button>
        <button className="way" onClick={() => setCapture({ mode: 'scan' })}>
          <BarcodeIcon />
          Scan
        </button>
        <button className="way" onClick={() => setCapture({ mode: 'search' })}>
          <SearchIcon />
          Search
        </button>
      </div>

      {view.usual.length > 0 && (
        <section className="usual" aria-label="Usual foods">
          <h2 className="section-label">{view.card.slot ? 'Usual around now · one tap' : 'Your usual foods · one tap'}</h2>
          <div className="usual-row">
            {view.usual.map((u) => (
              <UsualChip key={u.key} item={u} onTap={tapUsual} />
            ))}
          </div>
        </section>
      )}

      {view.meals.length === 0 ? (
        <section className="glass card">
          <h2 className="card-title">Nothing logged yet today</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Your meals show up here as you log them.
          </p>
        </section>
      ) : (
        view.meals.map((m) => (
          <section key={m.id} className="glass meal" aria-label={m.label}>
            <div className="meal-head">
              <h2 className="meal-title">{m.label}</h2>
              <span className="meal-sum">
                {fmt(m.totals.kcal)} kcal · {fmt(m.totals.protein)} g protein
              </span>
            </div>
            {m.logs.map((l) => (
              <div key={l.id} className={l.id.startsWith('temp-') ? 'meal-row saving' : 'meal-row'}>
                <div className="meal-col">
                  <span className="food-name">{l.name}</span>
                  <span className="food-sub">{gramsLabel(l.grams)}</span>
                </div>
                <div className="meal-col meal-col-end">
                  <span className="food-name">{fmt(l.kcal)} kcal</span>
                  <span className="food-sub">{fmt(l.protein)} g protein</span>
                </div>
              </div>
            ))}
          </section>
        ))
      )}

      {footer}

      {sheet?.kind === 'logged' && (() => {
        const rows = sheet.rows
        const slot = slotOf(rows[0]?.time ?? localTime())
        const label = SLOTS.find((x) => x.id === slot)!.label
        const added = totals(rows)
        const kLeft = (data.targets?.kcal ?? 0) - view.eaten.kcal
        const pLeft = (data.targets?.protein ?? 0) - view.eaten.protein
        const nh = view.hist.find((h) => h.id === view.card.slot)
        let detail = ''
        if (data.targets) {
          if (kLeft <= 0) detail = 'You are at your calories for today.'
          else {
            const fits = view.usual
              .filter((u) => u.template.kcal <= kLeft)
              .sort((a, b) => b.template.protein - a.template.protein)
              .slice(0, 2)
            detail = `${fmt(kLeft)} kcal and ${fmt(Math.max(0, pLeft))} g protein left.`
            if (fits.length && fits.reduce((t, u) => t + u.template.kcal, 0) <= kLeft)
              detail += ` ${fits.map((u) => u.name.split(',')[0]).join(' + ')} fits.`
          }
        }
        const nextLine = view.card.slot && nh ? { title: `Next: ${nh.label.toLowerCase()} around ${nh.usual}`, detail } : detail ? { title: 'Rest of today', detail } : null
        return (
          <JustLogged
            title={`${label} logged`}
            count={rows.length}
            added={added}
            eaten={view.eaten}
            targets={data.targets}
            gain={sheet.gain}
            next={nextLine}
            onDone={closeSheet}
            onUndo={() => {
              setSheet(null)
              void undoRows(rows)
            }}
          />
        )
      })()}
      {sheet?.kind === 'milestone' && (
        <Milestone days={sheet.days} rewards={view.rewards} freezeEarned={sheet.freezeEarned} onDone={() => setSheet(null)} />
      )}
      {sheet?.kind === 'streak' && (
        <StreakSheet rewards={view.rewards} canRest={!view.loggedToday} onRest={restToday} onClose={() => setSheet(null)} />
      )}

      {capture && (
        <Capture
          mode={capture.mode}
          initialFile={capture.file}
          history={data.history}
          saveRows={api.saveMeal}
          onClose={() => setCapture(null)}
          onLogged={logged}
        />
      )}
    </>
  )
}
