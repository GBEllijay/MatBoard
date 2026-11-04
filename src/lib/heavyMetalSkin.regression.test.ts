import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SCOREBOARD_SKIN, parseScoreboardSkin } from './scoreboardSkin.ts';
import { TRAINING_SKIN_KEY } from './trainingSkin.ts';
import { polishedSkinById, polishedSkinBySlug } from './polishedSkins.ts';
import {
  METAL_METER_SEGMENTS,
  metalBoardPhase,
  metalBoardState,
  metalFaceParts,
  metalMeterLit,
  metalPhaseParts,
  metalRoundLabel,
  metalTimerTitle,
  sideChipLabel,
} from '../skins/polished/heavyMetal.ts';
import { timerProgress } from '../skins/polished/timerText.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Heavy Metal keeps its saved id and picker label', () => {
  assert.equal(SCOREBOARD_SKIN.HEAVY_METAL, 'HEAVY_METAL');
  assert.equal(parseScoreboardSkin('HEAVY_METAL'), 'HEAVY_METAL');
  const skin = polishedSkinById('HEAVY_METAL');
  assert.ok(skin);
  assert.equal(skin.slug, 'heavy-metal');
  assert.equal(skin.label, 'Heavy Metal');
  assert.equal(polishedSkinBySlug('heavy-metal')?.id, 'HEAVY_METAL');
  assert.equal(TRAINING_SKIN_KEY, 'matboard.trainingSkin.v1');
  const loader = read('../skins/polished/load.ts');
  assert.match(loader, /'heavy-metal': \(\) => import\('\.\/heavy-metal\.ts'\)/);
});

test('side chips read BLUE and WHITE from the competitor side, never the belt', () => {
  assert.equal(sideChipLabel('blue'), 'BLUE');
  assert.equal(sideChipLabel('white'), 'WHITE');
  assert.notEqual(sideChipLabel('blue'), sideChipLabel('white'));
  const board = read('../components/PolishedScoreboard.tsx');
  assert.match(board, /sideChipLabel\(row\.side\)/);
  assert.doesNotMatch(board, /sideChipLabel\([^)]*rank/);
  assert.equal(board.match(/sideChipLabel\(row\.side\)/g)?.length, 1, 'one row component labels both sides');
  const css = read('../skins/polished/heavy-metal.css');
  assert.match(css, /\.c1 \.side b \{[^}]*background: #1f5bff;[^}]*color: #fff/);
  assert.match(css, /\.c2 \.side b \{[^}]*background: #f4f1ea;[^}]*color: #0e1726/);
});

test('Metal Mania headings put numerals in Anton, and clocks stay plain Anton', () => {
  assert.deepEqual(metalFaceParts('Mat 1'), [
    { kind: 'chrome', value: 'Mat' },
    { kind: 'num', value: '1' },
  ]);
  assert.deepEqual(metalFaceParts('Round 1'), [
    { kind: 'chrome', value: 'Round' },
    { kind: 'num', value: '1' },
  ]);
  assert.deepEqual(metalFaceParts('Round Semifinal'), [{ kind: 'chrome', value: 'Round Semifinal' }]);
  assert.deepEqual(metalTimerTitle(false, 1), { word: 'Round', numeral: '1' });
  assert.equal(metalTimerTitle(false, 1).numeral, '1');
  assert.deepEqual(metalTimerTitle(true, 1), { word: 'Rest', numeral: null });
  const css = read('../skins/polished/heavy-metal.css');
  const fonts = read('../skins/polished/fonts/chrome-inferno-fonts.css');
  assert.match(fonts, /font-family: 'Metal Mania'/);
  assert.match(fonts, /font-family: 'Anton'/);
  assert.match(fonts, /metal-mania-latin-400-normal\.woff2/);
  assert.match(fonts, /anton-latin-400-normal\.woff2/);
  assert.doesNotMatch(fonts, /fonts\.googleapis\.com/);
  assert.match(css, /\.n \{[^}]*font-family: Anton/);
  assert.match(css, /\.n \{[^}]*margin-left: 0\.3em/);
  assert.match(css, /\.id \{[^}]*min-width: 0;[^}]*overflow: hidden/);
  assert.match(css, /\.name a \{[^}]*overflow: hidden;[^}]*text-overflow: ellipsis/);
  assert.match(css, /\.lead \{[^}]*min-width: 0/);
  assert.match(css, /\.trail \{[^}]*justify-content: flex-end/);
  assert.match(css, /\.hdr \.mat a \{[^}]*overflow: hidden;[^}]*white-space: nowrap;[^}]*text-overflow: ellipsis/);
  assert.match(css, /font-size: 92cqh/);
  assert.match(css, /\.digit--pair \{[^}]*font-size: min\(92cqh, 86cqi\)/);
  assert.match(css, /padding: 0\.6vh max\(6px, 0\.6vw\)/);
  assert.match(css, /\.hdr \.mat \{[^}]*min-width: 8\.5em/);
  assert.equal(metalRoundLabel('Round 1'), 'Round 1');
  assert.equal(metalRoundLabel('Round Semifinal'), 'Semifinal');
  assert.equal(metalRoundLabel('Round Final'), 'Final');
  assert.equal(metalRoundLabel('Round Quarterfinal'), 'Quarterfinal');
  assert.equal(metalRoundLabel('Round Finals'), 'Finals');
  assert.equal(metalRoundLabel('Semifinal'), 'Semifinal');
  assert.match(css, /\.row \.tile \.lab \{[^}]*text-align: center/);
  assert.match(css, /\.row \.tile \.digit \{[^}]*text-align: center/);
  assert.match(css, /\.row \.tile \{[^}]*grid-template-rows: auto minmax\(0, 1fr\)/);
  assert.match(css, /padding: calc\(2\.4vw \+ 3\.2rem\)/);
  assert.match(css, /@media \(max-width: 500px\) \{[^]*\.hdr \.crest \{[^}]*display: none/);
  assert.match(css, /grid-template-rows: auto minmax\(20vh, 1fr\)/);
  assert.match(css, /grid-template-rows: auto minmax\(26vh, 1fr\) auto minmax\(26vh, 1fr\)/);
  assert.doesNotMatch(css, /min-height: 14vh/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
  assert.match(css, /\.hdr \.div a \{[^}]*min-width: 0;[^}]*text-overflow: ellipsis/);
  assert.match(css, /grid-template-columns: minmax\(0, 2\.1fr\)/);
  assert.match(css, /\.belt \{[^}]*gap: 0\.55em/);
  assert.match(css, /\.band\.is-final \.status \{[^}]*visibility: hidden/);
  const board = read('../components/PolishedScoreboard.tsx');
  assert.match(board, /is-final/);
  assert.match(css, /\.num,\s*\n\.skin-root\[data-skin="heavy-metal"\] \.clock,/);
  assert.match(css, /font-family: Anton, sans-serif;\s*font-weight: 400;/);
  assert.match(css, /color: #fff;/);
  const entry = read('../skins/polished/heavy-metal.ts');
  assert.match(entry, /chrome-inferno-fonts\.css/);
  assert.doesNotMatch(entry, /@fontsource\/metal-mania|@fontsource\/anton|fonts\.googleapis\.com/);
});

