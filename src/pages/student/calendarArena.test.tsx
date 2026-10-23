/**
 * Calendar controls the quiet dark restyle has to keep.
 *
 * Touched controls, month:
 * Back. Hold for Home. Home. Calendar.
 * Previous month. Next month. Month name. Weekday letters. Day buttons.
 * Legend. Tournaments. Competitor page.
 * Show gym class schedule. Gym class schedule.
 * Add an event. Event date. Event title. Event kind (Class, Open mat,
 * Tournament, Promotion test). Event note. Add event.
 *
 * Touched controls, day:
 * Day title. My rank. My rank link. Tournaments. Tournament link.
 * Competitor page. Journal card. Start today's page. Start a card for this day.
 * Remove {title}. Add an event. Event title. Event kind. Event note. Add event.
 * That day is not on the calendar.
 *
 * There is no edit-existing-event control. The draft fields are edited
 * before Add. Remove deletes one stored event.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { addTournament } from '../../lib/studentCompetition.ts';
import {
  addJournalEntry,
  blankStudentReport,
  saveStudentReport,
  STUDENT_EDITION_STORAGE_KEY,
} from '../../lib/studentEdition.ts';
import { setRankAwardedOn, setRankBelt } from '../../lib/studentRank.ts';
import { GYM_SCHEDULE_STORAGE_KEY } from '../../lib/studentTools.ts';
import { CalendarDayPage, CalendarPage } from './CalendarPages.tsx';

const dom = new Window({ url: 'http://localhost/student/calendar' });
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

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function isoOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function Screen() {
  const { pathname } = useLocation();
  let page: ReactNode;
  if (pathname.startsWith('/student/calendar/') && pathname.length > '/student/calendar/'.length) {
    page = <CalendarDayPage date={decodeURIComponent(pathname.slice('/student/calendar/'.length))} />;
  } else if (pathname === '/student/calendar') {
    page = <CalendarPage />;
  } else {
    page = <p>Left calendar for {pathname}</p>;
  }
  return (
    <>
      <div data-testid="path">{pathname}</div>
      {page}
    </>
  );
}

function mount(path = '/student/calendar'): { root: Root; host: HTMLElement } {
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
  const found = [...host.querySelectorAll(tag)].find((node) => node.textContent?.trim() === name);
  assert.ok(found, name);
  return found as HTMLElement;
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

function storedReport(): {
  calendar: { id: string; date: string; title: string; kind: string; note: string }[];
  journal: { date: string }[];
  competition?: { tournaments: { name: string }[] };
  rank?: { awardedOn: string };
} {
  return JSON.parse(localStorage.getItem(STUDENT_EDITION_STORAGE_KEY) ?? '{}');
}

const GYM = JSON.stringify({
  version: 1,
  classes: [{ id: 'c1', kind: 'class', day: 'mon', time: '06:00', title: 'Morning Gi', location: 'MAT 1', subtitle: '' }],
  specials: [],
});

test('calendar keeps every control on the dark arena surface', () => {
  localStorage.clear();
  const today = todayIso();
  const meet = isoOffset(12);
  let report = addJournalEntry(
    blankStudentReport(10),
    {
      date: today,
      className: 'Fundamentals',
      gameTag: 'a',
      techniques: [{ id: 'sweep.scissor', name: 'Scissor sweep' }],
      partners: '',
      drills: '',
      rolls: '',
      notes: 'grip the collar deeper',
    },
    10,
  );
  report = setRankAwardedOn(setRankBelt(report, 'blue', 11), today, 12);
  report = addTournament(
    report,
    {
      name: 'Spring Open',
      date: meet,
      location: 'Atlanta',
      division: 'Adult Blue',
      deadline: '',
      link: 'https://example.com/spring',
      status: 'entered',
      targetWeight: '',
      targetUnit: 'lb',
    },
    13,
  );
  saveStudentReport(localStorage, report);
  localStorage.setItem(GYM_SCHEDULE_STORAGE_KEY, GYM);

  const mounted = mount();
  const { host } = mounted;
  const main = host.querySelector('main');
  assert.ok(main?.classList.contains('student--arena'));
  assert.ok(main?.classList.contains('student--fundamentals'));
  assert.ok(main?.classList.contains('student--calendar'));
  assert.equal(host.querySelector('h1')?.textContent, 'Calendar');
  assert.equal(labeled(host, 'Back. Hold for Home.').getAttribute('href'), '/student');
  assert.equal(labeled(host, 'Home').getAttribute('href'), '/');
  control(host, 'button', 'Previous month');
  control(host, 'button', 'Next month');
  const month = host.querySelector('.cal-nav__label');
  assert.ok(month?.textContent);
  const monthText = month.textContent;
  act(() => {
    control(host, 'button', 'Next month').click();
  });
  assert.notEqual(host.querySelector('.cal-nav__label')?.textContent, monthText);
  act(() => {
    control(host, 'button', 'Previous month').click();
  });
  assert.equal(host.querySelector('.cal-nav__label')?.textContent, monthText);

  const todayButton = host.querySelector('[aria-current="date"]');
  assert.ok(todayButton);
  assert.equal(todayButton.getAttribute('data-journal'), 'true');
  assert.equal(todayButton.getAttribute('data-rank'), 'true');
  assert.match(todayButton.getAttribute('aria-label') ?? '', /journal entry/);
  assert.match(todayButton.getAttribute('aria-label') ?? '', /belt/);
  assert.ok(host.textContent?.includes('A filled dot is a journal entry.'));

  const tournaments = labeled(host, 'Tournaments');
  assert.ok(tournaments.textContent?.includes('Entered · Spring Open'));
  assert.equal(control(tournaments, 'a', 'Competitor page').getAttribute('href'), '/student/competitor');

  const gymToggle = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
  assert.ok(gymToggle);
  act(() => {
    gymToggle.click();
  });
  assert.ok(host.textContent?.includes('Monday · 6:00 AM · Morning Gi'));
  assert.ok(host.textContent?.includes('It is not saved in your progress file.'));
  assert.equal(localStorage.getItem(GYM_SCHEDULE_STORAGE_KEY), GYM);
  assert.equal(localStorage.getItem(STUDENT_EDITION_STORAGE_KEY)?.includes('Morning Gi'), false);

  labeled(host, 'Event date');
  labeled(host, 'Event title');
  labeled(host, 'Event note');
  labeled(host, 'Event kind');
  for (const name of ['Class', 'Open mat', 'Tournament', 'Promotion test', 'Add event']) {
    control(host, 'button', name);
  }
  assert.equal(control(host, 'button', 'Class').getAttribute('aria-pressed'), 'true');
  unmount(mounted);
});

test('editing the add-event draft, adding, and removing keep the stored calendar shape', () => {
  localStorage.clear();
  const today = todayIso();
  const other = isoOffset(3);
  saveStudentReport(
    localStorage,
    addJournalEntry(
      blankStudentReport(10),
      {
        date: today,
        className: 'Fundamentals',
        gameTag: 'a',
        techniques: [],
        partners: '',
        drills: '',
        rolls: '',
        notes: 'grip the collar deeper',
      },
      10,
    ),
  );
  const beforeKeys = Object.keys(storedReport()).sort();

  const mounted = mount();
  const { host } = mounted;
  const date = labeled(host, 'Event date') as HTMLInputElement;
  const title = labeled(host, 'Event title') as HTMLInputElement;
  const note = labeled(host, 'Event note') as HTMLInputElement;
  typeInto(title, '   ');
  act(() => {
    control(host, 'button', 'Add event').click();
  });
  assert.equal(host.querySelector('[role="alert"]')?.textContent, 'Add a title.');
  assert.equal(storedReport().calendar.length, 0);

  typeInto(date, other);
  typeInto(title, 'Saturday open mat');
  typeInto(note, 'no-gi rounds');
  act(() => {
    control(host, 'button', 'Open mat').click();
  });
  assert.equal(control(host, 'button', 'Open mat').getAttribute('aria-pressed'), 'true');
  assert.equal(control(host, 'button', 'Class').getAttribute('aria-pressed'), 'false');
  act(() => {
    control(host, 'button', 'Promotion test').click();
  });
  assert.equal(control(host, 'button', 'Promotion test').getAttribute('aria-pressed'), 'true');
  act(() => {
    control(host, 'button', 'Add event').click();
  });

  const added = storedReport();
  assert.deepEqual(Object.keys(added).sort(), beforeKeys);
  assert.equal(added.calendar.length, 1);
  assert.deepEqual(Object.keys(added.calendar[0]).sort(), ['date', 'id', 'kind', 'note', 'title']);
  assert.equal(added.calendar[0].date, other);
  assert.equal(added.calendar[0].title, 'Saturday open mat');
  assert.equal(added.calendar[0].kind, 'promotion');
  assert.equal(added.calendar[0].note, 'no-gi rounds');
  assert.equal(added.journal[0].date, today);
  assert.equal(localStorage.getItem(STUDENT_EDITION_STORAGE_KEY)?.includes(STUDENT_EDITION_STORAGE_KEY), false);
  const keptId = added.calendar[0].id;

  const [year, month, day] = other.split('-').map(Number);
  const pretty = new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  act(() => {
    labeled(host, `${pretty}, calendar event`).click();
  });
  assert.equal(host.querySelector('[data-testid="path"]')?.textContent, `/student/calendar/${other}`);
  assert.ok(host.textContent?.includes('Promotion test · Saturday open mat'));
  assert.ok(host.textContent?.includes('no-gi rounds'));
  assert.ok(host.textContent?.includes('No journal card on this day.'));
  assert.equal(control(host, 'a', 'Start a card for this day').getAttribute('href'), `/student/journal?date=${other}`);
  assert.equal(host.querySelector('[aria-label="Event date"]'), null);

  const dayTitle = labeled(host, 'Event title') as HTMLInputElement;
  const dayNote = labeled(host, 'Event note') as HTMLInputElement;
  typeInto(dayTitle, 'Private lesson');
  typeInto(dayNote, 'collar drill');
  act(() => {
    control(host, 'button', 'Class').click();
  });
  assert.equal(control(host, 'button', 'Class').getAttribute('aria-pressed'), 'true');
  act(() => {
    control(host, 'button', 'Add event').click();
  });
  const both = storedReport();
  assert.equal(both.calendar.length, 2);
  assert.equal(both.calendar[0].id, keptId);
  assert.equal(both.calendar[0].kind, 'promotion');
  assert.equal(both.calendar[0].note, 'no-gi rounds');
  assert.equal(both.calendar[1].title, 'Private lesson');
  assert.equal(both.calendar[1].kind, 'class');
  assert.equal(both.calendar[1].note, 'collar drill');
  assert.equal(both.calendar[1].date, other);
  assert.deepEqual(Object.keys(both.calendar[1]).sort(), ['date', 'id', 'kind', 'note', 'title']);

  act(() => {
    labeled(host, 'Remove Saturday open mat').click();
  });
  const left = storedReport();
  assert.equal(left.calendar.length, 1);
  assert.equal(left.calendar[0].title, 'Private lesson');
  assert.equal(left.calendar[0].kind, 'class');
  assert.equal(left.calendar[0].note, 'collar drill');
  assert.equal(left.calendar[0].date, other);
  assert.equal(left.journal[0].date, today);
  assert.equal(host.textContent?.includes('Saturday open mat'), false);
  unmount(mounted);

  const invalid = mount('/student/calendar/not-a-day');
  assert.ok(invalid.host.textContent?.includes('That day is not on the calendar.'));
  assert.equal(invalid.host.querySelector('h1')?.textContent, 'Calendar');
  unmount(invalid);

  localStorage.clear();
  saveStudentReport(localStorage, blankStudentReport(10));
  const empty = mount();
  const todayButton = empty.host.querySelector('[aria-current="date"]');
  assert.ok(todayButton);
  act(() => {
    (todayButton as HTMLElement).click();
  });
  assert.equal(empty.host.querySelector('[data-testid="path"]')?.textContent, '/student/journal');
  assert.ok(empty.host.textContent?.includes('Left calendar for /student/journal'));
  unmount(empty);
});
