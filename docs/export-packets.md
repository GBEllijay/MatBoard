# Advantage export packets

One packet system for every kind of Advantage data. A person exports one file and imports that same file. Student Edition is the first kind that reads and writes the file. Instructor, academy, and media use the same envelope and are designed here so they can be filled in without a second format.

## One system, not a format per screen

Per-type files are how the student export works today: a journal JSON, a spreadsheet, a progress PDF, and a self-assessment PDF. Only the JSON restores the phone, and the self-assessment, index cards, and several other local stores are easy to leave behind or to handle as a second upload.

A shared packet means the manifest, the checksums, the preview, and the merge-or-replace choice are written once. A new kind adds a section list and an apply function. It does not add a new file extension or a new restore screen.

## File format

The file is one JSON document with the extension `.advantage` and the type `application/vnd.advantage.packet+json`.

A zip would store video bytes more tightly, and a later media packet can put large binaries in a zip while keeping this manifest. This version stays a single JSON envelope:

- The app already restores JSON text. There is no zip library in the client.
- Checksums are hashes of each section's canonical JSON. Import can verify them before it shows a preview.
- Photos and optional video bytes already travel as text in the student backup, with the same 48 MB video cap.
- A spreadsheet is a text section inside the same file, so Excel users still have the rows without a second required download.

Canonical JSON sorts object keys at every level and keeps array order. Each checksum is `sha256:` plus the hex digest of that text. Every section key has one checksum, and every checksum names a section. A mismatch, a missing section, or an extra checksum refuses the file. Nothing is written.

## Manifest

```json
{
  "format": "advantage-packet",
  "version": 1,
  "kind": "student",
  "createdAt": "2026-11-10T20:00:00.000Z",
  "appVersion": "1.0.0",
  "profileId": "default",
  "accountId": "00000000-0000-4000-8000-000000000000",
  "checksums": { "scope": "sha256:…", "bundle:default": "sha256:…" },
  "sections": {}
}
```

`kind` is `student`, `instructor`, `academy`, or `media`. `profileId` and `accountId` are omitted when the device does not have them. `accountId` is the support reference already shown in the app. It is not a token and it does not restore a purchase.

`version` 1 is the only version this build reads. A higher version is refused with a message to update Advantage. An older journal backup (`advantage: "student-journal-backup"`, version 1) is not this envelope. Restore still accepts that file.

## Import

1. Parse the JSON and read the manifest.
2. Refuse a bad version, an unknown kind, a checksum mismatch, or a forbidden secret field.
3. Show a preview: kind, date, app version, profile names, and counts for each data type (journal cards, self-assessment check-ins, rank and promotion records, index cards, spreadsheet, video files).
4. Write only after an explicit choice. Merge keeps records that exist only on this phone. Replace writes the packet over the profiles named in the file. Profiles on the phone that are not in the file are left in place. Cancel writes nothing.

## What a packet never contains

Activation flags, entitlement tokens, parent-gate PIN hashes, inbox passwords, academy license ids, student upload codes, Drive or OneDrive tokens, Stripe ids, and license-redemption secrets.

The builder does not read those stores. As a backstop it drops forbidden field names (`pinHash`, `accessToken`, `inboxPass`, and the same class of key) before it checksums the file. Import refuses a file that still contains one. A packet does not unlock an edition and does not reconnect a cloud account.

## Student packet (implemented)

The main control is **Download student packet (.advantage)** on Backup & Print (`/student/backup`) and on Connections (`/student/connections`).

The open family profile is the file by default. **Include every profile on this phone** writes one bundle per profile in `matboard.studentEdition.profiles.v1`. The default profile keeps the unsuffixed keys. Other profiles use the `::profile:` suffix those keys already use.

Each bundle holds:

| Section | What it is |
| --- | --- |
| journal | Progress file: journal, rank, stripes, promotion history, belt progress, competitor data, weight, tournaments |
| assessment | Self-assessment check-ins |
| scouting | Opponent cards |
| rankPhotos, bracketPhotos | Promotion and bracket pictures stored on the phone |
| films, filmFiles | Video library metadata. Bytes only when **Include video files** is on, same 48 MB cap |
| coachPlan, coachFeedback | Coach plan and feedback saved on this phone |
| indexCards | Index cards |
| portrait, gymLogo | Profile photo and the student's gym logo, when they are on the phone |
| csv | Spreadsheet rows, including self-assessment, scouting, and filmed-video rows |
| extras | Other student-local values: podium photos, profile-mark switches, competitor switch, streak target, unsaved game drafts, photo flag, stable student id, weight-share choice, coach overlay, coach update ledger, coach file snapshot, coach outbox |

**Download spreadsheet (.csv)** remains a secondary button for Excel or Sheets. It cannot restore the phone. The progress PDF and the self-assessment PDF stay as printable copies. Their data is already in the packet.

Drive copy, when a folder is connected, uploads the one packet the student just downloaded.

## Instructor packet (designed)

Not written from live data in this build. The stub is a valid packet with `sections.status: "designed"`. Import shows the plan and does not restore it.

Planned sections: instructor character sheet (name, photo, belt, teaching start, stat sheet), technique tree (`matboard.coach.techniqueTree.v1`), training notes (`matboard.coach.trainingNotes.v1`), competition curriculum, and lesson templates kept on the device.

Left out: seat sessions, OAuth tokens, Stripe ids, license codes.

## Academy packet (designed, next)

Academy info has no export today. Clearing the cache means typing the gym in again. This is the next kind to implement, on the same `buildPacket` path.

Planned sections: academy profile (name, founded date, founders, lineage and whether lineage is shown), branding (gym logo), roster, class schedule, gym event log, and settings such as gallery approval.

Left out: Stripe, seat invite tokens, license codes, Drive tokens, Plus Cloud credentials. Roster notes stay in the academy packet. They are not copied into a student packet.

## Media packet (designed)

Planned sections: the local Media Console library (gallery items, shop slides, event slides) and the console settings stored on the device.

Plus Cloud owners keep the bytes in the cloud account. A later packet may list cloud object ids and names. It does not embed those bytes and it does not include cloud credentials or signed URLs. A separate download can be offered later for an owner who wants the bytes.

## Adding a kind

1. Add the section list to `src/lib/packets/stubs.ts` while it is still a design, or replace the stub with a collector.
2. Call `buildPacket` so the manifest and checksums stay shared.
3. Teach `readRestoreChoice` to preview the kind and, when it is ready, to apply it only after merge or replace.
