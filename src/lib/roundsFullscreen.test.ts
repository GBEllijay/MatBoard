import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { paidAssetName } from '../server/paidChunks.ts';
import { readRoundsDeviceEnv, roundsChipAction, roundsDisplayPath } from './roundsFullscreen.ts';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Rounds chip: phone or home-screen app goes fullscreen here, desktop keeps the TV popup', () => {
  assert.equal(roundsChipAction({ coarsePointer: true, installedApp: false }), 'fullscreen-here');
  assert.equal(roundsChipAction({ coarsePointer: false, installedApp: true }), 'fullscreen-here');
  assert.equal(roundsChipAction({ coarsePointer: true, installedApp: true }), 'fullscreen-here');
  assert.equal(roundsChipAction({ coarsePointer: false, installedApp: false }), 'popup');
});

test('device env reads pointer and display-mode media queries, and survives no window', () => {
  const win = (hits: string[]) => ({
    matchMedia: (query: string) => ({ matches: hits.includes(query) }) as MediaQueryList,
  });
  assert.deepEqual(readRoundsDeviceEnv(win(['(pointer: coarse)'])), { coarsePointer: true, installedApp: false });
  assert.deepEqual(readRoundsDeviceEnv(win(['(display-mode: standalone)'])), { coarsePointer: false, installedApp: true });
  assert.deepEqual(readRoundsDeviceEnv(win(['(display-mode: fullscreen)'])), { coarsePointer: false, installedApp: true });
  assert.deepEqual(readRoundsDeviceEnv(win([])), { coarsePointer: false, installedApp: false });
  assert.deepEqual(readRoundsDeviceEnv(undefined), { coarsePointer: false, installedApp: false });
});

test('rounds display path keeps the suite origin', () => {
  assert.equal(roundsDisplayPath(true), '/training?from=suite');
  assert.equal(roundsDisplayPath(false), '/training');
});

test('controller keeps the desktop popup, the Rounds chip, and Open rounds on this device', () => {
  const src = read('src/pages/TrainingController.tsx');
  assert.match(src, /window\.open\(roundsDisplayPath\(fromSuite\), 'matboard-rounds', 'popup,noopener,noreferrer,width=1280,height=720'\)/);
  assert.match(src, /className="chip chip--gold" onClick=\{openRounds\}>\s*Rounds\s*<\/button>/);
  assert.match(src, /onTitleClick=\{openRounds\}/);
  assert.match(src, /requestPageFullscreen\(\)/);
  assert.match(src, /Open rounds on this device/);
  assert.match(src, /<TrainingOptions \/>/);
});

test('rounds display keeps the Fullscreen chip and the round line toggles fullscreen', () => {
  const src = read('src/pages/Training.tsx');
  assert.match(src, /<FullscreenChip/);
  assert.match(src, /className="training__phase"/);
  assert.match(src, /dataHold="round"/);
  assert.match(src, /onTap=\{onRoundLabel\}/);
  assert.match(src, /onComplete=\{\(\) => resetTrainingSession\(\)\}/);
  assert.match(src, /const onRoundLabel[\s\S]*?event\.stopPropagation\(\);\s*void fs\.toggle\(\);/);
  // Tapping the round line must not also open the options sheet.
  assert.match(src, /'\.sheet, \.training__clock, \.training__phase,/);
  // Clock tap still starts / pauses. A 3-second hold resets the period instead.
  assert.match(src, /className="training__clock"/);
  assert.match(src, /dataHold="timer"/);
  assert.match(src, /onTap=\{onClock\}/);
  assert.match(src, /onComplete=\{\(\) => resetTrainingPeriod\(\)\}/);
});

test('home-screen manifest opens fullscreen and stays public', () => {
  const vite = read('vite.config.ts');
  assert.match(vite, /display: 'fullscreen'/);
  assert.match(vite, /display_override: \['fullscreen', 'standalone'\]/);
  assert.match(vite, /name: 'Advantage'/);
  assert.match(vite, /short_name: 'Advantage'/);
  assert.match(vite, /start_url: '\/'/);
  assert.match(vite, /scope: '\/'/);
  assert.match(vite, /src: 'icon-192\.png'/);
  assert.match(vite, /src: 'icon-512\.png'/);

  const routes = JSON.parse(read('public/_routes.json')) as { include: string[] };
  const routed = (path: string) =>
    routes.include.some((rule) => (rule.endsWith('/*') ? path.startsWith(rule.slice(0, -1)) : path === rule));
  for (const path of ['/manifest.webmanifest', '/icon-192.png', '/icon-512.png']) {
    assert.equal(routed(path), false, `${path} must not run a Pages Function`);
    assert.equal(paidAssetName(path), null, `${path} must not be a paid chunk`);
  }
  assert.match(read('public/_headers'), /\/manifest\.webmanifest\n {2}Cache-Control: no-cache, no-store, must-revalidate/);

  const html = read('index.html');
  assert.match(html, /<meta name="theme-color" content="#0b0d10" \/>/);
});

test('controller hands the rounds display a fullscreen flag', async () => {
  const { ROUNDS_FULLSCREEN_STATE, wantsRoundsFullscreen } = await import('./roundsFullscreen.ts');
  assert.equal(wantsRoundsFullscreen(ROUNDS_FULLSCREEN_STATE), true);
  assert.equal(wantsRoundsFullscreen(null), false);
  assert.equal(wantsRoundsFullscreen(undefined), false);
  assert.equal(wantsRoundsFullscreen({ roundsFullscreen: 'yes' }), false);
  assert.equal(wantsRoundsFullscreen({}), false);
});
