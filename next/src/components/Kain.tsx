import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  fmt,
  gramsLabel,
  habits,
  localDate,
  localTime,
  meals,
  nextCard,
  percent,
  streak,
  totals,
  usualFoods,
  week,
  type FoodLog,
  type Usual,
  type WeekDot,
} from '../lib/day'
import type { KainData } from '../lib/food'
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
}

export type ToastAction = { label: string; run: () => void }

type Props = {
  api: KainApi
  footer?: ReactNode
  onToast: (text: string, action?: ToastAction) => void
  onCapture: () => void
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

export function Kain({ api, footer, onToast, onCapture }: Props) {
  const [data, setData] = useState<KainData | null>(() => api.readCache())
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => new Date())
  const loading = useRef(false)

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

  // A cached day from yesterday is not today's: refetch when the date moves on.
  useEffect(() => {
    if (data && data.today !== today) void refresh()
  }, [data, today, refresh])

  const view = useMemo(() => {
    if (!data) return null
    const history = data.history
    const todayLogs = history.filter((l) => l.date === today)
    const dates = new Set(data.loggedDates)
    if (todayLogs.length) dates.add(today)
    const hist = habits(history, today)
    const card = nextCard(todayLogs, hist, localTime(now))
    return {
      eaten: totals(todayLogs),
      meals: meals(todayLogs),
      streak: streak(dates, today),
      loggedToday: todayLogs.length > 0,
      week: week(dates, today),
      card,
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
      setData((d) => {
        if (!d) return d
        const next = { ...d, history: d.history.map((l) => (l.id === tempId ? saved : l)) }
        api.writeCache(next)
        return next
      })
      onToast(`${u.name} logged, ${gramsLabel(u.grams)}`, {
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
      {view && view.streak > 0 && (
        <div className="pill pill-reward" aria-label={`${view.streak} day streak`}>
          <FlameIcon />
          {view.streak}
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

      <button className="next-card" onClick={onCapture}>
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
        <button className="way" onClick={onCapture}>
          <MicIcon />
          Say it
        </button>
        <button className="way" onClick={onCapture}>
          <BarcodeIcon />
          Scan
        </button>
        <button className="way" onClick={onCapture}>
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
    </>
  )
}
