// The reminder message pool (W3). The bandit in nudge.ts picks from it.
//
// House rules (Edwin, 11 Nov 2026): witty, direct, true to the data, one concrete action at
// the end. Savage mode may swear, but it is constructive: roast the excuse, never the
// person. No body, weight or looks words, no food shaming, no slurs, no real people.
// Title up to 40 characters, body up to 110 (after placeholders), at most one emoji, no em
// dashes. Savage line i in a group has the clean twin coach line i (same idea, same
// placeholders), so savage mode off always has a match.
//
// IDs are `${group}.${tone}.${index}` and are stored in notification_events.template_id.
// Never reorder or delete a line: append new ones at the end of a list. To retire a line,
// move it to RETIRED below so its history stays readable.
//
// Placeholders, all filled from real data by candidates():
// {meal} {Meal} breakfast, lunch or dinner | {kcalLeft} only when above 0 | {streak} only at 2+
// {session} the next Buhat session | {steps} only when Health sent steps | {hoursLeft} 1 to 3
// {friend} first name | {friendStreak} a milestone (7, 30, 100, 365 or every 100)
import type { BackoffStage, FriendEventKind, Goal, Template, Tone } from './nudge.ts'

type Line = [title: string, body: string]
type Group = Record<Tone, Line[]>

function group(key: string, goals: Goal[], lines: Group, extra: { stage?: BackoffStage; event?: FriendEventKind } = {}): Template[] {
  const out: Template[] = []
  for (const tone of ['friendly', 'cheeky', 'coach', 'savage'] as Tone[]) {
    lines[tone].forEach(([title, body], i) => {
      out.push({
        id: `${key}.${tone}.${i}`,
        goals,
        tone,
        title,
        body,
        ...(tone === 'savage' ? { twin: `${key}.coach.${i}` } : {}),
        ...extra,
      })
    })
  }
  return out
}

const MEAL: Group = {
  friendly: [
    ['{Meal} time', 'No {meal} logged yet. Snap a photo and say the grams.'],
    ['How was {meal}?', 'Tell the app what you ate. One photo is enough.'],
    ['{Meal} check', '{kcalLeft} kcal left today. Log {meal} so the number stays true.'],
    ['Quick one', 'Log {meal} now, while you still remember the grams.'],
    ['Your usual {meal} time', 'This is when you normally eat. Log it in ten seconds.'],
    ['{Meal} not in yet', 'Tap one of your usual foods to add it fast.'],
    ['Keep the day honest', 'Add {meal} now and today’s totals stay right.'],
    ['{streak} days strong', 'Keep it going. Log {meal} with one photo.'],
  ],
  cheeky: [
    ['{Meal} or it didn’t happen', 'No photo, no proof. Snap {meal} and say the grams.'],
    ['The app is hungry too', 'It has nothing for {meal} yet. Feed it one photo.'],
    ['Plot twist: you ate', 'Probably. The app can’t tell. Log {meal} and settle it.'],
    ['Memory is a liar', 'In two hours you will guess the grams. Log {meal} now.'],
    ['Psst. {Meal}.', 'Logging it takes ten seconds. Do it now.'],
    ['Ghost {meal}?', 'Eaten but not logged is a ghost. Snap it so it counts.'],
    ['{kcalLeft} kcal says hi', 'It wants to know what {meal} was. Log it and find out.'],
    ['{streak} days and counting', 'Your streak is watching. Log {meal} with one photo.'],
  ],
  coach: [
    ['{Meal} window is open', 'Accurate data beats perfect meals. Log {meal}: photo, grams, done.'],
    ['Data first', '{Meal} is not logged yet. Log it before the next task.'],
    ['Protein check', 'Log {meal} and check your protein. Then plan the next meal.'],
    ['One rep: log {meal}', 'Small habit, big payoff. Snap it now.'],
    ['Budget update', '{kcalLeft} kcal left. Log {meal} so the plan stays real.'],
    ['Close the loop', 'You ate, now record it. Log {meal} in under a minute.'],
    ['Consistency wins', 'Logging every {meal} is the habit. Do this one now.'],
    ['{streak} days of discipline', 'Protect the pattern. Log {meal} now.'],
  ],
  savage: [
    ['{Meal} won’t log itself', 'Stop fucking around and log {meal}. Photo, grams, done.'],
    ['Data first, damn it', '{Meal} is still not logged. Do it before you touch anything else.'],
    ['Guessing is bullshit', 'Log {meal} and check your protein. Then plan the next meal like you mean it.'],
    ['One rep. That’s it.', 'You’ve lifted heavier shit than a phone. Log {meal}.'],
    ['Numbers don’t lie', '{kcalLeft} kcal left. "About that much" is not a damn number. Log {meal}.'],
    ['You ate. Prove it.', 'The excuse takes longer than the log. Log {meal}, for fuck’s sake.'],
    ['No days off from basics', 'Every {meal} gets logged. Including this one. Haul ass and log it.'],
    ['{streak} days. Don’t blink.', 'You built that. Don’t piss it away. Log {meal}, right now.'],
  ],
}

