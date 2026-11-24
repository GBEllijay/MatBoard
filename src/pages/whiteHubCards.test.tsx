/**
 * White hub cards: existing tools stay wired. Brackets and Bracket Roster
 * open their tools. The Brackets image is still a placeholder. The Bracket
 * Roster hub card is a Direction B preview (button, then athlete list), not
 * the roster form. Account is not on this page.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { WhitePage } from './White.tsx';
import { roundsCardPreview } from '../lib/roundsCardPreview.ts';
import {
  DEFAULT_REST_MS,
  DEFAULT_ROUNDS,
  DEFAULT_WORK_MS,
} from '../lib/timeWheel.ts';
import { setBreakMs, setRounds, setWorkMs } from '../lib/trainingStore.ts';

const dom = new Window({ url: 'http://localhost/white' });
const view = dom as unknown as Window & typeof globalThis;

function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('localStorage', view.localStorage);
installGlobal('sessionStorage', view.sessionStorage);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('navigator', view.navigator);
installGlobal('Event', view.Event);
installGlobal('CustomEvent', view.CustomEvent);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={['/white']}>
        <WhitePage />
      </MemoryRouter>,
    );
  });
  return {
    host,
    done: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function hrefs(host: HTMLElement, selector: string): string[] {
  return [...host.querySelectorAll(selector)].map((node) => (node as HTMLAnchorElement).getAttribute('href') ?? '');
}

test('the White hub keeps working Scoreboard, Controller, Rounds, and Bracket Roster links', () => {
  const m = mount();
  const scoreboard = m.host.querySelector('#scoreboard');
  const rounds = m.host.querySelector('#round-timer');
  assert.ok(scoreboard);
  assert.ok(rounds);
  assert.equal(m.host.querySelector('.mode-card--names'), null);
  assert.doesNotMatch(m.host.textContent ?? '', /Match names/);
  assert.deepEqual(hrefs(scoreboard as HTMLElement, 'a.btn'), ['/match?from=white', '/match/control?from=white']);
  assert.deepEqual(hrefs(rounds as HTMLElement, 'a.btn'), ['/training?from=white', '/training/control?from=white']);
  m.done();
});

test('the Rounds card uses the timer icon and a rest and rounds caption', () => {
  setWorkMs(DEFAULT_WORK_MS);
  setBreakMs(DEFAULT_REST_MS);
  setRounds(DEFAULT_ROUNDS, false);
  const expected = roundsCardPreview({
    workMs: DEFAULT_WORK_MS,
    breakMs: DEFAULT_REST_MS,
    rounds: DEFAULT_ROUNDS,
    currentRound: 1,
    endless: false,
  });
  assert.equal(expected.work, '5:00');
  assert.equal(expected.header, 'WORK · ROUND 1 / 5');
  assert.equal(expected.restLine, 'REST 0:30 · 5 ROUNDS');
  const m = mount();
  const rounds = m.host.querySelector('#round-timer') as HTMLElement;
  const tv = rounds.querySelector('[data-rounds-tv="true"]');
  const icon = rounds.querySelector('[data-rounds-tv-icon="true"]') as HTMLImageElement | null;
  assert.ok(tv);
  assert.ok(icon);
  assert.equal(icon?.getAttribute('src'), '/storefront/rounds-timer-icon.png');
  assert.match(icon?.getAttribute('alt') ?? '', /round timer/i);
  assert.match(icon?.getAttribute('alt') ?? '', /5:00/);
  assert.equal(icon?.getAttribute('width'), '184');
  assert.equal(icon?.getAttribute('height'), '104');
  assert.match(tv?.textContent ?? '', /REST 0:30 · 5 ROUNDS/);
  assert.match(rounds.textContent ?? '', /Customizable with logo and skins/);
  assert.deepEqual(hrefs(rounds, 'a.btn'), ['/training?from=white', '/training/control?from=white']);
  assert.equal(rounds.querySelector('[data-rounds-skins="true"]')?.getAttribute('href'), '/training/control?from=white');
  m.done();
});

test('the Rounds card rest caption follows saved rest and rounds settings', () => {
  setWorkMs(4 * 60_000);
  setBreakMs(45_000);
  setRounds(8, false);
  try {
    const m = mount();
    const tv = m.host.querySelector('#round-timer [data-rounds-tv="true"]');
    const icon = m.host.querySelector('#round-timer [data-rounds-tv-icon="true"]');
    assert.ok(icon);
    assert.match(tv?.textContent ?? '', /REST 0:45 · 8 ROUNDS/);
    m.done();
  } finally {
    setWorkMs(DEFAULT_WORK_MS);
    setBreakMs(DEFAULT_REST_MS);
    setRounds(DEFAULT_ROUNDS, false);
  }
});

test('roundsCardPreview uses ENDLESS when counted rounds are off', () => {
  assert.deepEqual(
    roundsCardPreview({ workMs: 180_000, breakMs: 60_000, rounds: 5, currentRound: 2, endless: true }),
    {
      work: '3:00',
      header: 'WORK · ROUND 2',
      restLine: 'REST 1:00 · ENDLESS',
      roundTimeLabel: 'ROUND TIME',
    },
  );
});

test('Brackets and Bracket Roster open their tools, keep the placeholder image, and never say student roster', () => {
  const m = mount();
  const brackets = m.host.querySelector('#brackets');
  const roster = m.host.querySelector('#bracket-roster');
  assert.ok(brackets);
  assert.ok(roster);
  assert.ok(brackets.querySelector('[data-brackets-placeholder="true"]'));
  assert.match(brackets.textContent ?? '', /up to 16/);
  assert.match(brackets.textContent ?? '', /up to 64/);
  assert.match(brackets.textContent ?? '', /Placeholder image/);
  assert.deepEqual(hrefs(brackets as HTMLElement, 'a'), ['/white/brackets?from=white', '/white/brackets?from=white']);
  assert.equal(roster.querySelector('strong')?.textContent, 'Bracket Roster');
  assert.match(roster.textContent ?? '', /Mock tournament list/);
  assert.match(
    roster.textContent ?? '',
    /Build the list you seed into a bracket\. Add a name, then the gym under it, the same way Competitor 1 is entered on the scoreboard\./,
  );
  assert.doesNotMatch(roster.textContent ?? '', /Weight, division, age, and rank sit with each person/);
  assert.equal(roster.querySelector('.mode-card__actions .btn')?.textContent?.trim(), 'Roster');
  assert.equal(roster.querySelector('.bracket-roster-preview__field'), null);
  assert.match(roster.textContent ?? '', /Atlas/);
  assert.match(roster.textContent ?? '', /Northside Academy/);
  assert.match(roster.textContent ?? '', /Nori/);
  assert.match(roster.textContent ?? '', /Harbor Gym/);
  assert.match(roster.textContent ?? '', /Mina/);
  assert.match(roster.textContent ?? '', /Riverside/);
  assert.match(roster.textContent ?? '', /Kai/);
  assert.match(roster.textContent ?? '', /Eastside Club/);
  assert.match(roster.textContent ?? '', /155 · Adult/);
  assert.match(roster.textContent ?? '', /Purple/);
  assert.match(roster.textContent ?? '', /145 · Adult/);
  assert.match(roster.textContent ?? '', /Blue/);
  assert.match(roster.textContent ?? '', /125 · Adult/);
  assert.match(roster.textContent ?? '', /Black/);
  assert.match(roster.textContent ?? '', /170 · Master/);
  assert.match(roster.textContent ?? '', /Brown/);
  assert.ok(roster.querySelector('.bracket-roster-preview__belts'));
  assert.doesNotMatch(roster.textContent ?? '', /student roster/i);
  assert.doesNotMatch(brackets.textContent ?? '', /from your phone/i);
  assert.match(brackets.textContent ?? '', /right on the screen/i);
  assert.deepEqual(hrefs(roster as HTMLElement, 'a'), ['/white/bracket-roster', '/white/bracket-roster']);
  m.done();
});

test('the White page source has no Account control and the header hides /white', () => {
  const page = readFileSync('src/pages/White.tsx', 'utf8');
  const header = readFileSync('src/components/HeaderAccount.tsx', 'utf8');
  const footer = readFileSync('src/components/SiteFooter.tsx', 'utf8');
  assert.doesNotMatch(page, /HeaderAccount|AccountLink/);
  assert.match(page, /<SiteFooter hideAccount/);
  assert.match(footer, /hideAccount \? null : <Link to="\/account">Account<\/Link>/);
  assert.match(header, /'\/white'/);
  assert.match(header, /pathname\.startsWith\('\/white\/'\)/);
});

test('the White hub shows the brand tools line, moves the cast line above Instructions, and drops the belt header', () => {
  const m = mount();
  assert.equal(m.host.querySelector('.belt-header'), null);
  assert.doesNotMatch(m.host.textContent ?? '', /Advantage - White/);
  const tools = m.host.querySelector('.home__modes .home__tools-line');
  assert.equal(tools?.tagName, 'H2');
  assert.equal(tools?.textContent, 'BJJ Scoreboard, Round Timer & Mock Tournament Software');
  const logo = m.host.querySelector('.home__logo');
  const wordmark = m.host.querySelector('.home__mark h1');
  assert.ok(logo);
  assert.equal(wordmark?.textContent, 'Advantage');
  const cards = [...m.host.querySelectorAll('.home__modes .mode-card')];
  assert.equal(cards.length, 4);
  const modeKids = [...(m.host.querySelector('.home__modes')?.children ?? [])];
  assert.equal(modeKids[0], tools);
  assert.ok(cards[0] && modeKids.indexOf(cards[0]) > 0);
  const hints = m.host.querySelector('.home__hints');
  const hintKids = [...(hints?.children ?? [])];
  const cast = hints?.querySelector('p.home__cast-line');
  const instructions = hints?.querySelector('.instructions');
  assert.equal(
    cast?.textContent,
    'Your Scoreboard, Round Timer and Mock Tournament Software. Cast to your TV from your phone or PC.',
  );
  assert.equal(hintKids[0], cast);
  assert.ok(instructions && hintKids.some((node) => node === instructions || node.contains(instructions)));
  assert.ok(hintKids.findIndex((node) => node === instructions || node.contains(instructions)) > 0);
  assert.doesNotMatch(m.host.textContent ?? '', /Customizable Live Matches and Rounds/);
  assert.equal(m.host.querySelector('.site-footer a[href="/account"]'), null);
  m.done();
});
