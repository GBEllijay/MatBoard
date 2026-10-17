# Student Edition sharing, codes, and connections

This note records the owner's rules. It does not add a checkout, a seat issuer, or a new Stripe price. The screens in this change are the journal backup, printable reports, Film a move, and Connections. Issuing Student Edition codes is still not built.

## Owner rules

Export and print are available at every Student Edition tier: a purchased student, a Pro-opened journal, an owner unlock, and the `?student=1` preview. Nothing in this plan refuses a file the person already has because of their tier.

Only Pro shares a drive with other people, and only Pro has the built-in cross-platform upload and download path between coach and student. That path is the academy folder already connected on the Pro browser (Google Drive or OneDrive). Pro hands the student a pathway into that folder. The pathway is an Advantage link and a QR code. The coach can also open the folder and use Google Drive or OneDrive's own Share button. A best-effort "anyone with the link can edit" call is tried. If the provider refuses it, the coach still shares the folder by hand. The student does not pay for this.

Pro-provided Student seats assume the coach has a supported drive set up. Pro should warn buyers to set one up before those seats are handed out. The Pro page says that next to the academy pathway, and it says so again when no folder is connected.

A plain Coach does not get that shared-drive path. Coach gets a half-off Student Edition code. Coach and student exchange work by exported CSV and PDF, plus template import (the existing coach plan / coach feedback import, and the journal backup). They do not get Pro's academy folder pathway.

Pro includes 10 free Student Edition codes. The head instructor, or a licensed authorized coach, can issue them. Pro also includes the half-off code, and a way to buy more Student codes in bulk.

Students at gyms that do not use Advantage get a printable progress report and a printable self-assessment. Those pages are meant to be handed to an instructor. Print uses the phone's print dialog. Download PDF saves the same words.

## What this build does

Connections (`/student/connections`) is the one student area for:

- Connect to my academy. Paste the Pro link, or open the QR. Sign in to that provider with the existing Google Drive or OneDrive sign-in. The folder id is stored on the student phone (`matboard.studentEdition.academyDrive.v1`). It does not replace `matboard.pro.googleDriveFolder.v1`.
- My own drive. Google Drive and OneDrive can be picked for personal backups (`matboard.studentEdition.personalDrive.v1`). Google Photos and iCloud are listed as coming later. They are not backup folders in this build. Google Photos remains the gym media picker on Coach and Pro.
- Export and print. Back up my journal, print progress report, print self-assessment.
- Import from coach. Opens the existing import.

Back up my journal writes one JSON file (`advantage: "student-journal-backup"`, version 1) plus a CSV and two PDFs (progress, self-assessment). The JSON holds the progress report (journal, rank and stripes with dates, belt progress, competitor data, weight, tournaments, video links), self-assessment, scouting, rank photos, bracket photos, coach plan and feedback, and filmed-move metadata. Video bytes on the phone are included only when the student checks that box, and only up to 48 MB. The files download on the phone. If an academy folder or a personal drive is connected, the same files are copied into a `Student Journal` folder there.

Restore from backup asks for merge or replace. Merge keeps records that exist only on the phone. Replace warns that a backup of the current journal is recommended, then the backup becomes the journal. Clear journal on this phone shows "A backup is recommended before clearing data on this phone" before a second confirm. Clearing does not remove the academy link, the personal drive, or an unlock.

Film a move stays on Video Library beside the existing link form. Record uses `accept="video/*"` and `capture="environment"`. Pick from gallery uses `accept="video/*"` without capture. The saved name uses the Daily Training Videos helper: date, technique, clip number, and extension, under `Videos/{YYYY-MM-DD (Ddd)}/` when it goes to a drive. Phone copies stay in IndexedDB `matboard-student-films`. Playback is a video element in the library. A file that does not fit, is empty, or is not a video gets a plain error. A drive failure does not pretend the clip was saved.

The Pro page shows the academy pathway when a Google Drive or OneDrive folder is already connected on that browser. Copy link, QR, open the folder, and try to share it for student edits. No Stripe charge is added.

## How this maps to the code today

