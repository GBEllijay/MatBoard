# "Carlos" rename inventory — GBEllijay/MatBoard origin/main (f614aec, 2026-11-02 00:57 EST)

Read-only scan: `git grep -n -i carlos origin/main` (whole repo; package-lock excluded). Nothing was edited, committed, or pushed.

**Total: 218 matching lines across 21 files, plus the asset file name `public/assets/kids/carlos.webp`.**

## 1. User-visible text (fix first)

| file:line | current text | proposed |
|---|---|---|
| src/pages/MatchController.tsx:459 | `<legend>Master Carlos</legend>` (controller fieldset title) | `<legend>Grandmaster cheer</legend>` |
| src/pages/MatchController.tsx:470 | "…Off means no Carlos from these triggers." | "…Off means no Grandmaster from these triggers." |
| src/components/KidsScoreboardSwitcher.tsx:153 | Skin sheet toggle button label `Carlos` | `Grandmaster` |
| src/pages/Tournament.tsx:274 | Hint: "Grand Master Carlos stays in the corner after a champion…" | "The Grandmaster stays in the corner after a champion…" |
| README.md:21 | "**Master Carlos**" ×2 (repo docs, not in-app) | "**Grandmaster cheer**" |
| README.md:22 | "During a live bout Carlos stays off…" (repo docs) | "…the Grandmaster stays off…" |
| public/assets/kids/carlos.webp | asset URL is visible in page source / devtools / network tab | `public/assets/kids/grandmaster.webp` |

In-app user-visible: **4 lines** (MatchController 459 & 470, KidsScoreboardSwitcher 153, Tournament 274). Docs-visible: 2 README lines. Plus the public asset URL.
`CarlosCheer.tsx:69` image has `alt=""` (decorative) — no name in alt text. Cheer bubble text is "Bom trabalho!", "Congratulations, Coach!" etc. — no name.

**"Gracie":** no mascot references. All 17 `gracie` hits are the gym name "Gracie Barra Ellijay" (card maker line, e2e schedule titles) or negative-assert tests that keep "Gracie Barra" OUT of copy. Not part of this rename.

## 2. Rename notes / gotchas

- **Persisted state:** `MatchState.carlos` (src/lib/matchStore.ts:76, 173, 209, 226) is saved to localStorage `matboard.match.v1` and synced to display tabs. Renaming to `grandmaster` needs a read-fallback: `parseGrandmasterPrefs(parsed.grandmaster ?? parsed.carlos)` (lines 209, 226) or existing users lose their toggle. e2e fixtures (carlos-face, oldschool-landscape, scoreboard-fullscreen specs) seed `carlos:` and must change with it.
- Kids bracket prefs already use the neutral key `mascot` (KidsScoreboardSwitcher `prefs.mascot`) — no migration there.
- Files to `git mv`: `src/components/CarlosCheer.tsx → GrandmasterCheer.tsx`, `src/lib/carlosCelebration.ts → grandmasterCelebration.ts`, `src/lib/carlosCelebration.test.ts → grandmasterCelebration.test.ts`, `e2e/carlos-face.spec.ts → grandmaster-face.spec.ts`, `public/assets/kids/carlos.webp → grandmaster.webp` (new art). Update `package.json:12` test list.
- `carlosCelebration.test.ts:131` searches index.css for the literal `.kids-carlos__figure` reduced-motion block — rename CSS and test together.
- `CarlosCheer.tsx:70` and `index.css:16128` hold the head-box geometry of the current art (x 22–72%, y 2–42%) used to keep the bubble off the face; **re-measure for the new art** (e2e carlos-face.spec checks this).
- Optionally keep the old asset path 404-free for cached PWA clients for one release, then delete.

## 3. Full line inventory

