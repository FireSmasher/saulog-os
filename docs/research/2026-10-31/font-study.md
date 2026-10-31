# Font study, Saulog OS (31 Oct 2026)

GAPS FIRST. Fonts In Use search pages returned a generic shell (no results). Pentagram page returned only cookie script. Fontshare licence page unread. So the app-by-app type facts (Q1) are mostly UNVERIFIED. Items marked [U] come from model memory, not a fetched page. 12 of 12 fetches used.

## 1. What apps use
Verified:
- Duolingo: "Johnson Banks worked with the foundry Fontsmith to refine the Duolingo logotype and extend it into the Feather Bold typeface" (https://creativebloq.com/news/feather-bold). Feather Bold is proprietary, not licensable (https://madegooddesigns.com/duolingo-font/). Body is a DIN Round style face, sources disagree on exact name (https://www.designyourway.net/blog/duolingo-font/).
- MacroFactor: Pentagram credits Reset Type Studio for typeface development (https://pentagram.com/work/macrofactor, via search snippet; page itself unreadable). Typeface name not confirmed.
Unverified [U], not to be relied on: Strava, Whoop, Oura, Gentler Streak, Apple Fitness (SF Pro), Cal AI, Ladder, Hevy. No source found.
Pattern worth noting only as inference: the brand-led apps pay for custom or licensed faces; none confirmed to use default Inter.

## 2. Big-number faces and licences
- Instrument Sans: SIL OFL 1.1, VERIFIED ("licensed under the SIL Open Font License, Version 1.1", https://github.com/google/fonts/raw/main/ofl/instrumentsans/OFL.txt). Google Fonts yes.
- Geist, Inter, Manrope, Space Grotesk, Plus Jakarta Sans, Instrument Serif: OFL [U], all on Google Fonts [U] (Geist added 2024 [U]). Verify before ship.
- Satoshi, General Sans: Fontshare, Indian Type Foundry free licence [U], not Google Fonts, self-host files. Licence page not read.
- Tabular figures (tnum) and slashed zero (zero): feature support must be tested per font in the built woff2 [U]. Inter and Geist known to have tnum [U].

## 3. Pairings (390 px phone; sizes are proposals, untested)
A. Instrument Sans only (his first pick). Big number 56/600, -0.03em, tnum. Title 20/600, -0.02em. Body 13/400, -0.01em. Caption 11/500, +0.02em, uppercase optional. Numbers: Instrument Sans tnum. Safest to his taste; Google Fonts, Figma yes.
B. Instrument Sans UI + Instrument Serif accent for the hero number or section word. Number 64 serif/400, -0.02em, but tables stay sans tnum. Title 20/600. Body 13/400. Caption 11/500. Crafted feel, one serif moment per screen. Both Google, Figma yes.
C. Plus Jakarta Sans (his second pick) display 700 + Geist UI + Geist Mono-free tnum numbers. Number 52/700 -0.03em; title 18/700; body 13/400 Geist; caption 11/500. Google Fonts yes [U].
Fit: all three keep his dense, tnum, right-aligned rules. Satoshi/General Sans only if he accepts self-hosting.

## 4. AI-generated typography tells (no sources found; author judgement)
Inter or Plus Jakarta everywhere at one weight; gradient text on headings; tight uniform 16 px body with large radius cards; emoji as icons; oversized bold headings with no hierarchy beyond size; proportional (non-tabular) digits that jitter; centred numbers; default letter-spacing.
