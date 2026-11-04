# Student mat hours, streak, session quality, body status, report card

Draft PR. This is separate from the card-entry overhaul PR.

## What changed
- **Journal entry fields** (`types.ts`, `progress/format.ts`, `studentEdition.ts`). Each entry can now carry `minutes`, `session` (class or open mat), `quality` (1–5), `injury {area, note}` and `hiatus {reason, start, end}`. All are optional. Old cards count as 0 / untimed. Editing a card updates the totals. Merge picks up a new field only when the current entry doesn't have it. The fields are strictly parsed, round-trip through backups, and are excluded from the coach file and card share.
- **Log sheet** (`MatTime.tsx`). Class / Open mat chips, 30m / 1h / 1h 30m / 2h chips, an h:mm stepper with Clear, an optional "How it went" row, and a "Mark card" row (Session / Injury / Break). The same controls appear in Today and in the card editor.
- **Mat hours stat** (`MatHoursStat`). Shows on the student's hub card under My profile and on the report card. It uses the belt cloth weave (the `.mat-hours` class was added to the `:is()` belt rung selectors in `beltWeave.css`, kids belts included). Tapping toggles hours ↔ days or years (`aria-pressed`). It counts up when shown, and the count-up is skipped under reduced motion. It also shows the class vs open mat split.
- **Week streak** (`lib/trainingStreak.ts`). Weeks start Monday. The target is 2 or 3 sessions a week (default 2). A hiatus pauses the streak instead of breaking it. The current week never breaks the streak. Copy shows this week's progress only. There are no daily nudges or notifications.
- **Body status** (`lib/sessionQuality.ts` `bodyStatus`). The current status is an active break, or an injury card from the last 14 days. History sits in a collapsed `<details>`. It is private.
- **Report card** (`ProfileReport.tsx`, route `/student/report`, hub link "My report card"). Its sections are labeled by source: Training (From your journal), Status (From your journal), Game (From you), From coach (only what you accepted). Sections collapse on phone.

## Session quality wording (by belt stage)
| Stage | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| White | Just survived | Hung in there | Learned something | Something clicked | Breakthrough |
| Blue / purple | Off day | Rusty | Solid flow | Game working | Dialed in |
| Brown / black | Off day | Kept it steady | Refined details | Sharp and teaching | Led the mat |
| Kids | Tough day | Okay | Good | Great | Awesome! |

The profile summary reads "Lately: <label>", with the average of the last 10 rated cards.

## Controls touched
- Journal Today form: new Time on the mat, How it went and Mark card groups. Save and reset are unchanged.
- Journal card editor: the same groups are added. Edit stays a link.
- Card body: injury and break lines are added.
- Student hub: the mat hours stat and the "My report card" link are added under My profile.
- New screen `report` in `studentHubMenu.ts`.
- Not touched: unlock codes, entitlements, Stripe, Drive/OAuth code paths, ProfilePage and CoachClipboardCard.

## Persistence and privacy
- Mat hours live in the journal, so cloud, Drive and OneDrive behave exactly like the journal does today.
- Totals survive Leave academy, Disconnect and forget previous gym. Tests cover this.
- Nothing new goes to coaches.

## Decisions
- The streak target is stored per device in localStorage (`matboard.student.streakTarget.v1`), not in the backup file.
- The report card is its own route, so it doesn't collide with the profile card styling in the overhaul PR.
- The report level is floor(hours / 25) + 1. It's a light "character sheet" flavor only.

## Overlap with the card-entry overhaul PR
- `beltWeave.css`: `.mat-hours` is added to the belt `:is()` lists.
- The hub card list in `StudentMenus.tsx`: stat and link inserted after My profile.
- The journal editor in `StudentEdition.tsx`: extra fields.

## Open questions
1. Should coaches see mat hours, opt-in only? It's not implemented.
2. Should the streak target sync in the backup file?
3. Is a 14-day window for the "current injury" status right?
4. Should the report card level be kept, renamed or dropped?

## Update: profile card stat, quick-add, one shared log (10:41–10:42 AM EST)
- **Hub:** the standalone mat hours tile and the "My report card" tile are both gone. Only My profile and the existing tiles remain.
- **Profile card stat** (`src/pages/student/MatQuickAdd.tsx` → `ProfileMatHoursStat`, one line in `ProfilePage.tsx`). Mat hours is a card stat labeled "Mat hours · from your journal". It shows the belt-cloth total, the class / open mat split, a "Days · years" units chip (hours ↔ days/years), the week streak and this week's progress, and the **My report card** link. I moved the report link here, so there's no hub tile for it.
- **Quick-add sheet** (`MatQuickAddSheet`). Tapping the total opens it: Date (defaults to today), Class / Open mat, duration chips with the h:mm stepper, then Save or Cancel. It writes the shared log.
- **One shared log = the journal** (`src/lib/matLog.ts`):
  - `logMatTime`: quick-add and the calendar's "Add time". On the same day and session (`sessionOf`, which also reads old cards' class names), it updates the existing record's minutes, keeping its notes. An untyped, untimed calendar mark adopts the session. Otherwise it creates a minimal journal card, which then shows up in the journal and calendar.
  - `markTrained`: the calendar "Mark trained" button. It adds an untimed session, which counts for the streak with 0 minutes. It does nothing if the day already has a session.
  - Full journal cards are unchanged and are the same records.
