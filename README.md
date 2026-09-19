# MatBoard

Gym match scoreboard, round timer, and photo screensaver. Original UI and original synthesized sounds — this project is not affiliated with any grappling federation and does not use federation trademarks, logos, or branded assets.

Installable as a Progressive Web App. Built for Cloudflare Pages.

The consumer product name is **Advantage**. This GitHub repo and Cloudflare project stay MatBoard.

Browsers cannot permanently hide the address bar in a normal tab. For gym TV / cast without URL chrome: **install Advantage as an app** (browser menu → Add to Home Screen / Install) so it opens standalone, **or** press **F** / tap **Fullscreen** on Display, Training, or Owner’s Toolbox (rotating to landscape also tries fullscreen; tap the control if the browser blocks it). Home is left as a normal page. A computer plugged into the TV can run this same site as an always-on browser station.

## Modes

- **Match** — Blue competitor on top, white below. Name + gym, green points (0–99), orange advantages (0–99), red disadvantages (0–9). Landscape scoreboard at `/match` (tap a score +1, long-press −1, tap `MM:SS` to start/pause). Fat-thumb controller at `/match/control` for names, round, division, clock presets, second nudges, and match-end sound (on by default; **Buzzer** or owner-recorded **Parou**).
- **Training** — Black fullscreen `MM:SS`. Tap the clock to start/pause. Tap anywhere else for options (round **1:00 / 2:00 / 5:00 / 10:00** or custom `MM:SS` up to 99:59, break **0:00 / 0:30 / 1:00** or custom up to 10:00, rounds 1–99 or Endless, Training end sound on/off with **Buzzer** or **Parou, stop!**, Start / 10s / End cue previews, plus mute / volume / vibrate). Quieter start cue, 10-second warning, selected end cue. Screen wake lock while running.
- **Owner’s Toolbox** — Home card title (subtitle **Pro**). Manual only; never auto-starts from Match or Training. Route stays `/screensaver` (alias `/slideshow`) so old links still work. Four playlists (Gallery, Videos, Pro Shop, Events) with on/off play toggles. Gallery is the working photo library: pick photos on device, name them (thumbnail next to the name), and set slide interval from 1 second to 5:00. Videos / Pro Shop / Events are visible shells for later. Playback concatenates enabled folders in that order (or shuffles that list). Existing saved photos migrate into Gallery. Fullscreen loop with the full photo visible (`object-fit: contain`), letterbox/pillarbox filled by a blurred copy of the same image, a very gentle Ken Burns zoom, options sheet, and wake lock while playing.

Default match names are **Competitor 1** / **Competitor 2** with empty gyms.

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
   On a laptop or desktop connected with HDMI (or any browser URL on that computer), open this site and go to **Scoreboard** (`/match`), **Rounds**, or **Owner’s Toolbox**. Press **F** (or tap **Fullscreen**) so it fills the TV. No phone cast required.

2. **Cast from the Controller (phone or tablet)**  
   Open `/match/control`, tap **Cast**, pick a Chromecast / extra display. Chrome’s Presentation API sends the scoreboard URL to that screen. Keep the Controller in your hands. If Cast is canceled, nothing is sent. On many phones Cast just opens a window — then use the phone’s screen mirroring.

3. **Pop-out Display + HDMI**  
   On a laptop, open the Controller (or keep it in a window), tap **Display** to open `/match` in a second window, press **F** or tap **Fullscreen**, and send it to the TV with HDMI.

4. **One tablet on a stand**  
   Open `/match` only. The scoreboard itself is tappable: score boxes +1 / long-press −1, clock start/pause. Edit names, round, and division on the Controller.

Windows opened from the same browser stay in sync automatically. A phone Controller and a totally separate computer/TV browser do not share live scores yet — that pairing comes later. Until then, run Controller and Display on the same computer, or cast/mirror from the phone.

## Sounds

Start and warning cues, and the default **Buzzer** end cue, are **original procedural tones** synthesized in-app with the Web Audio API (oscillators + a short generated noise burst). There are no sampled federation buzzers and no third-party / Pixabay files.

**Parou** is an owner-recorded voice saying “parou”, stored at `public/sounds/parou.mp3` (trimmed and loudness-normalized for a phone / gym floor). On the Match Controller, choose **Buzzer** or **Parou** as the match end cue. The same choice is available under Training sound options. Preference is saved in `localStorage` (`matboard.audio.v1` and the match state).

A compressor and soft clipper sit on the master bus so end cues can be loud in a gym without harsh DAC clipping.

| Cue | Where | How it sounds | How it is made |
| --- | --- | --- | --- |
| **Start** | Training only (round / clock start) | Two rising “go” notes, brighter and shorter than the warning | Sine at 784 Hz then 1175 Hz, light octave shimmer |
| **10-second warning** | Training work phase only | Three light staccato ticks on one pitch | Quiet triangle pulses at 1047 Hz |
| **End buzzer** | Training round/session end; Match when the clock hits 0:00 (optional, on by default) if **Buzzer** is selected | Classic electric gym buzzer: sustained, raspy, mid-forward | Detuned square pair (~392/406 Hz) + saw sub + 23 Hz rasp + a few ms of synthesized noise. Match holds it longer and a bit louder than Training. |
| **Parou** | Same end slots as the buzzer, when **Parou** is selected | Owner voice: “parou” | Gym-owned MP3, decoded into the same Web Audio master bus (mute / volume apply) |

Match has **no** 10-second warning and **no** start cue. Match end sound still respects the on/off toggle.

Preview start / 10s / end from Training options (End honors the Training end sound toggle). On the Match Controller, tap **Buzzer** or **Parou, stop!** (or **Test end sound**) to hear the Match end cue (honors mute / volume and the Match end sound toggle).

First tap on Display, Controller, or Training unlocks audio on iOS/Android (and preloads Parou). Volume, mute, and vibrate live in Training options and apply app-wide.

## License

Use it in your gym. Keep federation marks off the board.
