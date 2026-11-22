/**
 * White hub cards: existing tools stay wired. Brackets and Bracket Roster
 * open their tools. The Brackets image is still a placeholder. Account is not on this page.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { WhitePage } from './White.tsx';

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

test('Brackets and Bracket Roster open their tools, keep the placeholder image, and never say student roster', () => {
  const m = mount();
  const brackets = m.host.querySelector('#brackets');
  const roster = m.host.querySelector('#bracket-roster');
  assert.ok(brackets);
  assert.ok(roster);
  assert.ok(brackets.querySelector('[data-brackets-placeholder="true"]'));
  assert.match(brackets.textContent ?? '', /up to 16/);
  assert.match(brackets.textContent ?? '', /up to 36/);
  assert.match(brackets.textContent ?? '', /Placeholder image/);
  assert.deepEqual(hrefs(brackets as HTMLElement, 'a'), ['/white/brackets?from=white', '/white/brackets?from=white']);
  assert.equal(roster.querySelector('strong')?.textContent, 'Bracket Roster');
  assert.match(roster.textContent ?? '', /Gym/);
  assert.match(roster.textContent ?? '', /Weight/);
  assert.match(roster.textContent ?? '', /Division/);
  assert.match(roster.textContent ?? '', /Age/);
  assert.match(roster.textContent ?? '', /Rank/);
  assert.match(roster.textContent ?? '', /Northside Academy/);
  assert.doesNotMatch(roster.textContent ?? '', /student roster/i);
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

test('the White header uses the owner tagline and no longer shows the old blurb', () => {
  const m = mount();
  assert.match(
    m.host.textContent ?? '',
    /Your Scoreboard, Round Timer and Mock Tournament Software\. Cast to your TV from your phone or PC\./,
  );
  assert.doesNotMatch(m.host.textContent ?? '', /Customizable Live Matches and Rounds/);
  assert.equal(m.host.querySelector('.site-footer a[href="/account"]'), null);
  m.done();
});