| # | file:line | kind | current | proposed |
|---|---|---|---|---|
| 1 | README.md:21 | USER-VISIBLE string | `…rnament / Old School picker, and it does not offer **Master Carlos**. The Pro tournament suite scoreboard ('/match/control?from=suite') and …` | `…rnament / Old School picker, and it does not offer **Grandmaster**. The Pro tournament suite scoreboard ('/match/control?from=suite') and …` |
| 2 | README.md:22 | USER-VISIBLE string | `…ight and Dark — no separate cast stack). During a live bout Carlos stays off. After a champion is decided he slides in from the left, in fro…` | `…ight and Dark — no separate cast stack). During a live bout the Grandmaster stays off. After a champion is decided he slides in from the left, in fro…` |
| 3 | e2e/carlos-face.spec.ts:42 | test code (identifier / selector / state key) | `carlos: { enabled: true, onWin: false, onPoints: true, pointsThreshold: 1 },` | `grandmaster: { enabled: true, onWin: false, onPoints: true, pointsThreshold: 1 },` |
| 4 | e2e/carlos-face.spec.ts:60 | test code (identifier / selector / state key) | `const face = document.querySelector('.kids-carlos__face');` | `const face = document.querySelector('.kids-grandmaster__face');` |
| 5 | e2e/carlos-face.spec.ts:61 | test code (identifier / selector / state key) | `const bubble = document.querySelector('.kids-carlos__bubble');` | `const bubble = document.querySelector('.kids-grandmaster__bubble');` |
| 6 | e2e/carlos-face.spec.ts:84 | test code (identifier / selector / state key) | `expect(report.shown, 'Carlos face and bubble').toBe(true);` | `expect(report.shown, 'the Grandmaster face and bubble').toBe(true);` |
| 7 | e2e/carlos-face.spec.ts:118 | test name | `test('points-scored cheer keeps text off Carlos’s face', async ({ browser }) => {` | `test('points-scored cheer keeps text off the Grandmaster’s face', async ({ browser }) => {` |
| 8 | e2e/carlos-face.spec.ts:127 | test code (identifier / selector / state key) | `await expect(board.page.locator('.kids-carlos__score')).toHaveText('4');` | `await expect(board.page.locator('.kids-grandmaster__score')).toHaveText('4');` |
| 9 | e2e/carlos-face.spec.ts:128 | test code (identifier / selector / state key) | `await expect(board.page.locator('.kids-carlos__cheer')).toHaveText('Bom trabalho!');` | `await expect(board.page.locator('.kids-grandmaster__cheer')).toHaveText('Bom trabalho!');` |
| 10 | e2e/carlos-face.spec.ts:129 | test code (identifier / selector / state key) | `await expect(board.page.locator('.kids-carlos__name')).toHaveText('Mia Santos');` | `await expect(board.page.locator('.kids-grandmaster__name')).toHaveText('Mia Santos');` |
| 11 | e2e/carlos-face.spec.ts:136 | test code (identifier / selector / state key) | `await expect(kids.page.locator('.kids-carlos__score')).toHaveText('4');` | `await expect(kids.page.locator('.kids-grandmaster__score')).toHaveText('4');` |
| 12 | e2e/carlos-face.spec.ts:154 | test code (identifier / selector / state key) | `await expect(opened.page.locator('.kids-carlos__score')).toHaveText(String(points));` | `await expect(opened.page.locator('.kids-grandmaster__score')).toHaveText(String(points));` |
| 13 | e2e/carlos-face.spec.ts:161 | test name | `test('advantages and penalties do not bring Carlos out', async ({ browser }) => {` | `test('advantages and penalties do not bring the Grandmaster out', async ({ browser }) => {` |
| 14 | e2e/carlos-face.spec.ts:168 | test code (identifier / selector / state key) | `await expect(opened.page.locator('.kids-carlos')).toHaveCount(0);` | `await expect(opened.page.locator('.kids-grandmaster')).toHaveCount(0);` |
| 15 | e2e/carlos-face.spec.ts:178 | test code (identifier / selector / state key) | `await expect(opened.page.locator('.kids-carlos')).toHaveCount(0);` | `await expect(opened.page.locator('.kids-grandmaster')).toHaveCount(0);` |
| 16 | e2e/carlos-face.spec.ts:182 | test name | `test('post-champion corner keeps text off Carlos’s face', async ({ browser }) => {` | `test('post-champion corner keeps text off the Grandmaster’s face', async ({ browser }) => {` |
| 17 | e2e/carlos-face.spec.ts:226 | test code (identifier / selector / state key) | `await expect(opened.page.locator('.kids-carlos--corner .kids-carlos__cheer')).toHaveText('Bom trabalho!');` | `await expect(opened.page.locator('.kids-grandmaster--corner .kids-grandmaster__cheer')).toHaveText('Bom trabalho!');` |
| 18 | e2e/carlos-face.spec.ts:227 | test code (identifier / selector / state key) | `await expect(opened.page.locator('.kids-carlos--corner .kids-carlos__name')).toHaveText('Mia Santos');` | `await expect(opened.page.locator('.kids-grandmaster--corner .kids-grandmaster__name')).toHaveText('Mia Santos');` |
| 19 | e2e/carlos-face.spec.ts:228 | test code (identifier / selector / state key) | `await expect(opened.page.locator('.kids-carlos--corner .kids-carlos__score')).toHaveText('4-2');` | `await expect(opened.page.locator('.kids-grandmaster--corner .kids-grandmaster__score')).toHaveText('4-2');` |
| 20 | e2e/oldschool-landscape.spec.ts:22 | test code (identifier / selector / state key) | `carlos: { enabled: false, onWin: false, onPoints: false, pointsThreshold: 8 },` | `grandmaster: { enabled: false, onWin: false, onPoints: false, pointsThreshold: 8 },` |
| 21 | e2e/scoreboard-fullscreen.spec.ts:38 | test code (identifier / selector / state key) | `carlos: { enabled: false, onWin: false, onPoints: false, pointsThreshold: 8 },` | `grandmaster: { enabled: false, onWin: false, onPoints: false, pointsThreshold: 8 },` |
| 22 | package.json:12 | npm test script (test file path) | `…bracketTheme.test.ts src/lib/scoreboardSkin.test.ts src/lib/carlosCelebration.test.ts src/lib/kidsScoreboard.test.ts src/lib/trainingSkin.te…` | `…bracketTheme.test.ts src/lib/scoreboardSkin.test.ts src/lib/grandmasterCelebration.test.ts src/lib/kidsScoreboard.test.ts src/lib/trainingSkin.te…` |
| 23 | src/components/CarlosCheer.tsx:1 | import | `import { CARLOS_ASSET } from '../lib/kidsScoreboard';` | `import { GRANDMASTER_ASSET } from '../lib/kidsScoreboard';` |
| 24 | src/components/CarlosCheer.tsx:20 | code comment | `/** Grand Master Carlos slide-in. Shared by the bracket champion, the match scoreboard, and the blue-belt graduation. */` | `/** the Grandmaster slide-in. Shared by the bracket champion, the match scoreboard, and the blue-belt graduation. */` |
| 25 | src/components/CarlosCheer.tsx:21 | export / function / type | `export function CarlosCheer({` | `export function GrandmasterCheer({` |
| 26 | src/components/CarlosCheer.tsx:36 | CSS class in JSX | `<div className={'kids-carlos${board ? ' kids-carlos--board' : ''}${corner ? ' kids-carlos--corner' : ''}${onDismiss ? ' kids-carlos--dismiss…` | `<div className={'kids-grandmaster${board ? ' kids-grandmaster--board' : ''}${corner ? ' kids-grandmaster--corner' : ''}${onDismiss ? ' kids-grandmaster--dismiss…` |
| 27 | src/components/CarlosCheer.tsx:51 | CSS class in JSX | `<figure className="kids-carlos__figure">` | `<figure className="kids-grandmaster__figure">` |
| 28 | src/components/CarlosCheer.tsx:52 | CSS class in JSX | `<p className="kids-carlos__bubble">` | `<p className="kids-grandmaster__bubble">` |
| 29 | src/components/CarlosCheer.tsx:58 | identifier / state key | `? 'kids-carlos__cheer'` | `? 'kids-grandmaster__cheer'` |
| 30 | src/components/CarlosCheer.tsx:60 | identifier / state key | `? 'kids-carlos__score'` | `? 'kids-grandmaster__score'` |
| 31 | src/components/CarlosCheer.tsx:61 | identifier / state key | `: 'kids-carlos__name'` | `: 'kids-grandmaster__name'` |
| 32 | src/components/CarlosCheer.tsx:68 | CSS class in JSX | `<div className="kids-carlos__portrait">` | `<div className="kids-grandmaster__portrait">` |
| 33 | src/components/CarlosCheer.tsx:69 | identifier / state key | `<img src={CARLOS_ASSET} alt="" width={845} height={1200} />` | `<img src={GRANDMASTER_ASSET} alt="" width={845} height={1200} />` |
| 34 | src/components/CarlosCheer.tsx:70 | code comment | `{/* Head of carlos.webp (alpha > 40): x 22–72%, y 2–42%, chin included. */}` | `{/* Head of grandmaster.webp (alpha > 40): x 22–72%, y 2–42%, chin included. */}` |
| 35 | src/components/CarlosCheer.tsx:71 | CSS class in JSX | `<span className="kids-carlos__face" aria-hidden="true" />` | `<span className="kids-grandmaster__face" aria-hidden="true" />` |
| 36 | src/components/CarlosCheer.tsx:75 | CSS class in JSX | `<button type="button" className="ink-btn ink-btn--save kids-carlos__dismiss" onClick={onDismiss}>` | `<button type="button" className="ink-btn ink-btn--save kids-grandmaster__dismiss" onClick={onDismiss}>` |
| 37 | src/components/KidsBracketChrome.tsx:6 | import | `import { CarlosCheer } from './CarlosCheer';` | `import { GrandmasterCheer } from './GrandmasterCheer';` |
| 38 | src/components/KidsBracketChrome.tsx:68 | identifier / state key | `<CarlosCheer lines={lines} corner />` | `<GrandmasterCheer lines={lines} corner />` |
| 39 | src/components/KidsScoreboardSwitcher.tsx:153 | USER-VISIBLE string | `Carlos` | `the Grandmaster` |
| 40 | src/hooks/useMatchBoard.ts:3 | import | `import { masterCarlosOnScoreboard } from '../lib/carlosCelebration';` | `import { grandmasterOnScoreboard } from '../lib/grandmasterCelebration';` |
| 41 | src/hooks/useMatchBoard.ts:22 | code comment | `* Pro suite ('from=suite') keeps skins and Master Carlos.` | `* Pro suite ('from=suite') keeps skins and Grandmaster.` |
| 42 | src/hooks/useMatchBoard.ts:24 | code comment | `* Coach Unlimited keeps the linked-bout skin and does not show Carlos.` | `* Coach Unlimited keeps the linked-bout skin and does not show the Grandmaster.` |
| 43 | src/hooks/useMatchBoard.ts:38 | identifier / state key | `const showCarlos = masterCarlosOnScoreboard(suite.fromSuite);` | `const showGrandmaster = grandmasterOnScoreboard(suite.fromSuite);` |
| 44 | src/hooks/useMatchBoard.ts:52 | identifier / state key | `return { suite, linkedId, plainWhite, showCarlos, whiteBoard, kidsSkin, polishedOpen, originPath, skinFor };` | `return { suite, linkedId, plainWhite, showGrandmaster, whiteBoard, kidsSkin, polishedOpen, originPath, skinFor };` |
| 45 | src/index.css:15545 | CSS comment | `/* The corner mark floats on the bracket. Carlos ignores pointers, so the mark still goes back. */` | `/* The corner mark floats on the bracket. the Grandmaster ignores pointers, so the mark still goes back. */` |
| 46 | src/index.css:16119 | CSS class / keyframe / var | `.kids-carlos {` | `.kids-grandmaster {` |
| 47 | src/index.css:16128 | CSS comment | `/* Head box of public/assets/kids/carlos.webp. The cheer bubble must miss this rect. */` | `/* Head box of public/assets/kids/grandmaster.webp. The cheer bubble must miss this rect. */` |
| 48 | src/index.css:16129 | CSS class / keyframe / var | `.kids-carlos__face {` | `.kids-grandmaster__face {` |
| 49 | src/index.css:16152 | CSS class / keyframe / var | `.kids-carlos--corner {` | `.kids-grandmaster--corner {` |
| 50 | src/index.css:16164 | CSS class / keyframe / var | `.kids-carlos--corner .kids-carlos__figure {` | `.kids-grandmaster--corner .kids-grandmaster__figure {` |
| 51 | src/index.css:16175 | CSS class / keyframe / var | `animation: kids-carlos-corner-in 0.45s cubic-bezier(0.16, 0.84, 0.32, 1) both;` | `animation: kids-grandmaster-corner-in 0.45s cubic-bezier(0.16, 0.84, 0.32, 1) both;` |
| 52 | src/index.css:16178 | CSS class / keyframe / var | `.kids-carlos--corner .kids-carlos__portrait {` | `.kids-grandmaster--corner .kids-grandmaster__portrait {` |
| 53 | src/index.css:16185 | CSS class / keyframe / var | `.kids-carlos--corner .kids-carlos__portrait img {` | `.kids-grandmaster--corner .kids-grandmaster__portrait img {` |
| 54 | src/index.css:16190 | CSS class / keyframe / var | `.kids-carlos--corner .kids-carlos__bubble {` | `.kids-grandmaster--corner .kids-grandmaster__bubble {` |
| 55 | src/index.css:16191 | CSS class / keyframe / var | `--carlos-bubble-shift: 0px;` | `--grandmaster-bubble-shift: 0px;` |
| 56 | src/index.css:16206 | CSS class / keyframe / var | `.kids-carlos--corner .kids-carlos__cheer,` | `.kids-grandmaster--corner .kids-grandmaster__cheer,` |
| 57 | src/index.css:16207 | CSS class / keyframe / var | `.kids-carlos--corner .kids-carlos__name,` | `.kids-grandmaster--corner .kids-grandmaster__name,` |
| 58 | src/index.css:16208 | CSS class / keyframe / var | `.kids-carlos--corner .kids-carlos__score {` | `.kids-grandmaster--corner .kids-grandmaster__score {` |
| 59 | src/index.css:16215 | CSS class / keyframe / var | `.kids-carlos--corner .kids-carlos__bubble::after {` | `.kids-grandmaster--corner .kids-grandmaster__bubble::after {` |
| 60 | src/index.css:16224 | CSS class / keyframe / var | `.kids-carlos--corner .kids-confetti {` | `.kids-grandmaster--corner .kids-confetti {` |
| 61 | src/index.css:16228 | CSS class / keyframe / var | `@keyframes kids-carlos-corner-in {` | `@keyframes kids-grandmaster-corner-in {` |
| 62 | src/index.css:16238 | CSS class / keyframe / var | `.kids-carlos--corner .kids-carlos__figure {` | `.kids-grandmaster--corner .kids-grandmaster__figure {` |
| 63 | src/index.css:16245 | CSS class / keyframe / var | `.kids-carlos--board {` | `.kids-grandmaster--board {` |
| 64 | src/index.css:16250 | CSS class / keyframe / var | `.kids-carlos--board .kids-carlos__figure {` | `.kids-grandmaster--board .kids-grandmaster__figure {` |
| 65 | src/index.css:16254 | CSS class / keyframe / var | `animation-name: kids-carlos-in-right;` | `animation-name: kids-grandmaster-in-right;` |
| 66 | src/index.css:16257 | CSS class / keyframe / var | `.kids-carlos--board .kids-carlos__bubble {` | `.kids-grandmaster--board .kids-grandmaster__bubble {` |
| 67 | src/index.css:16258 | CSS class / keyframe / var | `--carlos-bubble-shift: 0px;` | `--grandmaster-bubble-shift: 0px;` |
| 68 | src/index.css:16267 | CSS class / keyframe / var | `.kids-carlos--board .kids-carlos__bubble::after {` | `.kids-grandmaster--board .kids-grandmaster__bubble::after {` |
| 69 | src/index.css:16277 | CSS class / keyframe / var | `@keyframes kids-carlos-in-right {` | `@keyframes kids-grandmaster-in-right {` |
| 70 | src/index.css:16287 | CSS class / keyframe / var | `.kids-carlos--board .kids-carlos__figure {` | `.kids-grandmaster--board .kids-grandmaster__figure {` |
| 71 | src/index.css:16292 | CSS class / keyframe / var | `.kids-carlos__figure {` | `.kids-grandmaster__figure {` |
| 72 | src/index.css:16298 | CSS class / keyframe / var | `animation: kids-carlos-in 0.72s cubic-bezier(0.16, 0.84, 0.32, 1) both;` | `animation: kids-grandmaster-in 0.72s cubic-bezier(0.16, 0.84, 0.32, 1) both;` |
| 73 | src/index.css:16301 | CSS class / keyframe / var | `.kids-carlos__portrait {` | `.kids-grandmaster__portrait {` |
| 74 | src/index.css:16307 | CSS class / keyframe / var | `.kids-carlos__portrait img {` | `.kids-grandmaster__portrait img {` |
| 75 | src/index.css:16315 | CSS comment | `/* Shared by every Carlos speech bubble. The scoreboard and the corner each` | `/* Shared by every the Grandmaster speech bubble. The scoreboard and the corner each` |
| 76 | src/index.css:16317 | CSS class / keyframe / var | `.kids-carlos__bubble {` | `.kids-grandmaster__bubble {` |
| 77 | src/index.css:16318 | CSS class / keyframe / var | `--carlos-bubble-shift: 1.6rem;` | `--grandmaster-bubble-shift: 1.6rem;` |
| 78 | src/index.css:16323 | CSS class / keyframe / var | `transform: translateX(var(--carlos-bubble-shift));` | `transform: translateX(var(--grandmaster-bubble-shift));` |
| 79 | src/index.css:16340 | CSS class / keyframe / var | `.kids-carlos__score {` | `.kids-grandmaster__score {` |
| 80 | src/index.css:16345 | CSS class / keyframe / var | `.kids-carlos__bubble::after {` | `.kids-grandmaster__bubble::after {` |
| 81 | src/index.css:16371 | CSS class / keyframe / var | `@keyframes kids-carlos-in {` | `@keyframes kids-grandmaster-in {` |
| 82 | src/index.css:16391 | CSS class / keyframe / var | `.kids-carlos--dismiss .kids-carlos__dismiss {` | `.kids-grandmaster--dismiss .kids-grandmaster__dismiss {` |
| 83 | src/index.css:16405 | CSS class / keyframe / var | `.kids-carlos__figure {` | `.kids-grandmaster__figure {` |
| 84 | src/index.css:16414 | CSS comment | `/* Master Carlos controls on the match controller. */` | `/* Grandmaster controls on the match controller. */` |
| 85 | src/index.css:16415 | CSS class / keyframe / var | `.carlos-controls .cast-note {` | `.grandmaster-controls .cast-note {` |
| 86 | src/index.css:16419 | CSS class / keyframe / var | `.carlos-threshold {` | `.grandmaster-threshold {` |
| 87 | src/index.css:16427 | CSS class / keyframe / var | `.carlos-threshold input {` | `.grandmaster-threshold input {` |
| 88 | src/lib/carlosCelebration.test.ts:5 | test code (identifier / selector / state key) | `DEFAULT_CARLOS_POINTS_THRESHOLD,` | `DEFAULT_GRANDMASTER_POINTS_THRESHOLD,` |
| 89 | src/lib/carlosCelebration.test.ts:6 | test code (identifier / selector / state key) | `DEFAULT_CARLOS_PREFS,` | `DEFAULT_GRANDMASTER_PREFS,` |
| 90 | src/lib/carlosCelebration.test.ts:7 | test code (identifier / selector / state key) | `carlosMatchComplete,` | `grandmasterMatchComplete,` |
| 91 | src/lib/carlosCelebration.test.ts:8 | test code (identifier / selector / state key) | `masterCarlosOnScoreboard,` | `grandmasterOnScoreboard,` |
| 92 | src/lib/carlosCelebration.test.ts:9 | test code (identifier / selector / state key) | `matchCarlosView,` | `matchGrandmasterView,` |
| 93 | src/lib/carlosCelebration.test.ts:10 | test code (identifier / selector / state key) | `parseCarlosPrefs,` | `parseGrandmasterPrefs,` |
| 94 | src/lib/carlosCelebration.test.ts:11 | test code (identifier / selector / state key) | `parseCarlosThreshold,` | `parseGrandmasterThreshold,` |
| 95 | src/lib/carlosCelebration.test.ts:13 | test code (identifier / selector / state key) | `type CarlosCelebrationPrefs,` | `type GrandmasterCelebrationPrefs,` |
| 96 | src/lib/carlosCelebration.test.ts:14 | test code (identifier / selector / state key) | `} from './carlosCelebration.ts';` | `} from './grandmasterCelebration.ts';` |
| 97 | src/lib/carlosCelebration.test.ts:18 | test code (identifier / selector / state key) | `prefs: { ...DEFAULT_CARLOS_PREFS, enabled: true },` | `prefs: { ...DEFAULT_GRANDMASTER_PREFS, enabled: true },` |
| 98 | src/lib/carlosCelebration.test.ts:31 | test name | `test('Master Carlos on the match board is Pro suite only', () => {` | `test('Grandmaster on the match board is Pro suite only', () => {` |
| 99 | src/lib/carlosCelebration.test.ts:32 | test code (identifier / selector / state key) | `assert.equal(masterCarlosOnScoreboard(true), true);` | `assert.equal(grandmasterOnScoreboard(true), true);` |
| 100 | src/lib/carlosCelebration.test.ts:33 | test code (identifier / selector / state key) | `assert.equal(masterCarlosOnScoreboard(false), false);` | `assert.equal(grandmasterOnScoreboard(false), false);` |
| 101 | src/lib/carlosCelebration.test.ts:36 | test name | `test('Master Carlos stays off until the controller turns him on', () => {` | `test('Grandmaster stays off until the controller turns him on', () => {` |
| 102 | src/lib/carlosCelebration.test.ts:37 | test code (identifier / selector / state key) | `assert.equal(DEFAULT_CARLOS_PREFS.enabled, false);` | `assert.equal(DEFAULT_GRANDMASTER_PREFS.enabled, false);` |
| 103 | src/lib/carlosCelebration.test.ts:38 | test code (identifier / selector / state key) | `assert.equal(DEFAULT_CARLOS_PREFS.onWin, true);` | `assert.equal(DEFAULT_GRANDMASTER_PREFS.onWin, true);` |
| 104 | src/lib/carlosCelebration.test.ts:39 | test code (identifier / selector / state key) | `assert.equal(DEFAULT_CARLOS_PREFS.onPoints, true);` | `assert.equal(DEFAULT_GRANDMASTER_PREFS.onPoints, true);` |
| 105 | src/lib/carlosCelebration.test.ts:40 | test code (identifier / selector / state key) | `assert.equal(DEFAULT_CARLOS_POINTS_THRESHOLD, 10);` | `assert.equal(DEFAULT_GRANDMASTER_POINTS_THRESHOLD, 10);` |
| 106 | src/lib/carlosCelebration.test.ts:41 | test code (identifier / selector / state key) | `assert.deepEqual(parseCarlosPrefs(undefined), DEFAULT_CARLOS_PREFS);` | `assert.deepEqual(parseGrandmasterPrefs(undefined), DEFAULT_GRANDMASTER_PREFS);` |
| 107 | src/lib/carlosCelebration.test.ts:43 | test code (identifier / selector / state key) | `matchCarlosView({ ...base, prefs: DEFAULT_CARLOS_PREFS, outcome: win('blue'), bluePoints: 12 }),` | `matchGrandmasterView({ ...base, prefs: DEFAULT_GRANDMASTER_PREFS, outcome: win('blue'), bluePoints: 12 }),` |
| 108 | src/lib/carlosCelebration.test.ts:48 | test name | `test('A match win brings Carlos out with Bom trabalho and the score', () => {` | `test('A match win brings the Grandmaster out with Bom trabalho and the score', () => {` |
| 109 | src/lib/carlosCelebration.test.ts:49 | test code (identifier / selector / state key) | `const view = matchCarlosView({ ...base, outcome: win('blue'), bluePoints: 12, whitePoints: 0 });` | `const view = matchGrandmasterView({ ...base, outcome: win('blue'), bluePoints: 12, whitePoints: 0 });` |
| 110 | src/lib/carlosCelebration.test.ts:56 | test code (identifier / selector / state key) | `assert.equal(matchCarlosView({ ...base, outcome: dq, bluePoints: 4 }).show, false);` | `assert.equal(matchGrandmasterView({ ...base, outcome: dq, bluePoints: 4 }).show, false);` |
| 111 | src/lib/carlosCelebration.test.ts:57 | test code (identifier / selector / state key) | `const prefs: CarlosCelebrationPrefs = { ...base.prefs, onWin: false };` | `const prefs: GrandmasterCelebrationPrefs = { ...base.prefs, onWin: false };` |
| 112 | src/lib/carlosCelebration.test.ts:58 | test code (identifier / selector / state key) | `assert.equal(matchCarlosView({ ...base, prefs, outcome: win('white'), whitePoints: 4 }).show, false);` | `assert.equal(matchGrandmasterView({ ...base, prefs, outcome: win('white'), whitePoints: 4 }).show, false);` |
| 113 | src/lib/carlosCelebration.test.ts:62 | test code (identifier / selector / state key) | `assert.equal(matchCarlosView({ ...base, bluePoints: 11, whitePoints: 2 }).show, false);` | `assert.equal(matchGrandmasterView({ ...base, bluePoints: 11, whitePoints: 2 }).show, false);` |
| 114 | src/lib/carlosCelebration.test.ts:63 | test code (identifier / selector / state key) | `assert.equal(matchCarlosView({ ...base, matchComplete: true, bluePoints: 10 }).show, false);` | `assert.equal(matchGrandmasterView({ ...base, matchComplete: true, bluePoints: 10 }).show, false);` |
| 115 | src/lib/carlosCelebration.test.ts:64 | test code (identifier / selector / state key) | `const over = matchCarlosView({ ...base, matchComplete: true, bluePoints: 11, whitePoints: 2 });` | `const over = matchGrandmasterView({ ...base, matchComplete: true, bluePoints: 11, whitePoints: 2 });` |
| 116 | src/lib/carlosCelebration.test.ts:67 | test code (identifier / selector / state key) | `const prefs: CarlosCelebrationPrefs = { ...base.prefs, onPoints: false };` | `const prefs: GrandmasterCelebrationPrefs = { ...base.prefs, onPoints: false };` |
| 117 | src/lib/carlosCelebration.test.ts:68 | test code (identifier / selector / state key) | `assert.equal(matchCarlosView({ ...base, prefs, matchComplete: true, bluePoints: 14 }).show, false);` | `assert.equal(matchGrandmasterView({ ...base, prefs, matchComplete: true, bluePoints: 14 }).show, false);` |
| 118 | src/lib/carlosCelebration.test.ts:72 | test code (identifier / selector / state key) | `assert.equal(carlosMatchComplete({ running: true, remainingMs: 60_000, outcome: null }), false);` | `assert.equal(grandmasterMatchComplete({ running: true, remainingMs: 60_000, outcome: null }), false);` |
| 119 | src/lib/carlosCelebration.test.ts:73 | test code (identifier / selector / state key) | `assert.equal(carlosMatchComplete({ running: false, remainingMs: 60_000, outcome: null }), false);` | `assert.equal(grandmasterMatchComplete({ running: false, remainingMs: 60_000, outcome: null }), false);` |
| 120 | src/lib/carlosCelebration.test.ts:74 | test code (identifier / selector / state key) | `assert.equal(carlosMatchComplete({ running: false, remainingMs: 0, outcome: null }), true);` | `assert.equal(grandmasterMatchComplete({ running: false, remainingMs: 0, outcome: null }), true);` |
| 121 | src/lib/carlosCelebration.test.ts:75 | test code (identifier / selector / state key) | `assert.equal(carlosMatchComplete({ running: true, remainingMs: 30_000, outcome: win('blue') }), true);` | `assert.equal(grandmasterMatchComplete({ running: true, remainingMs: 30_000, outcome: win('blue') }), true);` |
| 122 | src/lib/carlosCelebration.test.ts:79 | test code (identifier / selector / state key) | `const prefs: CarlosCelebrationPrefs = { ...base.prefs, pointsThreshold: 6 };` | `const prefs: GrandmasterCelebrationPrefs = { ...base.prefs, pointsThreshold: 6 };` |
| 123 | src/lib/carlosCelebration.test.ts:80 | test code (identifier / selector / state key) | `const view = matchCarlosView({` | `const view = matchGrandmasterView({` |
| 124 | src/lib/carlosCelebration.test.ts:88 | test code (identifier / selector / state key) | `assert.equal(parseCarlosThreshold(6), 6);` | `assert.equal(parseGrandmasterThreshold(6), 6);` |
| 125 | src/lib/carlosCelebration.test.ts:89 | test code (identifier / selector / state key) | `assert.equal(parseCarlosThreshold(0), 10);` | `assert.equal(parseGrandmasterThreshold(0), 10);` |
| 126 | src/lib/carlosCelebration.test.ts:90 | test code (identifier / selector / state key) | `assert.equal(parseCarlosThreshold(99), 10);` | `assert.equal(parseGrandmasterThreshold(99), 10);` |
| 127 | src/lib/carlosCelebration.test.ts:91 | test code (identifier / selector / state key) | `assert.deepEqual(parseCarlosPrefs({ enabled: true, onWin: false, pointsThreshold: 8 }), {` | `assert.deepEqual(parseGrandmasterPrefs({ enabled: true, onWin: false, pointsThreshold: 8 }), {` |
| 128 | src/lib/carlosCelebration.test.ts:100 | test code (identifier / selector / state key) | `assert.equal(matchCarlosView({ ...base, bluePoints: 12, whitePoints: 15 }).show, false);` | `assert.equal(matchGrandmasterView({ ...base, bluePoints: 12, whitePoints: 15 }).show, false);` |
| 129 | src/lib/carlosCelebration.test.ts:101 | test code (identifier / selector / state key) | `const leader = matchCarlosView({ ...base, matchComplete: true, bluePoints: 12, whitePoints: 15 });` | `const leader = matchGrandmasterView({ ...base, matchComplete: true, bluePoints: 12, whitePoints: 15 });` |
| 130 | src/lib/carlosCelebration.test.ts:103 | test code (identifier / selector / state key) | `const tied = matchCarlosView({ ...base, matchComplete: true, bluePoints: 12, whitePoints: 12 });` | `const tied = matchGrandmasterView({ ...base, matchComplete: true, bluePoints: 12, whitePoints: 12 });` |
| 131 | src/lib/carlosCelebration.test.ts:107 | test name | `test('A referee-decision win brings Carlos out only after the bout is over', () => {` | `test('A referee-decision win brings the Grandmaster out only after the bout is over', () => {` |
| 132 | src/lib/carlosCelebration.test.ts:108 | test code (identifier / selector / state key) | `assert.equal(matchCarlosView({ ...base, refDecisionSide: 'white', bluePoints: 2, whitePoints: 2 }).show, false);` | `assert.equal(matchGrandmasterView({ ...base, refDecisionSide: 'white', bluePoints: 2, whitePoints: 2 }).show, false);` |
| 133 | src/lib/carlosCelebration.test.ts:109 | test code (identifier / selector / state key) | `const pending = matchCarlosView({` | `const pending = matchGrandmasterView({` |
| 134 | src/lib/carlosCelebration.test.ts:118 | test code (identifier / selector / state key) | `const recorded = matchCarlosView({` | `const recorded = matchGrandmasterView({` |
| 135 | src/lib/carlosCelebration.test.ts:129 | test name | `test('the Carlos slide-in stands still when motion is reduced', () => {` | `test('the the Grandmaster slide-in stands still when motion is reduced', () => {` |
| 136 | src/lib/carlosCelebration.test.ts:131 | test code (identifier / selector / state key) | `const start = css.indexOf('@media (prefers-reduced-motion: reduce) {\n  .kids-carlos__figure');` | `const start = css.indexOf('@media (prefers-reduced-motion: reduce) {\n  .kids-grandmaster__figure');` |
| 137 | src/lib/carlosCelebration.ts:2 | code comment | `* Optional Master Carlos on the match scoreboard.` | `* Optional Grandmaster on the match scoreboard.` |
| 138 | src/lib/carlosCelebration.ts:14 | code comment | `/** Master Carlos on the match scoreboard and its controller. Pro suite only. */` | `/** Grandmaster on the match scoreboard and its controller. Pro suite only. */` |
| 139 | src/lib/carlosCelebration.ts:15 | export / function / type | `export function masterCarlosOnScoreboard(fromSuite: boolean): boolean {` | `export function grandmasterOnScoreboard(fromSuite: boolean): boolean {` |
| 140 | src/lib/carlosCelebration.ts:19 | export / function / type | `export const DEFAULT_CARLOS_POINTS_THRESHOLD = 10;` | `export const DEFAULT_GRANDMASTER_POINTS_THRESHOLD = 10;` |
| 141 | src/lib/carlosCelebration.ts:20 | export / function / type | `export const CARLOS_THRESHOLD_MIN = 1;` | `export const GRANDMASTER_THRESHOLD_MIN = 1;` |
| 142 | src/lib/carlosCelebration.ts:21 | export / function / type | `export const CARLOS_THRESHOLD_MAX = 98;` | `export const GRANDMASTER_THRESHOLD_MAX = 98;` |
| 143 | src/lib/carlosCelebration.ts:23 | export / function / type | `export type CarlosCelebrationPrefs = {` | `export type GrandmasterCelebrationPrefs = {` |
| 144 | src/lib/carlosCelebration.ts:24 | code comment | `/** Master switch. Off means no Carlos from a match win or a point threshold. */` | `/** Master switch. Off means no the Grandmaster from a match win or a point threshold. */` |
| 145 | src/lib/carlosCelebration.ts:30 | code comment | `/** At match end, Carlos appears when points are greater than this number. */` | `/** At match end, the Grandmaster appears when points are greater than this number. */` |
| 146 | src/lib/carlosCelebration.ts:34 | export / function / type | `export const DEFAULT_CARLOS_PREFS: CarlosCelebrationPrefs = {` | `export const DEFAULT_GRANDMASTER_PREFS: GrandmasterCelebrationPrefs = {` |
| 147 | src/lib/carlosCelebration.ts:38 | identifier / state key | `pointsThreshold: DEFAULT_CARLOS_POINTS_THRESHOLD,` | `pointsThreshold: DEFAULT_GRANDMASTER_POINTS_THRESHOLD,` |
| 148 | src/lib/carlosCelebration.ts:41 | export / function / type | `export type CarlosMatchView = {` | `export type GrandmasterMatchView = {` |
| 149 | src/lib/carlosCelebration.ts:51 | export / function / type | `export function parseCarlosThreshold(value: unknown): number {` | `export function parseGrandmasterThreshold(value: unknown): number {` |
| 150 | src/lib/carlosCelebration.ts:53 | identifier / state key | `if (!Number.isInteger(n) \|\| n < CARLOS_THRESHOLD_MIN \|\| n > CARLOS_THRESHOLD_MAX) {` | `if (!Number.isInteger(n) \|\| n < GRANDMASTER_THRESHOLD_MIN \|\| n > GRANDMASTER_THRESHOLD_MAX) {` |
| 151 | src/lib/carlosCelebration.ts:54 | identifier / state key | `return DEFAULT_CARLOS_POINTS_THRESHOLD;` | `return DEFAULT_GRANDMASTER_POINTS_THRESHOLD;` |
| 152 | src/lib/carlosCelebration.ts:59 | export / function / type | `export function parseCarlosPrefs(raw: unknown): CarlosCelebrationPrefs {` | `export function parseGrandmasterPrefs(raw: unknown): GrandmasterCelebrationPrefs {` |
| 153 | src/lib/carlosCelebration.ts:60 | identifier / state key | `if (!raw \|\| typeof raw !== 'object') return { ...DEFAULT_CARLOS_PREFS };` | `if (!raw \|\| typeof raw !== 'object') return { ...DEFAULT_GRANDMASTER_PREFS };` |
| 154 | src/lib/carlosCelebration.ts:66 | identifier / state key | `pointsThreshold: parseCarlosThreshold(row.pointsThreshold),` | `pointsThreshold: parseGrandmasterThreshold(row.pointsThreshold),` |
| 155 | src/lib/carlosCelebration.ts:94 | export / function / type | `export function carlosMatchComplete(input: {` | `export function grandmasterMatchComplete(input: {` |
| 156 | src/lib/carlosCelebration.ts:107 | code comment | `* pass the winning side as 'refDecisionSide' into 'matchCarlosView' with the bout` | `* pass the winning side as 'refDecisionSide' into 'matchGrandmasterView' with the bout` |
| 157 | src/lib/carlosCelebration.ts:108 | code comment | `* complete, or record this outcome. Carlos then uses the same match-end win cheer.` | `* complete, or record this outcome. the Grandmaster then uses the same match-end win cheer.` |
| 158 | src/lib/carlosCelebration.ts:121 | export / function / type | `function carlosOutcome(input: {` | `function grandmasterOutcome(input: {` |
| 159 | src/lib/carlosCelebration.ts:141 | export / function / type | `export function matchCarlosView(input: {` | `export function matchGrandmasterView(input: {` |
| 160 | src/lib/carlosCelebration.ts:142 | identifier / state key | `prefs: CarlosCelebrationPrefs;` | `prefs: GrandmasterCelebrationPrefs;` |
| 161 | src/lib/carlosCelebration.ts:148 | code comment | `/** Clock at 0:00, or a result already recorded. See 'carlosMatchComplete'. */` | `/** Clock at 0:00, or a result already recorded. See 'grandmasterMatchComplete'. */` |
| 162 | src/lib/carlosCelebration.ts:155 | identifier / state key | `}): CarlosMatchView {` | `}): GrandmasterMatchView {` |
| 163 | src/lib/carlosCelebration.ts:156 | identifier / state key | `const hidden: CarlosMatchView = { show: false, lines: [] };` | `const hidden: GrandmasterMatchView = { show: false, lines: [] };` |
| 164 | src/lib/carlosCelebration.ts:159 | identifier / state key | `const outcome = carlosOutcome(input);` | `const outcome = grandmasterOutcome(input);` |
| 165 | src/lib/kidsScoreboard.test.ts:14 | test code (identifier / selector / state key) | `CARLOS_ASSET,` | `GRANDMASTER_ASSET,` |
| 166 | src/lib/kidsScoreboard.test.ts:67 | test code (identifier / selector / state key) | `assert.equal(CARLOS_ASSET, '/assets/kids/carlos.webp');` | `assert.equal(GRANDMASTER_ASSET, '/assets/kids/grandmaster.webp');` |
| 167 | src/lib/kidsScoreboard.test.ts:138 | test name | `test('Carlos appears only after a champion, with a stored score like 12-0', () => {` | `test('the Grandmaster appears only after a champion, with a stored score like 12-0', () => {` |
| 168 | src/lib/kidsScoreboard.test.ts:200 | test name | `test('Carlos stays off during an earlier live bout, and a scoreboard name fills an empty finalist', () => {` | `test('the Grandmaster stays off during an earlier live bout, and a scoreboard name fills an empty finalist', () => {` |
| 169 | src/lib/kidsScoreboard.ts:6 | code comment | `* Grand Master Carlos is a corner win celebration, never a live-match graphic.` | `* the Grandmaster is a corner win celebration, never a live-match graphic.` |
| 170 | src/lib/kidsScoreboard.ts:17 | export / function / type | `export const CARLOS_ASSET = '/assets/kids/carlos.webp';` | `export const GRANDMASTER_ASSET = '/assets/kids/grandmaster.webp';` |
| 171 | src/lib/kidsScoreboard.ts:33 | code comment | `/** Grand Master Carlos after a champion. Off leaves the corner empty. */` | `/** the Grandmaster after a champion. Off leaves the corner empty. */` |
| 172 | src/lib/kidsScoreboard.ts:118 | code comment | `* Carlos and other skin chrome stay off during fullscreen, an open sheet` | `* the Grandmaster and other skin chrome stay off during fullscreen, an open sheet` |
| 173 | src/lib/kidsScoreboard.ts:145 | code comment | `/** Carlos only in the corner, and only when skin chrome is allowed to show. */` | `/** the Grandmaster only in the corner, and only when skin chrome is allowed to show. */` |
| 174 | src/lib/kidsScoreboard.ts:203 | code comment | `* Carlos only after the championship bout has a winner. A stored champion name` | `* the Grandmaster only after the championship bout has a winner. A stored champion name` |
| 175 | src/lib/kidsScoreboard.ts:215 | code comment | `/** Carlos only after a champion is decided. A live bout keeps him off the tree. */` | `/** the Grandmaster only after a champion is decided. A live bout keeps him off the tree. */` |
| 176 | src/lib/matchStore.ts:1 | import | `import { DEFAULT_CARLOS_PREFS, parseCarlosPrefs, type CarlosCelebrationPrefs } from './carlosCelebration';` | `import { DEFAULT_GRANDMASTER_PREFS, parseGrandmasterPrefs, type GrandmasterCelebrationPrefs } from './grandmasterCelebration';` |
| 177 | src/lib/matchStore.ts:75 | code comment | `/** Optional Master Carlos on the scoreboard. Off until the controller turns it on. */` | `/** Optional Grandmaster on the scoreboard. Off until the controller turns it on. */` |
| 178 | src/lib/matchStore.ts:76 | identifier / state key | `carlos: CarlosCelebrationPrefs;` | `grandmaster: GrandmasterCelebrationPrefs;` |
| 179 | src/lib/matchStore.ts:102 | identifier / state key | `\| { type: 'setCarlos'; value: Partial<CarlosCelebrationPrefs> }` | `\| { type: 'setGrandmaster'; value: Partial<GrandmasterCelebrationPrefs> }` |
| 180 | src/lib/matchStore.ts:173 | identifier / state key | `carlos: { ...DEFAULT_CARLOS_PREFS },` | `grandmaster: { ...DEFAULT_GRANDMASTER_PREFS },` |
| 181 | src/lib/matchStore.ts:209 | identifier / state key | `carlos: parseCarlosPrefs(parsed.carlos),` | `grandmaster: parseGrandmasterPrefs(parsed.grandmaster),` |
| 182 | src/lib/matchStore.ts:220 | identifier / state key | `const incoming = s as MatchState & { padHeaders?: unknown; skin?: unknown; carlos?: unknown };` | `const incoming = s as MatchState & { padHeaders?: unknown; skin?: unknown; grandmaster?: unknown };` |
| 183 | src/lib/matchStore.ts:226 | identifier / state key | `carlos: incoming.carlos == null ? { ...state.carlos } : parseCarlosPrefs(incoming.carlos),` | `grandmaster: incoming.grandmaster == null ? { ...state.grandmaster } : parseGrandmasterPrefs(incoming.grandmaster),` |
| 184 | src/lib/matchStore.ts:440 | identifier / state key | `case 'setCarlos':` | `case 'setGrandmaster':` |
| 185 | src/lib/matchStore.ts:443 | identifier / state key | `carlos: parseCarlosPrefs({ ...current.carlos, ...action.value }),` | `grandmaster: parseGrandmasterPrefs({ ...current.grandmaster, ...action.value }),` |
| 186 | src/lib/scoreboardSkin.ts:7 | code comment | `* also keeps the stored skin. Master Carlos is not a skin; the Pro suite owns him.` | `* also keeps the stored skin. Grandmaster is not a skin; the Pro suite owns him.` |
| 187 | src/pages/MatchController.tsx:16 | import | `import { CARLOS_THRESHOLD_MAX, CARLOS_THRESHOLD_MIN, type CarlosCelebrationPrefs } from '../lib/carlosCelebration';` | `import { GRANDMASTER_THRESHOLD_MAX, GRANDMASTER_THRESHOLD_MIN, type GrandmasterCelebrationPrefs } from '../lib/grandmasterCelebration';` |
| 188 | src/pages/MatchController.tsx:329 | identifier / state key | `{board.showCarlos ? <CarlosControls prefs={match.carlos} /> : null}` | `{board.showGrandmaster ? <GrandmasterControls prefs={match.grandmaster} /> : null}` |
| 189 | src/pages/MatchController.tsx:450 | export / function / type | `function CarlosControls({ prefs }: { prefs: CarlosCelebrationPrefs }) {` | `function GrandmasterControls({ prefs }: { prefs: GrandmasterCelebrationPrefs }) {` |
| 190 | src/pages/MatchController.tsx:458 | CSS class in JSX | `<fieldset className="carlos-controls">` | `<fieldset className="grandmaster-controls">` |
| 191 | src/pages/MatchController.tsx:459 | USER-VISIBLE string | `<legend>Master Carlos</legend>` | `<legend>Grandmaster</legend>` |
| 192 | src/pages/MatchController.tsx:464 | identifier / state key | `onChange={(e) => dispatchMatch({ type: 'setCarlos', value: { enabled: e.target.checked } })}` | `onChange={(e) => dispatchMatch({ type: 'setGrandmaster', value: { enabled: e.target.checked } })}` |
| 193 | src/pages/MatchController.tsx:470 | USER-VISIBLE string | `for a win, or if points went over the total during the bout. Off means no Carlos from these triggers.` | `for a win, or if points went over the total during the bout. Off means no the Grandmaster from these triggers.` |
| 194 | src/pages/MatchController.tsx:478 | identifier / state key | `onChange={(e) => dispatchMatch({ type: 'setCarlos', value: { onWin: e.target.checked } })}` | `onChange={(e) => dispatchMatch({ type: 'setGrandmaster', value: { onWin: e.target.checked } })}` |
| 195 | src/pages/MatchController.tsx:486 | identifier / state key | `onChange={(e) => dispatchMatch({ type: 'setCarlos', value: { onPoints: e.target.checked } })}` | `onChange={(e) => dispatchMatch({ type: 'setGrandmaster', value: { onPoints: e.target.checked } })}` |
| 196 | src/pages/MatchController.tsx:490 | CSS class in JSX | `<label className="carlos-threshold">` | `<label className="grandmaster-threshold">` |
| 197 | src/pages/MatchController.tsx:500 | identifier / state key | `if (Number.isInteger(n) && n >= CARLOS_THRESHOLD_MIN && n <= CARLOS_THRESHOLD_MAX) {` | `if (Number.isInteger(n) && n >= GRANDMASTER_THRESHOLD_MIN && n <= GRANDMASTER_THRESHOLD_MAX) {` |
| 198 | src/pages/MatchController.tsx:501 | identifier / state key | `dispatchMatch({ type: 'setCarlos', value: { pointsThreshold: n } });` | `dispatchMatch({ type: 'setGrandmaster', value: { pointsThreshold: n } });` |
| 199 | src/pages/MatchController.tsx:506 | identifier / state key | `if (!Number.isInteger(n) \|\| n < CARLOS_THRESHOLD_MIN \|\| n > CARLOS_THRESHOLD_MAX) {` | `if (!Number.isInteger(n) \|\| n < GRANDMASTER_THRESHOLD_MIN \|\| n > GRANDMASTER_THRESHOLD_MAX) {` |
| 200 | src/pages/MatchDisplay.tsx:8 | import | `import { CarlosCheer } from '../components/CarlosCheer';` | `import { GrandmasterCheer } from '../components/GrandmasterCheer';` |
| 201 | src/pages/MatchDisplay.tsx:26 | import | `import { carlosMatchComplete, matchCarlosView } from '../lib/carlosCelebration';` | `import { grandmasterMatchComplete, matchGrandmasterView } from '../lib/grandmasterCelebration';` |
| 202 | src/pages/MatchDisplay.tsx:89 | identifier / state key | `const carlos = board.showCarlos` | `const grandmaster = board.showGrandmaster` |
| 203 | src/pages/MatchDisplay.tsx:90 | identifier / state key | `? matchCarlosView({` | `? matchGrandmasterView({` |
| 204 | src/pages/MatchDisplay.tsx:91 | identifier / state key | `prefs: match.carlos,` | `prefs: match.grandmaster,` |
| 205 | src/pages/MatchDisplay.tsx:97 | identifier / state key | `matchComplete: carlosMatchComplete({` | `matchComplete: grandmasterMatchComplete({` |
| 206 | src/pages/MatchDisplay.tsx:340 | identifier / state key | `{carlos.show ? <CarlosCheer lines={carlos.lines} board /> : null}` | `{grandmaster.show ? <GrandmasterCheer lines={grandmaster.lines} board /> : null}` |
| 207 | src/pages/Tournament.tsx:274 | USER-VISIBLE string | `Grand Master Carlos stays in the corner after a champion, with "Bom trabalho!" Turn him off from Skin.` | `the Grandmaster stays in the corner after a champion, with "Bom trabalho!" Turn him off from Skin.` |
| 208 | src/pages/student/RankPage.regressions.test.tsx:633 | test code (identifier / selector / state key) | `const cheer = document.querySelector('.kids-carlos');` | `const cheer = document.querySelector('.kids-grandmaster');` |
| 209 | src/pages/student/RankPage.regressions.test.tsx:637 | test code (identifier / selector / state key) | `assert.equal(cheer.querySelector('img')?.getAttribute('src'), '/assets/kids/carlos.webp');` | `assert.equal(cheer.querySelector('img')?.getAttribute('src'), '/assets/kids/grandmaster.webp');` |
| 210 | src/pages/student/RankPage.regressions.test.tsx:639 | test code (identifier / selector / state key) | `assert.equal(document.querySelector('.kids-carlos'), null);` | `assert.equal(document.querySelector('.kids-grandmaster'), null);` |
| 211 | src/pages/student/RankPage.regressions.test.tsx:645 | test code (identifier / selector / state key) | `assert.equal(document.querySelector('.kids-carlos'), null);` | `assert.equal(document.querySelector('.kids-grandmaster'), null);` |
| 212 | src/pages/student/RankPage.regressions.test.tsx:652 | test name | `test('Carlos congratulates a blue-belt graduation once, and not a white or purple choice', async () => {` | `test('the Grandmaster congratulates a blue-belt graduation once, and not a white or purple choice', async () => {` |
| 213 | src/pages/student/RankPage.regressions.test.tsx:664 | test code (identifier / selector / state key) | `assert.equal(document.querySelector('.kids-carlos'), null);` | `assert.equal(document.querySelector('.kids-grandmaster'), null);` |
| 214 | src/pages/student/RankPage.regressions.test.tsx:673 | test code (identifier / selector / state key) | `assert.equal(document.querySelector('.kids-carlos'), null);` | `assert.equal(document.querySelector('.kids-grandmaster'), null);` |
| 215 | src/pages/student/RankPage.regressions.test.tsx:681 | test code (identifier / selector / state key) | `assert.match(document.querySelector('.kids-carlos')?.textContent ?? '', /Coach/);` | `assert.match(document.querySelector('.kids-grandmaster')?.textContent ?? '', /Coach/);` |
| 216 | src/pages/student/RankPage.regressions.test.tsx:683 | test code (identifier / selector / state key) | `assert.equal(document.querySelector('.kids-carlos'), null);` | `assert.equal(document.querySelector('.kids-grandmaster'), null);` |
| 217 | src/pages/student/RankPage.tsx:74 | import | `import { CarlosCheer } from '../../components/CarlosCheer';` | `import { GrandmasterCheer } from '../../components/GrandmasterCheer';` |
| 218 | src/pages/student/RankPage.tsx:145 | identifier / state key | `<CarlosCheer lines={['Congratulations, Coach!', 'The blue belt is yours.']} onDismiss={() => setCoachCheer(false)} />` | `<GrandmasterCheer lines={['Congratulations, Coach!', 'The blue belt is yours.']} onDismiss={() => setCoachCheer(false)} />` |

