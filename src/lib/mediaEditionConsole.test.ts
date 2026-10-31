/**
 * Unlocked /media hub: purple belt titled Advantage Media Edition, then the
 * stacked /suite buttons Scoreboard, Round Timer, Media Console (no gallery).
 * Also the Media Console scrolling rules.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  COMPETITION_PRO_MENU,
  MATCH_CONTROLLER_PATH,
  MEDIA_CONSOLE_NAME,
  MEDIA_EDITION_MENU,
  PRO_HUBS,
  ROUND_CONTROLLER_PATH,
  withSuiteFrom,
} from './productNames.ts';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const hub = read('../pages/MediaEditionHub.tsx');
const saver = read('../pages/Screensaver.tsx');
const suite = read('../pages/TournamentSuite.tsx');
const paid = read('../components/PaidScreen.tsx');
const bundle = read('../server/paidChunkBundle.ts');
const css = read('../index.css').replace(/\/\*[\s\S]*?\*\//g, '');

test('three stacked buttons in order: Scoreboard, Round Timer, Media Console', () => {
  assert.deepEqual(
    MEDIA_EDITION_MENU.map((link) => link.title),
    ['Scoreboard', 'Round Timer', MEDIA_CONSOLE_NAME],
  );
});

test('Scoreboard and Round Timer are the /suite entries themselves', () => {
  const board = COMPETITION_PRO_MENU.find((link) => link.title === 'Scoreboard');
  const timer = COMPETITION_PRO_MENU.find((link) => link.title === 'Round Timer');
  // Same entry as /suite (path, bout reset); the hub adds a subtitle and a purple belt.
  const { sub: boardSub, belt: boardBelt, ...boardLink } = MEDIA_EDITION_MENU[0];
  const { sub: timerSub, belt: timerBelt, ...timerLink } = MEDIA_EDITION_MENU[1];
  const { belt: suiteBoardBelt, ...suiteBoard } = board!;
  const { belt: suiteTimerBelt, ...suiteTimer } = timer!;
  assert.deepEqual(boardLink, suiteBoard);
  assert.deepEqual(timerLink, suiteTimer);
  assert.equal(boardBelt, 'purple');
  assert.equal(timerBelt, 'purple');
  // /suite and the Pro menu keep their black belts.
  assert.equal(suiteBoardBelt, 'black');
  assert.equal(suiteTimerBelt, 'black');
  assert.ok(boardSub && timerSub);
  // /suite itself keeps its buttons without subtitles.
  for (const link of COMPETITION_PRO_MENU) assert.equal('sub' in link, false, link.title);
  assert.equal(MEDIA_EDITION_MENU[0].to, withSuiteFrom(MATCH_CONTROLLER_PATH, true));
  assert.equal(MEDIA_EDITION_MENU[1].to, withSuiteFrom(ROUND_CONTROLLER_PATH, true));
  assert.equal(MEDIA_EDITION_MENU[0].clearBout, true);
});

test('each hub button has one short, parallel subtitle ending in the gym TV line', () => {
  assert.deepEqual(
    MEDIA_EDITION_MENU.map((link) => link.sub),
    [
      'Live match scoring. Easily cast to your gym TV.',
      'Rounds and rest. Easily cast to your gym TV.',
      'Slideshows, schedule, and events. Easily cast to your gym TV.',
    ],
  );
  for (const link of MEDIA_EDITION_MENU) assert.ok((link.sub ?? '').length <= 64, link.title);
  const comp = read('../components/SuiteMenuLinks.tsx');
  assert.match(comp, /<span className="pro-hub__sub">\{link\.sub\}<\/span>/);
  const pageCss = read('../pages/mediaEdition.css');
  assert.match(pageCss, /\.home--media-hub \.pro-hub__sub \{/);
  assert.match(hub, /import '\.\/mediaEdition\.css';/);
});

test('Media Console opens the same page as the Pro hub Media Console', () => {
  const proMedia = PRO_HUBS.find((hub) => hub.title === MEDIA_CONSOLE_NAME);
  assert.equal(MEDIA_EDITION_MENU[2].to, '/slideshow?folder=gallery');
  assert.equal(MEDIA_EDITION_MENU[2].to, proMedia?.to);
  assert.equal(MEDIA_EDITION_MENU[2].belt, 'purple');
});

test('/suite and the /media hub render the same SuiteMenuLinks component', () => {
  assert.match(suite, /<SuiteMenuLinks links=\{COMPETITION_PRO_MENU\} label=\{TOURNAMENT_MANAGEMENT_PRO_LABEL\} \/>/);
  assert.match(hub, /<SuiteMenuLinks links=\{MEDIA_EDITION_MENU\} label="Advantage Media Edition menu" \/>/);
  const comp = read('../components/SuiteMenuLinks.tsx');
  assert.match(comp, /<nav className="suite__nav"/);
  assert.match(comp, /className="pro-hub"/);
  assert.match(comp, /onClick=\{link\.clearBout \? \(\) => unlinkBracketBout\(\) : undefined\}/);
});

test('hub: purple belt titled Advantage Media Edition on top, no gallery content', () => {
  assert.match(hub, /<BeltHeader kind="purple" title=\{MEDIA_EDITION_HUB_TITLE\} \/>/);
  assert.match(hub, /MEDIA_EDITION_HUB_TITLE = 'Advantage Media Edition'/);
  assert.ok(hub.indexOf('<BeltHeader') < hub.indexOf('<SuiteMenuLinks'));
  const hubCode = hub.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(hubCode, /GALLERY|media-gallery|Class Schedule|Pro Shop|Events|folder=(shop|events|schedule)/i);
});

test('hub loads from the media-console paid chunk; the Media Console page stays as it was', () => {
  assert.match(paid, /import\('\.\.\/pages\/MediaEditionHub\.tsx'\)\.then\(\(mod\) => \(\{ node: <mod\.MediaEditionHubPage \/> \}\)\)/);
  assert.match(paid, /<PaidImport chunk="media-console" load=\{loadMediaEdition\} \/>/);
  assert.match(bundle, /'\/src\/pages\/MediaEditionHub\.tsx': 'media-console'/);
  // No edition dress left on the console itself.
  assert.match(saver, /export function ScreensaverPage\(\) \{/);
  assert.match(saver, /<BeltHeader kind="purple" title="Advantage - Media Console" \/>/);
  assert.doesNotMatch(saver, /MEDIA_EDITION_MENU|SuiteMenuLinks|edition/);
  assert.doesNotMatch(css, /\.saver-edition/);
});

/** Declarations of every rule whose selector list contains `needle`. */
function rulesFor(needle: string): string[] {
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.matchAll(re)) {
    if (m[1].split(',').some((sel) => sel.trim() === needle)) out.push(m[2]);
  }
  return out;
}

