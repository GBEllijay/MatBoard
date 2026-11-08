import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  compareRosterNames,
  letterAtClientY,
  letterInStrip,
  measureStickyHeaderBottom,
  readRosterSort,
  rosterIndexClearance,
  rosterIndexTopPx,
  rosterJumpClearance,
  rosterJumpTop,
  rosterIndex,
  rosterIndexLetter,
  rosterSwipeIntent,
  sortRoster,
  writeRosterSort,
  ROSTER_INDEX_HEADER_GAP,
  ROSTER_SORT_KEY,
} from './rosterIndex.ts';

const FIRSTS = ['Micah', 'Oliver', 'Ana', 'Bea', 'Chris', 'Dana', 'Evan', 'Fran', 'Gus', 'Hana'];
const LASTS = ['Bates', 'Tibbetts', 'Nguyen', 'Ortiz', 'Young', 'Adler', 'Quinn', 'Ibarra', 'Shaw', 'Cho'];

/** Screenshot and test fixture only. Not written into the app's roster. */
function demoRoster(count = 100): { id: string; name: string; belt: string; division: string }[] {
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    const first = FIRSTS[index % FIRSTS.length];
    const last = LASTS[index % LASTS.length];
    const single = index % 17 === 0;
    rows.push({
      id: `demo-${index}`,
      name: single ? first : `${first} ${last}`,
      belt: index % 11 === 0 ? 'Grey' : index % 5 === 0 ? 'Blue' : 'White',
      division: index % 2 === 0 ? 'Kids' : 'Adult',
    });
  }
  rows.push({ id: 'blank', name: '   ', belt: 'White', division: '' });
  rows.push({ id: 'symbol', name: '123', belt: 'White', division: '' });
  return rows;
}

test('last name is the default sort and first name stays available', () => {
  const rows = [
    { id: '1', name: 'Micah Bates' },
    { id: '2', name: 'Oliver Tibbetts' },
    { id: '3', name: 'Sam' },
    { id: '4', name: 'Ana Adler' },
  ];
  assert.deepEqual(sortRoster(rows, 'last').map((row) => row.name), ['Ana Adler', 'Micah Bates', 'Sam', 'Oliver Tibbetts']);
  assert.deepEqual(sortRoster(rows, 'first').map((row) => row.name), ['Ana Adler', 'Micah Bates', 'Oliver Tibbetts', 'Sam']);
  assert.ok(compareRosterNames('Zoe Adams', 'Amy Zion', 'last') < 0);
  const memory = store();
  assert.equal(readRosterSort(memory), 'last');
  writeRosterSort('first', memory);
  assert.equal(memory.getItem(ROSTER_SORT_KEY), 'first');
  assert.equal(readRosterSort(memory), 'first');
  writeRosterSort('last', memory);
  assert.equal(readRosterSort(memory), 'last');
});

test('single-word names sort on that word and blank names go last', () => {
  const rows = [
    { id: 'a', name: 'Zoe' },
    { id: 'b', name: '' },
    { id: 'c', name: '  ' },
    { id: 'd', name: 'Amy Ng' },
  ];
  assert.deepEqual(sortRoster(rows, 'last').map((row) => row.id), ['d', 'a', 'b', 'c']);
  assert.equal(rosterIndexLetter('Sam', 'last'), 'S');
  assert.equal(rosterIndexLetter('Sam', 'first'), 'S');
  assert.equal(rosterIndexLetter('Oliver Tibbetts', 'last'), 'T');
  assert.equal(rosterIndexLetter('Oliver Tibbetts', 'first'), 'O');
  assert.equal(rosterIndexLetter('', 'last'), '#');
  assert.equal(rosterIndexLetter('Émile', 'first'), 'E');
});

