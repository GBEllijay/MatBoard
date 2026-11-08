/**
 * Podium photos hang off the competition result id.
 * A match edit, another result, and another student do not move them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { addCompetitionMatch, addCompetitionResult } from '../../lib/studentCompetition.ts';
import { blankStudentReport, loadStudentReport, saveStudentReport } from '../../lib/studentEdition.ts';
import { PODIUM_PHOTO_KEY, addPodiumPhoto, podiumPhotos } from '../../lib/podiumPhotos.ts';
import { CardMedals } from './StudentCardLayout.tsx';
import { ResultsPage } from './ResultsPage.tsx';

const dom = new Window({ url: 'http://localhost/student/results' });
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
installGlobal('HTMLButtonElement', view.HTMLButtonElement);
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('Event', view.Event);
installGlobal('MouseEvent', view.MouseEvent);
installGlobal('KeyboardEvent', view.KeyboardEvent);
installGlobal('navigator', view.navigator);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const SPRING = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SPRING_2 = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const OTHER = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=';

function labeled(label: string): HTMLElement {
  const found = [...document.querySelectorAll('[aria-label]')].find((node) => node.getAttribute('aria-label') === label);
  assert.ok(found instanceof HTMLElement, `missing control: ${label}`);
  return found;
}

function mount(node: ReactNode): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={['/student/results']}>{node}</MemoryRouter>);
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

test.beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
});

test('a result keeps its podium photos through a match edit, and the next result stays empty', async () => {
  let report = addCompetitionResult(blankStudentReport(4), { tournamentId: '', tournamentName: 'Spring Open', division: 'Adult Blue' }, 5);
  const spring = report.competition?.results[0]?.id ?? '';
  report = addCompetitionMatch(report, spring, { opponent: 'Sam', result: 'win', method: 'points', note: '' }, 6);
  report = addCompetitionResult(report, { tournamentId: '', tournamentName: 'Fall Open', division: 'Adult Blue' }, 7);
  const fall = report.competition?.results[1]?.id ?? '';
  saveStudentReport(localStorage, report);
  addPodiumPhoto(report.studentId, spring, SPRING);
  addPodiumPhoto(report.studentId, spring, SPRING_2);
  addPodiumPhoto('other-student', spring, OTHER);

  const mounted = mount(<ResultsPage />);
  try {
    const stack = labeled('Open Spring Open podium photos, 2 photos');
    assert.equal(stack.nextElementSibling?.classList.contains('photo'), true);
    assert.equal(stack.querySelector('.rank-photo-stack__card--front')?.getAttribute('src'), SPRING);
    assert.equal(stack.querySelector('.rank-photo-stack__card--mid')?.getAttribute('src'), SPRING_2);
    assert.equal(document.querySelector(`[data-result="${fall}"] .rank-photo-stack`), null);
    assert.ok(document.querySelector(`[data-result="${fall}"] .photo`));
    await click(stack);
    const dialog = document.querySelector('[aria-label="Spring Open podium gallery"]');
    assert.ok(dialog instanceof HTMLElement);
    assert.equal(dialog.querySelector('.rank-gallery__stage')?.getAttribute('src'), SPRING);
    for (const img of dialog.querySelectorAll('img')) {
      assert.notEqual(img.getAttribute('src'), OTHER);
      assert.notEqual(img.getAttribute('src'), undefined);
    }
    assert.equal([...dialog.querySelectorAll('img')].some((img) => img.getAttribute('src') === OTHER), false);
  } finally {
    unmount(mounted);
  }

  report = addCompetitionMatch(loadStudentReport(localStorage), spring, { opponent: 'Jo', result: 'win', method: 'sub', note: '' }, 8);
  saveStudentReport(localStorage, report);
  const again = mount(<ResultsPage />);
  try {
    assert.equal(labeled('Open Spring Open podium photos, 2 photos').querySelector('.rank-photo-stack__card--front')?.getAttribute('src'), SPRING);
    assert.equal(loadStudentReport(localStorage).competition?.results[0]?.id, spring);
    assert.match(loadStudentReport(localStorage).competition?.results[0]?.matches.map((match) => match.opponent).join(), /Jo/);
    await click(labeled('Remove Spring Open podium photo 1'));
    assert.deepEqual(podiumPhotos(report.studentId, spring), [SPRING_2]);
    assert.deepEqual(podiumPhotos(report.studentId, fall), []);
    assert.deepEqual(podiumPhotos('other-student', spring), [OTHER]);
  } finally {
    unmount(again);
  }

  const medals = mount(<CardMedals report={loadStudentReport(localStorage)} to={(path) => path} />);
  try {
    assert.equal(labeled('Open Spring Open podium photos, 1 photo').querySelector('.rank-photo-stack__card--front')?.getAttribute('src'), SPRING_2);
    assert.equal(document.querySelector('[aria-label="Add podium photo for Fall Open"]'), null);
    const raw = localStorage.getItem('matboard.studentEdition.v1') ?? '';
    assert.equal(raw.includes('data:image'), false);
    assert.equal(localStorage.getItem(PODIUM_PHOTO_KEY)?.includes(SPRING_2), true);
  } finally {
    unmount(medals);
  }
});