test('Media Console setup scrolls as one; only the Media Console bar stays pinned', () => {
  assert.match(rulesFor('.saver.saver--belt').join(), /overflow-y: auto;/);
  for (const sel of [
    '.saver.saver--belt > .saver-belt:not(.saver-belt--flow)',
    '.saver.saver--belt > .play-exit',
    '.saver.saver--belt > .saver-batch',
    '.saver.saver--belt > .sheet.sheet--dock-footer',
  ]) {
    assert.match(rulesFor(sel).join(), /position: absolute;/, sel);
  }
  assert.match(rulesFor('.saver.saver--belt .saver-batch--panel').join(), /position: static;/);
  const panel = rulesFor('.saver.saver--belt > .sheet.sheet--dock-footer .sheet__panel').join();
  assert.match(panel, /max-height: none;/);
  assert.match(panel, /overflow: visible;/);
  assert.match(rulesFor('.saver.saver--belt > .sheet.sheet--dock-footer .sheet__body').join(), /overflow: visible;/);
  // The one pinned piece: the sheet head with the Media Console title and Close.
  assert.match(rulesFor('.saver.saver--belt > .sheet.sheet--dock-footer .sheet__head').join(), /position: sticky;\s*top: 0;/);
  // No other fixed or sticky rule is scoped to the setup screen.
  const scoped = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(
    (m) => m[1].includes('.saver.saver--belt') && /position: (fixed|sticky)/.test(m[2]),
  );
  assert.deepEqual(
    scoped.map((m) => m[1].trim()),
    ['.saver.saver--belt > .sheet.sheet--dock-footer .sheet__head'],
  );
});

test('playback and fullscreen keep their own rules', () => {
  // The base saver still fills the screen for TV playback.
  const base = rulesFor('.saver').join();
  assert.match(base, /height: var\(--visible-vh, 100svh\);/);
  assert.match(base, /overflow: hidden;/);
  // The fixed belt rule is untouched for any page outside the setup screen.
  assert.match(rulesFor('.saver-belt').join(), /position: fixed;/);
});

test('one Media hub: /media serves Media pass, Pro and owner; /console sends Media-only to /media, Pro to /pro', () => {
  const app = read('../App.tsx');
  assert.equal(existsSync(new URL('../pages/MediaHub.tsx', import.meta.url)), false);
  assert.doesNotMatch(app, /MediaHubPage|pages\/MediaHub'/);
  const route = app.slice(app.indexOf('function MediaEditionRoute()'));
  assert.match(route.slice(0, 200), /return <MediaEditionGate open=\{mediaConsoleDoorOpen\(door\)\} \/>;/);
  const entry = app.slice(app.indexOf('function MediaConsoleEntryRoute()'));
  assert.match(
    entry.slice(0, 400),
    /if \(!door\.seated && !door\.proUnlocked\) return <Navigate to=\{MEDIA_EDITION_PATH\} replace \/>;\s*return <Navigate to="\/pro" replace \/>;/,
  );
});

test('hub keeps Lock Media for a browser holding the Media door', () => {
  assert.match(hub, /\{!door\.seated && door\.mediaUnlocked \? \(/);
  assert.match(hub, /onClick=\{\(\) => \{\s*lockMedia\(\);\s*navigate\(PRODUCTS_PATH\);\s*\}\}/);
  assert.match(hub, />\s*Lock Media\s*</);
  // Pro keeps its own Lock Media too.
  assert.match(read('../pages/Pro.tsx'), /onClick=\{\(\) => lockMedia\(\)\}/);
});

test('/media hub: all three buttons wear the purple belt; /suite belts are unchanged', () => {
  assert.deepEqual(MEDIA_EDITION_MENU.map((link) => link.belt), ['purple', 'purple', 'purple']);
  assert.deepEqual(COMPETITION_PRO_MENU.map((link) => link.belt), ['tournament', 'tournament', 'black', 'black']);
});