const WORKOUT: Group = {
  friendly: [
    ['{session} today', 'Your plan has {session} up next. Open Buhat and start the first set.'],
    ['Training day', '{session} is waiting. Even 20 minutes counts. Log your first set.'],
    ['Ready when you are', '{session} is next. Shoes on, open the app, log set one.'],
    ['Your usual gym time', 'This is when you usually train. Start {session} now.'],
    ['Small start', 'The rest tends to follow. Do the first exercise of {session}.'],
    ['Gym o’clock', '{session} today. Log each set as you go.'],
    ['Keep the streak lifting', '{streak} days in. Add {session} to today.'],
    ['Future you says thanks', 'Start {session} now and log it in Buhat.'],
  ],
  cheeky: [
    ['The bar misses you', '{session} is on today. Go say hi and log a set.'],
    ['Couch 1, you 0', 'Equalise. Start {session} and log the first set.'],
    ['{session} called', 'It bet you would skip it. Prove it wrong. Log set one.'],
    ['Warm-up starts now', 'Not after this video. Now. Start {session} and log the first set.'],
    ['Weights are patient', 'Not that patient. {session} today. Log a set.'],
    ['Excuse vs warm-up', 'Your excuse takes longer than one warm-up set. Start {session}.'],
    ['Spoiler: you feel great', 'It happens right after {session}. Start it and log it.'],
    ['Streak {streak}, lifts: pending', 'Make it a full day. Start {session}.'],
  ],
  coach: [
    ['{session}: go', 'Training day. Warm up, then log your first working set.'],
    ['Show up', 'Showing up is the win. Start {session} and log set one.'],
    ['Plan says {session}', 'Follow the plan, not the mood. First set now.'],
    ['Overload needs reps', 'Beat last time on one lift in {session}. Log it.'],
    ['20 minutes minimum', 'No time is not a reason. Do 20 minutes of {session}.'],
    ['Discipline over mood', 'Motivation shows up late. Start {session} anyway.'],
    ['Earn the day', 'Train {session}, log each set, rest, repeat.'],
    ['{streak} days of habits', 'Stack a workout on top. {session}, set one, now.'],
  ],
  savage: [
    ['{session}. Now.', 'Warm up, then log your first working set. No fucking negotiating.'],
    ['Show the hell up', 'That’s the whole job. Start {session} and log set one.'],
    ['The plan doesn’t give a shit', 'Your mood is not on the program. {session} is. Start the first set now.'],
    ['Last week is laughing', 'Beat one lift from last time in {session}. Log it and shut that shit up.'],
    ['No time? Bullshit.', 'You have 20 minutes. Spend them on {session}. Start now.'],
    ['Motivation is a no-show', 'Who gives a damn. Train anyway. Start {session}, first set, right now.'],
    ['Earn your damn rest', 'Train {session}, log each set, then rest. In that order.'],
    ['{streak} days. Add iron.', 'Don’t half-ass today. Stack {session} on that streak. Set one, now.'],
  ],
}

