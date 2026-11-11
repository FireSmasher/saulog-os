import { useState } from 'react'
import { supabase, SUPABASE_URL } from '../lib/supabase'
import '../styles/widget.css'

const SCRIPT_LINK = 'https://raw.githubusercontent.com/FireSmasher/saulog-os/main/scriptable/streak-widget.js'
const WIDGET_ADDRESS = `${SUPABASE_URL}/functions/v1/widget`

// Home screen streak widget through the Scriptable app. The code is shown once; only its
// hash is stored, so a lost code means making a new one.
export function WidgetToken() {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState('')

  async function make() {
    setBusy(true)
    setNote('')
    const { data, error } = await supabase.rpc('create_widget_token')
    setBusy(false)
    if (error || typeof data !== 'string') {
      setNote('Could not make a code. Check your connection and try again.')
      return
    }
    setToken(data)
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(''), 2000)
    } catch {
      setNote('Copy did not work. Press and hold the text to copy it.')
    }
  }

  return (
    <section className="glass card widget-card" aria-label="Home screen widget">
      <h2 className="card-title">Home screen widget</h2>
      <p className="small muted">Your streak on the home or lock screen, through the free Scriptable app.</p>
      {token ? (
        <div className="widget-code">
          <code className="widget-token" aria-label="Widget code">{token}</code>
          <div className="widget-row">
            <button className="btn" onClick={() => void copy(token, 'code')}>
              {copied === 'code' ? 'Copied' : 'Copy code'}
            </button>
            <button className="btn btn-quiet" onClick={() => void copy(WIDGET_ADDRESS, 'address')}>
              {copied === 'address' ? 'Copied' : 'Copy address'}
            </button>
          </div>
          <p className="small muted">This code is shown once. Copy it now.</p>
        </div>
      ) : (
        <button className="btn" disabled={busy} onClick={() => void make()}>
          Make widget code
        </button>
      )}
      {note && <p className="small muted">{note}</p>}
      <ol className="widget-steps small">
        <li>Install Scriptable from the App Store.</li>
        <li>Open it and tap + to make a new script.</li>
        <li>
          Paste the script from{' '}
          <a href={SCRIPT_LINK} target="_blank" rel="noreferrer">
            this link
          </a>
          .
        </li>
        <li>Paste the code in line 1 and the address in line 2 (between the quotes).</li>
        <li>Add a Scriptable widget to your home or lock screen and pick this script.</li>
      </ol>
      <p className="small muted">Making a new code switches off the old one.</p>
    </section>
  )
}
