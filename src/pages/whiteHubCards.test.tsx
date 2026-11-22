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

test('the White hub keeps working Scoreboard, Controller, Rounds, and Match names links', () => {
  const m = mount();
  const scoreboard = m.host.querySelector('#scoreboard');
  const rounds = m.host.querySelector('#round-timer');
  const names = m.host.querySelector('.mode-card--names');
  assert.ok(scoreboard);
  assert.ok(rounds);
  assert.ok(names);
  assert.deepEqual(hrefs(scoreboard as HTMLElement, 'a.btn'), ['/match', '/match/control']);
  assert.deepEqual(hrefs(rounds as HTMLElement, 'a.btn'), ['/training', '/training/control']);
  assert.deepEqual(hrefs(names as HTMLElement, 'a.btn, a.mode-card__hit'), ['/white/roster', '/white/roster']);
  assert.match(names?.textContent ?? '', /match-names\.csv/);
  assert.match(names?.textContent ?? '', /Upload/);
  assert.match(names?.textContent ?? '', /Download/);
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
  assert.doesNotMatch(page, /HeaderAccount|AccountLink/);
  assert.match(header, /'\/white'/);
});