## 4. Idea: a random master each time (design note, no repo edits)

Owner idea: a different master congratulates each time. Masters: A (two thumbs up and a wink), B (clapping), C (fist pump), D (Japanese judoka, arms crossed, nods). Art is in `/workspace/mascot-generic/v2/`.

**Data.** Swap the single `CARLOS_ASSET` (src/lib/kidsScoreboard.ts:17) for a list, e.g. in `src/lib/grandmasters.ts`:

```ts
export type Grandmaster = {
  id: 'a' | 'b' | 'c' | 'd';
  src: string;                 // '/assets/kids/grandmaster-a.webp'
  frames?: string[];           // D only: [d.webp, d-nod.webp], alternated for the nod
  face: { left: number; top: number; width: number; height: number }; // % of 845x1200
  avoid?: { left: number; top: number; width: number; height: number }[]; // hands the bubble must also miss
  bubble?: 'right' | 'left';  // side with the clearest space
};
```

Starting face boxes, estimated from each cutout's silhouette (alpha > 40). Re-measure before shipping. The current Carlos box is x 22–72%, y 2–42%.

| master | face box (left, top, w, h %) | other areas to keep clear |
|---|---|---|
| A two thumbs | 25, 0, 48, 31 | thumbs on both sides: about x 5–35% and x 70–92%, y 33–56%. The default bubble (top 4%, left 74%) clears the face; check its height against the right thumb |
| B clap | 28, 0, 38, 33 | hands at mid-chest, x 35–80%, y 40–60% |
| C fist pump | 31, 0, 40, 29 | fist on the viewer's left, x 12–30%, y 28–42%. Right side is clear |
| D judoka (both frames) | 28, 0, 39, 35 (nod frame chin sits about 2% lower) | arms crossed at chest, y 42–62%. No raised hand, so there's open space on both sides of the head. A bubble at top 4%, left 70% works and can sit closer than with A/C |

