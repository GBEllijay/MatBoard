# Student Edition progress file

Step 1 is the shared file format. There is no Student Edition screen, price, or tier check in this change. The planned one-time price in the owner notes is $19.99, between White ($9.99) and Coach ($29.99). That price is not in the app yet.

Advantage never hosts the file. A student or coach keeps it on their device, attaches it to email, or drops the same JSON into the gym Google Drive folder. The file is text. It does not carry photos or videos.

Student, Coach, and Pro may all import and export this file. This step does not change who can open a screen. A later step must not refuse a file the person already has because of their tier.

## Owner decisions

- Fundamentals ship as names only. Each catalog item still has an `examples` list so the shape can hold a worked checklist later. The list we ship is empty, and this step does not fill it.
- Belt progress is checkpoints between levels. A rubric is levels, then checkpoints, then criteria. A criterion is a requirement plus technique names. The student marks criteria and checkpoints met. The file has no stripe count.
- Coach feedback and the coach plan are suggestions only. Import shows them to the student and does not change rubric marks, checkpoints, the journal, or goals. The student chooses what to write on their own file.
- Licensing below is the plan for a later step. This step does not sell a code or send an invite.

## Packets

Every file is one JSON object with `schemaVersion`, `kind`, `id`, `studentId`, and `updatedAt` (milliseconds).

| Kind | Who writes it | What it carries |
| --- | --- | --- |
| `student-progress-report` | Student | Profile, rubric, fundamentals checklist, journal, calendar, goals, an optional clip clipboard, and an optional competition section (tournaments, standing A/B/C game, weigh-ins) |
| `coach-plan` | Coach | Suggestions under "Work on before next promotion" |
| `coach-feedback` | Coach | A synopsis and suggestion notes |

`schemaVersion` is `2`. This build also reads version `1`. A missing version, or any other version, is refused. The file is left unread. Optional fields that are absent (`examples`, an empty learned-on date, a blank license source, a null checkpoint mark, `clips`, `competition`) stay valid. Version 1 has no `competition` section. Import fills one. A version 1 journal card tagged A, B, or C copies its techniques and notes into that standing game when the file has no competition section yet. A file that already has `competition`, including empty games, is left as written. A migration that renames or removes a field still has to be explicit.

Invite and review packets in the gym folder use `version`, not `schemaVersion`. Today's Drive handoff reader ignores a progress file (`parseHandoffPacket` returns nothing). Progress files can sit in that folder without changing an invite or a review.

File names follow the handoff pattern:

`advantage-handoff-student-progress-report-{id}-{updatedAt}.json`
`advantage-handoff-coach-plan-{id}-{updatedAt}.json`
`advantage-handoff-coach-feedback-{id}-{updatedAt}.json`

Email on any tier attaches that JSON. Pro and Coach Unlimited can also save it with the existing gym-folder handoff (`drive.file` and `drive.readonly` only). OneDrive can use the same text later. This step does not add scopes or a new OAuth client.

## Licensing plan

Not built in this step. The profile may store `licenseSource` so a later file can say how the copy was issued. The field is optional and blank when unknown. It does not store the buyer, and it is not an abuse counter.

- A person who buys Coach gets a simple Academy Member code for Student Edition at 25% off. They may share that code with no use limit and no tie back to the buyer. A coach who holds a seat under Pro gets the same 25% code to give students.
- Pro includes 10 free Student Edition licenses. The head instructor sends those the same way they already send a Coach seat invite. Pro also includes the Academy Member 25% code.
- Later copy, for a screen this step does not add: "Gyms can email advantageappllc@gmail.com to purchase additional Student Edition licenses at a discount."

`licenseSource` is `academy-member` (the 25% code), `pro-grant` (one of the 10 free licenses), `additional` (a later discounted license the gym bought by email), or blank.

## Entities

### StudentProfile

The student's id, display name, gym name, current belt, start date, and optional `licenseSource`. The id is stable for the life of the file. The belt is `white`, `blue`, `purple`, `brown`, `black`, `grey`, `yellow`, `orange`, `green`, or `coral`.

### Rubric, levels, checkpoints, criteria

`StudentRubric` is a list of levels. Each level has a name, a belt, and checkpoints. Each checkpoint has a name, the student's `met` mark, a note, and criteria. Each criterion has a stable id, a requirement, technique refs (id plus name), the student's `met` mark, and a note.

Checkpoints are the steps between levels. The student marks a criterion met and marks a checkpoint met. Those marks live only on the student report.

Criterion ids are `rubric.{belt}.{slug}`, for example `rubric.white.closed-guard`. Checkpoint ids are `checkpoint.{belt}.{slug}`. The coach suggestion can name those ids. It cannot set `met`.

### FundamentalsCatalog and items

The catalog shipped with the app is `bjj-fundamentals-starter-1`, titled "BJJ fundamentals (starter)". The owner approved this list on 2026-10-10 (`draft: false`). It is the same names as the earlier draft: 31 techniques in 6 categories (positions, sweeps, escapes, passes, submissions, and takedowns). Item ids did not change. `sweep.scissor` is still "Scissor sweep".

