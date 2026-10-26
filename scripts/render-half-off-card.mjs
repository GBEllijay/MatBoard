/**
 * Writes public/half-off-card.png at the size declared in src/lib/halfOff.ts.
 * Run: node scripts/render-half-off-card.mjs
 */
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const WIDTH = 1200;
const HEIGHT = 630;
const SCALE = 2;

const logo = readFileSync(new URL('../public/card-logo.png', import.meta.url)).toString('base64');
const regular = readFileSync(new URL('../public/fonts/Inter-Regular.ttf', import.meta.url)).toString('base64');
const bold = readFileSync(new URL('../public/fonts/Inter-Bold.ttf', import.meta.url)).toString('base64');

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: Inter;
    src: url('data:font/ttf;base64,${regular}') format('truetype');
    font-weight: 400;
    font-style: normal;
  }
  @font-face {
    font-family: Inter;
    src: url('data:font/ttf;base64,${bold}') format('truetype');
    font-weight: 700;
    font-style: normal;
  }
  html, body { margin: 0; background: #08172e; }
  .og {
    box-sizing: border-box;
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    display: flex;
    align-items: center;
    gap: 56px;
    padding: 52px 64px;
    background:
      radial-gradient(90% 120% at 0% 0%, rgba(36, 78, 140, 0.55) 0%, rgba(8, 23, 46, 0) 55%),
      #08172e;
    color: #fff;
    font-family: Inter, sans-serif;
  }
  .logo { width: 250px; height: 250px; border-radius: 50%; flex: none; }
  .copy { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
  .word {
    margin: 0;
    font-size: 76px;
    font-weight: 700;
    letter-spacing: 0.08em;
    line-height: 0.9;
  }
  .sub {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 16px 0 0;
    color: rgba(247, 248, 251, 0.9);
    font-size: 24px;
    font-weight: 400;
    letter-spacing: -0.014em;
    line-height: 1.3;
  }
  .board {
    display: grid;
    grid-template-columns: 148px 210px 148px;
    margin-top: 26px;
    border: 2px solid rgba(255, 255, 255, 0.9);
    border-radius: 18px;
  }
  .lane, .clock {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 96px;
    padding: 12px 8px 14px;
  }
  .clock { border-left: 1px solid rgba(255, 255, 255, 0.35); border-right: 1px solid rgba(255, 255, 255, 0.35); }
  .label { color: rgba(255, 255, 255, 0.78); font-size: 14px; font-weight: 700; letter-spacing: 0.16em; }
  .score { font-size: 40px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
  .time { color: #ffd84a; font-size: 36px; font-weight: 700; line-height: 1; letter-spacing: 0.03em; font-variant-numeric: tabular-nums; }
  .pill {
    display: inline-flex;
    align-items: center;
    margin-top: 26px;
    min-height: 52px;
    padding: 0 20px;
    border-radius: 999px;
    background: #ffcc00;
    color: #10203c;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.045em;
  }
</style>
</head>
<body>
  <div class="og">
    <img class="logo" alt="" src="data:image/png;base64,${logo}">
    <div class="copy">
      <div class="word">ADVANTAGE</div>
      <p class="sub">
        <span>Jiu-Jitsu Round Timer, Scoreboard &amp; Journal for Students,</span>
        <span>Gym Management Software for Pros</span>
      </p>
      <div class="board">
        <div class="lane"><span class="label">BLUE</span><span class="score">0</span></div>
        <div class="clock"><span class="label">ROUND 1</span><span class="time">05:00</span></div>
        <div class="lane"><span class="label">WHITE</span><span class="score">0</span></div>
      </div>
      <div class="pill">HALF OFF CODE: MEIA</div>
    </div>
  </div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: SCALE,
});
await page.setContent(html, { waitUntil: 'load' });
await page.locator('.og').screenshot({
  path: new URL('../public/half-off-card.png', import.meta.url).pathname,
  type: 'png',
});
await browser.close();
console.log(`wrote public/half-off-card.png ${WIDTH * SCALE}x${HEIGHT * SCALE}`);
