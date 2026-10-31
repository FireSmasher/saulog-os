import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Muscle } from '../lib/buhat'

// Front and back body with every muscle drawn with its fibres (MIT drawing from
// react-muscle-highlighter, fibres from scripts/bodymap). Main = accent, helper = light
// cyan, rest = grey. The drawing loads on first use (its own small file).
type Parts = [string, string, string][]
type Data = { front: Parts; back: Parts }

let cache: Promise<Data> | null = null
const load = () => (cache ??= import('../assets/bodymap.json').then((m) => m.default as unknown as Data))

const SKIN = new Set(['head', 'hair', 'hands', 'feet', 'ankles', 'knees', 'neck'])

function Side({ parts, main, helper, label }: { parts: Parts; main: Set<Muscle>; helper: Set<Muscle>; label: string }) {
  const g = useRef<SVGGElement>(null)
  const [box, setBox] = useState('0 0 1448 1448')
  useLayoutEffect(() => {
    if (!g.current) return
    const b = g.current.getBBox()
    if (b.width > 0) setBox(`${b.x - 6} ${b.y - 6} ${b.width + 12} ${b.height + 12}`)
  }, [parts])
  return (
    <figure className="body-side">
      <svg viewBox={box} role="img" aria-label={`${label} of the body`}>
        <g ref={g}>
          {parts.map(([slug, d, fib], i) => {
            const state = main.has(slug as Muscle) ? 'main' : helper.has(slug as Muscle) ? 'helper' : SKIN.has(slug) ? 'skin' : 'rest'
            return (
              <g key={i} className={`bm bm-${state}`}>
                <path d={d} className="bm-shape" />
                {fib && state !== 'skin' && <path d={fib} className="bm-fib" />}
              </g>
            )
          })}
        </g>
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  )
}

export function BodyMap({ main, helper }: { main: Set<Muscle>; helper: Set<Muscle> }) {
  const [data, setData] = useState<Data | null>(null)
  useEffect(() => {
    let live = true
    void load().then((d) => live && setData(d))
    return () => {
      live = false
    }
  }, [])
  return (
    <div className="bodymap">
      {data ? (
        <>
          <Side parts={data.front} main={main} helper={helper} label="Front" />
          <Side parts={data.back} main={main} helper={helper} label="Back" />
        </>
      ) : (
        <div className="bodymap-wait" />
      )}
    </div>
  )
}
