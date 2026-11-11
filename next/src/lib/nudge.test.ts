// Run: npm test (node's own test runner, Berlin time zone). No packages needed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GOALS,
  TONES,
  candidates,
  eligible,
  habitTimes,
  instantOf,
  nextPush,
  pickTemplate,
  placeholders,
  render,
  rewardFor,
  seededRng,
  templateWeights,
  toLogRows,
  trainingDays,
  workoutDue,
  type Candidate,
  type LogRow,
  type NudgeState,
  type SendRecord,
  type SentPush,
} from './nudge.ts'
import { POOL } from './nudge-messages.ts'
import { addDays } from './day.ts'
import { todaySplit, type WorkoutRow } from './buhat.ts'

// A local Berlin wall time as a Date.
const at = (date: string, time: string) => new Date(instantOf(date, time))
const iso = (date: string, time: string) => at(date, time).toISOString()
const row = (goal: LogRow['goal'], date: string, time: string): LogRow => ({ goal, date, time })
const sent = (date: string, time: string, goal: string, template_id = `${goal}.x.0`): SentPush => ({ sent_at: iso(date, time), goal, template_id })
const daysBack = (today: string, n: number) => Array.from({ length: n }, (_, i) => addDays(today, -(i + 1)))
const goals = (cs: Candidate[]) => cs.map((c) => c.goal)

const state = (s: Partial<NudgeState> = {}): NudgeState => ({ savage: false, logs: [], workouts: [], streak: 0, sends: [], ...s })

let wid = 0
const lift = (date: string, split: string, time = '18:00'): WorkoutRow => ({
  id: String(wid++), date, time, split, exercise: 'Squat', sets: [{ weight: 60, reps: 8 }],
})

// ---------- Names ----------

test('goal names are the exact shared words', () => {
  assert.deepEqual([...GOALS], ['breakfast', 'lunch', 'dinner', 'workout', 'walk', 'streak_saver', 'friend', 'backoff'])
})

// ---------- Usual times ----------

test('habit times with no data use the defaults', () => {
  const h = habitTimes([], '2026-11-11')
  assert.deepEqual(
    Object.values(h).map((x) => [x.goal, x.time, x.source]),
    [
      ['breakfast', '08:00', 'default'],
      ['lunch', '13:00', 'default'],
      ['dinner', '19:30', 'default'],
      ['workout', '18:00', 'default'],
      ['walk', '12:30', 'default'],
    ],
  )
})

test('habit times with little data: 23.5 h after the last log', () => {
  const h = habitTimes([row('breakfast', '2026-11-05', '07:00'), row('breakfast', '2026-11-09', '09:10')], '2026-11-11')
  assert.equal(h.breakfast.time, '08:40')
  assert.equal(h.breakfast.source, 'last_log')
  assert.equal(h.lunch.source, 'default')
  // 4 days is still too few for a median
  const four = ['07:00', '07:10', '07:20', '09:00'].map((t, i) => row('breakfast', `2026-11-0${i + 5}`, t))
  assert.equal(habitTimes(four, '2026-11-11').breakfast.source, 'last_log')
})

test('habit times with lots of data: median of the last 42 days, first log of each day', () => {
  const today = '2026-11-11'
  const rows = daysBack(today, 20).flatMap((d, i) => [
    row('breakfast', d, ['07:20', '07:30', '07:40'][i % 3]),
    row('breakfast', d, '10:30'), // a second breakfast row the same day does not count
  ])
  rows.push(row('breakfast', '2026-09-01', '12:00')) // older than 42 days
  const h = habitTimes(rows, today)
  assert.equal(h.breakfast.time, '07:30')
  assert.equal(h.breakfast.source, 'median')
  assert.equal(h.breakfast.days, 20)
  // late dinners after midnight stay late, they do not drag the median to the morning
  const dinners = ['23:40', '23:50', '00:10', '00:20', '00:30'].map((t, i) => row('dinner', addDays(today, -(i + 1)), t))
  assert.equal(habitTimes(dinners, today).dinner.time, '00:10')
})

