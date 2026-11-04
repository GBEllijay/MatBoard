# Card entry overhaul (WIP)

Status: work in progress. Draft PR only.

## Done so far
- Coach Add / Edit student and Add / Edit competitor sheet is now a blank card in the gym's
  card look (Clipboard or Fighter, Dark or Light, from `readCardLook()`).
  - Header: photo slot (competitor: tap opens the existing Competitor photo chooser; student
    roster: initials placeholder), name typed straight onto the card, belt slot that jumps to the
    belt rack.
  - Kicker reads "Student roster card" or "Competition card".
  - Belt rack, Division, Gym name / nickname, Last promotion + detail, Stripes and Notes are styled
    card cells that use the card paint (`--cb-well`, `--cb-line`, `--cb-ink`).
  - Sticky footer: Cancel + Save student / Save competitor. The long intro paragraph is gone.
  - Every label, aria-label, radio and class the tests use is kept.
- Student Edition: "I'm a competitor" switch on My profile (`matboard.studentCompetitor.v1`).
  - Unset = ON, so nobody loses the Competitor tile.
  - OFF hides the hub Competitor tile and the profile's competitor summary. /student/compete
    still opens; nothing is deleted.
  - Nothing is sent. The flag is not part of the #392 Make a file for my coach payload.

## Still to do
- Tap-to-edit on the Coach Clipboard card, plus sub-12px fonts and 44px targets there.
- Student profile laid out as a card face.
- Digital Rolodex for the Student Roster and Competitor Roster lists.
- Competition card v1 (from the competitor-card-designs mock).
- Restyle the yellow Competitor pill.
- Regression tests, then final screenshots.

## Follow-ups (not built)
- Injury "body scan" card: a green-line hologram figure with red hot spots. Whiteboard only.