- **Calendar day** (`CalendarPages.tsx` `CalendarMatTime`). A "Mat time" section on past days and today lists "Trained · Class · 2h / no time yet". Buttons: Mark trained, then Add time (opens the same sheet with the date prefilled), or Log more time. The month grid's journal dot covers marked days automatically.
- **Tests:** +3 unit tests (de-dupe across entry points, an untimed mark counting for the streak then being filled, quick-add over a full card keeping its notes) and +2 UI tests (profile stat → quick-add → same record; calendar mark → add time → one card). The hub test now asserts there's no mat hours tile and no report tile. The profile test asserts the stat, streak and report link.
- **Test runners:** I added the empty `.css` loader to the remaining `scripts/run-*-regressions.mjs` runners, because the calendar and profile now import the mat hours CSS.
- **Overlap with #399** (which turns ProfilePage into a card face): one import and one `<ProfileMatHoursStat to={to} />` line at the top of `profile-stack`. #399 can move that line into its card's stats. The stat is self-contained (`useStudentFile`, its own CSS under `.card-stat--mat-hours`). `StudentCardPreview` still shows the read-only stat. The stat CSS forces readable colors on the dark profile arena.
- **Decision:** two different taps on the profile stat. The total opens quick-add, and the separate units chip switches hours ↔ days/years. The read-only stat (report card, card preview) keeps "tap the total to toggle".
- **Open question:** should two classes on the same day be logged separately? Right now same day + same session means one record, so a second class adds to the existing record instead of creating a new one. Use a full journal card if it's a separate class.
- **Screenshots:** `after-move-hub-{white,purple,black}-*`, `after-move-profile-stat-{white,purple,black}-*`, `after-move-quick-add-*`, `after-move-calendar-mark-*`, `after-move-calendar-add-time-*`, `after-move-calendar-month-*`, at 390 and 1024. All have no sideways scroll, text at least 12px and taps at least 44px.

## Screenshots (390 and 1024)
- `before-journal-log-*`, `after-journal-log-*`
- `after-journal-injury-mark-*`, `after-journal-break-mark-*`
- `before-card-stat-{white,blue,purple,black}-*`, `after-card-stat-{white,blue,purple,black}-*`
- `after-profile-report-{blue,injury,hiatus,black}-*`

Every shot was checked: no sideways scroll, smallest text 12px, smallest tap target 44px. The seeded screenshots render under the app's DEMO MODE banner.

## Round 10:58 — session types + one time wheel
- Session types: Class, Open mat, Miscellaneous, Other (optional free text, max 80, stored as `sessionOther`, kept only when session is `other`). Misc/Other count toward total mat hours.
- Mat time is one scrolling wheel (existing `WheelPicker`, detents every 10 min → 10/30 soft snap). Any minute 0–12:00 reachable by tap/arrow/flick (e.g. "1:31"); slow drags settle on the nearest 10. Clear kept. Same picker in quick-add. Chips and −/+ removed.
- Shared fix in `WheelPicker.commit()`: clear pending debounce so scrollend+debounce don't double-commit and re-snap a tapped/arrowed value. Benefits the #379 timer wheels too.
- Journal: technique lines with notes, My techniques picker search, fuzzy (typo-tolerant) search with highlights; video library has no tags so matching is text-only. Pagination is card view only. Binder pages styling.
- Seeded preview runs in DEMO MODE: saves don't persist across navigation (same on base f594af9) — not a bug.
- Overlap with #399: CSS is self-contained in `journalPages.css` / `matHours.css`; only shared touch is `WheelPicker.tsx` (one line).
- Tests: `journalRound.test.ts` (7) + mat-hours regressions (11). Full `npm test` 1768 pass / 0 fail; tsc + build clean.

## 11:19 follow-up
- Flag already present since 3ae6fa4: `src/lib/fundamentalsConfig.ts` → `FUNDAMENTALS_REQUIRED_FOR_BELT = true`. Routed through `checkpointFilled()` in `studentTools.ts` (default param), which feeds `checkpointShare`/`checkpointState`/`beltRequirementProgress` and the report's "Met". No other fundamentals-required checks exist.
- Test strengthened (`journalRound.test.ts`): default blocks on an unmet fundamentals requirement (= explicit `true`); `false` lets coach-met requirements decide.
- Techniques drilled confirmed last in both the new-entry and edit forms (after Partners, Drills, Rolls, Notes, Stop doing), covered by the regression test.

## Merge with main after #399 (2:09 PM)
- `package.json`: took main's test script (adds `competitionCard.test.ts`) and re-appended the mat-hours tests (`matHours.test.ts`, `journalRound.test.ts`, `run-mat-hours-regressions.mjs`).
- `src/pages/student/ProfilePage.tsx`: kept both imports. `ProfileMatHoursStat` moved out of the stack into a new optional `stats` slot on #399's `ProfileCardFace`. It renders as "Card stats" directly under the face, outside the face section, so #399's rules still hold: face controls use visible text only, and nothing collides with the face.
- Regression: mat hours sit in the card stats right after `profile-card-face`. Screenshot: `after-conflict-profile-390.png`.
