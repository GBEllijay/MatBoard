/**
 * /media for a Pro or owner pass: the Media Console in Media Edition dress.
 * Belt, title, the stacked buttons reused from Tournament Management Pro, their
 * order and destinations, and the Media Console scrolling rules.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const saver = read('../pages/Screensaver.tsx');
const suite = read('../pages/TournamentSuite.tsx');
const css = read('../index.css').replace(/\/\*[\s\S]*?\*\//g, '');

test('three stacked buttons in order: Media Console, Scoreboard, Round Timer', () => {
  assert.deepEqual(
    MEDIA_EDITION_MENU.map((link) => link.title),
    [MEDIA_CONSOLE_NAME, 'Scoreboard', 'Round Timer'],
  );
});

test('Scoreboard and Round Timer are the /suite entries themselves', () => {
  const board = COMPETITION_PRO_MENU.find((link) => link.title === 'Scoreboard');
  const timer = COMPETITION_PRO_MENU.find((link) => link.title === 'Round Timer');
  assert.equal(MEDIA_EDITION_MENU[1], board);
  assert.equal(MEDIA_EDITION_MENU[2], timer);
  assert.equal(MEDIA_EDITION_MENU[1].to, withSuiteFrom(MATCH_CONTROLLER_PATH, true));
  assert.equal(MEDIA_EDITION_MENU[2].to, withSuiteFrom(ROUND_CONTROLLER_PATH, true));
  assert.equal(MEDIA_EDITION_MENU[1].clearBout, true);
});

test('Media Console opens the same page as the Pro hub Media Console', () => {
  const proMedia = PRO_HUBS.find((hub) => hub.title === MEDIA_CONSOLE_NAME);
  assert.equal(MEDIA_EDITION_MENU[0].to, '/slideshow?folder=gallery');
  assert.equal(MEDIA_EDITION_MENU[0].to, proMedia?.to);
  assert.equal(MEDIA_EDITION_MENU[0].belt, 'purple');
});

test('/suite and /media render the same SuiteMenuLinks component', () => {
  assert.match(suite, /<SuiteMenuLinks links=\{COMPETITION_PRO_MENU\} label=\{TOURNAMENT_MANAGEMENT_PRO_LABEL\} \/>/);
  assert.match(saver, /<SuiteMenuLinks links=\{MEDIA_EDITION_MENU\} label="Media Edition console buttons" \/>/);
  const comp = read('../components/SuiteMenuLinks.tsx');
  assert.match(comp, /<nav className="suite__nav"/);
  assert.match(comp, /className="pro-hub"/);
  assert.match(comp, /onClick=\{link\.clearBout \? \(\) => unlinkBracketBout\(\) : undefined\}/);
});

test('edition uses the Media Console purple belt, titled Advantage Media Edition', () => {
  assert.match(
    saver,
    /<BeltHeader kind="purple" title=\{edition \? 'Advantage Media Edition' : 'Advantage - Media Console'\} \/>/,
  );
  // Same console as opened from Pro: gallery setup open, so Class Schedule,
  // Pro Shop and Events folders show under the buttons.
  assert.match(saver, /searchParams\.get\('folder'\) \?\? \(edition \? 'gallery' : null\)/);
  assert.match(saver, /export function ScreensaverPage\(\{ edition = false \}: \{ edition\?: boolean \} = \{\}\)/);
  assert.match(css, /\.saver-edition \{[^}]*pointer-events: auto;/);
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
