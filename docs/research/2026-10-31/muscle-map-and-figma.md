# Muscle map and Figma for Education (31 Oct 2026)

Budget used: 14 fetches, hosts api.github.com, raw.githubusercontent.com, registry.npmjs.org, developers.figma.com, help.figma.com, forum.figma.com (one WebSearch). No walls hit. One guessed help.figma.com URL was a 404 (my guess, not a block).
Gaps: wger muscle SVG licence/regions not checked (repo is AGPL-3.0 per GitHub API, which is a poor fit for a public MIT-style repo). ExerciseDB and wger API fields not fetched. Region counts below are from README lists, not from counting SVG paths. Drawing quality not seen visually (screenshots not opened). react-native-body-highlighter (HichamELBSI) checked only for licence.

## A. Muscle maps
| Package | Licence | Regions (README) | Front/back | Primary vs secondary | Framework | Last push |
|---|---|---|---|---|---|---|
| react-body-highlighter (giavinh79) | MIT (LICENSE: "MIT License / Copyright (c) 2020 GV79") | 21 slugs: trapezius, upper-back, lower-back, chest, biceps, triceps, forearm, back-deltoids, front-deltoids, abs, obliques, adductor, hamstring, quadriceps, abductors, calves, gluteal, head, neck | anterior and posterior | No. Only a frequency count; highlightedColors[frequency-1] gives levels (could fake secondary as frequency 1, primary as 2) | React | 2026-09-20 (npm release 2021-07-17) |
| body-highlighter (lahaxearnaud) | MIT (LICENSE file is the same GV79 text, fork) | Same set as above (fork) | both | Same frequency mechanism | None, renders to DOM, zero runtime deps | 2026-10-30 (npm 2025-11-08) |
| react-muscle-highlighter (soroojshehryar) | MIT per GitHub API; LICENSE file starts "MIT License" | 23 slugs incl. deltoids, tibialis, knees, ankles, hands, feet, hair; male and female bodies; left/right side option | front and back | Yes, via intensity (1-based index into colors array) | React 18+ | 2026-01-07 |
| react-native-body-highlighter (HichamELBSI) | MIT per GitHub API | origin of the polygons | | | React Native | 2026-10-18 |

Quotes: body-highlighter README: "Body Highlighter is a **framework-agnostic** muscle map that renders straight to the DOM with zero runtime dependencies. It started as a fork of react-body-highlighter". react-muscle-highlighter README: "Intensity levels map to the `colors` array (1-based indexing)." and "Zero dependencies (except React)". react-body-highlighter README: "The SVG polygons were leveraged from the React Native package react-native-body-highlighter."
Sources: https://github.com/giavinh79/react-body-highlighter , https://github.com/lahaxearnaud/body-highlighter , https://github.com/soroojshehryar/react-muscle-highlighter , https://api.github.com/repos/{owner}/{repo} (dates, licence keys)
wger: https://github.com/wger-project/wger licence AGPL-3.0, pushed 2026-10-29. Avoid shipping its SVGs unless licence of the asset files is confirmed.

Recommendation, map: react-muscle-highlighter. It is the only one with a first-class primary/secondary mechanism (intensity), left/right, finer parts, MIT. Caveat: single contributor, last push January 2026, and it is a React component; the PWA can copy the slug-to-path data from assets/bodyFront/bodyBack .ts files (MIT, keep the notice) if not using React. Fallback: body-highlighter (framework-agnostic, actively maintained).

## B. Dataset
free-exercise-db (yuhonas): The Unlicense (public domain; README badge "License: Unlicense"). 876 exercises in dist/exercises.json. Fields: name, force, level, mechanic, equipment, primaryMuscles[], secondaryMuscles[], instructions[], category, images[], id. 17 muscle names: abdominals, abductors, adductors, biceps, calves, chest, forearms, glutes, hamstrings, lats, lower back, middle back, neck, quadriceps, shoulders, traps, triceps. Needs a small mapping table to the map slugs (abdominals to abs, glutes to gluteal, lats and middle back to upper-back, shoulders to deltoids, etc.).
Source: https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json
Recommendation, dataset: free-exercise-db.

## C. Figma for Education
Click path (official): "From the file browser, click Admin in the left sidebar. Select the People tab. Click a person's current seat from the Seat type column. In the popup modal, select and confirm the new seat type." Source: https://help.figma.com/hc/en-us/articles/360039960434-Compare-and-manage-seats-in-Figma (page lists Education among plans for this feature).
Cost: nothing. Same page: "Figma for Education provides free access to Professional or Enterprise". Figma staff on the forum (29 Aug 2026): "There's no billing on an Education plan, so Seat type is simply controlling what you can access and not what you pay... for verified Education users, that upgrade is automatically approved and free." https://forum.figma.com/report-a-problem-6/education-plan-being-upgraded-into-a-full-seat-after-creating-team-57334
Fallback if the Seat type control is absent (community reply, lower confidence): edit or create a Figma Design file in the team to trigger an automatic Full seat request.
MCP rate limits (https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/): "View, Collab: Up to 20 per month" on every plan; Full, Dev: Professional up to 200 per day, 10 per minute; Organization 200/day, 15/min; Enterprise 600/day, 20/min. "Education plans have the same limits as Full and Dev seats on the Professional plan: up to 200 tool calls per day and 10 per minute." Write tools (add_code_connect_map, create_new_file, generate_figma_design, whoami) are exempt. Implication: on View the cap is 20 reads per month.
