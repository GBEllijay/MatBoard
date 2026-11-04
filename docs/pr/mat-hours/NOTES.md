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

## Screenshots (390 and 1024)
- `before-journal-log-*`, `after-journal-log-*`
- `after-journal-injury-mark-*`, `after-journal-break-mark-*`
- `before-card-stat-{white,blue,purple,black}-*`, `after-card-stat-{white,blue,purple,black}-*`
- `after-profile-report-{blue,injury,hiatus,black}-*`

Every shot was checked: no sideways scroll, smallest text 12px, smallest tap target 44px. The seeded screenshots render under the app's DEMO MODE banner.
