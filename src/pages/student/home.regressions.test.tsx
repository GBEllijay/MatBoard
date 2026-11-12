/**
 * Student home (character sheet) and the private body scan.
 * Controls touched: home menu links, streak badge, Show body scan switch (home + settings), body zones,
 * peek Open journal entry, See on body scan, Injury status (N) drop-down + Close/Esc, What the colors mean (?) + Close/Esc,
 * journal Body zone select and Injury status chips.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { addJournalEntry, blankStudentReport, loadStudentReport, saveStudentReport } from '../../lib/studentEdition.ts';
import { applyBackupToMemory, parseStudentBackup } from '../../lib/studentBackup.ts';
import { emptyRankPhotoStore } from '../../lib/rankPhotos.ts';
import { exportProgressPacket, parseProgressPacket } from '../../lib/progress/format.ts';
import { StudentEditionPage } from '../StudentEdition.tsx';
import { MatHoursStat } from './MatTime.tsx';
import {
  BODY_FRAME, BODY_SCAN_KEY, BODY_ZONES, HEAL_DAYS, bodyScan, bodyScanHref, healColor, injuryMarks, journalEntryHref,
  readBodyScanOn, setInjuryStatus, zoneFromText, zoneMarks, zoneTrend,
} from '../../lib/bodyScan.ts';
import { FORMER_HUB_ITEMS, formerHubItemReachable, studentPageBack } from '../../lib/studentHubMenu.ts';
import { buildCoachUpdateFile } from '../../lib/coachProgressFile.ts';
import { createStudentCardShare } from '../../lib/studentCardShare.ts';

const dom = new Window({ url: 'http://localhost/student/journal?student=1' });
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
installGlobal('HTMLInputElement', view.HTMLInputElement);
installGlobal('HTMLTextAreaElement', view.HTMLTextAreaElement);
installGlobal('HTMLButtonElement', view.HTMLButtonElement);
installGlobal('HTMLSelectElement', view.HTMLSelectElement);
installGlobal('HTMLFormElement', view.HTMLFormElement);
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('DocumentFragment', view.DocumentFragment);
installGlobal('Event', view.Event);
installGlobal('MouseEvent', view.MouseEvent);
installGlobal('KeyboardEvent', view.KeyboardEvent);
installGlobal('InputEvent', view.InputEvent);
installGlobal('FocusEvent', view.FocusEvent);
installGlobal('FormData', view.FormData);
installGlobal('getComputedStyle', view.getComputedStyle.bind(view));
installGlobal('requestAnimationFrame', view.requestAnimationFrame.bind(view));
installGlobal('cancelAnimationFrame', view.cancelAnimationFrame.bind(view));
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

let here = '';
let go: (to: string | number) => void = () => {};
function Probe() {
  const loc = useLocation();
  const nav = useNavigate();
  here = `${loc.pathname}${loc.search}${loc.hash}`;
  go = (to) => act(() => { typeof to === 'number' ? nav(to) : nav(to); });
  return null;
}

function mount(node: ReactNode, path: string): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={[path]}>{node}<Probe /></MemoryRouter>);
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

function control(host: ParentNode, tag: string, name: string): HTMLElement {
  const found = [...host.querySelectorAll(tag)].find((node) => node.textContent?.trim() === name);
  assert.ok(found, name);
  return found as HTMLElement;
}

function labeled(host: ParentNode, name: string): HTMLElement {
  const found = host.querySelector(`[aria-label="${name}"]`);
  assert.ok(found, name);
  return found as HTMLElement;
}

function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(
    input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value',
  );
  proto?.set?.call(input, value);
  act(() => {
    const key = Object.keys(input).find((name) => name.startsWith('__reactProps'));
    const props = key ? (input as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: input, currentTarget: input });
  });
}

function field(host: ParentNode, name: string): HTMLInputElement | HTMLTextAreaElement {
  const byAria = host.querySelector(`[aria-label="${name}"]`);
  if (byAria instanceof HTMLInputElement || byAria instanceof HTMLTextAreaElement) return byAria;
  const label = [...host.querySelectorAll('label')].find((node) => node.querySelector('.ink__label')?.textContent === name);
  const control = label?.querySelector('input, textarea');
  assert.ok(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement, name);
  return control;
}

function click(node: HTMLElement) {
  act(() => {
    node.click();
  });
}

/** The time wheel (shared WheelPicker): open it, tap the minute row, Done. */
function pickTime(host: ParentNode, prefix: string, label: string) {
  const opener = host.querySelector(`[aria-label^="${prefix}Time on the mat,"]`) as HTMLElement;
  assert.ok(opener, `${prefix}time wheel`);
  click(opener);
  const lists = [...document.querySelectorAll(`[role="listbox"][aria-label="${prefix}Time on the mat"]`)];
  const list = lists[lists.length - 1];
  assert.ok(list, 'wheel list');
  click(control(list, '[role="option"]', label));
  const sheet = list.closest('[role="dialog"]') ?? document.body;
  const done = [...sheet.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Done');
  if (done.length) click(done[done.length - 1] as HTMLElement);
}

function seed(belt = 'white', extra: Partial<Parameters<typeof addJournalEntry>[1]> = {}) {
  localStorage.clear();
  const report = blankStudentReport(10);
  report.profile.belt = belt as typeof report.profile.belt;
  const next = addJournalEntry(
    report,
    { date: '2026-10-11', className: 'Gi', gameTag: '', techniques: [], partners: '', drills: '', rolls: '', notes: 'n', ...extra },
    10,
  );
  saveStudentReport(localStorage, next);
  return next;
}


const TODAY = '2026-11-04';
function daysAgo(n: number, from = new Date()): string {
  return new Date(from.getTime() - n * 86_400_000).toISOString().slice(0, 10);
}
type Inj = { area: string; note: string; zone?: string; status?: 'hurt' | 'healing' | 'healed'; markedOn?: string };
function seedNamed(injuries: { date: string; injury?: Inj }[] = [], name = 'Sam') {
  localStorage.clear();
  let report = blankStudentReport(10);
  report.profile.displayName = name;
  report.profile.belt = 'blue' as typeof report.profile.belt;
  for (const { date, injury } of injuries) {
    report = addJournalEntry(report, { date, className: 'Gi', gameTag: '', techniques: [], partners: '', drills: '', rolls: '', notes: 'n', minutes: 60, ...(injury ? { injury } : {}) } as Parameters<typeof addJournalEntry>[1], 10);
  }
  saveStudentReport(localStorage, report);
  return report;
}
function entry(journal: { id: string; date: string }[], date: string) {
  return journal.find((e) => e.date === date)!;
}
function q(host: ParentNode, sel: string) {
  return host.querySelector(sel) as HTMLElement | null;
}

// ── Home = character sheet ────────────────────────────────────────────────
test('home: /student keeps the live branded header, then card → radar → medals → mat hours + stopwatch + streak, then hub tiles', () => {
  seedNamed([{ date: daysAgo(1) }]);
  const m = mount(<StudentEditionPage />, '/student?student=1');
  const text = m.host.textContent ?? '';
  assert.equal(q(m.host, '.parent-approvals'), null, 'Parent approvals is not on the student home');
  assert.equal(text.includes('Parent approvals'), false, 'Parent approvals is not student chrome');
  assert.ok(q(m.host, '.home__mark img.home__logo, img.home__logo'), 'round clock logo + Advantage title');
  assert.ok(text.includes('Advantage'), 'Advantage title');
  const nav = q(m.host, 'nav.s-hub')!;
  assert.ok(nav, 'hub nav');
  assert.ok(nav.querySelector('.belt-header, [class*="belt-header"]'), 'Student Edition belt bar');
  assert.equal(q(nav, '.s-hub__intro, .s-hub__avatar'), null, 'no photo + description section');
  assert.equal(text.includes('A personal BJJ training journal'), false, 'no description line');
  assert.equal(q(nav, '.s-profile, [aria-label="My profile"]'), null, 'no My profile card; the sheet is the profile');
  assert.match(q(m.host, '[data-testid="profile-edit-link"]')?.getAttribute('href') ?? '', /\/student\/profile/, 'edit link keeps the profile reachable');
  assert.equal(text.includes('MatBoard'), false, 'no internal name');
  const order = ['.belt-header', '[data-testid="student-home"]', '.s-journal'];
  const els = order.map((sel) => { const el = nav.querySelector(sel); assert.ok(el, `present: ${sel}`); return el!; });
  for (let i = 1; i < els.length; i++) assert.ok(els[i - 1].compareDocumentPosition(els[i]) & 4, `${order[i]} after ${order[i - 1]}`);
  // ONE sheet frame holding every zone, in order.
  const sheets = m.host.querySelectorAll('[data-testid="student-card-layout"]');
  assert.equal(sheets.length, 1, 'one character sheet');
  const zones = [...sheets[0].querySelectorAll(':scope > [data-testid="sheet-zone"]')].map((z) => z.getAttribute('data-zone'));
  assert.deepEqual(zones, ['identity', 'stats', 'radar', 'wins', 'body']);
  const zone = (id: string) => q(sheets[0], `[data-zone="${id}"]`)!;
  assert.ok(q(zone('identity'), '[data-testid="profile-card-face"]'), 'card face in identity');
  assert.ok(q(zone('identity'), '[data-testid="profile-edit-link"]'), 'edit link in identity');
  assert.ok(q(zone('stats'), '[data-testid="stat-mat-time"] [data-testid="mat-timer"]'), 'stopwatch inside MAT TIME');
  assert.ok(q(zone('stats'), '[data-testid="streak-badge"]') && q(zone('stats'), '[data-testid="stat-wins"]'), 'streak + wins tiles');
  assert.ok(q(zone('radar'), '[data-testid="card-radar"]'), 'radar zone');
  assert.ok(q(zone('wins'), '[data-testid="wins-breakdown"]') && q(zone('wins'), '[data-testid="card-medals"].card-medals--rail'), 'wins zone: breakdown + medals');
  assert.ok(q(zone('body'), '[data-testid="body-scan"]'), 'body scan at the bottom of the sheet');
  for (const cap of ['Identity', 'Mat time', 'Training streak', 'Wins', 'Shape', 'Body scan']) assert.ok([...sheets[0].querySelectorAll('.sheet-cap')].some((c) => c.textContent === cap), `caption ${cap}`);
  assert.equal(q(m.host, '[data-testid="student-home-top"]'), null, 'no streak bar at the very top');
  unmount(m);
});

test('Parent approvals control is absent from every Student Edition page', () => {
  const shell = readFileSync('src/pages/StudentEdition.tsx', 'utf8');
  assert.equal(shell.includes('ParentApprovals'), false, 'shared student shell must not mount the control');
  assert.equal(shell.includes('parent-approvals'), false, 'shared student shell must not render the control');

  seedNamed([{ date: daysAgo(1) }]);
  const rests = [
    '',
    'hub',
    'journal',
    'cards',
    'cards/card.1',
    'fundamentals',
    'calendar',
    'calendar/2026-10-23',
    'rubric',
    'belt',
    'profile',
    'report',
    'rank',
    'share',
    'self-assessment',
    'competitor',
    'weight',
    'results',
    'videos',
    'connections',
    'academy',
    'print/progress',
    'print/assessment',
    'scouting',
    'training',
    'progress',
    'compete',
    'coach',
    'backup',
    'backup/clear',
    'claim',
    'not-a-page',
  ];
  for (const rest of rests) {
    const path = `/student${rest ? `/${rest}` : ''}?student=1`;
    const mounted = mount(<StudentEditionPage />, path);
    const text = mounted.host.textContent ?? '';
    assert.equal(mounted.host.querySelector('.parent-approvals'), null, path);
    assert.equal(text.includes('Parent approvals'), false, path);
    assert.equal(text.includes('Turn on parent approvals'), false, path);
    assert.equal(text.includes('Turn off parent approvals'), false, path);
    unmount(mounted);
  }

  localStorage.clear();
  const closed = mount(<StudentEditionPage />, '/student');
  assert.equal(closed.host.querySelector('.parent-approvals'), null, 'closed student gate');
  assert.equal((closed.host.textContent ?? '').includes('Parent approvals'), false, 'closed student gate copy');
  unmount(closed);
});

function seedWins() {
  const report = seedNamed([{ date: daysAgo(1) }]);
  const m = (id: string, result: 'win' | 'loss', method: string) => ({ id, opponent: `Opp ${id}`, result, method, note: '', date: '2026-10-01' });
  report.competition = {
    ...report.competition!,
    results: [
      { id: 'r1', tournamentId: '', tournamentName: 'Sample Open', division: 'Teen', bracket: [], bracketPhoto: false, matches: [m('a', 'win', 'sub'), m('b', 'win', 'sub'), m('c', 'win', 'points')] },
      { id: 'r2', tournamentId: '', tournamentName: 'Example Cup', division: 'Teen', bracket: [], bracketPhoto: false, matches: [m('d', 'win', 'sub'), m('e', 'win', 'advantage'), m('f', 'loss', 'points')] },
      { id: 'r3', tournamentId: '', tournamentName: 'Demo Classic', division: 'Teen', bracket: [], bracketPhoto: false, matches: [m('g', 'win', 'points'), m('h', 'loss', 'sub')] },
    ],
  } as typeof report.competition;
  saveStudentReport(localStorage, report);
  return report;
}

test('sheet: wins breakdown comes from match results; WINS tile counts every win', () => {
  seedWins();
  const m = mount(<StudentEditionPage />, '/student?student=1');
  assert.equal(q(m.host, '[data-testid="wins-breakdown"]')?.textContent, 'Sub 3 · Pts 2 · Adv 1');
  assert.match(q(m.host, '[data-testid="stat-wins"]')?.textContent ?? '', /Wins6/);
  assert.ok(m.host.querySelectorAll('[data-zone="wins"] [data-testid="card-medal"]').length >= 1, 'recent medals in the wins zone');
  act(() => (q(m.host, '[data-zone="wins"] [data-testid="card-medal"]') as HTMLElement).dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
  assert.ok(q(m.host, '[data-testid="match-log"]'), 'medal opens the match log');
  unmount(m);
});

test('sheet: each stat tile opens its page; the stopwatch opens quick add', () => {
  const pages: Array<[string, RegExp]> = [['[data-testid="mat-hours-frame"]', /^\/student\/report/], ['[data-testid="streak-badge"]', /^\/student\/calendar/], ['[data-testid="stat-wins"]', /^\/student\/results/]];
  for (const [sel, path] of pages) {
    seedWins();
    const m = mount(<StudentEditionPage />, '/student?student=1');
    const tile = q(m.host, sel)!;
    assert.equal(tile.tagName, 'A', `${sel} is a link`);
    act(() => tile.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })));
    assert.match(here, path, `${sel} → ${path}`);
    unmount(m);
  }
  seedWins();
  const m = mount(<StudentEditionPage />, '/student?student=1');
  act(() => (q(m.host, '[data-testid="mat-timer"]') as HTMLElement).dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
  assert.ok(m.host.querySelector('[role="dialog"], form, .mat-quick'), 'quick add opens');
  assert.match(here, /^\/student(\?|$)/, 'stopwatch stays on the home');
  unmount(m);
});