A file that still says `bjj-fundamentals-draft-1` imports as `bjj-fundamentals-starter-1`. That alias is only the catalog id. Checklist rows keep their item ids.

Names only is the shipping decision. `examples` remains on the item. Missing means an empty list. Every item in the shipped catalog has an empty list.

The whole catalog is not copied into every progress file. The checklist and journal carry the name and the catalog id, so a coach can read the file without the catalog.

### StudentChecklistEntry

One row on the fundamentals sheet. `catalogItemId` points at a catalog name. An empty `catalogItemId` is a line the student added, so the list can grow. `learnedOn` is `YYYY-MM-DD` or empty. `note` is the blank "date learned / note".

### JournalEntry, game tag, technique refs, amendments

A card has a date, an optional `gameTag`, the original text, and technique refs. The Class line is free text, the same kind of note as a lesson plan class description. Older cards that stored Gi or No-Gi keep those words as the class text. A new journal page does not ask for A, B, or C game. `gameTag` is blank on a new card. A card saved when the journal still asked for a game keeps `a`, `b`, or `c`. The standing A/B/C game lives only on `competition.games`.

A new journal page starts with three rows labeled `Technique drilled #1`, `#2`, and `#3`. Add another technique adds a row, up to 12. Empty rows are not saved. An older card keeps the techniques it stored and does not gain blank rows. The card text lists each saved technique as `Technique drilled #N: name` and still includes a `Techniques:` line with those names separated by `; `. Search looks at the card text, the Technique drilled label, amendment text, technique names, and the standing game, so "scissor sweep", "technique drilled", or "pendulum sweep" finds a card.

The standing A/B/C game lives once, on `competition.games`. Each letter has `techniques` (techniques and sequences) and `notes`. The journal chips and the Competitor page edit that same copy. A journal card still keeps the techniques from the day it was written. Search on the journal cards page also lists a standing game whose techniques or notes match.

`Amendment` is a dated note on that same card. A later curriculum cycle appends an amendment. It does not replace the cycle-1 card.

### JournalClip

Optional on a student progress report. Older files omit `clips`, and import leaves them that way. A present `clips` array, including an empty one, is the clipboard.

Each clip has a stable id, an `http` or `https` URL, a short `description` of what the link is for or what to train, and `createdAt` / `updatedAt` in milliseconds. The description is at most 500 characters. The URL is at most 2000 characters. Any http(s) link is allowed. YouTube and Instagram are the usual ones, and the file does not limit the host. A `data:` URL or any other scheme is refused.

Search matches the description and the URL. Send to coach includes `clips` in the JSON only when the field is present on the report. The CSV adds a `Clip` sheet row for each saved clip (name and note are the description, body is the URL) and omits that sheet when the field is absent.

### CalendarEvent

A day on the student calendar: id, date, title, kind (`class`, `training`, `promotion`, `note`, `other`), and a note.

Tournaments are not copied into this list. The calendar reads `competition.tournaments` and marks the event day and the registration deadline.

### Competition, tournaments, standing game, weigh-ins

Optional on a student progress report. Version 2 files written by this app include it. Version 1 files omit it. Import of a file with no `competition` field does not clear a competition section already on the device.

`competition.games` is the standing A, B, and C game. `competition.weightUnit` is `lb` or `kg`, the unit the chart and new weigh-ins use on that device. Import keeps the unit already on the device.

`competition.tournaments` lists tournaments the student is `entered` in or `considering`. Each one has a name, event date, location, division / weight class, registration deadline (or empty), an http(s) link (or empty), status, an optional target division weight with its unit, and goals. A tournament goal has an id, name, note, and `met`. Those goals are not the belt goals.

`competition.weighIns` lists dated weigh-ins. Each stores the number in the unit it was entered (`lb` or `kg`) plus an optional note. The chart converts for display. The student edits weigh-ins, the target, and the chart on the Weight page.

`competition.results` lists competitions the student recorded after the event. Each result points at a tracked tournament id when they picked one, and stores the tournament name, division, matches, and personal bracket lines. A match has an opponent, a result of `win`, `loss`, or `draw`, a method of `points`, `sub`, `advantage`, `dq`, or blank, and a note. Bracket lines are a round and a name. This is a record, not a live scoreboard. `bracketPhoto` is true when a photo of the bracket is on the student's phone. The image is not in this file. A file with no `results` list imports as an empty list and does not clear results already on the device.

### CalendarEvent and tournaments

The student calendar shows tournament days from `competition.tournaments` beside journal dots and calendar events. Removing a tournament there removes it from the calendar. A hand-added calendar event with kind `other` (labeled Tournament on the page) stays a separate note.

### StudentGoal

A goal the student owns: id, name, note, and `met`. Coach files do not write goals.

### CoachPlan

Title, issue date, note, and focus lines. A focus line can point at a criterion id, a catalog item id, or just a name. The usual title is "Work on before next promotion." These lines are suggestions. Import does not copy them onto the rubric or the goals.

### CoachFeedback

