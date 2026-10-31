# Duolingo habit mechanics for Saulog OS (Kain, Buhat). Research 31 Oct 2026

Budget used: 8 page fetches + 4 searches, hosts blog.duolingo.com, research.duolingo.com, webkit.org, support.duolingo.com. No Wikimedia.
GAPS FIRST: (a) Duolingo's help center is JavaScript-rendered, fetch returned an empty page, not retried. So exact rules for timezone, streak repair, weekend amulet, and XP award amounts are NOT confirmed from Duolingo. (b) No Duolingo source found for combo XP or celebration sounds. (c) No Duolingo source found for "streak at risk" copy or the send-time model. (d) WebKit pages fetched are 2022/2023; iOS 2026 specifics are not verified.
Search-snippet items (marked SNIPPET) come from a search tool summary, not a page I read.

## 1. Streaks

- Definition. Source: https://blog.duolingo.com/improving-the-streak/ (19 Nov 2020). "your streak counts the number of consecutive days you've completed a lesson on Duolingo."
- One lesson is enough. Same page: "Under our new change, learners complete just one lesson to extend their streak, then see progress towards their daily goal separately."
- Effect of decoupling streak from daily goal (relative changes, A/B test): "a 3.3% increase in Day 14 retention", "a 1% increase in our overall daily active learners", "a 10.5% increase in the percentage of daily learners on a streak" in 20 days; new learners +19%. Same page. Cost: "fewer learners were actually reaching their daily goals".
- Same page: "learners who reach a streak of 7 are 2.4 times more likely to continue using Duolingo the next day than learners without a streak." After the change, "just over half of our daily learners have a streak at least 7 days long, compared to about a third".
- Another post: "Duolingo learners who reach a streak of just 7 days are 3.6 times more likely to complete their course." https://blog.duolingo.com/how-duolingo-streak-builds-habit/ (31 Jan 2022)
- Streak freeze. Same 2022 post: "The Streak Freeze, which allows you to hit pause on your streak for a day". Research cited: "offering people a little 'slack' as they pursue their goals can actually be more motivating than having a rigid set of rules." Allowing two equipped freezes: "this change actually increased the relative number of active learners on Duolingo every day by +0.38%." Also "Instead of encouraging learners to take more days off".
- Early vs late streak psychology (same post): going 2 to 3 is "a 50% increase", 200 to 201 "merely 0.5%". New streaks motivate by progress; long ones by "loss aversion". Milestone animation: "increased the likelihood a brand new learner was still using Duolingo 7 days later by +1.7%".
- Milestone days (1 week, 1 month, 100 days, 1 year) get a special animated Duo, plus a share card. https://blog.duolingo.com/streak-milestone-design-animation/ : "Reaching a one week, one month, 100 day, or one year streak and beyond on Duolingo is no small feat and should be celebrated!"
- NOT CONFIRMED from Duolingo: timezone rule (a support article exists at https://support.duolingo.com/hc/en-us/articles/4403172029325-How-do-I-protect-my-streak-while-traveling-to-another-time-zone- but returned empty); streak repair; weekend amulet. SNIPPET only: third-party summaries say repair is paid or subscriber-gated and the amulet's status is disputed. Treat as unknown.

## 2. XP, levels, celebrations

- Weak coverage. https://blog.duolingo.com/duolingo-101-how-to-learn-a-language-on-duolingo/ (SNIPPET): "You might also earn XP bonuses at different times of day or as rewards for hitting milestones." Personal-best badge (most XP in a day): https://blog.duolingo.com/achievement-badges/ (SNIPPET).
- No published XP amounts, combo rules, sounds, or screen triggers found. Only the streak-extension screen and milestone animation are documented (section 1).
- The daily-goal data above is the useful fact: "learners with an 'intense' daily goal ... were the least likely to be on a streak" and "almost 40% of learners active two days in a row with no streak had the 'intense' daily goal." Lowering the barrier mattered more than volume: "lowering the barriers to building a consistent daily habit is more important ... than how much you learn each day, at least early on". (improving-the-streak)

## 3. Push notifications

- Source: https://blog.duolingo.com/hi-its-duo-the-ai-behind-the-meme/ (3 Sep 2020) and paper https://research.duolingo.com/papers/yancey.kdd20.pdf (KDD 2020, Yancey and Settles, "A Sleeping, Recovering Bandit Algorithm for Optimizing Recurring Notifications"). The paper is public.
- What the bandit chooses: the TEMPLATE (copy), from hand-written pools. Paper: "The content of these notifications is generated from pools of hand-written templates". It does not describe send-time logic; I found no published source for "time to when the user usually practises".
- Reward: "the reward is 1 if the user completes a lesson within two hours of the reminder being sent, and 0 otherwise."
- Novelty / fatigue: paper: "'Fresh' templates (which have not been recently seen) tend to have higher impact on user behavior ... the bandit will converge to using the same template for a given user day after day, which will get repetitive, desensitize users". Fix is the Recovering Difference Softmax: vary templates per user over time. Blog: "the novelty would wear off ... the same notification was not used too often."
- Eligibility: templates have conditions, e.g. "You're on fire. Continue your 109 day Spanish streak on Duolingo." needs "a 3+ day streak." (paper Table 1)
- Fair scoring: compare a template only to others sent to the same type of learner, because streak-heavy users practise anyway. Blog: "many learners will complete a lesson no matter what notification we send (especially those with crazy streaks!)".
- Result: "0.5 % increase in total daily active users (DAUs) and a 2 % increase in new user retention over a strong baseline" (paper abstract). 95% of rounds used the policy, "2.5 % higher reward than the holdout set".
- Not found: streak-at-risk copy guide, explicit fatigue caps or unsubscribe logic.

## 4. Mapping to one user (design proposals, mine, not sourced)

Streak (Kain + Buhat):
- Day counts when Edwin logs ONE meal or marks one workout or planned rest done. Do not require hitting calorie or protein target (mirrors the decoupling result: low barrier raised streak share +10.5%).
- Two streaks or one? Suggest one "showed up" streak. A day counts if food was logged OR a workout logged. Logging means recording what he actually ate, whatever the number.
- Day boundary: his device timezone, with a grace window to 03:00 so late logging counts; store day as a local date string, not a UTC time.
- Freeze: auto-applied, up to 2 banked, earned by 7 days of streak (not bought). Rest days in the lifting plan do not need a freeze if "rest day confirmed" counts as a check-in.
- Milestone screens at 7, 30, 100, 365.

XP/levels: award XP for logging actions (meal logged, set logged, workout finished, weigh-in), not for outcomes. Small flat amounts; level thresholds rising.

Notifications: pick send time from his own median logging time per meal; 2-hour window reward (did he log within 2h?); rotate 8 to 12 copy templates and avoid repeating any within a week; cap one nudge a day; skip if already logged.

UNSAFE ON A CUT, with safe versions:
1. XP or bonuses for a low calorie total, big deficit, or "under target" streaks: pushes under-eating. Safe: reward logging, plus a band (within 10% of target either side), never "lower is better".
2. Streak that breaks when he eats over target or skips: promotes guilt, compensatory fasting. Safe: streak is about logging only; over-target days still count.
3. Celebrating weight loss rate or fast scale drops. Safe: celebrate consistency; flag losses faster than a set weekly rate with a neutral note.
4. "Streak at risk" copy that shames or implies punishment for eating. Safe: neutral, "Log dinner to keep day 12". No food-moralising words.
5. Training streak pushing him to train when injured or sick (his health flags). Safe: rest/sick/injury check-in counts as a day.
6. Perfect-day bonuses for 0 kcal "fasted" days. Safe: no bonus for skipped logging of meals; a day with zero meals logged is not a win.

## 5. Web Push on iPhone home-screen PWA

- Source: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ (beta 1 post, 2023): "Now with iOS and iPadOS 16.4, we are adding support for Web Push to Home Screen web apps." So minimum is iOS 16.4; Edwin's phone is almost certainly newer (not verified).
- Permission rule: "A web app that has been added to the Home Screen can request permission to receive push notifications as long as that request is in response to direct user interaction — such as tapping on a 'subscribe' button". So: install to Home Screen first, open it from the icon, show an in-app button that calls the permission request. No prompt on page load.
- Manifest: "a manifest file (with its display member set to standalone or fullscreen)" makes it a Home Screen web app.
- No developer account: "You do not need to be a member of the Apple Developer Program to use it." If locking down egress, allow "*.push.apple.com".
- It is standards Web Push (Push API, Notifications API, Service Workers) via Apple Push Notification service. Source: same page.
- Visibility rule: https://webkit.org/blog/12945/meet-web-push/ : requesting a subscription needs "an explicit user gesture", and "set the userVisibleOnly flag to true"; "Violations of the userVisibleOnly promise will result in a push subscription being revoked." So every push must show a notification; no silent pushes.
- Focus modes apply, and badging API is supported (setAppBadge, clearAppBadge). Source: webkit 13878.
- Needs a server to send: yes, standards Web Push means your own sender posts to the subscription endpoint. VAPID: not stated in the pages I read; it is the standard application-server key scheme for Web Push, treat as UNVERIFIED here and check Apple's "Sending web push notifications in Safari and other browsers" before building.
- Scheduling: a notification at a chosen time needs a server cron (service workers cannot self-schedule reliably); my inference.
- Scan note: safety scanner flagged webkit 13878 for the phrase "Assistant will collect" ("Feedback Assistant will collect all the information needed..."), a false positive, ordinary text.