const WALK: Group = {
  friendly: [
    ['Walk break?', 'No movement logged yet today. A 10 minute walk counts. Log it after.'],
    ['Fresh air time', 'Step out for 10 minutes, then tap Move to log it.'],
    ['{steps} steps so far', 'A short walk adds up. Go, then log it in Move.'],
    ['Move a little', 'Any walk counts, even around the block. Log it when you’re back.'],
    ['Your usual walk time', 'This is when you normally move. 10 minutes, then log it.'],
    ['Phone call? Walk it.', 'Take your next call on foot and log the minutes.'],
    ['Sun out? Maybe.', 'Either way, a walk helps. Go for 10 minutes and log it in Move.'],
    ['{streak} days going', 'Add a walk to today. 10 minutes, then log it.'],
  ],
  cheeky: [
    ['Your chair needs a break', 'Give it 10 minutes off. Walk, then log it in Move.'],
    ['{steps} steps? Warming up.', 'Make it a real number. Walk 10 minutes and log it.'],
    ['Outside still exists', 'Confirmed. Go check for 10 minutes and log the walk.'],
    ['Podcast plus walk', 'Best combo in the app. Press play, step out, log the minutes.'],
    ['Hallway laps?', 'Cute, but a real walk counts more. 10 minutes, then log it.'],
    ['Walking is free', 'No subscription needed. 10 minutes, then log it in Move.'],
    ['Plot: a short walk', 'Twist: you feel better. Go 10 minutes, log it.'],
    ['{streak} days, 0 walks today', 'Fix the second number. Walk 10 minutes and log it.'],
  ],
  coach: [
    ['Move now', 'No activity logged today. Walk 10 minutes, then log it in Move.'],
    ['Steps: {steps}', 'Below goal. A brisk 15 minute walk closes a good part of the gap.'],
    ['Recovery walk', 'Easy pace helps recovery. 10 minutes, then log it.'],
    ['Daily minimum', '10 minutes of walking. Start the timer now.'],
    ['Daily movement', 'Movement is the base of the plan. Walk and log it.'],
    ['Break the sitting', 'Stand up, walk 10 minutes, log it. Then back to work.'],
    ['Habit stack', 'After your next coffee, walk 10 minutes. Log it in Move.'],
    ['{streak} days of logging', 'Now log some movement too. Walk 10 minutes.'],
  ],
  savage: [
    ['Move. Now.', 'No activity logged today. Get your ass out for 10 minutes, then log it.'],
    ['{steps} steps won’t cut it', 'That’s bullshit and you know it. Brisk 15 minute walk. Log it.'],
    ['The couch isn’t recovery', 'An easy walk is. 10 damn minutes. Log it.'],
    ['10 minutes. No debate.', 'You’ve spent longer deciding, for fuck’s sake. Start the timer and walk.'],
    ['Basics, damn it', 'Movement is the base. Walk and log it. No shortcuts.'],
    ['Sitting is winning', 'Like hell it is. Walk 10 minutes, log it, then sit again.'],
    ['Coffee, then walk', 'After this coffee you walk 10 minutes. Then you log it. Done.'],
    ['{streak} days. Now move.', 'Logging is half the damn job. Walk 10 minutes and log it.'],
  ],
}

const STREAK: Group = {
  friendly: [
    ['Your streak needs one log', 'Nothing logged today yet. Any meal, walk or set keeps it alive.'],
    ['{streak} days on the line', 'One log before midnight saves it. Snap whatever you ate.'],
    ['Still time', '{hoursLeft} h left today. Log one thing and the day counts.'],
    ['Quick save', 'Log a snack, a walk, anything. Today still counts.'],
    ['Keep your {streak} days', 'That’s all it takes: one photo before midnight. Snap it now.'],
    ['Evening check-in', 'Nothing in today. Add one meal and you’re safe.'],
    ['Keep the flame lit', 'One log before midnight. Open the app and add a meal.'],
    ['Today isn’t over', '{hoursLeft} h to go. Log one thing to keep your streak.'],
  ],
  cheeky: [
    ['Midnight is coming for it', 'Your {streak} day streak, that is. Log one thing to stop it.'],
    ['Plot twist ending?', 'Not tonight. Log one meal and the streak lives.'],
    ['Tick tock', '{hoursLeft} h left. One log, any kind. Go.'],
    ['Your streak texted me', 'It’s nervous. Log anything and it calms down.'],
    ['Low effort, high reward', 'Best deal today: one photo saves {streak} days. Take it.'],
    ['This is your sign', 'Literally. Log one thing before midnight.'],
    ['Don’t make it awkward', 'Nothing logged today. Fix it with one tap.'],
    ['{streak} days, {hoursLeft} h left', 'The math says: log something now.'],
  ],
  coach: [
    ['Protect the streak', 'Nothing logged today. One log keeps the chain. Do it now.'],
    ['{streak} days of work', 'Don’t hand it back. Log one meal before midnight.'],
    ['{hoursLeft} h left', 'The minimum is one log. Hit the minimum.'],
    ['Minimum effective dose', 'Log one entry: meal, walk or set. Then rest.'],
    ['Keep the chain', 'Chains break at one link. Today is that link. Log one thing.'],
    ['Close out the day', 'Log what you ate today. A rough guess beats nothing.'],
    ['Finish strong', 'Last task of the day: one log. Do it now.'],
    ['Habits live on bad days', 'This one counts double. Log one thing before midnight.'],
  ],
  savage: [
    ['Protect the damn streak', 'Nothing logged today. One log keeps the chain. Now, not later.'],
    ['{streak} days. Don’t waste them.', 'You earned that shit. Log one meal before midnight.'],
    ['{hoursLeft} h. Move your ass.', 'The minimum is one log. No excuse is smaller than that. Log it.'],
    ['One entry. That’s it.', 'Meal, walk or set. Log the damn thing, then go to bed.'],
    ['Chain’s about to snap', 'Hell no. Today is the loose link. Fix it. Log one thing.'],
    ['Guess the grams. Who cares?', 'A rough log beats a perfect excuse. Log today’s food.'],
    ['Last job of the day', 'One fucking log. Do it before you brush your teeth.'],
    ['Bad day? Still counts.', 'Bad days are where habits get built. No bullshit. Log one thing. Go.'],
  ],
}

