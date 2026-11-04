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
  assert.match(css, /font-size: 15vh/);
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
