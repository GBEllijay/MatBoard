# Student Edition progress file

Step 1 is the shared file format. There is no Student Edition screen, price, or tier check in this change. The planned one-time price in the owner notes is $19.99, between White ($9.99) and Coach ($29.99). That price is not in the app yet.

Advantage never hosts the file. A student or coach keeps it on their device, attaches it to email, or drops the same JSON into the gym Google Drive folder. The file is text. It does not carry photos or videos.

Student, Coach, and Pro may all import and export this file. This step does not change who can open a screen. A later step must not refuse a file the person already has because of their tier.

## Packets

Every file is one JSON object with `schemaVersion`, `kind`, `id`, `studentId`, and `updatedAt` (milliseconds).

| Kind | Who writes it | What it carries |
| --- | --- | --- |
| `student-progress-report` | Student | Profile, rubric marks, fundamentals checklist, journal, calendar |
| `coach-plan` | Coach | "Work on before next promotion" and focus lines |
| `coach-feedback` | Coach | A synopsis, plus optional marks on the same criterion ids |

`schemaVersion` is `1`. A missing version, or any version this build does not know, is refused. The file is left unread. Optional fields that are absent (`examples`, an empty learned-on date, a blank level key, a null rubric mark) stay in version 1. A migration is required only when a field is renamed, removed, or an id starts meaning something else. The migration reads the old `schemaVersion`, writes version 1 fields, then runs the same checks.

Invite and review packets in the gym folder use `version`, not `schemaVersion`. Today's Drive handoff reader ignores a progress file (`parseHandoffPacket` returns nothing). Progress files can sit in that folder without changing an invite or a review.

File names follow the handoff pattern:

`advantage-handoff-student-progress-report-{id}-{updatedAt}.json`
`advantage-handoff-coach-plan-{id}-{updatedAt}.json`
`advantage-handoff-coach-feedback-{id}-{updatedAt}.json`

Email on any tier attaches that JSON. Pro and Coach Unlimited can also save it with the existing gym-folder handoff (`drive.file` and `drive.readonly` only). OneDrive can use the same text later. This step does not add scopes or a new OAuth client.

## Entities

### StudentProfile

The student's id, display name, gym name, start date, and belt level. The id is stable for the life of the file.

### BeltLevel

`belt` is `white`, `blue`, `purple`, `brown`, `black`, `grey`, `yellow`, `orange`, `green`, or `coral`. `levelKey` is free text. It is empty until the owner decides whether a belt is split into stripes, one next-belt gate, or both. The file does not count stripes.

### Rubric and shared criterion ids

`StudentRubric` is the student's marks toward the next belt or level (`toward` is words, such as "Blue"). Each mark stores `criterionId`, a label, a category, `met` (`true`, `false`, or blank), and a note.

The id is the join to the coach rubric. Build it as `rubric.{belt}.{slug}`, for example `rubric.white.closed-guard`. The coach file and the student file match on that id. The label can change. The id cannot.

`RubricCriterion` is the definition shape (id, belt, level key, label, category) the coach rubric will use later. This step does not add a coach rubric screen or a finished list of criteria.

### FundamentalsCatalog and items

The catalog shipped with the app is `bjj-fundamentals-draft-1`. It is marked `draft: true` for owner review. Categories are positions, sweeps, escapes, passes, submissions, and takedowns. Each item is a stable id plus a name, such as `sweep.scissor` / "Scissor sweep".

`examples` is optional. Missing means an empty list. The draft list leaves every examples list empty, so the sheet is names only. A later decision can fill examples without a new schema version. Those lines are short text, not photos.

The whole catalog is not copied into every progress file. The checklist and journal carry the name and the catalog id, so a coach can read the file without the catalog.

### StudentChecklistEntry

One row on the fundamentals sheet. `catalogItemId` points at a catalog name. An empty `catalogItemId` is a line the student added, so the list can grow. `learnedOn` is `YYYY-MM-DD` or empty. `note` is the blank "date learned / note" the owner described.

### JournalEntry, game tag, technique refs, amendments

A card has a date, `gameTag` of `a`, `b`, or `c` (A game / B game / C game), the original text, and technique refs (`id` plus `name`). Search looks at the card text, amendment text, and technique names, so "scissor sweep" or "pendulum sweep" finds a card.

`Amendment` is a dated note on that same card: its own id, date, text, and created time. A later curriculum cycle appends an amendment. It does not replace the cycle-1 card.

### CalendarEvent

A day on the student calendar: id, date, title, kind (`class`, `training`, `promotion`, `note`, `other`), and a note.

### CoachPlan

Title, issue date, note, and focus lines. A focus line can point at a `criterionId`, a `catalogItemId`, or just a name. The usual title is "Work on before next promotion."

### CoachFeedback

Issue date, the plan id it answers (or empty), a synopsis, and optional notes on criterion ids. `met` on a feedback note is optional. Whether the coach synopsis is allowed to set the student's rubric mark is still an owner decision. The file can store the mark. This step does not apply it to a screen.

## Stable ids

Ids are letters, numbers, dots, hyphens, and underscores, up to 80 characters. Dots separate the parts of a shared id, as in `sweep.scissor` or `rubric.white.closed-guard`. Catalog ids and criterion ids are shared vocabulary. Journal, amendment, checklist, calendar, plan, and packet ids are created once on the device that wrote them and then reused so the two sides can match.

A new export of the same living report keeps the same packet id and moves `updatedAt` forward.

## Import and merge

Import of a `student-progress-report` merges into the copy already on the device. It does not replace that copy.

- A file for a different `studentId` is left out.
- The profile on the device is kept when the two profiles differ.
- A journal card that already exists keeps its original text, date, game tag, and technique names. A different incoming card is reported and ignored.
- Amendments on that card append when the amendment id is new. The same amendment id with different text keeps the text already on the device.
- A checklist line, rubric mark, or calendar event that already has text keeps that text. An empty field can be filled from the incoming file. A new id is added.
- A coach plan or coach feedback file is one snapshot. The same id with a newer `updatedAt` replaces it. An older file is left aside. There is no amendment chain on those two kinds.

## Privacy

The checks refuse `data:` text and keys that mean a file body (`blob`, `bytes`, `base64`, and the same family). Email stays in the person's own mail. The Drive copy stays in the gym folder the owner already connected. Advantage does not receive the JSON.

## Spreadsheet

`exportProgressCsv` writes one UTF-8 CSV with a byte-order mark and CRLF, so Excel can open it. The first row is:

`Sheet, Id, Date, Parent id, Game, Category, Name, Technique names, Learned on, Note, Body, Met, Title, Kind, Belt, Toward, Criterion id, Catalog item id`

Filter the Sheet column:

| Sheet | One row is |
| --- | --- |
| Profile | The student |
| Rubric | One criterion mark |
| Checklist | One fundamentals line, including a line the student added |
| Journal | One original card. Technique names are separated with `; ` |
| Amendment | One later note. Parent id is the journal card id |
| Calendar | One day |
| Coach plan | The plan header |
| Focus | One "work on this" line. Parent id is the plan id |
| Coach feedback | The synopsis, in Body |
| Feedback mark | One criterion note on that synopsis |

JSON remains the file that import merges. The CSV is the spreadsheet view of that same file. Saving a CSV does not write back over a journal card.

## Code

Types live in `src/lib/progress/types.ts`. The draft name list is `FUNDAMENTALS_CATALOG` in `src/lib/progress/catalog.ts`. Read, write, merge, search, and CSV are in `src/lib/progress/format.ts`.
