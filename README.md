# MatBoard

Gym match scoreboard, round timer, and photo screensaver. Original UI and original synthesized sounds — this project is not affiliated with any grappling federation and does not use federation trademarks, logos, or branded assets.

Installable as a Progressive Web App. Built for Cloudflare Pages.

The consumer product name is **Advantage**. This GitHub repo and Cloudflare project stay MatBoard.

Browsers cannot permanently hide the address bar in a normal tab. For gym TV / cast without URL chrome: **install Advantage as an app** (browser menu → Add to Home Screen / Install) so it opens standalone, **or** tap **Fullscreen** on Display, Training, or Slideshow (rotating to landscape also tries fullscreen; tap the control if the browser blocks it). Home is left as a normal page.

## Modes

- **Match** — Blue competitor on top, white below. Name + gym, green points (0–99), orange advantages (0–99), red disadvantages (0–9). Landscape scoreboard at `/match` (tap a score +1, long-press −1, tap `MM:SS` to start/pause). Fat-thumb controller at `/match/control` for names, round, division, clock presets, second nudges, and match-end buzzer (on by default).
- **Training** — Black fullscreen `MM:SS`. Tap the clock to start/pause. Tap anywhere else for options (round 1/2/5/10 or custom `MM:SS` up to 99:59, break 00:00 / 00:30 / 01:00, rounds 1–99 or Endless, mute / volume / vibrate). Quieter start cue, 10-second warning, louder end buzzer. Screen wake lock while running.
- **Screensaver** — Manual only from the home card. Never auto-starts from Match or Training. Pick photos on device, name them, and set slide interval from 1 second to 5:00. Fullscreen loop with cover-framed photos (center crop), a gentle Ken Burns zoom, options sheet, and wake lock while playing.

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

1. **Cast from the Controller (phone or tablet)**  
   Open `/match/control`, tap **Cast**, pick a Chromecast / extra display. Chrome’s Presentation API sends the scoreboard URL to that screen. Keep the Controller in your hands. If Cast is canceled, nothing is sent.

2. **Pop-out Display + HDMI**  
   On a laptop, open the Controller (or keep it in a window), tap **Display** to open `/match` in a second window, tap **Fullscreen** (or rotate to landscape), and send it to the TV with HDMI or “Cast tab”.

3. **One tablet on a stand**  
   Open `/match` only. The scoreboard itself is tappable: score boxes +1 / long-press −1, clock start/pause. Edit names, round, and division on the Controller.

Windows opened from the same origin stay in sync automatically. A phone Controller and a totally separate TV browser (different device, no Cast connection) will not share live state — use Cast or two windows on the same computer for that.

## Sounds

All cues are generated with the Web Audio API on device (no sampled federation buzzers):

- Match: louder **end buzzer** when the clock hits 0:00 (optional, on by default). No 10-second warning on Match.
- Training: quieter two-tone **start**, triple **10-second warning**, **end buzzer**
- First tap on Display or Controller unlocks audio on iOS. Volume, mute, and vibrate live in Training options and apply app-wide.

## License

Use it in your gym. Keep federation marks off the board.
