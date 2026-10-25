/**
 * Controls that touch tournaments or events, and the shared list.
 *
 * Competitor (`/student/competitor`):
 * Search competition. Tournament name, date, location, Division, Weight class,
 * Division suggestions, Weight class suggestions, Registration deadline,
 * Tournament link. Considering, Entered, Pounds, Kilograms.
 * Target division weight. Add tournament, Save tournament, Cancel tournament edit.
 * Earlier tournaments. Goal, goal note, Add goal, Mark met, Remove goal.
 * Edit, Remove, Confirm remove, Keep tournament.
 *
 * Calendar month (`/student/calendar`):
 * Previous month, Next month, day buttons, tournament ring.
 * Tournaments list, Competitor page.
 * Show gym class schedule. Gym class schedule.
 * Event date, Event time, Repeat (None, Weekly, Every 2 weeks, Monthly),
 * Event title, Event kind (Class, Open mat, Tournament, Promotion test),
 * Event note, Add event.
 *
 * Calendar day (`/student/calendar/:date`):
 * Day title. Tournaments, tournament link, Remove tournament.
 * Journal card, Start today's page, Start a card for this day.
 * Event row, Remove event. Event title, time, Repeat, Event kind, Event note, Add event.
 * That day is not on the calendar.
 *
 * Results (`/student/results`):
 * Tracked tournament (Not on my list and each shared tournament),
 * Result tournament name, Result division, Add result.
 * Match date, Opponent, Win, Loss, Draw, Points, Sub, Advantage, DQ, Match notes, Add match.
 * Remove match. Bracket round, Bracket name, Add bracket line, Remove bracket line.
 * Bracket photo, Attach bracket photo, Remove bracket photo.
 * Remove result, Confirm remove, Keep result.
 *
 * Handwriting stays on the journal. Primary save buttons stay ink-btn--save.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { writeBracketPhoto } from '../../lib/bracketPhoto.ts';
import { emptyCompetition } from '../../lib/progress/competition.ts';
import { setBracketPhotoFlag } from '../../lib/studentCompetition.ts';
import {
  blankStudentReport,
  loadStudentReport,
  saveStudentReport,
  STUDENT_EDITION_STORAGE_KEY,
  todayIso,
} from '../../lib/studentEdition.ts';
import { GYM_SCHEDULE_STORAGE_KEY } from '../../lib/studentTools.ts';
import { CalendarDayPage, CalendarPage } from './CalendarPages.tsx';
import { CompetitorPage } from './CompetitorPage.tsx';
import { ResultsPage } from './ResultsPage.tsx';
import { ScoutingPage } from './ScoutingPage.tsx';

const dom = new Window({ url: 'http://localhost/student/competitor' });
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
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('DocumentFragment', view.DocumentFragment);
installGlobal('Event', view.Event);
installGlobal('MouseEvent', view.MouseEvent);
installGlobal('KeyboardEvent', view.KeyboardEvent);
installGlobal('InputEvent', view.InputEvent);
installGlobal('FocusEvent', view.FocusEvent);
installGlobal('getComputedStyle', view.getComputedStyle.bind(view));
installGlobal('requestAnimationFrame', view.requestAnimationFrame.bind(view));
installGlobal('cancelAnimationFrame', view.cancelAnimationFrame.bind(view));
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function isoOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function pretty(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function Screen() {
  const { pathname } = useLocation();
  let page: ReactNode;
  if (pathname.startsWith('/student/calendar/') && pathname.length > '/student/calendar/'.length) {
    page = <CalendarDayPage date={decodeURIComponent(pathname.slice('/student/calendar/'.length))} />;
  }   else if (pathname === '/student/calendar') page = <CalendarPage />;
  else if (pathname === '/student/competitor') page = <CompetitorPage />;
  else if (pathname === '/student/results') page = <ResultsPage />;
  else if (pathname === '/student/scouting') page = <ScoutingPage />;
  else page = <p>Left for {pathname}</p>;
  return (
    <>
      <div data-testid="path">{pathname}</div>
      {page}
    </>
  );
}

function mount(path: string): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Screen />
      </MemoryRouter>,
    );
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

function labeled(host: ParentNode, name: string): HTMLElement {
  const found = host.querySelector(`[aria-label="${name}"]`);
  assert.ok(found, name);
  return found as HTMLElement;
}

function control(host: ParentNode, tag: string, name: string): HTMLElement {
  const found = [...host.querySelectorAll(tag)].find((node) => {
    if (node.getAttribute('aria-label') === name) return true;
    return node.textContent?.trim() === name;
  });
  assert.ok(found, name);
  return found as HTMLElement;
}

function click(node: HTMLElement) {
  act(() => {
    node.click();
  });
}

function typeInto(input: HTMLInputElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  proto?.set?.call(input, value);
  act(() => {
    const key = Object.keys(input).find((name) => name.startsWith('__reactProps'));
    const props = key ? (input as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    props?.onChange?.({ target: input, currentTarget: input });
  });
}

function fire(node: HTMLElement, name: 'onFocus' | 'onMouseDown') {
  act(() => {
    const key = Object.keys(node).find((prop) => prop.startsWith('__reactProps'));
    const props = key ? (node as unknown as Record<string, Record<string, (event: unknown) => void>>)[key] : null;
    props?.[name]?.({ target: node, currentTarget: node, preventDefault() {} });
  });
}

function chooseSelect(select: HTMLSelectElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  proto?.set?.call(select, value);
  act(() => {
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function names(report = loadStudentReport(localStorage)) {
  return report.competition?.tournaments.map((tournament) => tournament.name) ?? [];
}

function rowsNamed(root: ParentNode, name: string): HTMLElement[] {
  return [...root.querySelectorAll('li')].filter((node) => node.textContent?.includes(name)) as HTMLElement[];
}

const GYM = JSON.stringify({
  version: 1,
  classes: [{ id: 'c1', kind: 'class', day: 'mon', time: '06:00', title: 'Morning Gi', location: 'MAT 1', subtitle: '' }],
  specials: [],
});

test('competitor tournament controls still add, edit, search, goal, and remove', () => {
  localStorage.clear();
  const mounted = mount('/student/competitor');
  const { host } = mounted;
  for (const name of [
    'Search competition',
    'Tournament name',
    'Tournament date',
    'Tournament location',
    'Division',
    'Weight class',
    'Registration deadline',
    'Tournament link',
    'Target division weight',
  ]) {
    labeled(host, name);
  }
  for (const name of ['Considering', 'Entered', 'Pounds', 'Kilograms', 'Add tournament']) {
    control(host, 'button', name);
  }
  assert.equal(control(host, 'button', 'Considering').getAttribute('aria-pressed'), 'true');
  assert.ok(control(host, 'button', 'Add tournament').classList.contains('ink-btn--save'));

  const division = labeled(host, 'Division');
  fire(division, 'onFocus');
  const divisionList = labeled(host, 'Division suggestions');
  const adult = control(divisionList, 'button', 'Adult');
  fire(adult, 'onMouseDown');
  assert.equal((labeled(host, 'Division') as HTMLInputElement).value, 'Adult');

  const weight = labeled(host, 'Weight class');
  fire(weight, 'onFocus');
  const weightList = labeled(host, 'Weight class suggestions');
  assert.ok(weightList.querySelector('button'));
  typeInto(weight as HTMLInputElement, 'Feather');

  const today = todayIso();
  const past = '2020-01-15';
  typeInto(labeled(host, 'Tournament name') as HTMLInputElement, 'City Open');
  typeInto(labeled(host, 'Tournament date') as HTMLInputElement, today);
  typeInto(labeled(host, 'Tournament location') as HTMLInputElement, 'Atlanta');
  typeInto(labeled(host, 'Registration deadline') as HTMLInputElement, isoOffset(3));
  typeInto(labeled(host, 'Tournament link') as HTMLInputElement, 'https://example.com/city');
  click(control(host, 'button', 'Entered'));
  click(control(host, 'button', 'Kilograms'));
  typeInto(labeled(host, 'Target division weight') as HTMLInputElement, '70');
  click(control(host, 'button', 'Add tournament'));

  assert.ok(host.textContent?.includes('Entered · City Open'));
  assert.ok(host.textContent?.includes('Atlanta'));
  assert.ok(host.textContent?.includes('https://example.com/city'));
  assert.equal(names().includes('City Open'), true);
  assert.equal(loadStudentReport(localStorage).calendar.filter((event) => event.kind === 'other' && event.title === 'City Open').length, 1);

  typeInto(labeled(host, 'Goal for City Open') as HTMLInputElement, 'Pass half guard');
  typeInto(labeled(host, 'Goal note for City Open') as HTMLInputElement, 'knee slice');
  click(control(host, 'button', 'Add goal for City Open'));
  assert.ok(host.textContent?.includes('Pass half guard'));
  click(control(host, 'button', 'Mark Pass half guard met'));
  assert.equal(control(host, 'button', 'Pass half guard met').getAttribute('aria-pressed'), 'true');
  click(control(host, 'button', 'Remove Pass half guard'));
  assert.equal(host.textContent?.includes('Pass half guard'), false);

  click(control(host, 'button', 'Edit City Open'));
  control(host, 'button', 'Save tournament');
  typeInto(labeled(host, 'Tournament name') as HTMLInputElement, 'State Open');
  click(control(host, 'button', 'Cancel tournament edit'));
  assert.ok(host.textContent?.includes('Entered · City Open'));
  assert.equal(host.textContent?.includes('State Open'), false);

  click(control(host, 'button', 'Edit City Open'));
  typeInto(labeled(host, 'Tournament name') as HTMLInputElement, 'State Open');
  typeInto(labeled(host, 'Tournament location') as HTMLInputElement, 'Savannah');
  click(control(host, 'button', 'Save tournament'));
  assert.ok(host.textContent?.includes('Entered · State Open'));
  assert.equal(loadStudentReport(localStorage).calendar.some((event) => event.title === 'State Open' && event.note === 'Savannah'), true);
  assert.equal(loadStudentReport(localStorage).calendar.some((event) => event.title === 'City Open'), false);

  typeInto(labeled(host, 'Search competition') as HTMLInputElement, 'no such meet');
  assert.equal(host.textContent?.includes('Entered · State Open'), false);
  typeInto(labeled(host, 'Search competition') as HTMLInputElement, 'Savannah');
  assert.ok(host.textContent?.includes('Entered · State Open'));
  typeInto(labeled(host, 'Search competition') as HTMLInputElement, '');

  typeInto(labeled(host, 'Tournament name') as HTMLInputElement, 'Old Open');
  typeInto(labeled(host, 'Tournament date') as HTMLInputElement, past);
  click(control(host, 'button', 'Add tournament'));
  const earlier = control(host, 'summary', 'Earlier tournaments');
  assert.ok(earlier.parentElement?.textContent?.includes('Old Open'));

  click(control(host, 'button', 'Remove State Open'));
  labeled(host, 'Remove State Open');
  click(control(host, 'button', 'Keep tournament'));
  assert.ok(host.textContent?.includes('Entered · State Open'));
  click(control(host, 'button', 'Remove State Open'));
  click(control(host, 'button', 'Confirm remove State Open'));
  assert.equal(host.textContent?.includes('State Open'), false);
  assert.equal(names().includes('State Open'), false);
  assert.equal(loadStudentReport(localStorage).calendar.some((event) => event.title === 'State Open'), false);
  assert.equal(names().includes('Old Open'), true);
  unmount(mounted);
});

test('calendar event controls still move months, add each kind, and remove', () => {
  localStorage.clear();
  localStorage.setItem(GYM_SCHEDULE_STORAGE_KEY, GYM);
  const today = todayIso();
  const other = isoOffset(2);
  const mounted = mount('/student/calendar');
  const { host } = mounted;
  const monthText = host.querySelector('.cal-nav__label')?.textContent;
  click(control(host, 'button', 'Next month'));
  assert.notEqual(host.querySelector('.cal-nav__label')?.textContent, monthText);
  click(control(host, 'button', 'Previous month'));
  assert.equal(host.querySelector('.cal-nav__label')?.textContent, monthText);
  assert.ok(host.querySelector('[aria-current="date"]'));

  const gym = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
  click(gym);
  assert.ok(labeled(host, 'Gym class schedule').textContent?.includes('Morning Gi'));

  for (const name of ['Event date', 'Event time', 'Event title', 'Event note', 'Repeat', 'Event kind']) {
    labeled(host, name);
  }
  for (const name of ['None', 'Weekly', 'Every 2 weeks', 'Monthly', 'Class', 'Open mat', 'Tournament', 'Promotion test', 'Add event']) {
    control(host, 'button', name);
  }
  assert.ok(control(host, 'button', 'Add event').classList.contains('ink-btn--save'));

  typeInto(labeled(host, 'Event date') as HTMLInputElement, other);
  typeInto(labeled(host, 'Event time') as HTMLInputElement, '18:30');
  click(control(host, 'button', 'Weekly'));
  typeInto(labeled(host, 'Event title') as HTMLInputElement, 'Evening rounds');
  typeInto(labeled(host, 'Event note') as HTMLInputElement, 'gi');
  click(control(host, 'button', 'Open mat'));
  click(control(host, 'button', 'Add event'));
  const openMat = loadStudentReport(localStorage).calendar.find((event) => event.title === 'Evening rounds');
  assert.equal(openMat?.kind, 'training');
  assert.equal(openMat?.time, '18:30');
  assert.equal(openMat?.repeat, 'weekly');
  assert.equal(names().includes('Evening rounds'), false);

  typeInto(labeled(host, 'Event date') as HTMLInputElement, other);
  typeInto(labeled(host, 'Event title') as HTMLInputElement, 'Promotion day');
  click(control(host, 'button', 'Promotion test'));
  click(control(host, 'button', 'Add event'));
  typeInto(labeled(host, 'Event date') as HTMLInputElement, other);
  typeInto(labeled(host, 'Event title') as HTMLInputElement, 'Fundamentals');
  click(control(host, 'button', 'Class'));
  click(control(host, 'button', 'Add event'));
  assert.equal(names().includes('Promotion day'), false);
  assert.equal(names().includes('Fundamentals'), false);

  const dayLabel = `${pretty(other)}, calendar event`;
  if (!host.querySelector(`[aria-label="${dayLabel}"]`)) click(control(host, 'button', 'Next month'));
  click(labeled(host, dayLabel));
  assert.equal(host.querySelector('[data-testid="path"]')?.textContent, `/student/calendar/${other}`);
  assert.ok(host.textContent?.includes('Open mat · Evening rounds'));
  assert.ok(host.textContent?.includes('6:30 PM'));
  assert.ok(host.textContent?.includes('Weekly from'));
  assert.equal(host.querySelector('[aria-label="Event date"]'), null);
  labeled(host, 'Event title');
  labeled(host, 'Event time');
  labeled(host, 'Event note');
  assert.ok(host.textContent?.includes('No journal card on this day.'));
  assert.equal(control(host, 'a', 'Start a card for this day').getAttribute('href'), `/student/journal?date=${other}`);

  click(labeled(host, 'Remove Evening rounds'));
  click(labeled(host, 'Remove Promotion day'));
  click(labeled(host, 'Remove Fundamentals'));
  assert.equal(loadStudentReport(localStorage).calendar.length, 0);
  assert.equal(host.textContent?.includes('Evening rounds'), false);

  const fresh = mount('/student/calendar');
  click(fresh.host.querySelector('[aria-current="date"]') as HTMLElement);
  assert.equal(fresh.host.querySelector('[data-testid="path"]')?.textContent, '/student/journal');
  unmount(fresh);
  unmount(mounted);

  const invalid = mount('/student/calendar/not-a-day');
  assert.ok(invalid.host.textContent?.includes('That day is not on the calendar.'));
  unmount(invalid);
});

test('results controls still pick a tournament and record a match, bracket, and photo flag', () => {
  localStorage.clear();
  const today = todayIso();
  let report = blankStudentReport(4);
  report = {
    ...report,
    competition: {
      ...emptyCompetition(),
      tournaments: [
        {
          id: 'meet-city',
          name: 'City Open',
          date: today,
          location: 'Atlanta',
          division: 'Adult',
          weightClass: 'Feather',
          deadline: '',
          link: '',
          status: 'entered',
          targetWeight: null,
          targetUnit: 'lb',
          goals: [],
        },
      ],
    },
  };
  saveStudentReport(localStorage, report);
  const mounted = mount('/student/results');
  const { host } = mounted;
  const picker = labeled(host, 'Tracked tournament') as HTMLSelectElement;
  assert.deepEqual([...picker.options].map((option) => option.text), ['Not on my list', 'City Open']);
  labeled(host, 'Result tournament name');
  labeled(host, 'Result division');
  assert.ok(control(host, 'button', 'Add result').classList.contains('ink-btn--save'));
  const city = [...picker.options].find((option) => option.text === 'City Open');
  assert.equal(city?.value, 'meet-city');
  chooseSelect(picker, city?.value ?? '');
  assert.equal((labeled(host, 'Result tournament name') as HTMLInputElement).value, 'City Open');
  assert.equal((labeled(host, 'Result division') as HTMLInputElement).value, 'Adult · Feather');
  click(control(host, 'button', 'Add result'));
  assert.ok(host.textContent?.includes('City Open'));

  labeled(host, 'Match date for City Open');
  labeled(host, 'Opponent for City Open');
  labeled(host, 'Match notes for City Open');
  for (const name of ['Win', 'Loss', 'Draw', 'Points', 'Sub', 'Advantage', 'DQ']) {
    control(host, 'button', name);
  }
  click(control(host, 'button', 'Loss'));
  click(control(host, 'button', 'Sub'));
  typeInto(labeled(host, 'Opponent for City Open') as HTMLInputElement, 'Jo');
  typeInto(labeled(host, 'Match notes for City Open') as HTMLInputElement, 'closed guard');
  click(control(host, 'button', 'Add match for City Open'));
  assert.ok(host.textContent?.includes('Loss · Jo'));
  click(control(host, 'button', 'Remove match Jo'));
  assert.equal(host.textContent?.includes('Loss · Jo'), false);

  labeled(host, 'Bracket round for City Open');
  labeled(host, 'Bracket name for City Open');
  typeInto(labeled(host, 'Bracket round for City Open') as HTMLInputElement, 'Final');
  typeInto(labeled(host, 'Bracket name for City Open') as HTMLInputElement, 'Riley');
  click(control(host, 'button', 'Add bracket line for City Open'));
  assert.ok(host.textContent?.includes('Final'));
  click(control(host, 'button', 'Remove Riley'));
  assert.equal(host.textContent?.includes('Riley'), false);

  const photo = labeled(host, 'Bracket photo for City Open') as HTMLInputElement;
  assert.equal(photo.getAttribute('type'), 'file');
  assert.equal(photo.getAttribute('accept'), 'image/*');
  assert.ok(host.textContent?.includes('Attach bracket photo'));
  unmount(mounted);

  const loaded = loadStudentReport(localStorage);
  const resultId = loaded.competition?.results[0].id ?? '';
  writeBracketPhoto(resultId, 'data:image/png;base64,aaaa');
  saveStudentReport(localStorage, setBracketPhotoFlag(loaded, resultId, true));
  const withPhoto = mount('/student/results');
  assert.ok(withPhoto.host.querySelector('img.bracket-photo'));
  click(control(withPhoto.host, 'button', 'Remove bracket photo for City Open'));
  assert.equal(withPhoto.host.querySelector('img.bracket-photo'), null);
  assert.equal(loadStudentReport(localStorage).competition?.results[0].bracketPhoto, false);

  click(control(withPhoto.host, 'button', 'Remove City Open'));
  labeled(withPhoto.host, 'Remove City Open result');
  click(control(withPhoto.host, 'button', 'Keep result'));
  assert.ok(withPhoto.host.textContent?.includes('City Open'));
  click(control(withPhoto.host, 'button', 'Remove City Open'));
  click(control(withPhoto.host, 'button', 'Confirm remove City Open'));
  assert.equal(loadStudentReport(localStorage).competition?.results.length, 0);
  assert.equal(names().includes('City Open'), true);
  unmount(withPhoto);
});

test('a tournament entered on competitor shows once on the calendar and in results', () => {
  localStorage.clear();
  const today = todayIso();
  const mounted = mount('/student/competitor');
  typeInto(labeled(mounted.host, 'Tournament name') as HTMLInputElement, 'City Open');
  typeInto(labeled(mounted.host, 'Tournament date') as HTMLInputElement, today);
  typeInto(labeled(mounted.host, 'Tournament location') as HTMLInputElement, 'Atlanta');
  click(control(mounted.host, 'button', 'Add tournament'));
  unmount(mounted);

  const calendar = mount('/student/calendar');
  const list = labeled(calendar.host, 'Tournaments');
  assert.equal(rowsNamed(list, 'City Open').length, 1);
  assert.equal(calendar.host.querySelector('[data-tournament="true"] .cal-dot--tournament') !== null, true);
  assert.equal(control(list, 'a', 'Competitor page').getAttribute('href'), '/student/competitor');
  click(labeled(calendar.host, `${pretty(today)}, tournament`));
  const dayList = labeled(calendar.host, 'Tournaments');
  assert.equal(rowsNamed(dayList, 'City Open').length, 1);
  assert.equal(calendar.host.querySelector('.cal-events'), null);
  assert.ok(calendar.host.textContent?.includes('Atlanta'));
  unmount(calendar);

  const results = mount('/student/results');
  const picker = labeled(results.host, 'Tracked tournament') as HTMLSelectElement;
  assert.equal([...picker.options].some((option) => option.text === 'City Open'), true);
  unmount(results);

  const edit = mount('/student/competitor');
  click(control(edit.host, 'button', 'Edit City Open'));
  typeInto(labeled(edit.host, 'Tournament name') as HTMLInputElement, 'State Open');
  click(control(edit.host, 'button', 'Save tournament'));
  unmount(edit);

  const renamed = mount(`/student/calendar/${today}`);
  assert.ok(renamed.host.textContent?.includes('State Open'));
  assert.equal(renamed.host.textContent?.includes('City Open'), false);
  click(labeled(renamed.host, 'Remove State Open'));
  unmount(renamed);

  assert.equal(names().includes('State Open'), false);
  const after = mount('/student/results');
  const afterPicker = labeled(after.host, 'Tracked tournament') as HTMLSelectElement;
  assert.equal([...afterPicker.options].some((option) => option.text === 'State Open'), false);
  unmount(after);
});

test('a calendar tournament shows on competitor and results, and a second add does not duplicate it', () => {
  localStorage.clear();
  const today = todayIso();
  const mounted = mount('/student/calendar');
  typeInto(labeled(mounted.host, 'Event date') as HTMLInputElement, today);
  typeInto(labeled(mounted.host, 'Event time') as HTMLInputElement, '09:30');
  typeInto(labeled(mounted.host, 'Event title') as HTMLInputElement, 'Pan Kids');
  typeInto(labeled(mounted.host, 'Event note') as HTMLInputElement, 'Atlanta');
  click(control(mounted.host, 'button', 'Tournament'));
  assert.equal(control(mounted.host, 'button', 'Tournament').getAttribute('aria-pressed'), 'true');
  click(control(mounted.host, 'button', 'Add event'));
  click(control(mounted.host, 'button', 'Tournament'));
  typeInto(labeled(mounted.host, 'Event title') as HTMLInputElement, 'Pan Kids');
  typeInto(labeled(mounted.host, 'Event date') as HTMLInputElement, today);
  typeInto(labeled(mounted.host, 'Event note') as HTMLInputElement, 'bring gi');
  click(control(mounted.host, 'button', 'Add event'));
  unmount(mounted);

  assert.equal(names().filter((name) => name === 'Pan Kids').length, 1);
  const stored = loadStudentReport(localStorage);
  assert.equal(stored.calendar.filter((event) => event.kind === 'other' && event.title === 'Pan Kids').length, 1);
  assert.equal(stored.calendar.find((event) => event.title === 'Pan Kids')?.time, '09:30');

  const competitor = mount('/student/competitor');
  assert.equal(rowsNamed(competitor.host, 'Pan Kids').length, 1);
  assert.ok(competitor.host.textContent?.includes('Atlanta'));
  unmount(competitor);

  const day = mount(`/student/calendar/${today}`);
  assert.equal(rowsNamed(labeled(day.host, 'Tournaments'), 'Pan Kids').length, 1);
  assert.ok(day.host.textContent?.includes('9:30 AM'));
  assert.equal(day.host.querySelector('.cal-events')?.textContent?.includes('Pan Kids') ?? false, false);
  unmount(day);

  const results = mount('/student/results');
  const picker = labeled(results.host, 'Tracked tournament') as HTMLSelectElement;
  assert.equal([...picker.options].filter((option) => option.text === 'Pan Kids').length, 1);
  unmount(results);
});

test('a saved file migrates both lists without dropping a goal, a class, or a distinct meet', () => {
  localStorage.clear();
  const today = todayIso();
  const report = blankStudentReport(8);
  report.competition = {
    ...emptyCompetition(),
    tournaments: [
      {
        id: 'meet-spring',
        name: 'Spring Open',
        date: '2099-04-04',
        location: 'Atlanta',
        division: 'Adult Blue',
        weightClass: 'Feather',
        deadline: '2099-03-01',
        link: 'https://example.com/spring',
        status: 'entered',
        targetWeight: 170,
        targetUnit: 'lb',
        goals: [{ id: 'goal-1', name: 'Pass', note: 'knee slice', met: false }],
      },
    ],
    results: [
      {
        id: 'result-1',
        tournamentId: 'meet-spring',
        tournamentName: 'Spring Open',
        division: 'Adult Blue',
        matches: [],
        bracket: [],
        bracketPhoto: false,
      },
    ],
  };
  report.calendar = [
    { id: 'cal-pan', date: today, title: 'Pan Kids', kind: 'other', note: 'gym lobby' },
    { id: 'cal-spring', date: '2099-04-04', title: 'spring open', kind: 'other', note: 'bring cash', time: '09:30' },
    { id: 'class-1', date: today, title: 'Fundamentals', kind: 'class', note: 'gi' },
  ];
  localStorage.setItem(STUDENT_EDITION_STORAGE_KEY, JSON.stringify(report));

  const competitor = mount('/student/competitor');
  assert.equal(rowsNamed(competitor.host, 'Spring Open').length, 1);
  assert.equal(rowsNamed(competitor.host, 'Pan Kids').length, 1);
  assert.ok(competitor.host.textContent?.includes('Pass'));
  assert.ok(competitor.host.textContent?.includes('knee slice'));
  assert.equal(competitor.host.textContent?.includes('Fundamentals'), false);
  unmount(competitor);

  const loaded = loadStudentReport(localStorage);
  assert.equal(loaded.competition?.tournaments.length, 2);
  assert.equal(loaded.competition?.tournaments.find((tournament) => tournament.id === 'meet-spring')?.goals[0].name, 'Pass');
  assert.equal(loaded.competition?.results[0].tournamentId, 'meet-spring');
  assert.equal(loaded.calendar.filter((event) => event.kind === 'class' && event.title === 'Fundamentals').length, 1);
  assert.equal(loaded.calendar.filter((event) => event.kind === 'other' && event.tournamentId === 'meet-spring').length, 1);

  const day = mount(`/student/calendar/${today}`);
  assert.equal(rowsNamed(labeled(day.host, 'Tournaments'), 'Pan Kids').length, 1);
  assert.ok(day.host.textContent?.includes('Class · Fundamentals'));
  assert.equal(day.host.querySelector('.cal-events')?.textContent?.includes('Pan Kids') ?? false, false);
  unmount(day);

  const spring = mount('/student/calendar/2099-04-04');
  const springList = labeled(spring.host, 'Tournaments');
  assert.equal(rowsNamed(springList, 'Spring Open').length, 1);
  assert.ok(springList.textContent?.includes('bring cash'));
  assert.ok(springList.textContent?.includes('9:30 AM'));
  assert.ok(springList.textContent?.includes('https://example.com/spring'));
  unmount(spring);

  const results = mount('/student/results');
  const picker = labeled(results.host, 'Tracked tournament') as HTMLSelectElement;
  const options = [...picker.options].map((option) => option.text);
  assert.equal(options.filter((text) => text === 'Spring Open').length, 1);
  assert.equal(options.filter((text) => text === 'Pan Kids').length, 1);
  unmount(results);
});

test('division and weight suggestions filter, a custom entry is kept, and a miss explains itself', () => {
  localStorage.clear();
  const mounted = mount('/student/competitor');
  const { host } = mounted;
  const division = labeled(host, 'Division') as HTMLInputElement;
  fire(division, 'onFocus');
  const divisionList = labeled(host, 'Division suggestions');
  for (const name of ['Juvenile', 'Adult', 'Master 1', 'Mighty Mite 1', 'Black', 'No-Gi']) {
    control(divisionList, 'button', name);
  }
  const openNames = [...divisionList.querySelectorAll('[role="option"]')].map((node) => node.getAttribute('aria-label'));
  assert.ok(openNames.length > 2);
  assert.equal(openNames.every((name) => name === 'Black' || name === 'Master'), false);

  typeInto(division, 'mast');
  const masters = labeled(host, 'Division suggestions');
  control(masters, 'button', 'Master 1');
  assert.equal([...masters.querySelectorAll('[role="option"]')].some((node) => node.getAttribute('aria-label') === 'Adult'), false);
  assert.equal([...masters.querySelectorAll('[role="option"]')].some((node) => node.getAttribute('aria-label') === 'Mighty Mite 1'), false);

  typeInto(division, 'zzzz-div');
  assert.equal(host.querySelector('[aria-label="Division suggestions"]'), null);
  assert.match(host.textContent ?? '', /No matches\. Your text is saved as typed\./);
  assert.equal(division.value, 'zzzz-div');

  const weight = labeled(host, 'Weight class') as HTMLInputElement;
  fire(weight, 'onFocus');
  const weightList = labeled(host, 'Weight class suggestions');
  for (const name of ['Rooster', 'Ultra Heavy', 'Open Class', 'Male Rooster', 'Female Rooster', 'Kids Rooster']) {
    control(weightList, 'button', name);
  }
  assert.match(control(weightList, 'button', 'Rooster').textContent ?? '', /57\.5 kg/);
  assert.match(control(weightList, 'button', 'Male Rooster').textContent ?? '', /57\.5 kg \/ 126\.8 lb/);
  assert.match(control(weightList, 'button', 'Female Rooster').textContent ?? '', /48\.5 kg \/ 106\.9 lb/);

  typeInto(weight, 'ultra');
  const ultras = labeled(host, 'Weight class suggestions');
  control(ultras, 'button', 'Ultra Heavy');
  assert.equal([...ultras.querySelectorAll('[role="option"]')].some((node) => node.getAttribute('aria-label') === 'Heavy'), false);

  typeInto(weight, 'female feather');
  control(labeled(host, 'Weight class suggestions'), 'button', 'Female Feather');
  typeInto(weight, 'mighty mite 1 rooster');
  const kids = labeled(host, 'Weight class suggestions');
  assert.ok([...kids.querySelectorAll('[role="option"]')].some((node) => node.getAttribute('aria-label') === 'Mighty Mite 1 Rooster'));
  assert.match(control(kids, 'button', 'Mighty Mite 1 Rooster').textContent ?? '', /26 lb/);

  typeInto(division, 'House League');
  typeInto(weight, 'zzzz-weight');
  assert.equal(host.querySelector('[aria-label="Weight class suggestions"]'), null);
  assert.match(host.textContent ?? '', /No matches\. Your text is saved as typed\./);
  assert.equal((labeled(host, 'Weight class') as HTMLInputElement).value, 'zzzz-weight');

  const today = todayIso();
  typeInto(labeled(host, 'Tournament name') as HTMLInputElement, 'Custom Open');
  typeInto(labeled(host, 'Tournament date') as HTMLInputElement, today);
  click(control(host, 'button', 'Add tournament'));
  assert.ok(host.textContent?.includes('House League · zzzz-weight'));
  const stored = loadStudentReport(localStorage).competition?.tournaments.find((tournament) => tournament.name === 'Custom Open');
  assert.equal(stored?.division, 'House League');
  assert.equal(stored?.weightClass, 'zzzz-weight');
  unmount(mounted);

  const scouting = mount('/student/scouting');
  const opponentWeight = labeled(scouting.host, 'Opponent weight class') as HTMLInputElement;
  fire(opponentWeight, 'onFocus');
  const opponentList = labeled(scouting.host, 'Opponent weight class suggestions');
  control(opponentList, 'button', 'Rooster');
  control(opponentList, 'button', 'Kids Rooster');
  typeInto(opponentWeight, 'My class');
  assert.equal(opponentWeight.value, 'My class');
  assert.match(scouting.host.textContent ?? '', /No matches\. Your text is saved as typed\./);
  unmount(scouting);
});