test('A-Z index maps letters to the first student and dims empty letters', () => {
  const rows = demoRoster(100);
  const index = rosterIndex(rows, 'last');
  assert.equal(index.length, 27);
  const tee = index.find((row) => row.letter === 'T');
  assert.ok(tee && tee.count > 0 && tee.firstId);
  const sorted = sortRoster(rows, 'last');
  assert.equal(sorted.find((row) => rosterIndexLetter(row.name, 'last') === 'T')?.id, tee?.firstId);
  const empty = index.filter((row) => row.count === 0);
  assert.ok(empty.length > 0, 'a 100-name demo still leaves some letters empty');
  assert.ok(empty.every((row) => row.firstId === null));
  const hash = index.find((row) => row.letter === '#');
  assert.equal(hash?.count, 2);
  assert.equal(hash?.firstId, 'symbol');
});

test('the index follows the Find filter and the active sort', () => {
  const rows = demoRoster(100);
  const matched = rows.filter((row) => row.belt === 'Blue');
  const last = rosterIndex(matched, 'last');
  const first = rosterIndex(matched, 'first');
  const byLast = sortRoster(matched, 'last');
  const byFirst = sortRoster(matched, 'first');
  assert.ok(matched.length > 0 && matched.length < rows.length);
  assert.equal(last.find((row) => row.letter === 'B')?.firstId, byLast.find((row) => rosterIndexLetter(row.name, 'last') === 'B')?.id);
  assert.equal(first.find((row) => row.letter === 'M')?.firstId, byFirst.find((row) => rosterIndexLetter(row.name, 'first') === 'M')?.id);
  assert.notEqual(last.find((row) => row.letter === 'T')?.count, rosterIndex(rows, 'last').find((row) => row.letter === 'T')?.count);
  assert.equal(rosterIndexLetter('Oliver Tibbetts', 'last'), 'T');
  assert.equal(rosterIndexLetter('Oliver Tibbetts', 'first'), 'O');
  const none = rosterIndex(rows.filter((row) => row.name === 'nobody'), 'last');
  assert.ok(none.every((row) => row.count === 0));
});