| Rule | Where it lives now | Gap |
| --- | --- | --- |
| Student Edition opens for Pro, a student purchase, the owner student flag, or `?student=1` | `studentEditionOpen` in `src/lib/studentEdition.ts`. Pro writes `advantage.studentEditionUnlocked` from `src/lib/proUnlock.ts`. Purchase flag is `advantage.studentUnlocked`. | Coach and White do not open the journal. A half-off code would need to set the student purchase or a new grant. That writer is not built. |
| Pro unlock | `advantage.proUnlocked`. Owner code `advantage` opens Pro and Student Edition. `WINBYADV` also opens White and Coach. | Not a Stripe subscription check. |
| Student price | `STUDENT_LIST_PRICE_CENTS` is 1999. Checkout product `student` uses `STRIPE_PRICE_STUDENT` (`src/server/stripeCheckout.ts`, `src/lib/checkoutProducts.ts`). | No half-off price id. `STRIPE_PRICE_PRO_MONTHLY_DISCOUNT` is a Pro monthly discount, not a Student price. |
| 10 free licenses | `PRO_INCLUDED_STUDENT_LICENSES` is 10 in `src/lib/progress/types.ts`. `licenseSource` may be `academy-member`, `pro-grant`, or `additional`. | Nothing issues those licenses. The 10-seat cap in `src/lib/instructorSeats.ts` (`PRO_INSTRUCTOR_SEAT_CAP`) is instructor seats, not Student Edition codes. |
| Academy member discount | `ACADEMY_MEMBER_DISCOUNT_PERCENT` is 25. `ACADEMY_MEMBER_CODE_LABEL` is "Academy Member". `docs/student-edition/progress-format.md` says 25% off with no use limit. | The owner rule in this note is half off (50%). The constant was not changed. |
| Who may share a drive | `menuCloudSharing` is Pro, or a live instructor seat whose menu is allowed. Drive connect is the Coach Unlimited / Pro card. | Plain Coach has no academy pathway. This build puts the pathway on the Pro page and reads the folder already saved for that browser. |
| Coach ↔ student files | Send to coach exports the progress JSON and an optional CSV (`src/pages/student/SharePage.tsx`). Import from coach accepts a coach plan or coach feedback and does not mark the rubric. | CSV and PDF reports are now also on Connections. Template import is still the coach-file import. |
| Drive upload | `uploadTrainingVideos` / `publishTrainingVideos` in `src/lib/googleDrive.ts`. Names and date folders are `src/lib/driveVideoNames.ts`. OneDrive text and, now, larger bytes are `src/lib/oneDrive.ts`. | Student film and backup pass the student folder id. They do not call `publishTrainingVideos`, so a student phone does not overwrite the gym lesson binding. |

## Open questions

1. Half off or 25%? This note follows the latest owner rule (half off for plain Coach, and Pro includes that same half-off code). The code constant and the older progress-format note still say 25%. Which number should a later checkout use?
2. Is the half-off code one shared code per coach, with no use limit and no tie to the buyer, as the older note says for Academy Member?
3. Who counts as a "licensed authorized coach" allowed to issue the 10 free Student codes: a Pro owner only, a program-director seat, or any coach seat? Instructor seats cannot issue invites today.
4. Are the 10 free Student codes the same pool as the 10 instructor seats, or a separate pool? This note treats them as separate. The seat cap is not a student-license counter.
5. Bulk purchase of more Student codes: a new Stripe price, or the existing email line `STUDENT_LICENSE_MORE_NOTE`?
6. Should a student Google sign-in replace the Google token already stored for Pro on a shared browser? This build uses the existing sign-in, so one Google account is signed in per phone. Academy and a personal Google folder both use that sign-in. OneDrive is a separate sign-in.
7. Google Drive `drive.file` plus `drive.readonly` may refuse "anyone can edit" on a folder the app did not create. The fallback is the provider's Share button. Is a broader scope wanted later? This change does not add a scope.
8. Google Photos and iCloud are named for a later personal-backup connect. Should a student backup ever be a Photos album, or only Drive-like folders?
9. Filmed moves saved only to a drive are not inside the JSON backup. Is a later "download from the academy folder into the backup" step required?
10. Pro pathway is shown to whoever can open the Pro page on a browser that already has a folder connected. Should a seated coach without the owner Pro unlock see it too?
