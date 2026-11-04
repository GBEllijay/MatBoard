/**
 * Coach Clipboard roster card, rendered: the four looks, the No photos badge and
 * blocked photo actions, Save profile last on My profile, the card preview after
 * Save, the upload offer, and sync on add.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

const dom = new Window({ url: 'http://localhost/student/profile?student=1', width: 390, height: 844 });
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
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);
installGlobal('File', view.File);
installGlobal('Event', view.Event);
installGlobal('CustomEvent', view.CustomEvent);
installGlobal('StorageEvent', view.StorageEvent);
const urlApi = globalThis.URL as unknown as { createObjectURL: (b: Blob) => string; revokeObjectURL: (u: string) => void };
const downloads: string[] = [];
urlApi.createObjectURL = () => 'blob:x';
urlApi.revokeObjectURL = () => undefined;
view.URL.createObjectURL = urlApi.createObjectURL;
view.URL.revokeObjectURL = urlApi.revokeObjectURL;
view.HTMLAnchorElement.prototype.click = function click() {
  const anchor = this as HTMLAnchorElement;
  if (anchor.download) downloads.push(anchor.download);
};

const { RosterCardSheet, registrationText, sendResultText, startStudentAppSync } = await import('./RosterCardSheet.tsx');
const { CardLookSetting } = await import('./CardLookSetting.tsx');
const { addStudent, getRoster, linkRosterCard, resetRoster, setNoPhotos } = await import('../../lib/rosterStore.ts');
const { CARD_LOOKS, readCardLook, writeCardLook } = await import('../../lib/cardLook.ts');
const { getCardSyncState } = await import('../../lib/cardSync.ts');
const { updateRosterCard } = await import('../../lib/rosterCardStore.ts');
const { ASSESSMENT_AREAS } = await import('../../lib/studentAssessment.ts');
const { ProfilePage } = await import('../../pages/student/ProfilePage.tsx');
const { blankStudentReport, saveStudentReport } = await import('../../lib/studentEdition.ts');
const { STUDENT_NO_PHOTOS_KEY } = await import('../../lib/studentPhotoFlag.ts');
const { saveStudentDriveLink } = await import('../../lib/academyPathway.ts');
type Student = import('../../lib/rosterStore.ts').Student;

type Mounted = { root: Root; host: HTMLElement };
function mount(node: React.ReactNode, entry = '/roster'): Mounted {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<MemoryRouter initialEntries={[entry]}>{node}</MemoryRouter>));
  return { root, host };
}
function unmount(m: Mounted) {
  act(() => m.root.unmount());
  m.host.remove();
  document.body.innerHTML = '';
}
function buttons(name: string | RegExp): HTMLButtonElement[] {
  return [...document.querySelectorAll('button')].filter((b) =>
    typeof name === 'string' ? b.textContent?.trim() === name : name.test(b.textContent ?? ''),
  ) as HTMLButtonElement[];
}
function click(el: Element) {
  act(() => {
    (el as HTMLElement).dispatchEvent(new view.MouseEvent('click', { bubbles: true }) as unknown as Event);
  });
}
function text(): string {
  return document.body.textContent ?? '';
}

function studentCard(name = 'Ana Lima'): Student {
  const card = addStudent(
    { name, belt: 'blue', division: '', gym: 'Advantage', lastPromotion: '2026-03-02', lastPromotionDetail: '', note: '', photo: 'data:image/png;base64,AAAA' },
    { rosterList: 'student' },
  );
  assert.ok(card);
  return card;
}
function fresh(id: string): Student {
  return getRoster().students.find((s) => s.id === id) as Student;
}
function sheet(student: Student, extra: { onLink?: () => void; onOpenPhotos?: () => void } = {}) {
  return (
    <RosterCardSheet
      student={student}
      onClose={() => undefined}
      onEditBelt={() => undefined}
      onLink={extra.onLink ?? (() => undefined)}
      onOpenPhotos={extra.onOpenPhotos ?? (() => undefined)}
      competitorRosterOpen
      onOpenCompetitorRoster={() => undefined}
    />
  );
}
const TABS = ['Overview', 'Assessments', 'Benchmarks'];

test('all four looks render every card field, and the look comes from the gym setting', () => {
  for (const look of CARD_LOOKS) {
    localStorage.clear();
    resetRoster();
    writeCardLook(look);
    const card = studentCard();
    const scores = Object.fromEntries(ASSESSMENT_AREAS.map((a) => [a.id, 3]));
    updateRosterCard(card.id, (r) => ({ ...r, trainingStartedOn: '2024-01-15', trainingStyle: 'both', coachAssessments: [{ id: 'a1', date: '2026-10-01', note: 'Good base', scores } as never] }));
    const m = mount(sheet(card));
    const root = document.querySelector('.clipboard') as HTMLElement;
    assert.equal(root.dataset.style, look.style, 'style');
    assert.equal(root.dataset.skin, look.skin, 'skin');
    const overview = text();
    for (const field of ['Ana Lima', 'Belt achieved', 'Last stripe awarded', 'Trains', 'Gi', 'No-Gi', 'Both', 'Training start']) {
      assert.ok(overview.includes(field), `${look.style}-${look.skin}: ${field}`);
    }
    assert.ok(document.querySelector('.clipboard__photo, .clipboard__initials'), 'photo area');
    assert.ok(document.querySelector('.clipboard__logo, [class*="clipboard__gym"]') || overview.includes('Advantage'), 'gym logo or mark');
    for (const tab of TABS) assert.ok(buttons(new RegExp(`^${tab}`)).length, `tab ${tab}`);
    click(buttons(/^Assessments/)[0]);
    assert.ok(text().includes('Assessment'), 'assessment');
    assert.ok(buttons('Coach').length && buttons('Both').length, 'Coach / Self / Both toggle');
    if (look.style === 'fighter') assert.ok(document.querySelector('.clipboard__bars'), 'fighter uses bars');
    else assert.ok(document.querySelector('.clipboard__radar'), 'clipboard uses radar');
    click(buttons(/^Benchmarks/)[0]);
    assert.ok(text().includes('Sync with student app'), 'sync switch');
    unmount(m);
  }
});

test('the card look setting persists the choice', () => {
  localStorage.clear();
  const m = mount(<CardLookSetting />);
  const fighter = [...document.querySelectorAll('input[type="radio"]')].find((n) => (n.parentElement?.textContent ?? '').includes('Fighter')) as HTMLInputElement;
  const light = [...document.querySelectorAll('input[type="radio"]')].find((n) => (n.parentElement?.textContent ?? '').includes('Light')) as HTMLInputElement;
  assert.ok(fighter && light, 'both radios');
  click(fighter);
  click(light);
  assert.deepEqual(readCardLook(), { style: 'fighter', skin: 'light' });
  unmount(m);
});

test('No photos: badge on every look, Choose photo hidden, initials shown', () => {
  for (const look of CARD_LOOKS) {
    localStorage.clear();
    resetRoster();
    writeCardLook(look);
    const card = studentCard();
    setNoPhotos(card.id, true, 'coach');
    const m = mount(sheet(fresh(card.id)));
    const badge = document.querySelector('[data-testid="no-photos-badge"]');
    assert.ok(badge, `${look.style}-${look.skin}: badge`);
    assert.match(badge?.textContent ?? '', /No photos/);
    assert.equal(buttons(/Choose photo/).length, 0, 'Choose photo hidden');
    assert.equal(document.querySelector('.clipboard__photo'), null, 'no photo image');
    assert.ok(document.querySelector('.clipboard__initials'), 'initials');
    unmount(m);
  }
});

test('No photos: the coach toggles it, but a family flag is locked', () => {
  localStorage.clear();
  resetRoster();
  const card = studentCard();
  let m = mount(sheet(fresh(card.id)));
  assert.ok(buttons(/Choose photo/).length, 'Choose photo before');
  click(buttons('Mark No photos')[0]);
  assert.equal(fresh(card.id).noPhotos, 'coach');
  unmount(m);
  setNoPhotos(card.id, false, 'coach');
  setNoPhotos(card.id, true, 'family');
  m = mount(sheet(fresh(card.id)));
  assert.match(document.querySelector('[data-testid="no-photos-badge"]')?.textContent ?? '', /Set by family/);
  const locked = buttons(/No photos · Set by family/)[0];
  assert.ok(locked?.disabled, 'family flag locked for the coach');
  click(locked);
  assert.equal(fresh(card.id).noPhotos, 'family');
  unmount(m);
});

test('registration and send result text', () => {
  assert.equal(registrationText({ eventName: 'Atlanta Open', date: '2026-12-05', division: 'Adult Blue' }), 'Registered: Atlanta Open, Dec 5, 2026 · Adult Blue');
  assert.equal(sendResultText({ mode: 'blocked', gate: 'off', reason: 'Turn on Sync.' } as never, 'Ana', 'It shows').error, true);
  const file = sendResultText({ mode: 'file', name: 'a.json', json: '{}', reason: 'Saved a file.' } as never, 'Ana', 'It shows');
  assert.equal(file.file?.name, 'a.json');
  assert.equal(sendResultText({ mode: 'invalid', error: 'Bad' } as never, 'Ana', 'x').error, true);
});

test('sync on add: the same action as the card switch; unlinked opens pairing', () => {
  localStorage.clear();
  resetRoster();
  const card = studentCard();
  let opened = 0;
  startStudentAppSync(fresh(card.id), true, () => (opened += 1));
  assert.equal(opened, 1, 'pairing opens for an unlinked card');
  assert.equal(getCardSyncState(card.id)?.comms, 'on');
  linkRosterCard(card.id, 'stu-ana-9');
  startStudentAppSync(fresh(card.id), true, () => (opened += 1));
  assert.equal(opened, 1, 'a linked card does not reopen pairing');
  startStudentAppSync(fresh(card.id), false, () => (opened += 1));
  assert.equal(getCardSyncState(card.id)?.comms, 'off');
});

function seedStudent() {
  localStorage.clear();
  const report = blankStudentReport();
  saveStudentReport(localStorage, { ...report, profile: { ...report.profile, displayName: 'Ana Lima', gymName: 'Advantage' } });
}

test('My profile: Save profile is the last control, then the preview opens and closes', () => {
  seedStudent();
  const m = mount(<ProfilePage />, '/student/profile?student=1');
  const stack = document.querySelector('.profile-stack') as HTMLElement;
  const all = [...stack.querySelectorAll('button, input, label.profile-action')];
  const save = buttons('Save profile')[0];
  assert.ok(save, 'Save profile');
  assert.equal(all[all.length - 1], save, 'Save profile is last in My profile');
  assert.ok(save.getAttribute('form'), 'submits the profile form from the bottom');
  // Submit through the form, as the browser does for a form= button.
  const form = document.getElementById(save.getAttribute('form') as string) as HTMLFormElement;
  act(() => {
    form.dispatchEvent(new view.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event);
  });
  assert.ok(text().includes('Saved on this phone.'));
  assert.ok(document.querySelector('[data-testid="student-card-preview"]'), 'preview after Save');
  assert.ok(text().includes('Latest from coach'));
  assert.ok(text().includes('Suggestions from coach'));
  assert.equal(buttons('Upload for coach approval to add to student card').length, 0, 'no upload without Pro, Plus Cloud or a Drive');
  click(buttons('Close preview')[0]);
  assert.equal(document.querySelector('[data-testid="student-card-preview"]'), null, 'dismissed');
  assert.ok(buttons('Preview my card').length, 'can reopen');
  unmount(m);
});

test('My profile: the upload offer shows after Save only when the gym has a Drive or cloud link', () => {
  seedStudent();
  saveStudentDriveLink(localStorage, { role: 'academy', provider: 'googleDrive', folderId: '1AbCdEfGhIjKlMnOpQrStUvWxYz012345', folderName: 'Advantage gym', accountLabel: null, gymName: 'Advantage' });
  const m = mount(<ProfilePage />, '/student/profile?student=1');
  assert.equal(buttons('Upload for coach approval to add to student card').length, 0, 'not before Save');
  const save = buttons('Save profile')[0];
  const form = document.getElementById(save.getAttribute('form') as string) as HTMLFormElement;
  act(() => {
    form.dispatchEvent(new view.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event);
  });
  click(buttons('Close preview')[0]);
  assert.equal(buttons('Upload for coach approval to add to student card').length, 1);
  unmount(m);
});

test("My profile: Don't allow photos shows No photos and hides the photo send", async () => {
  seedStudent();
  const m = mount(<ProfilePage />, '/student/profile?student=1');
  const sw = [...document.querySelectorAll('button[role="switch"]')].find((b) => (b.textContent ?? '').includes("Don't allow photos")) as HTMLButtonElement;
  assert.ok(sw, 'switch');
  assert.equal(sw.getAttribute('aria-checked'), 'false');
  await act(async () => {
    sw.dispatchEvent(new view.MouseEvent('click', { bubbles: true }) as unknown as Event);
    await new Promise((r) => setTimeout(r, 0));
  });
  assert.equal(JSON.parse(localStorage.getItem(STUDENT_NO_PHOTOS_KEY) ?? '{}').on, true);
  assert.ok(document.querySelector('[data-testid="profile-no-photos"]'), 'No photos on the profile photo card');
  assert.equal(buttons(/Send photo to coach|Send to coach/).length, 0, 'photo send hidden');
  unmount(m);
});