test('a vertical swipe on a card scrolls and does not get captured', () => {
  assert.equal(rosterSwipeIntent(0, 48), 'scroll');
  assert.equal(rosterSwipeIntent(4, 36), 'scroll');
  assert.equal(rosterSwipeIntent(2, 3), 'tap');
  assert.equal(rosterSwipeIntent(80, 10), 'horizontal');
  assert.equal(letterAtClientY([
    { letter: 'A', top: 0, bottom: 20 },
    { letter: 'B', top: 20, bottom: 40 },
    { letter: 'C', top: 40, bottom: 60 },
  ], 28), 'B');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
  const top = 80;
  const band = 12;
  const bottom = top + alphabet.length * band;
  const at = (letter: string) => top + alphabet.indexOf(letter) * band + 3;
  assert.equal(letterInStrip(alphabet, top, bottom, at('V')), 'V');
  assert.equal(letterInStrip(alphabet, top, bottom, at('O')), 'O');
  assert.equal(letterInStrip(alphabet, top, bottom, at('P')), 'P');
  assert.equal(letterInStrip(alphabet, top, bottom, at('N')), 'N');
  assert.equal(rosterJumpTop(400, 100, 20, 12), 308);
  const pageSource = readFileSync('src/pages/Roster.tsx', 'utf8');
  const jump = pageSource.slice(pageSource.indexOf('const jumpToLetter'), pageSource.indexOf('const openAdd'));
  assert.match(jump, /scroller\.scrollTop = top/);
  assert.doesNotMatch(jump, /behavior:\s*'smooth'/);
  const look = readFileSync('src/index.css', 'utf8');
  assert.match(look, /\.roster__cardlook\s*\{[^}]*position:\s*static/);
  assert.doesNotMatch(look, /\.roster__cardlook\s*\{[^}]*position:\s*sticky/);
  const findAt = pageSource.indexOf('data-testid="roster-sort"');
  const lookAt = pageSource.indexOf('<CardLookSetting');
  assert.ok(findAt > 0 && lookAt > findAt, 'Card look sits after Find and Sort');
  const css = readFileSync('src/components/rosterCard/rolodex.css', 'utf8');
  assert.match(css, /\.rolodex \.roster-card,\s*\n\.rolodex \.roster-card button[\s\S]*touch-action:\s*pan-y/);
  assert.match(css, /overscroll-behavior:\s*auto/);
  assert.doesNotMatch(css, /overscroll-behavior:\s*contain/);
  assert.match(css, /pointer:\s*coarse\)[\s\S]*animation:\s*none/);
  const page = readFileSync('src/pages/Roster.tsx', 'utf8');
  assert.match(page, /portal stacked/);
  assert.match(page, /data-testid="card-entry-belt-slot"[\s\S]*<RankBelt student=\{\{ belt: draft\.belt, stripes: draft\.stripes/);
  assert.match(page, /Sort/);
  assert.match(page, /readRosterSort/);
});

test('A and B clear a measured Upgrade header at 390 and 400 wide', () => {
  const headerBottom = 196;
  const logoClearance = 128;
  const viewportHeight = 985;
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
  for (const width of [390, 400]) {
    const top = rosterIndexClearance(headerBottom, logoClearance);
    assert.equal(top, Math.ceil(headerBottom) + ROSTER_INDEX_HEADER_GAP);
    assert.ok(top > headerBottom, `${width}px: strip starts below the header`);
    const bottom = viewportHeight - 10;
    const band = (bottom - top) / letters.length;
    assert.ok(top >= headerBottom, `${width}px: A is tappable`);
    assert.ok(top + band >= headerBottom, `${width}px: B is tappable`);
    assert.ok(top + letters.length * band <= viewportHeight, `${width}px: # stays on screen`);
    const right = Math.max(2, (width - Math.min(42 * 16, width)) / 2);
    assert.ok(right + 40 <= width, `${width}px: the strip stays inside the screen`);
  }
  assert.equal(rosterIndexClearance(null, logoClearance), logoClearance);
  assert.equal(rosterIndexClearance(40, logoClearance), logoClearance);
  assert.equal(rosterIndexClearance(Number.NaN, logoClearance), logoClearance);
  assert.equal(rosterIndexTopPx(headerBottom, logoClearance), `${Math.ceil(headerBottom) + ROSTER_INDEX_HEADER_GAP}px`);
  assert.equal(rosterIndexTopPx(null, logoClearance), null);
  assert.equal(rosterIndexTopPx(40, logoClearance), null);
  assert.equal(measureStickyHeaderBottom(null), null);
  const indexSource = readFileSync('src/components/rosterCard/RosterIndex.tsx', 'utf8');
  const css = readFileSync('src/components/rosterCard/rolodex.css', 'utf8');
  assert.match(indexSource, /measureStickyHeaderBottom\(view\.document\)/);
  assert.match(indexSource, /querySelector\('\.seat-session'\)|measureStickyHeaderBottom/);
  assert.match(css, /--roster-index-top,\s*calc\(0\.35rem \+ var\(--safe-t/);
  assert.doesNotMatch(indexSource, /top:\s*['"]?\d+px/);
  assert.match(readFileSync('src/lib/rosterIndex.ts', 'utf8'), /\.seat-session/);
});

test('an A–Z jump lands the first row below the measured sticky header', () => {
  const headerBottom = 190;
  const scrollerTop = 40;
  const clearance = rosterJumpClearance(headerBottom, scrollerTop);
  assert.ok(scrollerTop + clearance > headerBottom, 'V sits fully under the header edge');
  const targetTop = 640;
  const scrollTop = 200;
  const next = rosterJumpTop(targetTop, scrollerTop, scrollTop, clearance);
  const landed = targetTop - (next - scrollTop);
  assert.ok(landed >= headerBottom + 8);
  assert.equal(rosterJumpClearance(null, scrollerTop), 12);
  assert.equal(rosterJumpClearance(20, 80), 12);
  const pageSource = readFileSync('src/pages/Roster.tsx', 'utf8');
  const jump = pageSource.slice(pageSource.indexOf('const jumpToLetter'), pageSource.indexOf('const openAdd'));
  assert.match(jump, /rosterJumpClearance\(measureStickyHeaderBottom/);
  assert.match(jump, /scroller\.scrollTop = top/);
  assert.doesNotMatch(jump, /behavior:\s*'smooth'/);
});

function store() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}