test('habit times hold across the 29 Mar and 25 Oct clock changes', () => {
  const spring = ['2026-03-25', '2026-03-27', '2026-03-29', '2026-03-30', '2026-04-01'].map((d) => row('breakfast', d, '08:00'))
  assert.equal(habitTimes(spring, '2026-04-02').breakfast.time, '08:00')
  const autumn = ['2026-10-21', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-28'].map((d) => row('breakfast', d, '08:00'))
  assert.equal(habitTimes(autumn, '2026-10-29').breakfast.time, '08:00')
})

// ---------- Training days ----------

test('training days are learned from 6 weeks of Mon, Wed, Fri', () => {
  const today = '2026-11-11' // a Wednesday
  const dates = daysBack(today, 44).filter((d) => [1, 3, 5].includes(new Date(d + 'T12:00').getDay()))
  const plan = trainingDays(dates.map((date) => ({ date })), today)
  assert.equal(plan.learned, true)
  assert.deepEqual(plan.weekdays, [0, 2, 4])
  assert.equal(workoutDue(plan, today), true)
  assert.equal(workoutDue(plan, '2026-11-12'), false)
})

test('under 3 weeks of data a workout is due on the second day without one', () => {
  const rows = [{ date: '2026-11-01' }, { date: '2026-11-09' }]
  assert.equal(trainingDays(rows, '2026-11-10').learned, false)
  assert.equal(workoutDue(trainingDays(rows, '2026-11-10'), '2026-11-10'), false)
  assert.equal(workoutDue(trainingDays(rows, '2026-11-11'), '2026-11-11'), true)
  assert.equal(workoutDue(trainingDays([], '2026-11-11'), '2026-11-11'), true)
})

test('workout nudge names the next session on a training day', () => {
  const today = '2026-11-11'
  const splits = ['Full Body', 'Upper', 'Lower']
  const workouts = daysBack(today, 44)
    .filter((d) => [1, 3, 5].includes(new Date(d + 'T12:00').getDay()))
    .reverse()
    .map((d, i) => lift(d, splits[i % 3]))
  const s = state({ workouts, logs: toLogRows({ workouts }) })
  const c = candidates(s, at(today, '18:00')).find((x) => x.goal === 'workout')
  assert.ok(c)
  assert.equal(c.vars.session, todaySplit(workouts, today))
  assert.equal(candidates(s, at(today, '17:55')).find((x) => x.goal === 'workout'), undefined)
  // trained already today: no nudge
  const done = [...workouts, lift(today, 'Upper', '07:00')]
  assert.equal(candidates(state({ workouts: done, logs: toLogRows({ workouts: done }) }), at(today, '18:00')).find((x) => x.goal === 'workout'), undefined)
})

// ---------- Candidates and volume ----------

const mealHistory = (today: string) =>
  daysBack(today, 10).flatMap((d) => [row('breakfast', d, '08:00'), row('lunch', d, '13:00'), row('dinner', d, '19:30')])

test('a meal is nudged at its usual time, only while it is not logged', () => {
  const today = '2026-11-11'
  const logs = mealHistory(today)
  assert.deepEqual(goals(candidates(state({ logs }), at(today, '07:55'))), [])
  assert.ok(goals(candidates(state({ logs }), at(today, '08:00'))).includes('breakfast'))
  const done = [...logs, row('breakfast', today, '07:30')]
  assert.ok(!goals(candidates(state({ logs: done }), at(today, '08:00'))).includes('breakfast'))
  const c = candidates(state({ logs, kcalLeft: 1850.4, streak: 9 }), at(today, '13:00')).find((x) => x.goal === 'lunch')
  assert.deepEqual(c?.vars, { streak: '9', meal: 'lunch', Meal: 'Lunch', kcalLeft: '1,850' })
})

test('walk only when nothing moved today and steps are under the goal', () => {
  const today = '2026-11-11'
  assert.ok(goals(candidates(state(), at(today, '12:30'))).includes('walk'))
  assert.equal(candidates(state({ steps: 3400 }), at(today, '12:30')).find((c) => c.goal === 'walk')?.vars.steps, '3,400')
  assert.ok(!goals(candidates(state({ steps: 9000 }), at(today, '12:30'))).includes('walk'))
  assert.ok(!goals(candidates(state({ logs: [row('walk', today, '07:00')] }), at(today, '12:30'))).includes('walk'))
})

test('never two pushes within 60 minutes', () => {
  const today = '2026-11-11'
  const logs = [...mealHistory(today), row('breakfast', today, '08:05')]
  const sends = [sent(today, '12:40', 'walk')]
  assert.deepEqual(candidates(state({ logs, sends }), at(today, '13:20')), [])
  assert.deepEqual(candidates(state({ logs, sends }), at(today, '13:39')), [])
  const later = goals(candidates(state({ logs, sends }), at(today, '13:41')))
  assert.ok(later.includes('lunch'))
  assert.ok(!later.includes('walk')) // walk already went out today
})

test('60 minutes is real time across the 29 Mar clock change', () => {
  // 01:50 CET and 03:05 CEST look 75 minutes apart on the wall but are 15 minutes apart.
  const sends: SentPush[] = [{ sent_at: '2026-03-29T00:50:00Z', goal: 'dinner', template_id: 'meal.x.0' }]
  const friendEvents = [{ friend_id: 'f1', friend: 'Sam', kind: 'workout_done' as const, at: '2026-03-29T01:00:00Z', session: 'Upper' }]
  assert.deepEqual(candidates(state({ sends, friendEvents }), new Date('2026-03-29T01:05:00Z')), [])
  assert.deepEqual(goals(candidates(state({ sends, friendEvents }), new Date('2026-03-29T01:50:00Z'))), ['friend'])
})

test('60 minutes is real time across the 25 Oct clock change', () => {
  // 02:30 CEST, then 02:15 CET: the wall clock went back, 45 real minutes passed.
  const sends: SentPush[] = [{ sent_at: '2026-10-25T00:30:00Z', goal: 'dinner', template_id: 'meal.x.0' }]
  const friendEvents = [{ friend_id: 'f1', friend: 'Sam', kind: 'workout_done' as const, at: '2026-10-25T01:00:00Z', session: 'Upper' }]
  assert.deepEqual(candidates(state({ sends, friendEvents }), new Date('2026-10-25T01:15:00Z')), [])
  assert.deepEqual(goals(candidates(state({ sends, friendEvents }), new Date('2026-10-25T01:31:00Z'))), ['friend'])
})

test('meal times stay on the wall clock on both clock-change days', () => {
  for (const [today, utcHour] of [['2026-03-29', 6], ['2026-10-25', 7]] as const) {
    const logs = daysBack(today, 9).map((d) => row('breakfast', d, '08:00'))
    assert.equal(at(today, '08:00').getTime(), Date.UTC(2026, Number(today.slice(5, 7)) - 1, Number(today.slice(8)), utcHour))
    assert.ok(!goals(candidates(state({ logs }), at(today, '07:55'))).includes('breakfast'))
    assert.ok(goals(candidates(state({ logs }), at(today, '08:00'))).includes('breakfast'))
  }
})

test('each goal at most once a day, even after he acted', () => {
  const today = '2026-11-11'
  const logs = [...mealHistory(today), row('breakfast', today, '13:30')]
  const sends = [sent(today, '13:00', 'lunch')]
  assert.ok(!goals(candidates(state({ logs, sends }), at(today, '14:30'))).includes('lunch'))
})

test('friends: big moments only, one push per friend per day', () => {
  const today = '2026-11-11'
  const ev = (friend_id: string, kind: 'workout_done' | 'streak_milestone' | 'passed_you', time: string, extra = {}) => ({
    friend_id, friend: `Alexandrina ${friend_id}`, kind, at: iso(today, time), ...extra,
  })
  const friendEvents = [
    ev('a', 'workout_done', '10:00', { session: 'Lower' }),
    ev('a', 'passed_you', '10:10'),
    ev('b', 'streak_milestone', '10:05', { streak: 12 }), // not a milestone
    ev('c', 'streak_milestone', '10:05', { streak: 30 }),
  ]
  const logs = [row('breakfast', today, '07:00')]
  const cs = candidates(state({ logs, friendEvents }), at(today, '10:20')).filter((c) => c.goal === 'friend')
  assert.deepEqual(cs.map((c) => [c.friendId, c.event]), [['a', 'passed_you'], ['c', 'streak_milestone']])
  assert.equal(cs[0].vars.friend, 'Alexandrina')
  const sends: SentPush[] = [{ ...sent(today, '10:20', 'friend'), friend_id: 'a' }]
  const next = candidates(state({ logs, friendEvents, sends }), at(today, '11:30')).filter((c) => c.goal === 'friend')
  assert.deepEqual(next.map((c) => c.friendId), ['c'])
})

// ---------- Streak saver ----------

test('streak saver: 3 h and 1 h before midnight, only when nothing is logged', () => {
  const today = '2026-11-11'
  const logs = [row('dinner', addDays(today, -1), '19:00')]
  const s = (sends: SentPush[] = [], extra: LogRow[] = []) => state({ logs: [...logs, ...extra], streak: 5, sends })
  const saver = (st: NudgeState, time: string) => candidates(st, at(today, time)).find((c) => c.goal === 'streak_saver')
  assert.equal(saver(s(), '20:59'), undefined)
  const first = saver(s(), '21:00')
  assert.deepEqual(first?.vars, { streak: '5', hoursLeft: '3' })
  assert.equal(candidates(s(), at(today, '21:00'))[0].goal, 'streak_saver')
  const once = [sent(today, '21:00', 'streak_saver')]
  assert.equal(saver(s(once), '22:30'), undefined)
  assert.deepEqual(saver(s(once), '23:00')?.vars, { streak: '5', hoursLeft: '1' })
  const twice = [sent(today, '21:00', 'streak_saver'), sent(today, '22:55', 'streak_saver')]
  assert.equal(saver(s(twice), '23:58'), undefined)
  assert.equal(saver(s([], [row('walk', today, '20:00')]), '21:30'), undefined)
  assert.equal(saver(state({ logs, restToday: true }), '21:30'), undefined)
})

test('streak saver on the clock-change days fires at 21:00 local', () => {
  const autumn = state({ logs: [row('dinner', '2026-10-24', '19:00')] })
  const spring = state({ logs: [row('dinner', '2026-03-28', '19:00')] })
  const has = (st: NudgeState, utc: string) => goals(candidates(st, new Date(utc))).includes('streak_saver')
  assert.equal(has(autumn, '2026-10-25T19:59:00Z'), false) // 20:59 CET
  assert.equal(has(autumn, '2026-10-25T20:00:00Z'), true) // 21:00 CET
  assert.equal(has(spring, '2026-03-29T18:59:00Z'), false) // 20:59 CEST
  assert.equal(has(spring, '2026-03-29T19:00:00Z'), true) // 21:00 CEST
})

// ---------- Backoff ----------

test('backoff: daily to day 7, pause on day 8, last check-in on day 18, reset on a log', () => {
  const logs = [row('breakfast', '2026-11-01', '08:00')]
  const days = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']
  const sends = days.map((d, i) => sent(d, '13:00', i % 2 ? 'walk' : 'lunch'))
  const run = (extra: SentPush[], date: string, time: string, moreLogs: LogRow[] = []) =>
    candidates(state({ logs: [...logs, ...moreLogs], sends: [...sends, ...extra] }), at(date, time))

  // day 7: still one reminder a day, and not the same kind as the last one
  const day7 = run([], '2026-11-07', '13:05')
  assert.deepEqual(goals(day7), ['lunch'])
  assert.equal(day7[0].phase, 'daily')
  assert.deepEqual(run([], '2026-11-07', '12:40'), []) // walk was the last kind, so no walk
  assert.deepEqual(run([sent('2026-11-07', '13:05', 'lunch')], '2026-11-07', '18:30'), []) // one a day

  // day 8: nothing at lunch, one pause message in the evening, then silence
  const s7 = [sent('2026-11-07', '13:05', 'lunch')]
  assert.deepEqual(run(s7, '2026-11-08', '13:00'), [])
  const pause = run(s7, '2026-11-08', '19:30')
  assert.deepEqual(pause.map((c) => [c.goal, c.stage]), [['backoff', 'pause']])
  const s8 = [...s7, sent('2026-11-08', '19:30', 'backoff')]
  assert.deepEqual(run(s8, '2026-11-09', '19:30'), [])
  assert.deepEqual(run(s8, '2026-11-17', '20:00'), [])

  // day 18: one last check-in, then nothing
  assert.deepEqual(run(s8, '2026-11-18', '19:30').map((c) => [c.goal, c.stage]), [['backoff', 'last']])
  const s18 = [...s8, sent('2026-11-18', '19:30', 'backoff')]
  assert.deepEqual(run(s18, '2026-11-19', '19:30'), [])
  assert.deepEqual(run(s18, '2026-12-05', '21:30'), [])

  // a new log resets everything
  const back = run(s18, '2026-11-20', '13:00', [row('breakfast', '2026-11-20', '09:00')])
  assert.ok(goals(back).includes('lunch'))
  assert.equal(back[0].phase, 'normal')
})

test('backoff pushes pick a matching pause or last message', () => {
  const logs = [row('breakfast', '2026-11-01', '08:00')]
  const sends = [sent('2026-11-01', '13:00', 'lunch')]
  const p = nextPush(state({ logs, sends }), at('2026-11-08', '19:30'), POOL, [], seededRng(1))
  assert.equal(p?.candidate.goal, 'backoff')
  assert.ok(p?.template.id.startsWith('backoff_pause.'))
  const q = nextPush(state({ logs, sends }), at('2026-11-18', '19:30'), POOL, [], seededRng(1))
  assert.ok(q?.template.id.startsWith('backoff_last.'))
})

// ---------- Bandit ----------

const lunch: Candidate = { goal: 'lunch', vars: { meal: 'lunch', Meal: 'Lunch' }, phase: 'normal' }
const friendlyMeals = POOL.filter((t) => t.id.startsWith('meal.friendly.'))

test('template choice is deterministic with a seeded rng', () => {
  const pool = eligible(POOL, lunch, false)
  const now = at('2026-11-11', '13:00')
  const draw = (seed: number) => {
    const rng = seededRng(seed)
    return Array.from({ length: 20 }, () => pickTemplate(pool, [], now, rng)?.id)
  }
  assert.deepEqual(draw(42), draw(42))
  assert.notDeepEqual(draw(42), draw(7))
  assert.ok(new Set(draw(42)).size > 5) // it rotates
})

test('a template sent yesterday is avoided, an older one is only penalised', () => {
  const now = at('2026-11-11', '13:00')
  const yesterday: SendRecord[] = [{ template_id: 'meal.friendly.3', sent_at: iso('2026-11-10', '13:00'), logged_after: false, user_id: 'me' }]
  const w = templateWeights(friendlyMeals, yesterday, now, 'me')
  assert.equal(w.find((x) => x.id === 'meal.friendly.3')?.weight, 0)
  const rng = seededRng(3)
  for (let i = 0; i < 500; i++) assert.notEqual(pickTemplate(friendlyMeals, yesterday, now, rng, 'me')?.id, 'meal.friendly.3')
  // another person's send does not put it to sleep for me
  const theirs = yesterday.map((r) => ({ ...r, user_id: 'them' }))
  assert.ok(templateWeights(friendlyMeals, theirs, now, 'me').find((x) => x.id === 'meal.friendly.3')!.weight > 0)
  // 10 days ago: awake again, but the least likely
  const old: SendRecord[] = [{ ...yesterday[0], sent_at: iso('2026-11-01', '13:00') }]
  const wo = templateWeights(friendlyMeals, old, now, 'me')
  const mine = wo.find((x) => x.id === 'meal.friendly.3')!
  assert.ok(Math.abs(mine.penalty - 0.017 * 0.5 ** (10 / 15)) < 1e-9)
  assert.ok(wo.every((x) => x.id === mine.id || x.weight > mine.weight))
})

test('success rates are shrunk: one lucky send does not decide, a real winner leads', () => {
  const now = at('2026-11-11', '13:00')
  const sends = (id: string, n: number, k: number): SendRecord[] =>
    Array.from({ length: n }, (_, i) => ({ template_id: id, sent_at: iso('2026-10-01', '13:00'), logged_after: i < k, user_id: 'x' }))
  const others = friendlyMeals.slice(1).flatMap((t) => sends(t.id, 10, 3))
  const lucky = templateWeights(friendlyMeals, [...sends(friendlyMeals[0].id, 1, 1), ...others], now, 'me')
  assert.ok(lucky[0].weight < 0.5)
  assert.ok(lucky[0].weight > lucky[1].weight)
  const strong = templateWeights(friendlyMeals, [...sends(friendlyMeals[0].id, 20, 15), ...others], now, 'me')
  assert.ok(strong[0].weight > 0.5)
})

test('the reward is a log of that goal within 2 hours', () => {
  const logs = [row('lunch', '2026-11-11', '14:30'), row('walk', '2026-11-11', '13:10')]
  assert.equal(rewardFor(iso('2026-11-11', '13:00'), 'lunch', logs), true)
  assert.equal(rewardFor(iso('2026-11-11', '12:00'), 'lunch', logs), false) // 2 h 30 later
  assert.equal(rewardFor(iso('2026-11-11', '13:00'), 'dinner', logs), false)
  assert.equal(rewardFor(iso('2026-11-11', '13:00'), 'streak_saver', logs), true)
})

test('savage messages only for savage mode', () => {
  const now = at('2026-11-11', '13:00')
  const rng = seededRng(9)
  for (let i = 0; i < 200; i++) assert.notEqual(pickTemplate(eligible(POOL, lunch, false), [], now, rng)?.tone, 'savage')
  assert.ok(eligible(POOL, lunch, true).some((t) => t.tone === 'savage'))
})

// ---------- The message pool ----------

const LONG: Record<string, string> = {
  meal: 'breakfast', Meal: 'Breakfast', kcalLeft: '1,850', streak: '365', session: 'Full Body',
  steps: '12,345', hoursLeft: '3', friend: 'Alexandrina', friendStreak: '365',
}
const BANNED = [
  'fat', 'fatty', 'skinny', 'ugly', 'chubby', 'obese', 'belly', 'thighs', 'gross', 'disgusting', 'loser',
  'pathetic', 'worthless', 'stupid', 'idiot', 'lazy', 'slob', 'pig', 'weak', 'retard', 'spaz', 'cripple',
  'midget', 'junk', 'binge', 'guilt', 'guilty', 'cheat',
]

test('every message fits: 40 character title, 110 character body, filled in', () => {
  for (const t of POOL) {
    for (const p of placeholders(t.title + t.body)) assert.ok(p in LONG, `${t.id} unknown {${p}}`)
    assert.ok(render(t.title, LONG).length <= 40, `${t.id} title ${render(t.title, LONG).length}`)
    assert.ok(render(t.body, LONG).length <= 110, `${t.id} body ${render(t.body, LONG).length}`)
  }
})

test('every savage message has a clean twin with the same placeholders', () => {
  const byId = new Map(POOL.map((t) => [t.id, t]))
  assert.equal(byId.size, POOL.length, 'ids are unique')
  const savage = POOL.filter((t) => t.tone === 'savage')
  assert.ok(savage.length > 0)
  for (const t of savage) {
    const twin = byId.get(t.twin ?? '')
    assert.ok(twin, `${t.id} has no twin`)
    assert.notEqual(twin.tone, 'savage')
    assert.deepEqual(twin.goals, t.goals)
    assert.equal(twin.stage, t.stage)
    assert.equal(twin.event, t.event)
    const ph = (x: typeof t) => [...new Set(placeholders(x.title + x.body))].sort()
    assert.deepEqual(ph(twin), ph(t), `${t.id} and ${twin.id} use different data`)
  }
})

test('no em dash, at most one emoji, no banned word', () => {
  const emoji = /\p{Extended_Pictographic}/gu
  for (const t of POOL) {
    const text = `${t.title} ${t.body}`
    assert.ok(!text.includes('—') && !text.includes('–'), `${t.id} has a dash`)
    assert.ok((text.match(emoji) ?? []).length <= 1, `${t.id} has emoji`)
    for (const w of BANNED) assert.ok(!new RegExp(`\\b${w}\\b`, 'i').test(text), `${t.id} uses "${w}"`)
  }
})

test('at least 8 messages per goal per tone', () => {
  for (const goal of GOALS) {
    for (const tone of TONES) {
      const n = POOL.filter((t) => t.goals.includes(goal) && t.tone === tone).length
      assert.ok(n >= 8, `${goal} ${tone}: ${n}`)
    }
  }
})

test('every friend event and backoff stage has messages in every tone', () => {
  for (const tone of TONES) {
    for (const event of ['workout_done', 'streak_milestone', 'passed_you']) assert.ok(POOL.some((t) => t.tone === tone && t.event === event))
    for (const stage of ['pause', 'last']) assert.ok(POOL.some((t) => t.tone === tone && t.stage === stage))
  }
})

test('every message ends on an action word', () => {
  const verbs = /\b(log|logs|logged|logging|snap|start|walk|train|do|go|send|give|tap|add|open|move|take|make|feed|press|plan|beat|spend|stack|stand|cheer|copy|respond|answer|catch|grab|fix|protect|restart|turn|bring|wave|return|equalise|hit|prove|tell|say|check)\b/i
  const missing = POOL.filter((t) => !verbs.test(t.body.split(/(?<=[.!?])\s+/).slice(-2).join(' ')))
  assert.deepEqual(missing.map((t) => `${t.id}: ${t.body}`), [])
})