**Picking a master.** In `GrandmasterCheer` (today's CarlosCheer), choose once per mount with `useState(() => pickMaster())` so the master doesn't change on re-render or on each score tick. `pickMaster` picks at random but skips the last one shown. Store `lastMasterId` in sessionStorage, or in match state if every cast display must show the same master. Note: the scoreboard and controller sync through localStorage `matboard.match.v1`. If the TV and the controller tab each pick on their own, they can show different masters. Either pick in the controller and store `grandmasterId` in MatchState (then `parseGrandmasterPrefs` / `syncMatch` carry it), or accept that each screen picks separately. The bracket corner (KidsBracketChrome) and blue-belt graduation (RankPage) have no sync need, so a local pick is fine there.

**Face box and bubble.** `.kids-carlos__face` is fixed in CSS (index.css:16129) and the bubble is placed by fixed `left: 74%` / `--carlos-bubble-shift`. Make them per-master: set the box with inline style `{left: face.left+'%', ...}` or CSS vars (`--gm-face-l/t/w/h`, `--gm-bubble-l`) on `.kids-grandmaster__portrait`, and key a modifier class `kids-grandmaster--d`. Update e2e `carlos-face.spec.ts` to loop over all masters, forcing each one with a test hook such as `?grandmaster=a` or a seeded random, and assert the bubble misses the face box and the `avoid` boxes.

**D nod.** Two frames with identical framing (`d-judoka.webp`, `d-judoka-nod.webp`; preview in `v2/d-nod.gif`). Stack both `<img>`s and cross-fade opacity with a CSS keyframe (about 0.9s up, 0.45s down, 2–3 nods then rest on frame 1). Under `prefers-reduced-motion` show frame 1 only (carlosCelebration.test.ts:129 already checks the reduced-motion block; extend it). Preload frame 2 so the first nod doesn't flash.

**Other.** D wears a red-and-white panel belt (judo kohaku obi), not the BJJ coral belt. Width differs: B and D are narrower (about 75% and 70% of canvas width) and A/C fill it. All share the 845×1200 canvas, so `aspect-ratio: 845/1200` and `width/height` attributes stay. Tests that assert the single asset path (kidsScoreboard.test.ts:67, RankPage.regressions.test.tsx:637) become "src is one of GRANDMASTERS".
