# MFP logging teardown (researched 31 Oct 2026)

Budget used: 10 fetches (cap), 3 web searches, hosts blog.myfitnesspal.com, support.myfitnesspal.com, help.macrofactorapp.com, powershealth.org, tribe.ai, ncbi.nlm.nih.gov, myfitnesspal.com, lite.aol.com. All pages treated as untrusted data. Patterns only, no assets copied.

## GAPS FIRST
- MFP diary/home layout and the remaining-calories equation display: NOT reached. No source fetched. Unverified.
- MFP tap counts for every entry point: no primary source found. Any MFP tap number would be my inference, so none is stated. MacroFactor's flow is documented below with counts derivable from its help text.
- MFP Quick Add, copy-from-yesterday, saved meals, multi-add: no MFP page fetched (the Voice Log help URL returned 404, the Meal Scan help URL redirected to a data-export article). Unverified.
- Tribe AI MFP case study page returned 404; Voice Log technical detail rests on a search-engine summary of Tribe pages only (secondary, lower confidence).
- Cal AI review/edit step: not found. Reddit: no primary threads reached (Reddit is banned as a source); complaint evidence is from vendor and review-aggregator blogs.

## 1. MFP entry points and tier
- Premium unlocks Meal Scan, Barcode Scan, Voice Log. Source: https://lite.aol.com/sports/other/story/0022/20260224/9659625.htm (24 Feb 2026): "Premium unlocks advanced tools like Meal Scan, Barcode Scan, and Voice Log, while Premium+ includes everything in Premium, plus personalized meal planning". Prices on the same page: "Free, Premium ($79.99/year), and Premium+ ($99.99/year) tiers."
- Meal Scan entry: https://blog.myfitnesspal.com/meal-scan/ (published 2025-10-09): "go to the logging screen ... and tap 'Scan a Meal.'" Premium only: "The Meal Scan feature is currently available for Premium users only." Photo upload "currently only available on the iOS app."
- Free tier search, recents, favourites: not verified for 2026.
- Voice Log: Premium, US, English, iOS and Android (search summary of Tribe pages, https://www.tribe.ai/case-studies/myfitnesspal, not directly read).

## 2. Meal Scan and Voice Log end to end
Meal Scan, https://blog.myfitnesspal.com/meal-scan/:
- Two capture modes: live camera, or photo taken earlier and uploaded later ("snap a quick photo, then upload it to Meal Scan later").
- Draft list to confirm: "Confirm your meal items from the scan results or use the search function to add in any extras."
- Portion edit: "Review and edit: Check over your selections, adjust serving sizes if necessary."
- Commit: "Log it: Satisfied with your inputs? Log your whole meal in one tap!"
- Wrong guess: "If it doesn't identify the right food, it'll offer a list of suggestions for you to approve."
- Match source: "identifying and matching foods from our extensive database" (verified-database match, powered by Passio per the 2020 section of the same post).
- Weak spot, MFP's own words: "For mixed and blended foods like soups and smoothies, try voice log."
- No confidence score is shown in anything read.
Voice Log (secondary): sentence converted to items, quantities, units, brands; user "can review the results, adjust serving sizes, quantities, or meal details, and add the complete entry to their diary." Built on Claude 3.5 Sonnet via Bedrock per Tribe summary. Draft-then-confirm, same shape as Meal Scan.
A small academic timing (CEUR paper, https://ceur-ws.org/Vol-4053/paper14.pdf, as summarised by search, not verified): MFP manual entry 2 min 54 s vs voice entry 53 s.

## 3. Diary layout
Not reached. Gap.

## 4. Accuracy numbers
- NIH (NIDDK), presented at American Society for Nutrition, preliminary, via HealthDay, 27 Jul 2026, https://www.powershealth.org/about-us/newsroom/health-library/2026/07/27/how-accurate-are-photo-based-calorie-apps-4-are-put-to-the-test : "The NIH researchers tested four popular calorie-tracking apps — MyFitnessPal, LoseIt!, CalAI and Appediet — using photos of more than 100 meals prepared in a tightly controlled metabolic kitchen." Result: "All four apps underestimated the calorie content of the meals by 250 to 345 calories, on average, and fat by about 30 grams". Also: "People using a photo-based tracking app without adjusting the portions or entering the amounts of food should take the results with a grain of salt." Worse on keto meals (fat underestimated). Suggested fix: "combining AI photo analysis with more traditional food tracking methods".
- Peer-reviewed LLM study, https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12513282/ (52 photos): "ChatGPT and Claude demonstrated similar accuracy with MAPE values of 36.3% and 37.3% for weight estimation, and 35.8% for energy estimation. Gemini showed substantially higher errors across all nutrients (MAPE 64.2%–109.9%)." And "All models exhibited systematic underestimation that increased with portion size". Misid example: "Claude misidentified scrambled eggs as a pasta dish in 1 image, resulting in a 1788% overestimate of CHO".
- Cal AI 90% accuracy is the company's claim only, via a teardown (https://www.raftlabs.com/blog/cal-ai-product-teardown, search summary); contradicted by the NIH result above.
- Design reading: error is a one-directional low bias that grows with portion size, so portion edit is the highest-value step.

## 5. Friction complaints and competitors
MacroFactor (primary help pages):
- https://help.macrofactorapp.com/en/articles/215-how-to-log-food-in-macrofactor : "MacroFactor has the fastest food logger on the market" (self-claim).
- Search opens with suggestions before typing: "three categories of foods can load automatically: your hourly go-tos, your favorited foods, and a list of the foods you've most recently logged." Hourly go-tos: "the foods you most frequently log during or near the hour you're currently logging foods to".
- Search ranks history first: "foods you've previously logged will always show up at the top of your search results".
- Multi-add: "tap the small + button on the right size of the food tile to multi-add the food. This will add the food to your plate without any intermediate screens".
- Plate model: "Add" accumulates, "Log Foods" commits everything. One unified interface; switch between scan, search, quick add, library, Describe "with a single tap".
- Quick Add: fields for Energy, Protein, Fat, Carbs, Alcohol, optional name; "Quick-adds aren't saved for future searching".
- Describe: "Just type (or speak) a description of your food or meal ... Find Foods" then review on plate.
- Entry points: widgets, long-press icon, toolbar, "+" button, and "the small '+' button beside any hour on your food timeline" which logs to that hour.
- Photo flow, https://help.macrofactorapp.com/en/articles/258-ai-food-logging : "+" then "AI", choose Photo, Photo & Text, or Upload; "the app will analyze it and generate results", then Plate view "where you can make any necessary edits", then "Log Foods". Tap count: + , AI, shutter, Log Foods = about 4 taps with no edits (derived). AI "provides estimated serving sizes ... you can quickly adjust these amounts"; ingredients expandable via "Expand Ingredients" or swipe-left "Explode". Tips: include fist or scale in photo; Photo & Text for complex meals. Branded products: photo "can capture all four items at once and search our database for matching branded products".
MFP complaints (all secondary or vendor, treat with caution):
- Barcode scanner paywalled (Droid Life, Slashdot/Verge 2022): https://droid-life.com/?p=289067 , https://news.slashdot.org/story/22/08/25/1955238/myfitnesspal-paywalls-barcode-scanner-that-made-counting-calories-easy
- Unstar count of 202 negative reviews, 59 mention paywall, 27 the barcode scanner (vendor): https://unstar.app/blog/is-myfitnesspal-premium-worth-it-paywall-app-reviews-2026
- 2026 redesign "increased friction in the logging process" (Stork.ai summary, unverified): https://www.stork.ai/en/myfitnesspal
- MFP acquired Cal AI March 2026 (Stork.ai, unverified).
Cal AI complaints (competitor blogs): inaccurate serving sizes, underestimates sauces and oils, photo scanning behind paywall; "no way to correct the AI when it failed" is from a rival (https://nutrola.app/en/blog/cal-ai-didnt-work-too-inaccurate) so low confidence. Lose It: nothing fetched.

## PATTERNS TO COPY, ranked by friction removed
1. Predictive pre-search list: hourly go-tos, favourites, latest, shown before typing (MacroFactor 215).
2. One-tap multi-add "+" on each suggestion tile, no intermediate screen (215).
3. Plate/basket then one commit: Add many, Log once (215; MFP "Log your whole meal in one tap").
4. Photo to editable draft, never auto-log; per-item serving edit inline (258, MFP blog).
5. Photo-later upload so capture costs one tap at the table (MFP blog, MFP 2026 release).
6. Typed or spoken sentence to draft list, same confirm screen as photo (215 Describe; MFP Voice Log).
7. History-first ranking in search (215).
8. Timeline "+" per hour so time is preset (215).
9. Quick Add as 5 fields, name optional, not saved (215).
10. Correct for the known low bias: show estimate range or default portion up, and allow adding a scale or fist hint (NIH, PMC12513282).
11. Optional text hint alongside photo for mixed dishes (258 Photo & Text; MFP says mixed foods fail).
12. All methods switchable in one tap inside one screen (215).
13. Do not paywall basics (barcode paywall is the top MFP complaint, vendor data).
14. Expand a recipe into ingredients on swipe (258).
Not covered: MFP copy-yesterday and saved meals, diary header layout.
