# Card entry overhaul

Status: draft PR #399. Do not merge or mark ready without the owner's own go-ahead.
Public name is Advantage throughout. No changes to unlock codes, entitlements, Stripe or Drive/OAuth.

## What changed
1. **Coach Add / Edit sheet is a blank card.** It uses the gym's card look (Clipboard or Fighter, Dark or Light).
   - Kicker reads "Student roster card" or "Competition card".
   - Tap the photo slot, the name, or the belt slot to fill it in. The belt slot jumps to the belt rack.
   - All the fields use the card paint. There's a sticky Cancel + Save footer, and the long intro copy is gone.
2. **Digital Rolodex for both rosters.** Mini cards snap as you scroll.
   - The face and the name open the full card: a Student roster card, or a Competition card on the Competitor Roster.
   - Every row control stays on the mini card in the same order: belt, Competitor switch, then Check In.
   - It works by keyboard and screen reader, and it respects reduced motion.
3. **Yellow Competitor pill** is repainted with the card look.
4. **Competition card v1**, built from existing data only:
   - Record (W–L), Upcoming tournaments (with a Calendar .ics download), the latest weigh-in and goal.
   - Coach assessment, taken from the linked Student roster card.
   - Results, with method labels.
   - Scouting, which lists opponents faced in the results.
   - Belt archive.
   - On a phone, Results, Scouting and Archive are folded. Record, Upcoming and Assessment never fold.
   - Check in and Change details sit on the card.
5. **Coach Clipboard card**:
   - Tap the name (a button inside the h2, so the heading text doesn't change) or the belt ("Change belt and stripes") to open Change details. The pencil ("Edit belt and stripes") stays and is now 44×44.
   - A hidden hint "Tap the name or belt to change details" is wired up with aria-describedby.
   - All text is at least 12px (21 declarations were raised) and every target is at least 44px: tabs, buttons, Choose photo, No photos toggle, links, switches, segment buttons and inputs.
   - The radar labels are readable at 390.
6. **Belt buttons** in the editor measure 14px / 44px in all four looks. The 11.52px belt-mark name on the Rolodex, the Competition card and the Clipboard card is now 12px.
7. **My profile is a card face**, shown in the gym's card look (newest accepted coach update, the same rule as the preview).
   - It shows the photo (or initials), the gym logo, the name, gym, training start, trains, and the belt.
   - Each part jumps to the field that fills it in. The belt opens My rank.
   - The face is read-only. Save profile is still the last control.
   - With No photos (the family lock) on, the face never shows the photo.
   - Exit demo and the inline My rank link now reach 44px.
8. **Student "I'm a competitor" switch** (`matboard.studentCompetitor.v1`):
   - Unset means ON.
   - OFF hides the hub Competitor tile and the competitor summary. /student/compete still opens.
   - It is not sent in Make a file for my coach.

## Decisions (owner, 9:41 AM EST)
- "I'm a competitor" defaults to ON.
- It is not part of Make a file for my coach.
- Hiding the tile and summary is enough. The pages are not blocked.

## Checks
- Measured at 390 and 1024 in all four looks: Rolodex, Competition card, Coach card, editor and belt rack, and My profile. No sideways scroll, no text under 12px, no tap target under 44px.
  - Scripts: `/workspace/skins-mock/card-entry-overhaul/*.mjs`.
  - The tap check uses offsetHeight because the Rolodex scale animation skews getBoundingClientRect.
- `npm test`: 1751 tests, 0 failing. `tsc -b` and `npm run build` are clean.
- e2e: `student-profile-photo` and `card` pass. `student-profile.spec.ts:12` fails on the hub's "My profile" tile text with or without this branch's last commit. That failure predates this work (the demo hub copy) and is left as is.

## Known limits
- Student roster rows have no photos (photos go through approval), so their Rolodex faces show initials.

## Follow-ups (not built)
- Injury "body scan" card: a green-line hologram figure with red hot spots. **Whiteboard only. Don't build.**
- Competition card game plans.
- The video suggestion.
- An updates archive (there is no model for it yet).
- Coach-side self-assessment and scouting data models. Scouting only shows opponents faced for now.
- Student roster photos on Rolodex faces once approval sync exists.

## Screenshots
Before and after shots are in this folder. The full set is in `/workspace/skins-mock/card-entry-overhaul/` (`before-*`, `after-*`, `after-face-*`).
