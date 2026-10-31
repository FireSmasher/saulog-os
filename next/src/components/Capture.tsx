import { useEffect, useMemo, useRef, useState } from 'react'
import '../styles/capture.css'
import { localDate, localTime, fmt, gramsLabel, habits, type FoodLog } from '../lib/day'
import {
  findBarcode,
  foodsFromHistory,
  itemFromFood,
  itemFromSaid,
  itemNumbers,
  parseSpoken,
  plateTotals,
  search,
  type Food,
  type PlateItem,
} from '../lib/plate'
import { askAi, loadLibrary, lookupBarcodeLive, preparePhoto, saveMeal, type Photo } from '../lib/capture'
import { BarcodeIcon, CameraIcon, CloseIcon, MicIcon, MinusIcon, PlusIcon, SearchIcon } from './Icons'

export type CaptureMode = 'photo' | 'voice' | 'scan' | 'search' | 'plate'

type Props = {
  mode: CaptureMode
  initialFile?: File
  history: FoodLog[]
  onClose: () => void
  onLogged: (rows: FoodLog[]) => void
  saveRows?: typeof saveMeal // demo mode swaps this out
}

// Web Speech API (Safari ships it as webkitSpeechRecognition).
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start: () => void
  stop: () => void
}
type RecognitionCtor = new () => Recognition
const SpeechCtor: RecognitionCtor | undefined =
  (window as unknown as { SpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition

const WHEN = [
  { id: 'now', label: 'Now' },
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
] as const
type When = (typeof WHEN)[number]['id']

function Tags({ i }: { i: PlateItem }) {
  const tags: string[] = []
  if (i.unmatched) tags.push('Pick a food')
  else {
    if (i.source === 'said' && !i.gramsGuess) tags.push('Said')
    if (i.source === 'photo') tags.push('Guess from photo')
    if (i.source === 'barcode') tags.push('Barcode')
    if (i.gramsGuess && i.source !== 'photo') tags.push('Check grams')
    if (i.nutritionGuess) tags.push('AI estimate')
  }
  return (
    <span className="tags">
      {tags.map((t) => (
        <span key={t} className={t === 'Said' || t === 'Barcode' ? 'tag tag-sure' : 'tag'}>
          {t}
        </span>
      ))}
    </span>
  )
}

function GramsStepper({ value, onChange }: { value: number; onChange: (g: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(String(value))
  const step = value >= 200 ? 25 : value >= 50 ? 10 : 5
  if (editing) {
    return (
      <input
        className="grams-input"
        inputMode="decimal"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const g = parseFloat(text.replace(',', '.'))
          if (g > 0) onChange(Math.round(g))
          setEditing(false)
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    )
  }
  return (
    <span className="stepper">
      <button aria-label="Less" onClick={() => onChange(Math.max(step, value - step))}>
        <MinusIcon />
      </button>
      <button
        className="stepper-value"
        onClick={() => {
          setText(String(value))
          setEditing(true)
        }}
      >
        {gramsLabel(value)}
      </button>
      <button aria-label="More" onClick={() => onChange(value + step)}>
        <PlusIcon />
      </button>
    </span>
  )
}

export function Capture({ mode, initialFile, history, onClose, onLogged, saveRows = saveMeal }: Props) {
  const [library, setLibrary] = useState<Food[]>([])
  const mine = useMemo(() => foodsFromHistory(history), [history])
  const foods = useMemo(() => [...mine, ...library], [mine, library])

  const [items, setItems] = useState<PlateItem[]>([])
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [transcript, setTranscript] = useState('')
  const [heard, setHeard] = useState('')
  const [listening, setListening] = useState(false)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [replacing, setReplacing] = useState<string | null>(null)
  const [scanning, setScanning] = useState(mode === 'scan')
  const [when, setWhen] = useState<When>('now')
  const [saving, setSaving] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const recRef = useRef<Recognition | null>(null)
  const heardRef = useRef('')

  useEffect(() => {
    let live = true
    void loadLibrary().then((l) => live && setLibrary(l))
    return () => {
      live = false
    }
  }, [])

  // Open straight into what he tapped. (A photo arrives already taken: iOS only opens
  // the camera from inside a tap.)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    if (initialFile) void onPhoto(initialFile)
    const devSaid = import.meta.env.DEV ? new URLSearchParams(location.search).get('said') : null
    if (devSaid) {
      setTranscript(devSaid)
      void draft(devSaid, null)
    }
    if (mode === 'search') searchRef.current?.focus()
    if (mode === 'voice' && !SpeechCtor) textRef.current?.focus()
  }, [mode, initialFile]) // eslint-disable-line

  useEffect(() => {
    if (!photo) return
    return () => URL.revokeObjectURL(photo.preview)
  }, [photo])

  const update = (key: string, patch: Partial<PlateItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)))
  const remove = (key: string) => setItems((list) => list.filter((i) => i.key !== key))

  // Said foods go on the plate at once from his library; the AI is asked only when there
  // is a photo or a food it could not match.
  async function draft(nextTranscript: string, nextPhoto: Photo | null) {
    const all = [...mine, ...(await loadLibrary())]
    const said = parseSpoken(nextTranscript).map((s) => itemFromSaid(all, s))
    const kept = items.filter((i) => i.source === 'barcode' || i.source === 'search' || i.source === 'typed')
    setItems([...kept, ...said])
    const needAi = nextPhoto !== null || said.some((i) => i.unmatched)
    if (!needAi) return
    setBusy(true)
    setStatus(nextPhoto ? 'Reading your photo' : 'Looking up foods')
    const res = await askAi(all, nextPhoto, nextTranscript, kept.map((i) => `${i.name} ${i.grams} g`))
    setBusy(false)
    if ('error' in res) {
      const off = res.error === 'no_key' || res.error === 'unreachable'
      setStatus(
        off
          ? 'Photo reading is not switched on yet. Say or type the foods and grams.'
          : 'Could not read that. Say or type the foods and grams.',
      )
      return
    }
    setStatus(res.items.length ? '' : 'No food found. Say or type it.')
    // Keep what he matched by hand; the AI replaces the rest of the draft.
    setItems((list) => [...list.filter((i) => i.source !== 'said' && i.source !== 'photo'), ...res.items])
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return
    setStatus('Getting the photo ready')
    try {
      const p = await preparePhoto(file)
      setPhoto(p)
      await draft(transcript, p)
    } catch {
      setStatus('Could not open that photo.')
    }
  }

  function startTalk() {
    if (!SpeechCtor) {
      textRef.current?.focus()
      setStatus('Tap the mic on your keyboard and say the foods and grams.')
      return
    }
    try {
      const rec = new SpeechCtor()
      rec.lang = 'en-US'
      rec.continuous = true
      rec.interimResults = true
      let finalText = ''
      rec.onresult = (e) => {
        let interim = ''
        finalText = ''
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i]
          if (r.isFinal) finalText += r[0].transcript + ' '
          else interim += r[0].transcript
        }
        heardRef.current = (finalText + interim).trim()
        setHeard(heardRef.current)
      }
      rec.onerror = () => setStatus('The mic stopped. Type or try again.')
      rec.onend = () => {
        setListening(false)
        recRef.current = null
        const said = heardRef.current.trim()
        heardRef.current = ''
        setHeard('')
        if (said) {
          const next = (transcript ? transcript + ', ' : '') + said
          setTranscript(next)
          void draft(next, photo)
        }
      }
      rec.start()
      recRef.current = rec
      setListening(true)
      setStatus('')
    } catch {
      textRef.current?.focus()
    }
  }

  const stopTalk = () => recRef.current?.stop()

  async function onCode(code: string) {
    setScanning(false)
    const clean = code.replace(/\D/g, '')
    if (!clean) return
    let food = findBarcode(foods, clean)
    if (!food) {
      setStatus('Looking up the barcode')
      food = await lookupBarcodeLive(clean)
    }
    if (!food) {
      setStatus(`Barcode ${clean} not found. Search for it instead.`)
      setQuery('')
      searchRef.current?.focus()
      return
    }
    setStatus('')
    setItems((list) => [...list, { ...itemFromFood(food!, food!.lastGrams ?? 100, 'barcode', !food!.lastGrams), barcode: clean }])
  }

  function pick(f: Food) {
    if (replacing) {
      update(replacing, {
        name: f.name,
        per100: { kcal: f.kcal, protein: f.protein, carb: f.carb, fat: f.fat },
        unmatched: false,
        nutritionGuess: false,
        ...(f.barcode ? { barcode: f.barcode } : {}),
      })
      setReplacing(null)
    } else {
      setItems((list) => [...list, itemFromFood(f, f.lastGrams ?? 100, 'search', !f.lastGrams)])
    }
    setQuery('')
  }

  const results = useMemo(() => (query.trim().length >= 2 ? search(foods, query, 8) : []), [foods, query])
  const total = plateTotals(items)
  const blocked = items.some((i) => i.unmatched)

  function timeFor(w: When): string {
    if (w === 'now') return localTime()
    return habits(history, localDate()).find((h) => h.id === w)!.usual
  }

  async function log() {
    if (!items.length || blocked || saving) return
    setSaving(true)
    try {
      const rows = await saveRows(items, localDate(), timeFor(when), photo)
      onLogged(rows)
    } catch {
      setStatus('Not saved. Check your connection and tap Log again.')
      setSaving(false)
    }
  }

  return (
    <div className="capture" role="dialog" aria-label="Log a meal">
      <div className="capture-scroll">
        <header className="capture-head">
          <h1 className="header-title">Log a meal</h1>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <div className="capture-ways">
          <button className="capture-way" onClick={() => fileRef.current?.click()}>
            {photo ? <img src={photo.preview} alt="" className="capture-thumb" /> : <CameraIcon />}
            <span>{photo ? 'New photo' : 'Photo'}</span>
          </button>
          <button
            className={listening ? 'capture-way capture-talk on' : 'capture-way capture-talk'}
            onPointerDown={(e) => {
              e.preventDefault()
              startTalk()
            }}
            onPointerUp={stopTalk}
            onPointerLeave={() => listening && stopTalk()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <MicIcon />
            <span>{listening ? 'Listening' : 'Hold to talk'}</span>
          </button>
          <button className="capture-way" onClick={() => setScanning(true)}>
            <BarcodeIcon />
            <span>Scan</span>
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            void onPhoto(e.target.files?.[0])
            e.target.value = ''
          }}
        />

        {(listening || heard) && <p className="heard">{heard || 'Say the foods and the grams'}</p>}

        <label className="said-box glass">
          <span className="section-label">What you ate</span>
          <textarea
            ref={textRef}
            rows={2}
            placeholder="200 g chicken breast, 250 g rice, 1 tbsp oil"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            onBlur={() => transcript.trim() && void draft(transcript, photo)}
          />
        </label>

        {status && (
          <p className={busy ? 'capture-status busy' : 'capture-status'} role="status">
            {status}
          </p>
        )}

        <div className="search-box">
          <SearchIcon />
          <input
            ref={searchRef}
            type="search"
            placeholder={replacing ? 'Pick the right food' : 'Search foods'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {results.length > 0 && (
          <ul className="results glass">
            {results.map((f, n) => (
              <li key={f.name + n}>
                <button onClick={() => pick(f)}>
                  <span className="food-name">{f.name}</span>
                  <span className="food-sub">
                    {fmt(f.kcal)} kcal · {fmt(f.protein)} g protein per 100 g{f.mine ? ' · yours' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {items.length > 0 && (
          <section className="plate glass" aria-label="Your plate">
            {items.map((i) => {
              const n = itemNumbers(i)
              return (
                <div key={i.key} className="plate-row">
                  <div className="plate-main">
                    <button
                      className="plate-name"
                      onClick={() => {
                        setReplacing(i.key)
                        setQuery(i.name)
                        searchRef.current?.focus()
                      }}
                    >
                      {i.name}
                    </button>
                    <Tags i={i} />
                    <span className="food-sub">
                      {i.unmatched ? 'Tap the name to pick it' : `${fmt(n.kcal)} kcal · ${fmt(n.protein)} g protein`}
                    </span>
                  </div>
                  <div className="plate-side">
                    <GramsStepper value={i.grams} onChange={(g) => update(i.key, { grams: g, gramsGuess: false })} />
                    <button className="link-btn plate-remove" onClick={() => remove(i.key)}>
                      Remove
                    </button>
                  </div>
                </div>
              )
            })}
          </section>
        )}

        {items.length === 0 && !busy && (
          <p className="small muted capture-hint">
            Snap the plate, then hold the mic and say the grams. Scan packets. Everything lands on one plate.
          </p>
        )}
      </div>

      <footer className="capture-foot glass">
        <div className="when" role="group" aria-label="When">
          {WHEN.map((w) => (
            <button key={w.id} className={when === w.id ? 'when-chip on' : 'when-chip'} onClick={() => setWhen(w.id)}>
              {w.label}
            </button>
          ))}
        </div>
        <button className="btn log-btn" disabled={!items.length || blocked || saving || busy} onClick={log}>
          {saving
            ? 'Saving'
            : items.length
              ? `Log ${items.length} ${items.length === 1 ? 'food' : 'foods'} · ${fmt(total.kcal)} kcal`
              : 'Log'}
        </button>
      </footer>

      {scanning && <Scanner onCode={onCode} onClose={() => setScanning(false)} />}
    </div>
  )
}

// ---------- Barcode scanner ----------

function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')
  const done = useRef(false)
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  useEffect(() => {
    let scanner: { stop: () => Promise<void>; isScanning: boolean } | null = null
    let cancelled = false
    void (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats: F } = await import('html5-qrcode')
        if (cancelled) return
        const s = new Html5Qrcode('scan-view', {
          verbose: false,
          formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E],
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        })
        scanner = s
        await s.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 130 } },
          (text) => {
            if (done.current) return
            done.current = true
            void s.stop().catch(() => {})
            onCodeRef.current(text)
          },
          () => {},
        )
      } catch {
        setError('The camera did not open. Type the numbers under the barcode.')
      }
    })()
    return () => {
      cancelled = true
      if (scanner?.isScanning) void scanner.stop().catch(() => {})
    }
  }, [])

  return (
    <div className="scanner" role="dialog" aria-label="Scan a barcode">
      <div className="scanner-top">
        <span>Point at the barcode</span>
        <button className="icon-btn light" aria-label="Close scanner" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div id="scan-view" className="scan-view" />
      {error && <p className="scanner-error">{error}</p>}
      <form
        className="scanner-type"
        onSubmit={(e) => {
          e.preventDefault()
          if (typed.trim()) onCode(typed)
        }}
      >
        <input inputMode="numeric" placeholder="Or type the numbers" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <button className="btn" type="submit">
          Add
        </button>
      </form>
    </div>
  )
}
