/**
 * Student home (character sheet) and the private body scan.
 * Controls touched: home menu links, streak badge, Show body scan switch (home + settings), body zones,
 * peek Open journal entry, See on body scan, Body type 1/2, What the colors mean (?) + Close/Esc,
 * journal Body zone select and Injury status chips.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { addJournalEntry, blankStudentReport, loadStudentReport, saveStudentReport } from '../../lib/studentEdition.ts';
import { exportProgressPacket, parseProgressPacket } from '../../lib/progress/format.ts';
import { StudentEditionPage } from '../StudentEdition.tsx';
import { MatHoursStat } from './MatTime.tsx';
import {
  BODY_SCAN_KEY, BODY_TYPE_KEY, BODY_ZONES, HEAL_DAYS, bodyScan, bodyScanHref, healColor, injuryMarks, journalEntryHref,
  readBodyScanOn, readBodyType, setInjuryStatus, zoneFromText, zoneMarks, zoneTrend,
} from '../../lib/bodyScan.ts';
import { FORMER_HUB_ITEMS, formerHubItemReachable, studentPageBack } from '../../lib/studentHubMenu.ts';
import { buildCoachUpdateFile } from '../../lib/coachProgressFile.ts';
import { createStudentCardShare } from '../../lib/studentCardShare.ts';
import { HOME_EXTRA_LINKS } from './StudentHome.tsx';

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
test('home: /student lands on the character sheet with streak, mat hours, card and menu', () => {
  seedNamed([{ date: daysAgo(1) }]);
  const m = mount(<StudentEditionPage />, '/student?student=1');
  assert.ok(q(m.host, '[data-testid="student-home"]'), 'home renders');
  const top = q(m.host, '[data-testid="student-home-top"]')!;
  assert.ok(q(top, '[data-testid="streak-badge"]'), 'streak badge at the top');
  assert.ok(q(top, '[data-testid="home-mat-hours"]'), 'mat hours next to it');
  assert.ok(q(m.host, '[data-testid="mat-hours-frame"]'), 'card layout under it');
  assert.ok(q(m.host, '[data-testid="student-home-menu"]'), 'menu under the card');
  unmount(m);
});

test('home: no profile yet goes to setup first', () => {
  seedNamed([], '');
  const m = mount(<StudentEditionPage />, '/student?student=1');
  assert.equal(q(m.host, '[data-testid="student-home"]') === null, true);
  assert.match(here, /^\/student\/profile\?/);
  assert.match(here, /setup=1/);
  unmount(m);
});

test('home: every former hub item is reachable from the menu; classic hub still works', () => {
  seedNamed();
  const m = mount(<StudentEditionPage />, '/student?student=1');
  const links = [...m.host.querySelectorAll('[data-testid="home-menu-link"]')].map((a) => ({ to: (a.getAttribute('href') ?? '').replace(/^\/?/, '/'), label: a.textContent ?? '' }));
  assert.ok(links.length >= 5);
  for (const item of FORMER_HUB_ITEMS) assert.ok(formerHubItemReachable(item, links), `reachable: ${item.label}`);
  assert.ok(HOME_EXTRA_LINKS.some((l) => l.to === '/student/hub'));
  unmount(m);
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
  assert.match(badge.textContent ?? '', /3/);
  assert.equal(m.host.querySelector('[data-testid="streak-badge"] input, [data-testid="student-home-top"] [role="switch"]') === null, true, 'no hide toggle');
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
  assert.equal(m.host.querySelectorAll('[data-testid="body-legend-row"]').length, 3);
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

// ── Body types ────────────────────────────────────────────────────────────
test('body type: default 1, choice persists, every zone renders on both types', () => {
  seedNamed([{ date: daysAgo(2), injury: { area: 'Left knee', note: '' } }]);
  localStorage.setItem(BODY_SCAN_KEY, 'on');
  assert.equal(readBodyType(localStorage), 1);
  let m = mount(<StudentEditionPage />, '/student?student=1');
  const count = (host: HTMLElement) => new Set([...host.querySelectorAll('[data-testid="body-zone"]')].map((z) => z.getAttribute('data-zone')));
  assert.equal(count(m.host).size, BODY_ZONES.length);
  click(q(m.host, '[data-testid="body-type-2"]')!);
  assert.equal(localStorage.getItem(BODY_TYPE_KEY), '2');
  assert.equal(q(m.host, '[data-testid="body-figure-front"]')!.getAttribute('data-type'), '2');
  assert.equal(count(m.host).size, BODY_ZONES.length);
  unmount(m);
  m = mount(<StudentEditionPage />, '/student?student=1');
  assert.equal(q(m.host, '[data-testid="body-type-2"]')!.getAttribute('aria-pressed'), 'true');
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