const FRIEND_WORKOUT: Group = {
  friendly: [
    ['{friend} just trained', '{friend} finished {session}. Send kudos, then plan yours.'],
    ['{friend} is on a roll', '{session} done. Give a kudos and log something of your own.'],
    ['Crew update', '{friend} finished {session}. Your turn: log a workout or a walk.'],
  ],
  cheeky: [
    ['{friend} beat you to it', '{session} done already. Kudos first, then catch up.'],
    ['Good peer pressure', '{friend} did {session}. You know what to do. Log a set.'],
    ['{friend} is showing off', 'Rightly so. {session} done. Answer with a workout of yours.'],
  ],
  coach: [
    ['{friend} put in the work', '{session} done. Match the energy: log your next session.'],
    ['Crew standard', '{friend} trained {session}. Hold the standard. Train today.'],
    ['Accountability ping', '{friend} did {session}. Give kudos, then log yours.'],
  ],
  savage: [
    ['{friend} did the work', '{session} done. Where the hell is yours? Log your next session.'],
    ['{friend} raised the bar', '{session} is done. Your excuse isn’t. Cut the crap and train today.'],
    ['{friend} showed up. You?', '{session} logged. Send kudos, then go earn your own damn session.'],
  ],
}

const FRIEND_STREAK: Group = {
  friendly: [
    ['{friend} hit {friendStreak} days', 'Big streak. Send kudos and log your own day.'],
    ['Streak party', '{friend} is at {friendStreak} days. Cheer them on, then log today.'],
    ['Milestone in the crew', '{friend} reached {friendStreak} days. Give a kudos.'],
  ],
  cheeky: [
    ['{friend}: {friendStreak} days', 'Big flex. Send kudos and log yours.'],
    ['{friendStreak} days?!', '{friend} isn’t stopping. Neither should you. Log something.'],
    ['{friend} is on fire', '{friendStreak} days. Grab a spark: log today.'],
  ],
  coach: [
    ['{friend}: {friendStreak} days', 'That’s consistency. Copy it: log today.'],
    ['Proof it works', '{friend} reached {friendStreak} days. Same habit, your turn. Log one thing.'],
    ['Crew milestone', '{friend} hit {friendStreak} days. Send kudos, then protect yours.'],
  ],
  savage: [
    ['{friend}: {friendStreak} days', 'That’s what consistency looks like. Stop admiring that shit. Log today.'],
    ['{friendStreak} days. No bullshit.', '{friend} found time every day. So can you. Log one thing.'],
    ['{friend} keeps showing up', '{friendStreak} days. Kudos, then go protect your own damn streak.'],
  ],
}

const FRIEND_PASSED: Group = {
  friendly: [
    ['{friend} passed you', 'On this week’s crew table. Log a meal or a set to climb back.'],
    ['Table shuffle', '{friend} moved ahead of you. A workout day is +15 XP. Log one.'],
    ['Friendly race', '{friend} is just ahead this week. Log something to close the gap.'],
  ],
  cheeky: [
    ['{friend} overtook you', 'Rude. Log a workout and return the favour.'],
    ['You’ve been lapped', 'By {friend}, this week. Log a set and take it back.'],
    ['{friend} waves from above', 'On the crew table. Log something and wave back.'],
  ],
  coach: [
    ['{friend} moved ahead', 'XP is earned daily. Log your meals and training today.'],
    ['Gap to close', '{friend} is ahead this week. A workout day is +15 XP. Go get it.'],
    ['Compete', '{friend} passed you. Respond with work: log today’s session.'],
  ],
  savage: [
    ['{friend} just passed you', 'XP is earned daily. Get your ass moving. Log meals and training today.'],
    ['Gap to close. Now.', '{friend} is ahead this week. A workout day is +15 XP. Go take the damn thing.'],
    ['Respond with work', '{friend} passed you. Complaining earns 0 fucking XP. Log today’s session.'],
  ],
}