test('Metal Mania and Anton are committed with the SIL Open Font License', () => {
  for (const face of ['metal-mania', 'anton']) {
    const license = read(`../skins/polished/fonts/${face}/OFL.txt`);
    assert.match(license, /SIL Open Font License, Version 1\.1/);
    assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
    const woff = readFileSync(new URL(`../skins/polished/fonts/${face}/${face}-latin-400-normal.woff2`, import.meta.url));
    assert.equal(woff.subarray(0, 4).toString('ascii'), 'wOF2');
    assert.ok(woff.length > 1000, face);
  }
});

test('the Chrome Inferno meter is 30 live segments and 04:40 of 05:00 lights 28', () => {
  assert.equal(METAL_METER_SEGMENTS, 30);
  assert.equal(metalMeterLit(timerProgress(280_000, 300_000)), 28);
  assert.equal(metalMeterLit(1), 30);
  assert.equal(metalMeterLit(0), 0);
  assert.deepEqual(metalPhaseParts('WORK · ROUND 1 · ENDLESS'), { pill: 'WORK', sub: 'ROUND 1 · ENDLESS' });
  assert.deepEqual(metalPhaseParts('REST · ROUND 1 / 5'), { pill: 'REST', sub: 'ROUND 1 / 5' });
  assert.equal(metalBoardPhase({ running: false, decided: false }), 'OPEN');
  assert.equal(metalBoardPhase({ running: true, decided: false }), 'LIVE');
  assert.equal(metalBoardPhase({ running: false, decided: true }), 'FINAL');
  assert.equal(metalBoardPhase({ running: true, decided: true }), 'FINAL');
  assert.equal(metalBoardState('Match'), 'OPEN');
  assert.equal(metalBoardState('LIVE'), 'LIVE');
  assert.equal(metalBoardState('FINAL'), 'FINAL');
  assert.equal(metalBoardState('Final'), 'Final');
  const timer = read('../components/PolishedTimer.tsx');
  assert.match(timer, /METAL_METER_SEGMENTS/);
  assert.match(timer, /className=\{i < lit \? 'on' : undefined\}/);
});

test('two-digit scores fit a 109px tile at 390', async () => {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const root = new URL('../skins/polished/', import.meta.url);
  const tile = (score: string, pair: boolean) =>
    `<button class="tile pts" style="width:109px;height:160px"><span class="lab">POINTS</span><span class="num"><span class="digit${pair ? ' digit--pair' : ''}">${score}</span></span></button>`;
  await page.setContent(`<!doctype html>
    <link rel="stylesheet" href="${new URL('fonts/chrome-inferno-fonts.css', root)}">
    <link rel="stylesheet" href="${new URL('heavy-metal.css', root)}">
    <div class="skin-root" data-skin="heavy-metal" style="width:390px;height:844px">
      <div class="sb"><section class="row c1" style="height:220px">
        ${tile('12', true)}${tile('10', true)}${tile('4', false)}
      </section></div>
    </div>`);
  await page.evaluate(() => document.fonts.ready);
  const fit = await page.evaluate(() =>
    [...document.querySelectorAll('.tile')].map((el) => {
      const tileBox = el.getBoundingClientRect();
      const digit = el.querySelector('.digit').getBoundingClientRect();
      return {
        score: el.querySelector('.digit').textContent,
        tile: Math.round(tileBox.width),
        left: digit.left - tileBox.left,
        right: tileBox.right - digit.right,
        font: parseFloat(getComputedStyle(el.querySelector('.digit')).fontSize),
      };
    }),
  );
  await browser.close();
  for (const row of fit.filter((row) => row.score !== '4')) {
    assert.ok(row.left >= 6, `${row.score} left padding ${row.left.toFixed(1)}px`);
    assert.ok(row.right >= 6, `${row.score} right padding ${row.right.toFixed(1)}px`);
  }
  const single = fit.find((row) => row.score === '4');
  const pair = fit.find((row) => row.score === '12');
  assert.ok(single && pair);
  assert.ok(single.font + 0.5 >= pair.font, 'a single digit stays on the height size');
});
