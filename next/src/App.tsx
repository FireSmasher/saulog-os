import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { loadTargets, rememberedEmail, supabase, type Targets } from './lib/supabase'
import { TabBar, type Tab } from './components/TabBar'

function todayLabel(date = new Date()): string {
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' })
  const dayMonth = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${weekday}, ${dayMonth}`
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-GB')

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

function Connected({ session }: { session: Session }) {
  const [targets, setTargets] = useState<Targets | null | undefined>(undefined)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    loadTargets()
      .then((t) => live && setTargets(t))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [session.user.id])

  return (
    <section className="glass card" aria-label="Sync">
      <div className="row">
        <span className={error ? 'status-dot off' : 'status-dot'} />
        <span style={{ font: 'var(--t-label)' }}>
          {error ? 'Could not reach your data' : 'Connected to your logs'}
        </span>
      </div>
      {error && <p className="small muted" style={{ margin: 0 }}>{error}</p>}
      {targets === undefined && !error && <p className="small muted" style={{ margin: 0 }}>Loading your targets</p>}
      {targets === null && <p className="small muted" style={{ margin: 0 }}>No daily targets saved yet.</p>}
      {targets && (
        <div className="split">
          <div>
            <div className="small muted">Calories a day</div>
            <div className="number">{fmt(targets.kcal)}</div>
          </div>
          <div>
            <div className="small muted">Protein a day</div>
            <div className="number">{fmt(targets.protein)} g</div>
          </div>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="small muted">{session.user.email}</span>
        <button className="link-btn" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </section>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>('kain')
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  function showToast(text: string) {
    setToast(text)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2200)
  }

  return (
    <>
      <main className="screen">
        {tab === 'kain' ? (
          <>
            <Header title="Kain" />
            {session === undefined && <section className="glass card small muted">Checking sign-in</section>}
            {session === null && <SignIn />}
            {session && <Connected session={session} />}
            <p className="small muted" style={{ margin: '4px 2px 0' }}>
              New Saulog OS, step 1 of 7. Your meals for today show here next.
            </p>
          </>
        ) : (
          <>
            <Header title="Buhat" />
            <section className="glass card">
              <h2 className="card-title">Workouts come in step 5</h2>
              <p className="small muted" style={{ margin: 0 }}>
                Keep logging sets in the old app until then.
              </p>
            </section>
          </>
        )}
      </main>
      {toast && (
        <div className="glass toast" role="status">
          {toast}
        </div>
      )}
      <TabBar tab={tab} onTab={setTab} onPlus={() => showToast('Photo, voice and barcode logging come in step 3.')} />
    </>
  )
}
