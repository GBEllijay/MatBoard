# Variant A · nine-cap

Variant A is the D8 sub-factor preview that caps the diamond at nine cards and keeps that diamond on screen when you zoom. It does not turn a face into a list, and it does not drill into a card or its branches.

Commit `6bd8623f735255161dd254d5bbc4a57e570a0209` contains the full A+B implementation. Restore Variant A from that commit. This file describes that behavior so it can be brought back later. The live preview no longer has a variant switch.

## How it was opened

Route: `/preview/d8-subfactors?variant=a`

`variantFromSearch` in `src/preview/d8Subfactors/cards.ts` read the `variant` query. The value `a` selected Variant A. A missing value, `b`, or anything else selected Variant B, so B was already the default. The page showed `Variant A · nine-cap` (`VARIANT_A_LABEL`) in a `p.d8sf-variant` with `data-variant-label="a"`. The root `main.crystal.d8sf` carried `data-variant="a"`.

Variant B used the same route with no query, or `?variant=b`, and the label `Variant B · fractal zoom-to-list`.

## What Variant A did

The diamond never grew past a 3×3. `DIAMOND_CAP` is 9. `strongestCards` ranks the face’s cards by rating (highest first), then `addedAt` (newer first), then name. `showOnDiamond` in `src/preview/d8Subfactors/topoModel.ts` paints at most those nine onto the face’s existing triangles, closest to the center first. Extra cards do not add a row. The factor button counts the nine (`(9)`), not the hidden cards.

Past nine cards, `moreLabel` / `moreCount` draw a `+N more` badge (`data-more` set to the face id, class `d8sf-badge` on the focused face). The face score is `averageRating` of every card on the face, including the ones that did not fit. **Add** still opens a draft card when all nine tiles are full. A blank name is ignored. A name already on that face shows `Already on this face.` and is not saved.

Clicking the badge, an empty slot (`data-empty-slot`), or the empty pyramid background calls `openList`. That focuses the face and sets `listFaceId`. `FacePanel` then renders `CardList` (`data-testid="face-card-list"`) under the pyramid, with every card on the face, its rating, and **Add**. An effect scrolls that list into view. The diamond stays mounted.

Clicking a term (`a.d8sf-term`, `data-term-link`) calls `openCard`. On Variant A that always opens the index card as a modal sheet (`role="dialog"`, `FaceIndexCard` with `layout="sheet"`). The sheet can rate the line and add a journal note or a video, all in memory. `showBranches` is false, so the sheet has no **Branches** button. `openBranches` returns immediately.

Technique names on the crystal stay hidden until the zoom passes the resting frame (`FOCUS_FRAME_ZOOM`, 1.15). One **+** click multiplies zoom by `ZOOM_STEP` (1.3), which is enough to show the focused face’s names and not enough to pass `ZOOM_LIST` (1.8). That label rule is the one merged in PR 474 and is shared with Variant B. Variant A never consults `ZOOM_LIST` to change the page.

The bottom controls stay: the eight factor buttons, zoom **+** / **−**, **Pause rotation** / **Resume rotation**, and **Reset view**. **Reset view** clears the focus, the open list, and any sheet. The sample branch trail (the scissor chain and the other sample branches) is unchanged. Nothing is written to `localStorage` or `sessionStorage`.

## What Variant A refused to do

These gates all required `variant === 'b'`. On Variant A they did not run.

- The zoom effect in `D8SubfactorsPreview` returned immediately, so zooming never set `drill` to `{ level: 'face' }`.
- `drilled` stayed false. `TopoStage` kept `meshHidden` false, and the readout stayed on `FacePanel` instead of `DrillView`.
- `openList` did not enter the face drill even when zoom was at or above 1.8.
- `openCard` did not enter `{ level: 'card' }`. It always used the sheet.
- `openBranches` did not enter `{ level: 'branches' }`.
- `DrillView` (breadcrumb `data-testid="drill-crumb"`, **Back** `data-testid="drill-back"`, branch level `data-testid="branch-level"`) was not rendered. Four zoom clicks, which land past 1.8, left `data-testid="drill-view"` absent and `.topo-stage` visible.

`holdDiamond` and `zoomCommand` exist for Variant B’s **Back** / **Diamond** path. Variant A never opened `DrillView`, so those controls were not on screen.

## Components and functions

| Piece | Role on Variant A |
| --- | --- |
| `variantFromSearch`, `variantLabel`, `PreviewVariant`, `VARIANT_A_LABEL` in `cards.ts` | Query switch and the nine-cap label |
| `D8SubfactorsPreview` | Read `useLocation().search` and kept every `variant === 'b'` branch closed |
| `strongestCards`, `moreLabel`, `moreCount`, `averageRating`, `DIAMOND_CAP` | Shared. The cap, the badge, and the full-face average |
| `showOnDiamond`, `faceSlots` | Shared mesh. Nine tiles, empty corners on the far slots |
| `FacePanel` | Focused face: score, badge, optional in-panel `CardList`, pyramid, per-line rating buttons |
| `CardList` | Full face list with **Add**. Shown under the pyramid, not instead of it |
| `FaceIndexCard` `layout="sheet"` | Term and draft cards. `showBranches={false}` on a saved card |
| `DrillView` | Not used |
| `ZOOM_LIST` | Defined and tested. The preview ignored it while `variant` was `a` |
| `.d8sf-variant` in `d8Subfactors.css` | Cyan label above the sample chip |

`sampleCards` builds one in-memory card per sample line (six per face). Added cards use ids `added.{faceId}.{stamp}` and `tree: null`.

## Tests that pinned Variant A

`src/preview/d8Subfactors/model.test.ts`, inside `twelve cards keep nine on the diamond and average every card`:

- `variantFromSearch('?variant=a')` is `'a'`
- `variantFromSearch('')` and `variantFromSearch('?variant=b')` are `'b'`
- `variantLabel('a')` is `Variant A · nine-cap`
- `variantLabel('b')` is `Variant B · fractal zoom-to-list`
- The same test checks the cap itself: twelve cards, nine shown, `+3 more`, average of all twelve is 2, average of the nine shown is 3, and `showOnDiamond` never grows past nine tiles. That cap is shared. It is not A-only.

`src/preview/d8Subfactors/preview.regressions.test.tsx`, each mounted at `/preview/d8-subfactors?variant=a` and run by `scripts/run-d8-subfactors-regressions.mjs`:

- `blank and duplicate names are refused, and a saved line opens its face card` — label is Variant A, an empty slot opens the six-card list, a blank name is ignored, a duplicate shows the alert, **De La Riva** saves and opens the sheet with the face name, empty journal, and empty videos.
- `every face line is a link, and a blank on Passing or Mindset opens that face list` — every sample line is an `a[data-term-link]`, and an empty slot on Passing or Mindset opens that face’s list. A term in the list opens a dialog whose `data-face` is that face.
- `a full face shows nine tiles, a +3 more badge, the average of all twelve, and Add still works` — six added low cards leave nine pyramid links, no empty slot, `+3 more`, face score `2 / 5`, and the Sweeps button reads `(9)`. The list has twelve cards. One more add makes `+4 more` and thirteen list cards, still nine pyramid links. Zooming four times leaves `drill-view` null and `.topo-stage` visible.

The Variant B regression (`variant B lists every card after zooming in, then Back and Reset step up to the diamond`) was the opposite zoom check: four **+** clicks hide the stage, list every Sweeps card, and **Back** / **Reset view** return to the diamond. That test mounted the default route and expected the Variant B label.
