import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { rememberedEmail, supabase } from './lib/supabase'
import { clearCache, deleteLog, deleteLogs, loadKain, logAgain, markRestDay, readCache, writeCache } from './lib/food'
import { saveMeal } from './lib/capture'
import { TabBar, type Tab } from './components/TabBar'
import { Kain, type KainApi, type ToastAction } from './components/Kain'
import type { BuhatApi } from './components/Buhat'
// Buhat (and its body map) loads when the tab is first opened.
const Buhat = lazy(() => import('./components/Buhat').then((m) => ({ default: m.Buhat })))
import { Reminder } from './components/Reminder'
import { WidgetToken } from './components/WidgetToken'
import { loadWorkouts, readWorkoutCache, removeLastSet, saveSet, saveSets, writeWorkoutCache } from './lib/workouts'

// Dev only: http://localhost:5173/saulog-os/next/?demo shows made-up data, no sign-in.
// import.meta.env.DEV is false in the build, so this branch and lib/demo.ts are dropped.
const DEMO = import.meta.env.DEV && new URLSearchParams(location.search).has('demo')

function todayLabel(date = new Date()): string {
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' })
  const dayMonth = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${weekday}, ${dayMonth}`
}

function Header({ title }: { title: string }) {
  return (
    <header className="header">
      <div>
        <p className="header-date">{todayLabel()}</p>
        <h1 className="header-title">{title}</h1>
      </div>
    </header>
  )
}

function SignIn() {
  const [email, setEmail] = useState(rememberedEmail)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(error.message)
  }

  return (
    <form className="glass card" onSubmit={submit}>
      <h2 className="card-title">Sign in to see your logs</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Same email and password as the old app.
      </p>
      <label className="field">
        Email
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="field">
        Password
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && <p className="small" style={{ margin: 0, color: 'var(--ink)' }}>{error}</p>}
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Signing in' : 'Sign in'}
      </button>
    </form>
  )
}

function useLiveApi(session: Session | null | undefined): KainApi | null {
  const userId = session?.user.id
  return useMemo(
    () =>
      userId
        ? {
            load: loadKain,
            logAgain,
            deleteLog,
            readCache: () => readCache(userId),
            writeCache: (d) => writeCache(userId, d),
            saveMeal,
            deleteLogs,
            markRestDay,
          }
        : null,
    [userId],
  )
}

function useBuhatApi(session: Session | null | undefined): BuhatApi | null {
  const userId = session?.user.id
  return useMemo(
    () =>
      userId
        ? {
            load: loadWorkouts,
            saveSet,
            saveSets,
            removeLastSet,
            readCache: () => readWorkoutCache(userId),
            writeCache: (rows) => writeWorkoutCache(userId, rows),
            readKain: () => readCache(userId),
            writeKain: (d) => writeCache(userId, d),
          }
        : null,
    [userId],
  )
}

type Toast = { text: string; action?: ToastAction }

export default function App() {
  const [tab, setTab] = useState<Tab>('kain')
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [demoApi, setDemoApi] = useState<KainApi | null>(null)
  const [demoBuhat, setDemoBuhat] = useState<BuhatApi | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [plusSignal, setPlusSignal] = useState(0)
  const toastTimer = useRef<number | undefined>(undefined)
  const liveApi = useLiveApi(session)
  const liveBuhat = useBuhatApi(session)

  useEffect(() => {
    if (DEMO) {
      void import('./lib/demo').then((m) => {
        setDemoApi(m.demoApi)
        setDemoBuhat(m.demoBuhat)
        if (new URLSearchParams(location.search).get('tab') === 'buhat') setTab('buhat')
      })
      return
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  function showToast(text: string, action?: ToastAction) {
    setToast({ text, action })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 4500 : 2600)
  }

  function onPlus() {
    setTab('kain')
    setPlusSignal((n) => n + 1)
  }

  async function signOut() {
    if (session) clearCache(session.user.id)
    await supabase.auth.signOut()
  }

  const api = DEMO ? demoApi : liveApi
  const buhatApi = DEMO ? demoBuhat : liveBuhat

  return (
    <>
      <main className="screen">
        {tab === 'kain' ? (
          api ? (
            <Kain
              key={DEMO ? 'demo' : session?.user.id}
              api={api}
              onToast={showToast}
              plusSignal={plusSignal}
              footer={
                !DEMO &&
                session && (
                  <>
                  <Reminder />
                  <WidgetToken />
                  <div className="footer-line small muted">
                    <span>{session.user.email}</span>
                    <button className="link-btn" onClick={signOut}>
                      Sign out
                    </button>
                  </div>
                  <div className="footer-line small muted">
                    <a className="link-btn" href="../?old=1">
                      Quarters and old app
                    </a>
                  </div>
                  </>
                )
              }
            />
          ) : (
            <>
              <Header title="Kain" />
              {session === undefined && <section className="glass card small muted">Checking sign-in</section>}
              {session === null && <SignIn />}
            </>
          )
        ) : (
          buhatApi ? (
            <Suspense fallback={<Header title="Buhat" />}>
              <Buhat key={DEMO ? 'demo' : session?.user.id} api={buhatApi} onToast={showToast} />
            </Suspense>
          ) : (
            <>
              <Header title="Buhat" />
              {session === undefined && <section className="glass card small muted">Checking sign-in</section>}
              {session === null && <SignIn />}
            </>
          )
        )}
      </main>
      {toast && (
        <div className="glass toast" role="status">
          <span>{toast.text}</span>
          {toast.action && (
            <button
              className="toast-action"
              onClick={() => {
                toast.action!.run()
                setToast(null)
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
      <TabBar tab={tab} onTab={setTab} onPlus={onPlus} />
    </>
  )
}
