import { useEffect } from 'react'
import '../styles/rewards.css'
import { fmt, type Totals } from '../lib/day'
import type { Gain, Rewards } from '../lib/rewards'
import { CheckIcon, FlameIcon, SnowIcon } from './Icons'

type Targets = { kcal: number; protein: number } | null

function Bar({ value, target, reward }: { value: number; target: number; reward?: boolean }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0
  return (
    <div className="bar">
      <div className={reward ? 'bar-fill reward' : 'bar-fill'} style={{ width: `${pct}%` }} />
    </div>
  )
}

function DoubleRing({ kcal, protein }: { kcal: number; protein: number }) {
  const ring = (r: number, pct: number, cls: string) => {
    const c = 2 * Math.PI * r
    return (
      <>
        <circle className="dr-track" cx="60" cy="60" r={r} />
        <circle className={cls} cx="60" cy="60" r={r} strokeDasharray={`${(Math.min(pct, 100) / 100) * c} ${c}`} />
      </>
    )
  }
  return (
    <div className="double-ring" aria-hidden="true">
      <svg viewBox="0 0 120 120">
        {ring(54, kcal, 'dr-arc')}
        {ring(42, protein, 'dr-arc reward')}
      </svg>
      <span className="dr-check">
        <CheckIcon />
      </span>
    </div>
  )
}

type JustLoggedProps = {
  title: string
  count: number
  added: Totals
  eaten: Totals
  targets: Targets
  gain: Gain
  next: { title: string; detail: string } | null
  onDone: () => void
  onUndo: () => void
}

// "Lunch logged" (Figma 14:85): one-second feedback, then out of the way.
export function JustLogged({ title, count, added, eaten, targets, gain, next, onDone, onUndo }: JustLoggedProps) {
  useEffect(() => {
    navigator.vibrate?.(12)
  }, [])
  const kT = targets?.kcal ?? 0
  const pT = targets?.protein ?? 0
  return (
    <div className="sheet-backdrop" onClick={onDone}>
      <section className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <span className="sheet-grip" />
        <DoubleRing kcal={kT ? (eaten.kcal / kT) * 100 : 0} protein={pT ? (eaten.protein / pT) * 100 : 0} />
        <h2 className="sheet-title">{title}</h2>
        <p className="sheet-sub">
          {count} {count === 1 ? 'food' : 'foods'} · {fmt(added.kcal)} kcal · {fmt(added.protein)} g protein
        </p>
        <div className="sheet-pills">
          {gain.xp > 0 && <span className="pill pill-accent">+{gain.xp} XP</span>}
          {gain.dayNowSafe && gain.streak > 0 && (
            <span className="pill pill-reward">
              <FlameIcon /> Day {gain.streak} is safe
            </span>
          )}
          {gain.levelUp && <span className="pill pill-reward">Level {gain.levelUp}</span>}
        </div>
        {targets && (
          <div className="sheet-bars">
            <div className="bar-row">
              <span>Calories</span>
              <span className="muted">
                {fmt(eaten.kcal)} of {fmt(kT)} kcal
              </span>
            </div>
            <Bar value={eaten.kcal} target={kT} />
            <div className="bar-row">
              <span>Protein</span>
              <span className="muted">
                {fmt(eaten.protein)} of {fmt(pT)} g
              </span>
            </div>
            <Bar value={eaten.protein} target={pT} reward />
          </div>
        )}
        {next && (
          <div className="sheet-next">
            <strong>{next.title}</strong>
            <span>{next.detail}</span>
          </div>
        )}
        <button className="btn sheet-btn" onClick={onDone} autoFocus>
          Done
        </button>
        <button className="link-btn sheet-undo" onClick={onUndo}>
          Undo
        </button>
      </section>
    </div>
  )
}

// "7 days" (Figma 14:335). Shown once per milestone.
export function Milestone({ days, rewards, freezeEarned, onDone }: { days: number; rewards: Rewards; freezeEarned: boolean; onDone: () => void }) {
  useEffect(() => {
    navigator.vibrate?.([20, 60, 20])
  }, [])
  const words: Record<number, string> = {
    7: 'You logged every day this week.',
    30: 'A whole month of logging.',
    100: 'One hundred days. This is who you are now.',
    365: 'A full year of logging.',
  }
  const bonus = days === 365 ? 2000 : days === 100 ? 500 : days === 30 ? 150 : 0
  const lv = rewards.level
  return (
    <div className="milestone" role="dialog" aria-label={`${days} days`}>
      <div className="milestone-body">
        <span className="milestone-badge">
          <FlameIcon />
        </span>
        <h1 className="milestone-title">{days} days</h1>
        <p className="milestone-sub">{words[days] ?? 'Keep it going.'}</p>
        <div className="glass milestone-card">
          <div className="bar-row">
            <strong className="reward-text">+{(days % 7 === 0 ? 50 : 0) + bonus} XP</strong>
            <span className="muted small">
              Level {lv.level} · {lv.into} of {lv.cost}
            </span>
          </div>
          <Bar value={lv.into} target={lv.cost} />
        </div>
        {freezeEarned && (
          <div className="glass milestone-card freeze-note">
            <SnowIcon />
            <span>You earned a streak freeze. It covers one missed day by itself.</span>
          </div>
        )}
      </div>
      <button className="btn milestone-btn" onClick={onDone}>
        Keep going
      </button>
    </div>
  )
}

// Tapping the flame: the streak in plain words, freezes, level, and the rest-day button.
export function StreakSheet({
  rewards,
  canRest,
  onRest,
  onClose,
}: {
  rewards: Rewards
  canRest: boolean
  onRest: () => void
  onClose: () => void
}) {
  const lv = rewards.level
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" role="dialog" aria-label="Your streak" onClick={(e) => e.stopPropagation()}>
        <span className="sheet-grip" />
        <span className="milestone-badge small">
          <FlameIcon />
        </span>
        <h2 className="sheet-title">
          {rewards.streak} {rewards.streak === 1 ? 'day' : 'days'} in a row
        </h2>
        <p className="sheet-sub">Best: {rewards.best} days. Any day you log food or a workout counts.</p>
        <div className="freeze-row">
          {[0, 1].map((i) => (
            <span key={i} className={i < rewards.freezes ? 'freeze on' : 'freeze'}>
              <SnowIcon />
            </span>
          ))}
          <span className="small muted">
            {rewards.freezes === 0
              ? 'No freezes yet. You get one every 7 days in a row.'
              : `${rewards.freezes} ${rewards.freezes === 1 ? 'freeze' : 'freezes'} ready. One covers a missed day by itself.`}
          </span>
        </div>
        <div className="sheet-bars">
          <div className="bar-row">
            <span>Level {lv.level}</span>
            <span className="muted">
              {lv.into} of {lv.cost} XP
            </span>
          </div>
          <Bar value={lv.into} target={lv.cost} />
        </div>
        {canRest && (
          <button className="btn btn-quiet sheet-btn" onClick={onRest}>
            Rest or sick today? Keep the streak
          </button>
        )}
        <button className="btn sheet-btn" onClick={onClose}>
          Done
        </button>
      </section>
    </div>
  )
}
