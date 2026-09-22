# MatBoard

Gym match scoreboard, round timer, and photo screensaver. Original UI and original synthesized sounds — this project is not affiliated with any grappling federation and does not use federation trademarks, logos, or branded assets.

Installable as a Progressive Web App. Built for Cloudflare Pages.

The consumer product name is **Advantage**. This GitHub repo and Cloudflare project stay MatBoard.

Public home is a product ladder: **Advantage White**, **Advantage Coach**, and **Advantage Pro**. White is live. Coach and Pro stay grayed for public testers.

Browsers cannot permanently hide the address bar in a normal tab. For gym TV / cast without URL chrome: **install Advantage as an app** (browser menu → Add to Home Screen / Install) so it opens standalone, **or** press **F** / tap **Fullscreen** on Display, Training, or Gym Owner and Instructor's Console (rotating to landscape also tries fullscreen; tap the control if the browser blocks it). Home is left as a normal page. A computer plugged into the TV can run this same site as an always-on browser station.

## Products

- **Advantage White** (`/white`, `/lite` redirects here) — BJJ scoreboard and timer. Home card opens this page. **Live Bout** and **Rounds** live here (same Scoreboard / Controller / Training destinations as before).
- **Advantage Coach** — Coming soon on public home. When unlocked (`?coach=gbellijay`), **Open Coach** goes to `/coach` with five tools: **Mock Tournament**, **Competitor roster** (Competitor Management System — local-only, no CSV), **Daily Lesson Plan** (today's class on this phone: coach name, intro, warm-up note, technique blocks with optional water breaks, cool-down, and closing; about 14 local days stay on this device, with Yesterday, Recent, and copy into today), and **Daily Training Videos** (Warm-up, Technique / Drill cards, and Cool down; **+ Add another** inserts a technique above Cool down; one clip per card, 10 clips on this phone; each technique has its own 2:30 / 5:00 / 7:00 / Custom loop timer; **Add video** opens **Record** or **Pick from gallery**; **Start** loops the selected card only; mute defaults on; media stays on this phone). **Technique Tree** (`/technique-tree`) keeps every tree on this phone: a base position, child branches, and defense/counter steps with a Defense chip, expand/collapse, edit, and delete. **Add tree** keeps the open tree and starts another. **Delete tree** removes one tree after confirm. They auto-save in `localStorage` (`matboard.coach.techniqueTree.v1`, archive `version: 2`; a saved `version: 1` tree is kept on first open). Each node keeps a `slotId` for a later lesson or video link. Up to 20 trees; extras already stored are not dropped. Coach does not open Gallery or Gym Owner Console folders (Pro Shop, Events, Class Schedule, slideshow). Public deep links stay gated.
- **Advantage Pro** — Coming soon on public home. Compact card teases gym-TV and tournament tools. Tap opens a Coming soon ad with the full **Gym Owner and Instructor's Console** paragraph (cast Pro-Shop, Class Schedules, Recent Promotions, Upcoming Events and Competitions; in-house tournament suite; instructor licenses). No prices. When Pro is unlocked on this browser, the Pro card is active and **Open Console** goes to `/pro` (Gallery, Pro Shop, Events, **Tournament Software**, Class Schedule, Competitor Management System). Public deep links to those routes stay gated.

## Modes

- **Match** — Opened from **Advantage White → Live Bout**. Blue competitor on top, white below. Name + gym, green points (0–99), orange advantages (0–99), red disadvantages (0–9). Landscape scoreboard at `/match` (tap a score +1, long-press −1, tap `MM:SS` to start/pause). Fat-thumb controller at `/match/control` for names, round, division, clock presets, second nudges, and match sounds: optional start beep (off), optional 10-second warning (off), match-end sound (on by default; **Buzzer** or **PAROU! ("STOP!")**), and **Auto-announce winner** (on by default). When the clock hits 0:00 with auto-announce on, the board names a winner by points, then advantages, then fewer penalties, and the scoreboard shows a large center splash (**Winner by points**). A full tie or empty board does not invent a winner — Display shows **Referee decision** (open Controller to call it). Controller **Win** / **DQ** next to each name open a small sheet (Win: Submission / Points / Decision; DQ: Technical / Medical). A Win splash reads **Winner by submission / points / decision**; a DQ splash names the disqualified athlete (**Disqualified — Technical** or **Disqualified — Medical**). Those Controller calls work on a live gym match; a linked Mock Tournament bout writes the outcome into the bracket.
- **Training** — Opened from **Advantage White → Rounds**. Black fullscreen `MM:SS`. Tap the clock to start/pause. Tap anywhere else for options (round **1:00 / 2:00 / 5:00 / 10:00** or custom `MM:SS` up to 99:59, break **0:00 / 0:30 / 1:00** or custom up to 10:00, rounds 1–99 or Endless, Training end sound on/off with **Buzzer** or **PAROU! ("STOP!")**, Start / 10s / End cue previews, plus mute / volume / vibrate). Quieter start cue, 10-second warning, selected end cue. Screen wake lock while running.
- **Gym Owner and Instructor's Console** — Pro page card title (subtitle **Pro**), opened from the unlocked **Advantage Pro** home card (`/pro`). Folder buttons sit under that card, rendered from the `FOLDERS` list (Gallery, Pro Shop, Events). Tapping one opens that folder’s manage UI (`/slideshow?folder=…`; `/screensaver` still works). Manual only; never auto-starts from Match or Training. Playlists have on/off play toggles on the manage screen: a folder-level On/Off plus a fat-thumb tap on each row’s left preview (checkbox overlay; bright = On, dimmed = Off). Same shared list for Gallery and later Pro Shop / Events. Off items stay in the list and keep their order; they are not deleted. Newly added media defaults to Play On. All three folders share one ordered-list pattern (preview toggle, name, Up / Down, press-and-hold drag) and per-folder `sortOrder` in on-device storage. Gallery is the media library for photos and videos. **Add photos** opens **Take photo** (`accept="image/*"` + `capture="environment"`) or **Pick from gallery** (same accept, capture off). **Add videos** opens **Record** (`accept="video/*"` + `capture="environment"`, so Android Chrome launches the camera) or **Pick from gallery** (`video/*`, capture off). There is no separate Videos folder. Daily Training Videos uses the same Record / Pick pattern. Capture and library are two dedicated file inputs, activated with a `<label htmlFor>` (not `input.click()` from a closing dialog) so Android Chrome does not skip the camera for Google Photos. Desktop still uses the file picker. Media stays on this phone — nothing is uploaded. **Not in this build:** Pro Instructor cloud / gym Google Photos upload. Later Owner Console: instructors take class or promotion photos → cloud or the gym Google Photos album → owner approve → gym Gallery. MP4 and WebM play most reliably; there is no hard duration cap. Playback concatenates enabled folders in folder order (Gallery, then Pro Shop and Events when those are on), **Play On** items in each folder’s list order, or **Shuffle**. One enabled video loops alone; several play in that order; none shows the idle empty state. Photos use the slide interval (1 second to 5:00) with contain + blurred fill + a gentle Ken Burns zoom; videos play through, then the next item. **Mute clips** is on by default (Play video sound off) so gym-floor music in another tab can keep going; the preference is saved with other Console play options. Match/Training buzzers stay on the Web Audio path and are unchanged. A later editor can pass a single cross-folder `storyIds` list into `buildPlayQueue` to interleave Gallery, Pro Shop, and Events without changing per-folder lists. Pro Shop / Events stay coming-soon shells on that same manage foundation. Existing saved photos stay in Gallery. Clips that were saved in the old Videos folder are copied into Gallery once, after the current Gallery items, so that old Gallery-then-Videos order is kept. Fullscreen loop, options sheet, and wake lock while playing. A separate **Tournament Software** button on the same card opens a single-elim bracket (2–16 competitors; non-powers of two get byes) at `/tournament` (not a slideshow folder — `FOLDERS` stays media-only). Type names on the tree or **Edit names**. Tap **Score** on a bout to open the Match scoreboard with Blue / White filled and `bracketMatchId` linked (`r16-0`…`final-0`). **Win** or **DQ** on the Controller or tree opens the same sheet (Win: Submission / Points / Decision; DQ: Technical / Medical). The scoreboard shows a large center splash, then a linked bout returns to the bracket. A clock-end **Points** decision can also write into that bout when **Auto-announce winner** is on. **Undo last** (or **Undo** on that bout) clears the result; later rounds that already have their own result are left alone. Reset clears the open board. Names, results, competitor count, and named saved brackets persist in `localStorage` (`matboard.tournament.v1`) on this device. **Size** picks 2 / 4 / 8 / 16 or a custom count through 16. **Save** names the open board (Gi Blue Belt, Kids, …) so a coach can switch divisions without losing progress. Coach saves stay local. Owner cloud sync of those named brackets — so a gym can run more than 16 fighters as several division boards — is next and not in this version. Landscape-first for tablet / gym TV; phones can scroll the tree or use the names sheet. Same-device only — a phone and a separate computer still do not share live scores or the bracket. **Class Schedule** is another Console tool (not a media folder) at `/schedule`: gym-TV board with logo left, gym name + month stamp, QR right, and a notices strip. Default **Weekly list** template is a flyer-style day-by-day board. Same clock time on two mats is two rows under one time (MAT 1 Tiny Champions / MAT 2 Advanced Kids). Fat-thumb **Edit** has MAT 1 / MAT 2 chips and **Another mat** on each time slot. Owners can switch to a compact **Week grid** or a **Monthly** specials-first layout; the choice persists on this device. Fat-thumb **Edit** can load a sample week. The on-device model lives in `src/lib/gymCalendar.ts` so Events flyers can reuse the same ids later: `kind: 'class'` weekly slots (`time`, `title`, optional `location` / `subtitle`) vs `kind: 'special'` dated items with a reserved `flyerId` (photoStore Events-folder id). Class Schedule writes `matboard.schedule.v1` plus logo/QR blobs in IndexedDB (`matboard-schedule`). No cloud sync, no holiday auto-detect, no recurrence engine, and no flyer thumbnails on the week grid yet.  **Roster** is the third Console tool (not a media folder) at `/roster`: fat-thumb **competitor roster** cards with name, belt (White / Blue / Purple / Brown / Black plus kids Grey / Yellow / Orange / Green, or a short custom rank), last promotion date, and one short note. This is competitor management for Match and Mock Tournament — not a membership or progress tracker. Add / edit / remove; persist in `localStorage` (`matboard.roster.v1`) on this device. Pro CSV on that screen stays in the browser: download a UTF-8 template (`Name,Belt,Last promotion,Notes`), import a spreadsheet export (columns mapped by header; name + belt required; bad rows skipped with a count), or export the current list. Import adds competitors; it does not replace the list. When Pro or Coach is on, Match Controller Blue / White **name** fields and Mock Tournament bracket / Edit-names slots offer roster pick and autocomplete. A pick fills **name** and, on Match, a small **rank chip** next to the name (gym, notes, and promotion dates are left alone). Public White stays gated.


Default match names are **Competitor 1** / **Competitor 2** with empty gyms.

## Soft beta (public White)

Public testers land on three product cards. **Advantage White** is the live path (Live Bout + Rounds on `/white`). **Advantage Coach** and **Advantage Pro** stay grayed and open Coming soon ads (Coach-angled vs gym-owner — not checkout). `/slideshow`, `/screensaver`, `/tournament`, `/techniques`, `/technique-tree`, `/schedule`, `/roster`, `/coach`, and `/pro` go to a Coming soon page unless the matching product is on (Coach or Pro for Coach tools; Pro only for `/pro` and `/schedule`).

This is not a login. The gym owner can keep testing Coach / Console / Tournament on the same build:

**Advantage Pro**

1. Open the site with `?pro=advantage` (or `?pro=1`).
2. Or tap **Advantage Pro** → **Owner unlock** (or **Unlock Pro** on Coming soon) and enter the code.
3. Or set `localStorage` key `advantage.proUnlocked` to `1`.

Unlocked home shows an active Pro card and **Open Console**. The code lives in `src/lib/proUnlock.ts` as `PRO_UNLOCK_CODE` (default `advantage`). Override at build time with `VITE_PRO_UNLOCK_CODE`. Lock again with **Lock Pro** on home, `?pro=0`, or by clearing that flag.

**Advantage Coach** (same pattern, separate flag and code)

1. Open the site with `/?coach=gbellijay` (or `?coach=1`).
2. Or tap **Advantage Coach** → **Owner unlock** (or **Unlock Coach** on Coming soon) and enter `gbellijay`.
3. Or set `localStorage` key `advantage.coachUnlocked` to `1`.

Unlocked home shows an active Coach card and **Open Coach**. The code lives in `src/lib/coachUnlock.ts` as `COACH_UNLOCK_CODE` (default `gbellijay`). Override at build time with `VITE_COACH_UNLOCK_CODE`. Lock again with **Lock Coach** on home, `?coach=0`, or by clearing that flag. Coach and Pro unlocks are independent — Pro still uses `?pro=advantage`.

## Scripts

```bash
npm install
npm run dev      # local Vite dev server
npm run build    # production build to dist/
npm run preview  # preview the production build
```

## Cloudflare Pages

This repo is a static Vite app.

- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback: `public/_redirects` contains `/*    /index.html   200` and is copied into `dist` on build.

## Cast notes

Match is split into two views that stay in sync in the same browser profile (`BroadcastChannel` + `localStorage`):

| View | Route | Use |
| --- | --- | --- |
| Scoreboard (Display) | `/match` | Landscape board for the TV / HDMI window |
| Controller | `/match/control` | Fat-thumb scoring and text editing |

**Recommended gym setups**

1. **Computer plugged into the TV (simplest gym-owner path)**  
   On a laptop or desktop connected with HDMI (or any browser URL on that computer), open this site and go to **Scoreboard** (`/match`), **Rounds**, or **Gym Owner and Instructor's Console**. Press **F** (or tap **Fullscreen**) so it fills the TV. No phone cast required.

2. **Cast from the Controller (phone or tablet)**  
   Open `/match/control`, tap **Cast**, pick a Chromecast / extra display. Chrome’s Presentation API sends the scoreboard URL to that screen. Keep the Controller in your hands. If Cast is canceled, nothing is sent. On many phones Cast just opens a window — then use the phone’s screen mirroring.

3. **Pop-out Display + HDMI**  
   On a laptop, open the Controller (or keep it in a window), tap **Display** to open `/match` in a second window, press **F** or tap **Fullscreen**, and send it to the TV with HDMI.

4. **One tablet on a stand**  
   Open `/match` only. The scoreboard itself is tappable: score boxes +1 / long-press −1, clock start/pause. Edit names, round, and division on the Controller.

Windows opened from the same browser stay in sync automatically. A phone Controller and a totally separate computer/TV browser do not share live scores yet — that pairing comes later. Until then, run Controller and Display on the same computer, or cast/mirror from the phone.

## Sounds

Start and warning cues, and the default **Buzzer** end cue, are **original procedural tones** synthesized in-app with the Web Audio API (oscillators + a short generated noise burst). There are no sampled federation buzzers and no third-party / Pixabay files.

**PAROU! ("STOP!")** plays a Portuguese-only voice saying “Parou!” (the English “STOP!” is the button translation and is not spoken). The wired file is `public/sounds/parou-tts-parou-only.mp3`. To ship a louder take, replace that file or point `PAROU_URL` in `src/lib/audio.ts` at the new clip under `public/sounds/` — keep it Portuguese-only. On the Match Controller and under Training sound options, choose **Buzzer** or **PAROU! ("STOP!")**. Preference is saved in `localStorage` (`matboard.audio.v1` and the match state).

A compressor and soft clipper sit on the master bus so end cues can be loud in a gym without harsh DAC clipping.

| Cue | Where | How it sounds | How it is made |
| --- | --- | --- | --- |
| **Start** | Training (round / clock start); Match when **Start beep** is on | Two rising “go” notes, brighter and shorter than the warning | Sine at 784 Hz then 1175 Hz, light octave shimmer |
| **10-second warning** | Training work phase; Match when **10-second warning** is on | Three light staccato ticks on one pitch | Quiet triangle pulses at 1047 Hz |
| **End buzzer** | Training round/session end; Match when the clock hits 0:00 (optional, on by default) if **Buzzer** is selected | Classic electric gym buzzer: sustained, raspy, mid-forward | Detuned square pair (~392/406 Hz) + saw sub + 23 Hz rasp + a few ms of synthesized noise. Match holds it longer and a bit louder than Training. |
| **PAROU! ("STOP!")** | Same end slots as the buzzer, when that chip is selected | Portuguese “Parou!” only | `public/sounds/parou-tts-parou-only.mp3`, decoded into the same Web Audio master bus (mute / volume apply), with a cue-only gain trim |

Match start beep and 10-second warning default **off** (IBJJF-style matches do not use a 10s warning). Match end sound defaults **on**. All three persist in match state.

Preview start / 10s / end from Training options or the Match Controller (End honors the matching end-sound toggle). On the Match Controller, tap **Buzzer** or **PAROU! ("STOP!")** to pick the Match end cue (honors mute / volume and the Match end sound toggle).

First tap on Display, Controller, or Training unlocks audio on iOS/Android (and preloads Parou). Volume, mute, and vibrate live in Training options and apply app-wide. Gym Owner and Instructor's Console **video clips** have a separate mute (on by default) so gym-floor music is not replaced by clip audio; Match/Training cues are unchanged.

## License

Use it in your gym. Keep federation marks off the board.