const BACKOFF_PAUSE: Group = {
  friendly: [
    ['Pausing reminders', 'These don’t seem to help right now, so I’ll stop. Log anything to turn them back on.'],
    ['Taking a break', 'No more reminders for now. Log one meal when you’re ready and they come back.'],
    ['I’ll go quiet', 'Reminders are paused. Log one thing any time to restart them.'],
    ['Your call', 'I’m pausing nudges. Open the app and log a meal whenever you’re ready.'],
  ],
  cheeky: [
    ['Okay, I get the hint', 'Reminders paused. Log anything and I’m back, no hard feelings.'],
    ['Going quiet now', 'A week of talking to myself. Pausing. Log one thing to bring me back.'],
    ['Muting myself', 'You win. No more nudges. Log one thing and I’ll be back.'],
    ['Fine, I’ll wait', 'Reminders off for now. The app is still here. Log a meal to restart.'],
  ],
  coach: [
    ['Resetting the plan', 'Reminders paused. When you’re ready, restart with one easy log.'],
    ['Pause, not quit', 'No nudges for now. Restart small: log one meal.'],
    ['Back to basics later', 'Reminders are off. Log one thing to turn them back on.'],
    ['Start small again', 'Nudges paused. When you return, log one thing. That’s step one.'],
  ],
  savage: [
    ['Pausing. Not quitting.', 'Reminders paused. When the bullshit excuses run out, restart with one easy log.'],
    ['Pause, not quit', 'No nudges for now. Restarting takes one damn log. Log one meal.'],
    ['Silence. Your move.', 'Reminders are off. Quit the bullshit and log one thing to turn them back on.'],
    ['Ball’s in your court', 'Nudges paused. Come back and log one damn thing. That’s step one.'],
  ],
}

const BACKOFF_LAST: Group = {
  friendly: [
    ['Just checking in', 'Haven’t heard from you in a while. Log one meal and reminders come back.'],
    ['Still here', 'No pressure. Whenever you want, open the app and log one thing.'],
    ['One last hello', 'This is my last nudge for now. Log one thing to turn reminders back on.'],
    ['Door’s open', 'Come back any day: log a single meal and everything restarts.'],
  ],
  cheeky: [
    ['Remember me?', 'The app with the grams. Log one thing and we’re good.'],
    ['Long time no log', 'Last ping from me. Snap one photo and we pick up where we left off.'],
    ['Knock knock', 'It’s your food log. Open up and add one meal.'],
    ['Final nudge, promise', 'After this I’m quiet. Log one thing to start again.'],
  ],
  coach: [
    ['Restart today', 'The best restart is small. Log one meal today.'],
    ['Fresh start', 'Streaks can start again any day. Make it today: log one thing.'],
    ['Last check-in', 'No more nudges after this. Log once and the system restarts.'],
    ['Day one again', 'Everyone restarts. Log one meal and you’re back in.'],
  ],
  savage: [
    ['Restart. Today.', 'The best restart is small. Log one meal today. Stop waiting, damn it.'],
    ['Clean slate, no excuses', 'Streaks start again any day. Make it today, for fuck’s sake: log one thing.'],
    ['Last check-in. Listen up.', 'No more nudges after this. Log once and this shit restarts.'],
    ['Day one again. So what?', 'Everyone restarts. Log one meal and get back in the damn fight.'],
  ],
}

export const POOL: Template[] = [
  ...group('meal', ['breakfast', 'lunch', 'dinner'], MEAL),
  ...group('workout', ['workout'], WORKOUT),
  ...group('walk', ['walk'], WALK),
  ...group('streak', ['streak_saver'], STREAK),
  ...group('friend_workout', ['friend'], FRIEND_WORKOUT, { event: 'workout_done' }),
  ...group('friend_streak', ['friend'], FRIEND_STREAK, { event: 'streak_milestone' }),
  ...group('friend_passed', ['friend'], FRIEND_PASSED, { event: 'passed_you' }),
  ...group('backoff_pause', ['backoff'], BACKOFF_PAUSE, { stage: 'pause' }),
  ...group('backoff_last', ['backoff'], BACKOFF_LAST, { stage: 'last' }),
]

// Lines taken out of rotation; kept so old template_ids still resolve in reports.
export const RETIRED: Template[] = []

export const templateById = (id: string) => POOL.find((t) => t.id === id) ?? RETIRED.find((t) => t.id === id)
