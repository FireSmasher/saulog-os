# Flow and nudge study, Saulog OS (Kain, Buhat) - 2026-10-31

GAPS FIRST. Not reached or not verified: Apple Fitness ring-close pages (Apple page fetched was a generic Watch guide, no ring text), MacroFactor help article (JS-only page, empty), Strong, Fitbod, Cal AI step-by-step flow (only the home page), the Patel 2019 JMIR trial and Patel 2021 Obesity review (search summary only, not read; PMC id I guessed was a wrong paper, discarded). Tap counts below are my design estimates, not measured from those apps. Anything about their animations/haptics is from general knowledge and marked UNSOURCED.
Fetches used: 14 of 14 (6 curl batch, 2 WebSearch, 4 curl batch, 2 curl-in-one-call for Cal AI and MacroFactor home).

## 1. Sourced facts
- Hevy live PR: "When you exceed a previous best performance and mark a set as complete, you're presented with a banner, and your new PR is saved for the workout." https://www.hevyapp.com/features/live-pr/ (fetched 2026-10-31). PR types: 1RM, heaviest weight, set volume, most reps, duration.
- Hevy medal: per search summary of help.hevyapp.com, "a medal will appear for the set the PR was achieved" and no PR is flagged with no earlier value to compare. https://help.hevyapp.com/hc/en-us/articles/36012016405655 (snippet only).
- Hevy rest timer starts when a set is marked complete, adjustable in 15 s steps (search summary, https://www.hevyapp.com/features/workout-rest-timer/ not read).
- Hevy finish screen: "you're taken to a new window where you can see the ordinal number of the workout, your active streak (only for the first workout of the week), and options to share". https://www.hevyapp.com/features/workout-log/
- Hevy prefill (user testimonial on same page): "I love how it holds the last rep and weight from the previous time I did the exercise."
- Cal AI: "Snap a photo, scan a barcode, or describe your meal and get instant calorie and nutrient info." https://www.calai.app/
- Self-monitoring review: "All of the 15 studies that focused on dietary self-monitoring found significant associations between self-monitoring and weight loss." and "A significant association between self-monitoring and weight loss was consistently found; however, the level of evidence was weak because of methodological limitations." Burke et al 2011, https://pmc.ncbi.nlm.nih.gov/articles/PMC3268700/
- Same review row: "Significant association between number of diaries submitted and wt loss."
- Digital self-monitoring (Patel 2021, via search summary only, WEAK until read): few interventions had engagement of 75% of days or more; greater digital self-monitoring linked to weight loss in 74% of occurrences. https://www.healthday.com/healthpro-news/nutrition/digital-self-monitoring-linked-to-weight-loss-for-adults-2650738788.html
- Risk: "We found that a substantial percentage (~75%) of participants used My Fitness Pal and that 73% of these users perceived the app as contributing to their eating disorder." N=105 with diagnosed eating disorder, correlational, self-report. Levinson et al 2017, https://pmc.ncbi.nlm.nih.gov/articles/PMC5700836/ . Also "Recent research has shown that in undergraduates, calorie tracking is associated with eating disorder pathology."

## 2. Moment of a log (what to build; mostly UNSOURCED convention, Hevy parts sourced)
Within 1 s: the tapped item fills its slot, a ring/bar segment animates to the new total, light haptic, one-line result ("Lunch 640 kcal, 52 g protein left to go: 71"). Workout: set row ticks, rest timer starts, PR banner and medal only if truly a PR (Hevy pattern). Day end: recap card of logged things, not targets hit. Weekly recap: days logged count, PRs.

## 3. Minimal flows (my proposal, tap counts)
Meal (photo + voice + barcode into one plate):
1. Tap Kain's big "+ Plate" button (1 tap). Camera opens live, plate draft started.
2. Shutter (1 tap). Photo thumb pins to plate; mic auto-opens.
3. Speak "200 g chicken, 150 g rice" (0 taps, auto stop on pause). Rows appear with grams, kcal, protein.
4. Optional barcode: tap scan chip (1), scan auto-adds a row, returns to plate.
5. Plate screen shows running total vs 2,000 / 160 and the fill bar. Tap "Log" (1 tap). 1 s: plate drops into the day, ring fills, haptic, "Next: dinner".
Total: 3 taps (photo, voice only), 4 with a barcode, 5 if one row needs a gram edit.
Set log (Buhat):
1. Home shows "Next set: Lat Pulldown 35 kg x 12" prefilled from last time (Hevy-style). 
2. Tap the check (1 tap) if as planned. Row ticks, haptic, rest timer starts, PR banner if earned.
3. Different numbers: tap value, step with +/- 2.5 kg and +/- 1 rep (2 to 3 taps), then check.
Total: 1 tap as planned, 3 to 4 with one change.

## 4. Home screen (UNSOURCED pattern, built from decisions already made)
First glance: one next-action card chosen by time of day ("Lunch not logged yet" after 13:00, "Next set: ..." at gym), rings of calories and protein as neutral fill, streak chip. Wording neutral, no red, no "you missed". Max one push a day.

## 5. Evidence on frequency and risk
- Dietary self-monitoring is associated with weight loss in 15 of 15 reviewed studies, but evidence level WEAK (observational, methodological limits) per Burke 2011.
- More entries correlate with more loss; direction of causation not proven (motivated people log more). WEAK.
- Gamification risks: only calorie-tracking harm evidence I read is Levinson 2017, WEAK (small N, clinical sample, perception). No gamification-specific diet study read; that is a gap. Streaks that count logging, not targets, fit the cautious reading.

## 6. Ranked changes (expected effect; source)
1. One-tap prefilled set check with rest timer start; effect: fewer taps per set, more complete workout logs. Hevy pages above.
2. Plate flow: photo + voice + barcode into one draft, one Log tap; effect: lower logging friction, more days logged. Cal AI home; Burke 2011 (more diaries, more loss, WEAK).
3. Next-action card on home by time of day; effect: several returns a day. UNSOURCED, design inference.
4. 1 s completion feedback: bar fill + haptic + one-line result. UNSOURCED convention.
5. Live PR banner and medal only on real PRs; Hevy live PR page.
6. Streak with freeze counting logging only; Hevy shows streak on finish screen; risk note Levinson 2017.
7. Neutral progress fill, no red or over-target colouring; Levinson 2017 (WEAK).
8. Daily recap card of what was logged, not targets; UNSOURCED.
9. Weekly recap: days logged, PRs, best sets; Hevy has monthly report and year-in-review pages (existence only, not read).
10. One push a day, wording about the next action, off by default after two ignored days; UNSOURCED.