test('home: no profile yet goes to setup first', () => {
  seedNamed([], '');
  const m = mount(<StudentEditionPage />, '/student?student=1');
  assert.equal(q(m.host, '[data-testid="student-home"]') === null, true);
  assert.match(here, /^\/student\/profile\?/);
  assert.match(here, /setup=1/);
  const link = m.host.querySelector('.profile-restore a');
  assert.equal(link?.textContent?.trim(), 'Already have a backup? Restore it here');
  assert.equal(link?.getAttribute('href'), '/student/backup?student=1');
  unmount(m);
});

test('a blank or whitespace name can open restore without saving, and a restored name hides that offer', () => {
  localStorage.clear();
  const blank = blankStudentReport(10);
  blank.profile.displayName = '   ';
  saveStudentReport(localStorage, blank);
  const before = localStorage.getItem('matboard.studentEdition.v1');
  const setup = mount(<StudentEditionPage />, '/student/profile?setup=1&student=1');
  const link = setup.host.querySelector('.profile-restore a') as HTMLAnchorElement | null;
  assert.ok(link);
  assert.equal(link.textContent?.trim(), 'Already have a backup? Restore it here');
  assert.equal(link.getAttribute('href'), '/student/backup?student=1');
  assert.equal(link.tabIndex, 0);
  click(link);
  assert.equal(here.split('?')[0], '/student/backup');
  assert.equal(localStorage.getItem('matboard.studentEdition.v1'), before);
  assert.match(setup.host.textContent ?? '', /A PDF or a spreadsheet is not a backup/);
  assert.ok(setup.host.querySelector('input[aria-label="Restore from backup"]'));
  unmount(setup);

  const named = blankStudentReport(12);
  named.profile.displayName = 'Restored Alex';
  const parsed = parseStudentBackup(
    JSON.stringify({
      advantage: 'student-journal-backup',
      version: 1,
      exportedAt: '2026-11-07',
      report: JSON.parse(exportProgressPacket(named)),
      assessment: { entries: [] },
      scouting: [],
      rankPhotos: emptyRankPhotoStore(),
      bracketPhotos: {},
      coachPlan: null,
      coachFeedback: null,
      films: [],
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  applyBackupToMemory(localStorage, parsed.file, 'replace', { rank: emptyRankPhotoStore(), bracket: {} });
  assert.equal(loadStudentReport(localStorage).profile.displayName, 'Restored Alex');

  const home = mount(<StudentEditionPage />, '/student?student=1');
  assert.ok(q(home.host, '[data-testid="student-home"]'));
  assert.equal(home.host.querySelector('.profile-restore'), null);
  assert.match(home.host.textContent ?? '', /Backup & Print/);
  unmount(home);

  const edited = mount(<StudentEditionPage />, '/student/profile?setup=1&student=1');
  assert.equal(edited.host.querySelector('.profile-restore'), null);
  assert.match(edited.host.textContent ?? '', /Save profile/);
  unmount(edited);
});

test('home: every former hub item is reachable from the menu; classic hub still works', () => {
  seedNamed();
  const m = mount(<StudentEditionPage />, '/student?student=1');
  const links = [...m.host.querySelectorAll('nav.s-hub a[href]')].map((a) => ({ to: (a.getAttribute('href') ?? '').replace(/^\/?/, '/'), label: a.textContent ?? '' }));
  assert.ok(links.length >= 5);
  unmount(m);
  // One tap deeper: every hub tile's own menu page.
  for (const tile of [...links]) {
    if (!/^\/student\/(training|progress|compete|coach|backup)$/.test(tile.to.split('?')[0])) continue;
    const g = mount(<StudentEditionPage />, `${tile.to.split('?')[0]}?student=1`);
    for (const a of g.host.querySelectorAll('a[href]')) links.push({ to: (a.getAttribute('href') ?? '').replace(/^\/?/, '/'), label: a.textContent ?? '' });
    unmount(g);
  }
  for (const item of FORMER_HUB_ITEMS) assert.ok(formerHubItemReachable(item, links), `reachable: ${item.label}`);
  const hub = mount(<StudentEditionPage />, '/student/hub?student=1');
  assert.equal(q(hub.host, '[data-testid="student-home"]') === null, true, 'classic hub is not the home');
  assert.ok(hub.host.textContent?.includes('Training'));
  unmount(hub);
});

test('home: streak is always on (no toggle) and follows the weekly goal', () => {
  seedNamed([{ date: daysAgo(0) }]);
  localStorage.setItem('matboard.student.streakTarget.v1', '3');
  const m = mount(<StudentEditionPage />, '/student?student=1');
  const badge = q(m.host, '[data-testid="streak-badge"]')!;
  assert.ok(badge);
  assert.equal(badge.getAttribute('data-target'), '3');
  assert.match(badge.textContent ?? '', /^Training streak\d+ weeks?$/);
  assert.match(badge.getAttribute("aria-label") ?? "", /^Training streak: \d+ weeks?\. This week: 1 of 3 sessions/);
  assert.equal(m.host.querySelector('[data-testid="streak-badge"] input, [data-testid="sheet-stats"] [role="switch"]') === null, true, 'no hide toggle');
  unmount(m);
});

test('home: back from a menu page returns to the home', () => {
  seedNamed();
  assert.equal(studentPageBack('/student/training', '?student=1', null), '/student?student=1');
  const m = mount(<StudentEditionPage />, '/student?student=1');
  go('/student/training?student=1');
  assert.equal(q(m.host, '[data-testid="student-home"]') === null, true);
  go(-1);
  assert.equal(here, '/student?student=1');
  assert.ok(q(m.host, '[data-testid="student-home"]'));
  unmount(m);
});

// ── Body scan: privacy switch ─────────────────────────────────────────────
test('body scan: off by default; only the collapsed row with the switch shows', () => {
  seedNamed([{ date: daysAgo(2), injury: { area: 'Left knee', note: 'tweak' } }]);
  assert.equal(readBodyScanOn(localStorage), false);
  const m = mount(<StudentEditionPage />, '/student?student=1');
  const scan = q(m.host, '[data-testid="body-scan"]')!;
  assert.equal(scan.getAttribute('data-on'), 'false');
  assert.ok(q(scan, '[data-testid="body-scan-switch"]'));
  assert.equal(q(scan, '[data-testid="body-figure-front"]') === null, true);
  unmount(m);
});

test('body scan: the switch persists, and settings has the same switch', () => {
  seedNamed([{ date: daysAgo(2), injury: { area: 'Left knee', note: '' } }]);
  let m = mount(<StudentEditionPage />, '/student?student=1');
  click(q(m.host, '[data-testid="body-scan-switch"]')!);
  assert.equal(localStorage.getItem(BODY_SCAN_KEY), 'on');
  unmount(m);
  m = mount(<StudentEditionPage />, '/student?student=1');
  assert.equal(q(m.host, '[data-testid="body-scan"]')!.getAttribute('data-on'), 'true');
  assert.ok(q(m.host, '[data-testid="body-figure-front"]') && q(m.host, '[data-testid="body-figure-back"]'));
  unmount(m);
  const p = mount(<StudentEditionPage />, '/student/profile?student=1');
  const sw = q(p.host, '[data-testid="body-scan-switch"]') as HTMLInputElement;
  assert.ok(sw, 'switch in settings');
  assert.equal(sw.checked, true);
  click(sw);
  assert.equal(localStorage.getItem(BODY_SCAN_KEY), 'off');
  unmount(p);
});

test('body scan: zones come from injury marks (picker zone wins; free text uses keywords; unmatched → Other)', () => {
  const r = seedNamed([
    { date: daysAgo(3), injury: { area: 'sore', note: '', zone: 'wristR' } },
    { date: daysAgo(4), injury: { area: 'Left knee', note: '' } },
    { date: daysAgo(5), injury: { area: 'earlobe', note: '' } },
  ]);
  const view = bodyScan(r.journal, daysAgo(0));
  assert.deepEqual(view.zones.map((z) => z.zone).sort(), ['kneeL', 'wristR']);
  assert.equal(view.other.length, 1);
  assert.equal(view.other[0].label, 'earlobe');
  localStorage.setItem(BODY_SCAN_KEY, 'on');
  const m = mount(<StudentEditionPage />, '/student?student=1');
  const flagged = [...m.host.querySelectorAll('[data-testid="body-zone"]')].filter((z) => z.getAttribute('data-status'));
  assert.deepEqual([...new Set(flagged.map((z) => z.getAttribute('data-zone')))].sort(), ['kneeL', 'wristR']);
  assert.equal(q(m.host, '[data-testid="injury-status-open"]')!.textContent, 'Injury status (3)');
  unmount(m);
});

test('body scan: keyword map for old free text', () => {
  const cases: [string, string][] = [
    ['Left knee', 'kneeL'], ['right knee', 'kneeR'], ['knee', 'kneeL'], ['Shoulder', 'shoulderL'], ['R shoulder', 'shoulderR'],
    ['neck', 'neck'], ['ribs', 'ribs'], ['lower back', 'lowerBack'], ['upper back', 'upperBack'], ['ankle', 'ankleL'],
    ['right wrist', 'wristR'], ['elbow', 'elbowL'], ['hip', 'hips'], ['earlobe', ''],
  ];
  for (const [text, zone] of cases) assert.equal(zoneFromText(text), zone, text);
});

// ── Recovery ──────────────────────────────────────────────────────────────
test('recovery: color by status (hurt red, healing amber→green, healed green)', () => {
  const mk = (status?: 'hurt' | 'healing' | 'healed') => injuryMarks([{ id: 'a', date: '2026-11-01', injury: { area: 'knee', note: '', zone: 'kneeL', status, markedOn: '2026-11-02' } } as never]);
  const hurt = zoneTrend(mk('hurt'), TODAY)!;
  const healing = zoneTrend(mk('healing'), TODAY)!;
  const healed = zoneTrend(mk('healed'), TODAY)!;
  assert.equal(hurt.status, 'hurt');
  assert.equal(hurt.color, healColor(0));
  assert.equal(healColor(0), '#ff4d3a');
  assert.equal(healing.status, 'healing');
  assert.ok(healing.heal >= 0.5 && healing.heal < 1);
  assert.equal(healed.status, 'healed');
  assert.equal(healed.color, '#3de08a');
});

test('recovery: an unmarked injury drifts red → green over about 28 days', () => {
  const at = (n: number) => zoneTrend(injuryMarks([{ id: 'a', date: daysAgo(n, new Date(`${TODAY}T12:00:00Z`)), injury: { area: 'Left knee', note: '' } } as never]), TODAY);
  assert.equal(at(0)!.heal, 0);
  assert.equal(at(0)!.status, 'hurt');
  assert.equal(at(7)!.status, 'hurt');
  assert.equal(at(20)!.status, 'healing');
  assert.ok(at(14)!.heal > at(0)!.heal && at(14)!.heal < at(27)!.heal);
  assert.equal(at(HEAL_DAYS)!.status, 'healed');
  assert.ok(at(HEAL_DAYS + 14), 'still glowing on day 14');
  assert.equal(at(HEAL_DAYS + 15), null, 'old marks drop off after the glow');
});

test('recovery: a new mark on the same zone resets it to red', () => {
  const r = seedNamed([
    { date: '2026-10-01', injury: { area: 'Left knee', note: '', status: 'healed', markedOn: '2026-10-20' } },
    { date: '2026-11-03', injury: { area: 'knee again', note: '', zone: 'kneeL' } },
  ]);
  const knee = bodyScan(r.journal, TODAY).zones.find((z) => z.zone === 'kneeL')!;
  assert.equal(knee.status, 'hurt');
  assert.equal(knee.marks.length, 2);
  assert.equal(knee.marks[0].date, '2026-11-03');
});

test('recovery: healed glows green 14 days then leaves the scan but stays in history', () => {
  const r = seedNamed([{ date: '2026-09-01', injury: { area: 'Left knee', note: '', status: 'healed', markedOn: '2026-10-25' } }]);
  assert.equal(bodyScan(r.journal, '2026-11-04').zones[0]?.status, 'healed');
  assert.equal(bodyScan(r.journal, '2026-11-09').zones.length, 0);
  assert.equal(zoneMarks(r.journal, 'kneeL').length, 1, 'still in history');
});

test('recovery: old marks (no zone/status/markedOn) still parse and count as Hurt from their date', () => {
  const r = seedNamed([{ date: daysAgo(1), injury: { area: 'Shoulder', note: 'old' } }]);
  const loaded = loadStudentReport(localStorage);
  assert.equal(loaded.journal[0].injury?.area, 'Shoulder');
  const round = parseProgressPacket(exportProgressPacket(loaded));
  assert.ok(round);
  const zone = bodyScan(r.journal, daysAgo(1)).zones[0];
  assert.equal(zone.zone, 'shoulderL');
  assert.equal(zone.status, 'hurt');
});

test('recovery: setting a status stamps markedOn and round-trips through the file format', () => {
  const r = seedNamed([{ date: '2026-10-20', injury: { area: 'Left knee', note: '', zone: 'kneeL' } }]);
  const next = setInjuryStatus(r.journal, r.journal[0].id, 'healing', TODAY);
  assert.equal(next[0].injury?.status, 'healing');
  assert.equal(next[0].injury?.markedOn, TODAY);
  saveStudentReport(localStorage, { ...r, journal: next });
  const loaded = loadStudentReport(localStorage);
  assert.equal(loaded.journal[0].injury?.zone, 'kneeL');
  assert.equal(loaded.journal[0].injury?.status, 'healing');
  assert.equal(loaded.journal[0].injury?.markedOn, TODAY);
});

// ── Linking ───────────────────────────────────────────────────────────────
test('linking: tapping a zone opens the peek with marks newest first and an Open journal entry link', () => {
  const r = seedNamed([
    { date: daysAgo(6), injury: { area: 'Left knee', note: 'first' } },
    { date: daysAgo(2), injury: { area: 'knee', note: 'second', zone: 'kneeL' } },
  ]);
  localStorage.setItem(BODY_SCAN_KEY, 'on');
  const m = mount(<StudentEditionPage />, '/student?student=1');
  const hit = q(m.host, '[data-testid="body-figure-front"] [data-zone="kneeL"] [role="button"]')!;
  assert.ok(hit);
  act(() => { hit.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const peek = q(m.host, '[data-testid="body-peek"]')!;
  assert.ok(peek);
  const rows = [...peek.querySelectorAll('[data-testid="body-peek-row"]')];
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent ?? '', /second/);
  assert.match(rows[1].textContent ?? '', /first/);
  const newest = entry(r.journal, daysAgo(2));
  const link = q(rows[0], '[data-testid="open-journal-entry"]')!;
  assert.equal(link.getAttribute('href'), `${journalEntryHref(newest.id).replace('#', '?student=1#')}`);
  click(link);
  assert.match(here, new RegExp(`^/student/cards/${newest.id}\\?student=1#injury$`));
  const inj = q(m.host, '[data-testid="card-injury"]')!;
  assert.equal(inj.id, 'injury');
  assert.equal(inj.getAttribute('data-highlight'), 'true');
  go(-1);
  assert.match(here, /^\/student\?student=1/);
  unmount(m);
});

test('linking: journal "See on body scan" opens the scan with the zone and peek, temporarily when the switch is off', () => {
  const r = seedNamed([{ date: daysAgo(2), injury: { area: 'Right wrist', note: 'tape' } }]);
  const id = r.journal[0].id;
  const m = mount(<StudentEditionPage />, `/student/cards/${id}?student=1`);
  const back = q(m.host, '[data-testid="see-on-body-scan"]')!;
  assert.ok(back);
  assert.equal(bodyScanHref('wristR'), '/student?zone=wristR&scan=1#body-scan');
  click(back);
  assert.match(here, /^\/student\?zone=wristR&scan=1&student=1#body-scan$/);
  const scan = q(m.host, '[data-testid="body-scan"]')!;
  assert.equal(scan.getAttribute('data-on'), 'true');
  assert.equal(scan.getAttribute('data-temporary'), 'true');
  assert.equal(localStorage.getItem(BODY_SCAN_KEY), null, 'saved preference unchanged');
  assert.ok(q(m.host, '[data-testid="body-figure-front"] [data-zone="wristR"].bs-zone--selected'));
  assert.ok(q(m.host, '[data-testid="body-peek"]'));
  go(-1);
  assert.match(here, new RegExp(`^/student/cards/${id}`));
  unmount(m);
});

// ── Single body ───────────────────────────────────────────────────────────
test('single body: no body type control; one androgynous frame; old stored type ignored; every zone renders', () => {
  seedNamed([{ date: daysAgo(2), injury: { area: 'Left knee', note: '' } }]);
  localStorage.setItem(BODY_SCAN_KEY, 'on');
  localStorage.setItem('advantage.student.bodyType.v1', '1');
  const m = mount(<StudentEditionPage />, '/student?student=1');
  assert.equal(q(m.host, '[data-testid^="body-type"]'), null);
  assert.equal(q(m.host, '[aria-label="Body type"]'), null);
  assert.equal(m.host.textContent?.includes('Body type'), false);
  assert.deepEqual({ ...BODY_FRAME }, { shoulder: 23, hip: 21 });
  for (const side of ['front', 'back']) assert.equal(q(m.host, `[data-testid="body-figure-${side}"]`)!.getAttribute('data-frame'), '23/21');
  const zones = new Set([...m.host.querySelectorAll('[data-testid="body-zone"]')].map((z) => z.getAttribute('data-zone')));
  assert.equal(zones.size, BODY_ZONES.length);
  unmount(m);
});

// ── Injury status drop-down ───────────────────────────────────────────────
test('injury status: closed by default, opens a list of every flagged zone, item opens the peek, Esc and Close shut it', () => {
  seedNamed([
    { date: daysAgo(1), injury: { area: 'Left knee', note: '' } },
    { date: daysAgo(3), injury: { area: 'Right wrist', note: '' } },
    { date: daysAgo(4), injury: { area: 'earlobe', note: '' } },
  ]);
  localStorage.setItem(BODY_SCAN_KEY, 'on');
  const m = mount(<StudentEditionPage />, '/student?student=1');
  assert.equal(q(document.body, '[data-testid="body-legend-row"]'), null, 'no permanent status lines');
  const open = q(m.host, '[data-testid="injury-status-open"]')!;
  assert.equal(open.textContent, 'Injury status (3)');
  assert.equal(open.getAttribute('aria-expanded'), 'false');
  click(open);
  const dlg = q(document.body, '[data-testid="injury-status"] [role="dialog"]')!;
  assert.equal(dlg.getAttribute('aria-modal'), 'true');
  assert.deepEqual([...dlg.querySelectorAll('[data-testid="body-legend-row"]')].map((r) => r.getAttribute('data-zone')).sort(), ['kneeL', 'other', 'wristR']);
  act(() => { dlg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  assert.equal(q(document.body, '[data-testid="injury-status"]'), null);
  click(open);
  click(control(q(document.body, '[data-testid="injury-status"]')!, 'button', 'Close'));
  assert.equal(q(document.body, '[data-testid="injury-status"]'), null);
  click(open);
  click(q(document.body, '[data-testid="injury-status"] [data-zone="wristR"] button')!);
  assert.equal(q(document.body, '[data-testid="injury-status"]'), null);
  const peek = q(m.host, '[data-testid="body-peek"]')!;
  assert.equal(peek.getAttribute('data-zone'), 'wristR');
  assert.ok(q(peek, '[data-testid="open-journal-entry"]'));
  unmount(m);
});

// ── Color help overlay ────────────────────────────────────────────────────
test('color help: ? opens a dialog with the four meanings; Esc and Close shut it', () => {
  seedNamed([{ date: daysAgo(2), injury: { area: 'Left knee', note: '' } }]);
  localStorage.setItem(BODY_SCAN_KEY, 'on');
  const m = mount(<StudentEditionPage />, '/student?student=1');
  assert.equal(q(document.body, '[data-testid="color-help"]'), null);
  click(q(m.host, '[data-testid="color-help-open"]')!);
  const dlg = q(document.body, '[data-testid="color-help"] [role="dialog"]')!;
  assert.equal(dlg.getAttribute('role'), 'dialog');
  assert.equal(dlg.getAttribute('aria-modal'), 'true');
  const text = [...dlg.querySelectorAll('[data-testid="color-meaning"]')].map((n) => n.textContent ?? '').join(' | ');
  for (const w of [/Red/i, /Amber/i, /Green/i, /Blue/i]) assert.match(text, w);
  act(() => { dlg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  assert.equal(q(document.body, '[data-testid="color-help"]'), null);
  click(q(m.host, '[data-testid="color-help-open"]')!);
  click(control(document.body, 'button', 'Close'));
  assert.equal(q(document.body, '[data-testid="color-help"]'), null);
  unmount(m);
});

// ── Privacy ───────────────────────────────────────────────────────────────
test('privacy: injuries and body zones never reach the coach file or the card share', () => {
  const r = seedNamed([{ date: daysAgo(2), injury: { area: 'Left knee', note: 'secret-note', zone: 'kneeL', status: 'hurt', markedOn: daysAgo(1) } }]);
  localStorage.setItem(BODY_SCAN_KEY, 'on');
  const file = buildCoachUpdateFile(r, { storage: localStorage, assessments: [] });
  for (const word of ['secret-note', 'kneeL', 'Left knee', 'injury', 'markedOn', 'bodyScan']) assert.equal(file.json.includes(word), false, word);
  const share = createStudentCardShare({ studentId: r.studentId, gym: { gymDrive: true, plusCloud: true }, card: { name: 'Sam', belt: 'blue' }, parentRequired: false, now: 1 });
  const json = JSON.stringify(share);
  for (const word of ['secret-note', 'kneeL', 'injury']) assert.equal(json.includes(word), false, word);
});

test('shape toggle defaults to the diamond and can switch to the radar', () => {
  seedNamed([{ date: daysAgo(1) }]);
  const m = mount(<StudentEditionPage />, '/student?student=1');
  const shape = q(m.host, '[data-testid="card-radar"]')!;
  assert.equal(shape.getAttribute('data-shape'), 'diamond');
  assert.equal(control(shape, 'button', 'Diamond').getAttribute('aria-pressed'), 'true');
  assert.ok(q(shape, '[data-testid="sheet-diamond"]'));
  assert.equal(q(shape, 'polygon.oct-cage'), null);
  click(control(shape, 'button', 'Radar'));
  assert.equal(shape.getAttribute('data-shape'), 'radar');
  assert.equal(control(shape, 'button', 'Radar').getAttribute('aria-pressed'), 'true');
  assert.equal(q(shape, '[data-testid="sheet-diamond"]'), null);
  click(control(shape, 'button', 'Diamond'));
  assert.equal(shape.getAttribute('data-shape'), 'diamond');
  assert.ok(q(shape, '[data-testid="sheet-diamond"]'));
  unmount(m);
});


function pickSelect(select: HTMLSelectElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  proto?.set?.call(select, value);
  act(() => {
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

test('add injury from the list: saves without a journal card, shows with journal marks, healing toggle reloads', () => {
  const r = seedNamed([{ date: daysAgo(2), injury: { area: 'Right wrist', note: 'from class', zone: 'wristR' } }]);
  const journalCount = r.journal.length;
  const journalNote = r.journal[0].injury?.note;
  localStorage.setItem(BODY_SCAN_KEY, 'on');
  const m = mount(<StudentEditionPage />, '/student?student=1');
  click(q(m.host, '[data-testid="injury-add-open"]')!);
  const form = q(document.body, '[data-testid="injury-add"]')!;
  assert.ok(form);
  assert.equal(control(form, 'button', 'Outside of training').getAttribute('aria-pressed'), 'true');
  typeInto(field(form, 'What was injured') as HTMLInputElement, 'Left knee');
  pickSelect(labeled(form, 'Body zone') as HTMLSelectElement, 'kneeL');
  typeInto(field(form, 'Note (optional)') as HTMLInputElement, 'car accident');
  click(q(form, '[data-testid="injury-add-save"]')!);
  assert.equal(q(document.body, '[data-testid="injury-add"]'), null);
  assert.match(q(m.host, '[data-testid="injury-status-open"]')!.textContent ?? '', /Injury status \(2\)/);

  const loaded = loadStudentReport(localStorage);
  assert.equal(loaded.journal.length, journalCount);
  assert.equal(loaded.journal[0].injury?.note, journalNote);
  assert.equal(loaded.journal[0].injury?.area, 'Right wrist');
  assert.equal(loaded.injuries?.length, 1);
  assert.equal(loaded.injuries?.[0].area, 'Left knee');
  assert.equal(loaded.injuries?.[0].note, 'car accident');
  assert.equal(loaded.injuries?.[0].source, 'outside');
  assert.equal(loaded.injuries?.[0].zone, 'kneeL');
  assert.equal(loaded.injuries?.[0].status, 'hurt');

  const knee = q(m.host, '[data-testid="body-figure-front"] [data-zone="kneeL"] [role="button"]')!;
  act(() => { knee.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const peek = q(m.host, '[data-testid="body-peek"]')!;
  const listRow = q(peek, '[data-testid="body-peek-row"][data-source="list"]')!;
  assert.match(listRow.textContent ?? '', /car accident/);
  assert.match(listRow.textContent ?? '', /Outside of training/);
  assert.equal(q(listRow, '[data-testid="open-journal-entry"]'), null);
  click(control(listRow, 'button', 'Healing'));
  unmount(m);

  const after = loadStudentReport(localStorage);
  assert.equal(after.injuries?.[0].status, 'healing');
  assert.equal(after.journal.length, journalCount);
  assert.equal(after.journal[0].injury?.note, journalNote);
  assert.equal(after.journal[0].injury?.status, undefined);

  const m2 = mount(<StudentEditionPage />, '/student?student=1');
  const wrist = q(m2.host, '[data-testid="body-figure-front"] [data-zone="wristR"] [role="button"]')!;
  act(() => { wrist.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const journalRow = q(m2.host, '[data-testid="body-peek-row"][data-source="journal"]')!;
  assert.match(journalRow.textContent ?? '', /from class/);
  assert.ok(q(journalRow, '[data-testid="open-journal-entry"]'));
  assert.equal(control(journalRow, 'button', 'Hurt').getAttribute('aria-pressed'), 'true');
  unmount(m2);
});

test('privacy: a list-added injury never reaches the coach file or the card share', () => {
  const r = seedNamed([{ date: daysAgo(2), injury: { area: 'Right wrist', note: 'class-note', zone: 'wristR' } }]);
  const next = { ...r, injuries: [{ id: 'inj.secret', date: daysAgo(1), area: 'Left knee', note: 'wreck-note', zone: 'kneeL', status: 'hurt' as const, markedOn: daysAgo(1), source: 'outside' as const, createdAt: 20, updatedAt: 20 }] };
  saveStudentReport(localStorage, next);
  const file = buildCoachUpdateFile(loadStudentReport(localStorage), { storage: localStorage, assessments: [] });
  for (const word of ['wreck-note', 'class-note', 'kneeL', 'Left knee', 'inj.secret']) assert.equal(file.json.includes(word), false, word);
  const share = createStudentCardShare({ studentId: r.studentId, gym: { gymDrive: true, plusCloud: true }, card: { name: 'Sam', belt: 'blue' }, parentRequired: false, now: 1 });
  const json = JSON.stringify(share);
  for (const word of ['wreck-note', 'injury']) assert.equal(json.includes(word), false, word);
});