Issue date, the plan id it answers (or empty), a synopsis, and suggestion notes. A suggestion has its own id, an optional target id (a checkpoint or criterion), and text. There is no `met` on a suggestion. A file that includes `met`, a journal, a rubric, or goals inside a coach packet is refused.

## Stable ids

Ids are letters, numbers, dots, hyphens, and underscores, up to 80 characters. Dots separate the parts of a shared id, as in `sweep.scissor` or `rubric.white.closed-guard`. Catalog ids, criterion ids, and checkpoint ids are shared vocabulary. Journal, amendment, clip, checklist, calendar, goal, tournament, tournament-goal, weigh-in, plan, and packet ids are created once on the device that wrote them.

A new export of the same living report keeps the same packet id and moves `updatedAt` forward.

## Import and merge

Import of a `student-progress-report` merges into the copy already on the device. It does not replace that copy.

- A file for a different `studentId` is left out.
- The profile on the device is kept when the two profiles differ.
- A journal card that already exists keeps its original text, date, game tag, and technique names. A different incoming card is reported and ignored.
- Amendments on that card append when the amendment id is new. The same amendment id with different text keeps the text already on the device.
- A checklist line, goal, checkpoint, criterion, calendar event, or clip that already has text keeps that text. An empty field can be filled from the incoming student file. A new id is added. A mark the student already set is kept.
- A file with no `clips` field does not clear a clipboard already on the device. A file that includes `clips` adds new clip ids and keeps the link and note already stored for an id this device has.
- A file with no `competition` field does not clear tournaments, the standing game, weigh-ins, or results already on the device. A file that includes `competition` adds new tournament, goal, weigh-in, result, match, and bracket ids. Text already stored for an id is kept. An empty standing-game field can be filled from the incoming file. The weight unit on the device is kept. A missing `results` list does not clear results already on the device.
- `importCoachSuggestion` returns the student report unchanged, beside the coach packet. The student can read the suggestion. Nothing in that import writes rubric marks, checkpoints, the journal, or goals. A newer coach file can replace an older coach file of the same id. That replacement is only the suggestion snapshot.

## Privacy

The checks refuse `data:` text and keys that mean a file body (`blob`, `bytes`, `base64`, and the same family). Email stays in the person's own mail. The Drive copy stays in the gym folder the owner already connected. Advantage does not receive the JSON.

A coach import of this file copies the competition plan onto that competitor’s roster card on the coach’s phone. Competition Class Curriculum, the competitor roster, check-in, and rankings read that same on-device copy. Nothing is uploaded.

## Spreadsheet

`exportProgressCsv` writes one UTF-8 CSV with a byte-order mark and CRLF, so Excel can open it. The first row is:

`Sheet, Id, Date, Parent id, Game, Category, Name, Technique names, Learned on, Note, Body, Met, Title, Kind, Belt, Toward, Criterion id, Catalog item id`

Filter the Sheet column:

| Sheet | One row is |
| --- | --- |
| Profile | The student. Note is `licenseSource` when set. Belt is the current belt. |
| Level | One rubric level. Parent id is the rubric id. |
| Checkpoint | One checkpoint. Parent id is the level id. Met is the student's mark. |
| Criterion | One requirement. Parent id is the checkpoint id. Body is the requirement. Technique names are separated with `; `. |
| Checklist | One fundamentals line, including a line the student added |
| Journal | One original card. Technique names are separated with `; `. Body lists each saved technique as `Technique drilled #N: name` |
| Amendment | One later note. Parent id is the journal card id |
| Clip | One saved link, only when the report includes `clips`. Name and Note are the description. Body is the URL |
| Calendar | One day |
| Game | One standing A, B, or C game that has techniques or notes. Game is `a`, `b`, or `c`. Technique names are the sequences. Note is the game notes. Omitted when that letter is blank |
| Tournament | One tournament. Date is the event day. Learned on is the registration deadline. Category is the division. Note is the location. Body is the link. Kind is `entered` or `considering`. Toward is the target weight and unit when set |
| Tournament goal | One goal for that tournament. Parent id is the tournament id |
| Weigh-in | One weigh-in. Name is the number. Kind is `lb` or `kg` |
| Result | One recorded competition. Name is the tournament. Category is the division. Criterion id is the tracked tournament id when set. Note says a bracket photo is on the student phone when one is |
| Match | One match. Parent id is the result id. Game is `win`, `loss`, or `draw`. Category is the method. Name is the opponent. Note is the match note |
| Bracket | One personal bracket line. Parent id is the result id. Category is the round. Name is the person |
| Goal | One student goal |
| Coach plan | The plan header |
| Focus | One suggestion line. Parent id is the plan id |
| Coach feedback | The synopsis, in Body |
| Suggestion | One coach note. Criterion id column holds the target id. Met is blank. |

JSON remains the file that import merges. The CSV is the spreadsheet view of that same file. Saving a CSV does not write back over a journal card or a checkpoint mark.

## Code

Types live in `src/lib/progress/types.ts`. The approved starter list is `FUNDAMENTALS_CATALOG` in `src/lib/progress/catalog.ts`. Read, write, merge, search, and CSV are in `src/lib/progress/format.ts`.
