/**
 * Coach Clipboard roster card, rendered: the four looks, the No photos badge and
 * blocked photo actions, Save profile last on My profile, Save staying on the
 * editable card, Both sticking after save, the upload offer, and sync on add.
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, useState } from 'react';
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
const { addStudent, getRoster, linkRosterCard, resetRoster, setNoPhotos, updateStudent } = await import('../../lib/rosterStore.ts');
const { CARD_LOOKS, readCardLook, writeCardLook } = await import('../../lib/cardLook.ts');
const { getCardSyncState } = await import('../../lib/cardSync.ts');
const { updateRosterCard } = await import('../../lib/rosterCardStore.ts');
const { ASSESSMENT_AREAS, ASSESSMENT_FORM_AREAS } = await import('../../lib/studentAssessment.ts');
const { ProfilePage } = await import('../../pages/student/ProfilePage.tsx');
const { StudentCard } = await import('../../pages/Roster.tsx');
const { readRosterCard } = await import('../../lib/rosterCardStore.ts');
const { toggleCompetitor, toggleStudentCheckIn, setPersonCheckedIn, personCheckedIn } = await import('../../lib/rosterCardActions.ts');
const { competitorCards } = await import('../../lib/rosterStore.ts');
const { checkedInCompetitors, competitorsForBracketFill, orderCheckedInByRanking } = await import('../../lib/checkInSeeds.ts');
const { RankBelt } = await import('./RankBelt.tsx');
const { CheckInFillSheet } = await import('../CheckInFillSheet.tsx');
const { studentCheckInFor } = await import('../../pages/Roster.tsx');
const { RosterIndex } = await import('./RosterIndex.tsx');
const { Sheet } = await import('../Sheet.tsx');
const { pageScrollIsLocked, resetPageScrollLockForTests } = await import('../../lib/pageScrollLock.ts');
const { rosterIndexTopPx } = await import('../../lib/rosterIndex.ts');
const { blankStudentReport, saveStudentReport } = await import('../../lib/studentEdition.ts');
const { STUDENT_NO_PHOTOS_KEY } = await import('../../lib/studentPhotoFlag.ts');
const { saveStudentDriveLink } = await import('../../lib/academyPathway.ts');
const { readStudentGymLogo, writeStudentGymLogo } = await import('../../lib/studentGymMark.ts');
const { readGymLogo, writeGymLogo } = await import('../../lib/gymLogo.ts');
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

function submitProfile() {
  const save = buttons('Save profile')[0];
  assert.ok(save, 'Save profile');
  const form = document.getElementById(save.getAttribute('form') as string) as HTMLFormElement;
  act(() => {
    form.dispatchEvent(new view.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event);
  });
}

test('My profile: Save profile is the last control and stays on the editable card', () => {
  seedStudent();
  const m = mount(<ProfilePage />, '/student/profile?student=1');
  const stack = document.querySelector('.profile-stack') as HTMLElement;
  const all = [...stack.querySelectorAll('button, input, label.profile-action')];
  const save = buttons('Save profile')[0];
  assert.ok(save, 'Save profile');
  assert.equal(all[all.length - 1], save, 'Save profile is last in My profile');
  assert.ok(save.getAttribute('form'), 'submits the profile form from the bottom');
  submitProfile();
  assert.ok(text().includes('Saved on this phone.'));
  assert.equal(document.querySelector('[data-testid="student-card-preview"]'), null, 'Save does not open the preview shell');
  assert.equal(document.querySelector('[role="dialog"]'), null, 'no preview dialog');
  const face = document.querySelector('[data-testid="profile-card-face"]');
  assert.ok(face, 'editable card stays on the page');
  assert.ok(face.querySelector('button.profile-face__name'), 'name on the card still opens the field');
  assert.equal(buttons('Upload for coach approval to add to student card').length, 0, 'no upload without Pro, Plus Cloud or a Drive');
  assert.ok(buttons('Preview my card').length, 'preview stays available');
  click(buttons('Preview my card')[0]);
  assert.ok(document.querySelector('[data-testid="student-card-preview"]'), 'preview opens only when asked');
  assert.ok(text().includes('Latest from coach'));
  assert.ok(text().includes('Suggestions from coach'));
  click(buttons('Close preview')[0]);
  assert.equal(document.querySelector('[data-testid="student-card-preview"]'), null, 'dismissed');
  assert.ok(document.querySelector('[data-testid="profile-card-face"]'), 'back on the editable card');
  unmount(m);
});

test('My profile: the student card shows name and rank only, never a logo (saved logo data stays)', () => {
  seedStudent();
  const LOGO = 'data:image/png;base64,TE9HTw==';
  writeStudentGymLogo(LOGO, localStorage);
  const m = mount(<ProfilePage />, '/student/profile?student=1');
  const face = document.querySelector('[data-testid="profile-card-face"]') as HTMLElement;
  assert.ok(face, 'card face');
  assert.equal(face.querySelector('.profile-face__crest'), null, 'no logo crest on the card face');
  assert.equal(face.querySelector(`img[src="${LOGO}"]`), null, 'saved logo is not drawn on the card');
  assert.equal(face.querySelectorAll('img').length, 0, 'no images on the face without a photo');
  assert.doesNotMatch(face.textContent ?? '', /Add logo|\bLogo\b/, 'no logo hint on the card');
  assert.equal(face.querySelector('button.profile-face__name')?.textContent?.trim(), 'Ana Lima', 'name shown');
  assert.ok((face.querySelector('.profile-face__belt-text')?.textContent ?? '').trim(), 'rank shown');
  assert.equal(document.querySelector('.profile-corner img[alt="Gym logo"]'), null, 'no logo in the header corner');
  assert.equal(document.querySelector(`main img[src="${LOGO}"]`), null, 'logo not drawn anywhere on My profile');
  assert.equal(readStudentGymLogo(localStorage), LOGO, 'saved logo data is kept');
  assert.equal(document.querySelector('section[aria-label="Gym logo"]'), null, 'gym logo upload is hidden');
  assert.doesNotMatch(document.body.textContent ?? '', /Gym logo on reports and backups/, 'logo report switch is gone');
  submitProfile();
  click(buttons('Preview my card')[0]);
  const preview = document.querySelector('[data-testid="student-card-preview"]') as HTMLElement;
  assert.ok(preview, 'preview open');
  assert.equal(preview.querySelector('.clipboard__crest img'), null, 'no logo or Advantage mark on the student card preview');
  assert.equal(preview.querySelector(`img[src="${LOGO}"]`), null);
  assert.match(preview.querySelector('.clipboard__crest')?.textContent ?? '', /Advantage/, 'gym name still in the crest');
  assert.match(preview.textContent ?? '', /Ana Lima/, 'name on the preview');
  click(buttons('Close preview')[0]);
  unmount(m);
});

test('instructor roster card: name and rank stay, no gym logo or crest image (saved logo stays)', () => {
  localStorage.clear();
  resetRoster();
  const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  writeGymLogo(LOGO);
  const card = studentCard();
  const m = mount(sheet(card));
  const root = document.querySelector('.clipboard') as HTMLElement;
  assert.ok(root, 'clipboard card');
  assert.equal(root.querySelector('.clipboard__crest img'), null, 'no gym logo or Advantage mark in the crest');
  assert.equal(root.querySelector(`img[src="${LOGO}"]`), null, 'saved gym logo is not drawn on the card');
  assert.match(root.querySelector('.clipboard__crest')?.textContent ?? '', /Advantage|Gym not set|[A-Za-z]/, 'gym name still in the crest');
  assert.match(root.textContent ?? '', /Ana Lima/, 'student name stays');
  assert.ok(root.querySelector('.clipboard__belt'), 'rank / belt stays');
  assert.equal(readGymLogo(), LOGO, 'saved gym logo data is kept');
  unmount(m);
});

test('My profile: the upload offer shows after Save only when the gym has a Drive or cloud link', () => {
  seedStudent();
  saveStudentDriveLink(localStorage, { role: 'academy', provider: 'googleDrive', folderId: '1AbCdEfGhIjKlMnOpQrStUvWxYz012345', folderName: 'Advantage gym', accountLabel: null, gymName: 'Advantage' });
  const m = mount(<ProfilePage />, '/student/profile?student=1');
  assert.equal(buttons('Upload for coach approval to add to student card').length, 0, 'not before Save');
  submitProfile();
  assert.equal(document.querySelector('[data-testid="student-card-preview"]'), null, 'upload sits on the profile, not behind the preview');
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

test('Add to Competitor Roster is the first control after the card header, on all four looks', () => {
  for (const look of CARD_LOOKS) {
    localStorage.clear();
    resetRoster();
    writeCardLook(look);
    const card = studentCard();
    const m = mount(sheet(fresh(card.id)));
    const header = document.querySelector('.clipboard__hdr');
    assert.ok(header, `${look.style}-${look.skin}: header`);
    const top = header?.nextElementSibling;
    assert.equal(top?.getAttribute('data-testid'), 'clipboard-top', `${look.style}-${look.skin}: top block right under the header`);
    const first = top?.querySelector('button, input, select, textarea');
    assert.equal(first?.getAttribute('role'), 'switch');
    assert.match(first?.textContent ?? '', /Add to Competitor Roster/);
    assert.equal(document.querySelectorAll('[role="switch"]').length >= 1, true);
    assert.equal([...document.querySelectorAll('.clipboard__extras [role="switch"]')].filter((b) => /Competitor Roster/.test(b.textContent ?? '')).length, 0, 'not lower down any more');
    click(first as Element);
    assert.equal(readRosterCard(card.id).competitorOn, true);
    assert.match(text(), /was added to the Competitor Roster as a new card/);
    const competitorId = readRosterCard(card.id).competitorCardId as string;
    assert.ok(buttons(/Open competitor card ›/).length, 'Open competitor card next to it');
    assert.ok(top?.textContent?.includes('Open competitor card ›'));
    click(top?.querySelector('[role="switch"]') as Element);
    assert.equal(readRosterCard(card.id).competitorOn, false);
    assert.ok(fresh(competitorId), 'turning it off keeps the competitor card');
    unmount(m);
  }
});

test('the card switch stays hidden where the Competitor Roster is locked', () => {
  localStorage.clear();
  resetRoster();
  const card = studentCard();
  const m = mount(
    <RosterCardSheet student={fresh(card.id)} onClose={() => undefined} onEditBelt={() => undefined} onLink={() => undefined} competitorRosterOpen={false} onOpenCompetitorRoster={() => undefined} />,
  );
  assert.equal(document.querySelector('[data-testid="clipboard-top"]'), null);
  assert.equal(buttons(/Add to Competitor Roster/).length, 0);
  unmount(m);
});

type RowCheckIn = { checkedIn: boolean; onToggle: () => { text: string; error?: true } };
function row(student: Student, competitorSwitch?: { on: boolean; onToggle: () => { text: string; error?: true } }, studentCheckIn?: RowCheckIn, competitorList = false) {
  const noop = () => undefined;
  return (
    <ul>
      <StudentCard
        student={student}
        studentRoster={!competitorList}
        pending={false}
        onEdit={noop}
        onAskRemove={noop}
        onCancelRemove={noop}
        onConfirmRemove={noop}
        onToggleCheckIn={() => setPersonCheckedIn(student.id, !student.checkedIn)}
        onLink={noop}
        onSamePerson={noop}
        onSendCompetition={noop}
        onOpenCard={noop}
        onCoachSync={noop}
        sendAllowed={false}
        competitorSwitch={competitorSwitch}
        studentCheckIn={studentCheckIn}
      />
    </ul>
  );
}

test('Student Roster row: a Competitor switch next to the belt on the header row flips the student onto the Competitor Roster', () => {
  localStorage.clear();
  resetRoster();
  const card = studentCard();
  const toggle = () => toggleCompetitor(card.id);
  let m = mount(row(fresh(card.id), { on: readRosterCard(card.id).competitorOn, onToggle: toggle }));
  const head = document.querySelector('.roster-card__head');
  const sw = head?.querySelector('.roster-card__belt-row [role="switch"]') as HTMLButtonElement | null;
  assert.ok(sw, 'switch in the header row beside the belt');
  assert.notEqual(head?.querySelector('.roster-card__belt-row')?.firstElementChild, sw, 'the belt comes first, then the switch');
  assert.equal(sw?.getAttribute('aria-checked'), 'false');
  assert.equal(sw?.getAttribute('aria-label'), 'Add Ana Lima to Competitor Roster');
  click(sw as Element);
  const record = readRosterCard(card.id);
  assert.equal(record.competitorOn, true, 'the same action as the card switch');
  const competitor = fresh(record.competitorCardId as string);
  assert.notEqual(competitor.rosterList, 'student', 'a Competitor Roster card');
  assert.match(text(), /was added to the Competitor Roster/);
  unmount(m);
  m = mount(row(fresh(card.id), { on: readRosterCard(card.id).competitorOn, onToggle: toggle }));
  const on = document.querySelector('.roster-card__belt-row [role="switch"]') as HTMLButtonElement;
  assert.equal(on.getAttribute('aria-checked'), 'true');
  click(on);
  assert.equal(readRosterCard(card.id).competitorOn, false);
  assert.ok(fresh(competitor.id), 'off keeps the competitor card');
  unmount(m);
  // No switch when the page passes none (Competitor Roster locked, or the Competitor list itself).
  m = mount(row(fresh(card.id)));
  assert.equal(document.querySelector('.roster-card__competitor'), null);
  unmount(m);
});

test('Roster page passes the row switch only on the Student Roster and behind competitorRosterOpen', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync('src/pages/Roster.tsx', 'utf8');
  assert.match(page, /studentRoster && competitorRosterOpen\s*\?\s*\{ on: readRosterCard\(competitor\.id\)\.competitorOn, onToggle: \(\) => toggleCompetitor\(competitor\.id\) \}/);
  assert.match(page, /const competitorRosterOpen = coachDoorOpen\(proUnlocked, coachUnlocked, seat !== null\);/);
});

// ---------- Check In: Student Roster row, card top block, competitor list ----------

function checkInButton(scope: ParentNode = document): HTMLButtonElement | null {
  return [...scope.querySelectorAll('button')].find((b) => /^Check(ed)? In$/.test(b.textContent?.trim() ?? '')) as HTMLButtonElement | null ?? null;
}
function rowFor(id: string) {
  const student = fresh(id);
  return row(student, { on: readRosterCard(id).competitorOn, onToggle: () => toggleCompetitor(id) }, studentCheckInFor(id, true));
}

function rowCheckIn(): HTMLButtonElement | null {
  return checkInButton(document.querySelector('.roster-card__head .roster-card__belt-row') as ParentNode);
}
function cardCheckIn(): HTMLButtonElement | null {
  return checkInButton(document.querySelector('[data-testid="clipboard-top"]') as ParentNode);
}
const filledIds = () => checkedInCompetitors(getRoster().students).map((s) => s.id);

test('Check In shows on every Student Roster row and the card top block, Competitor on or off', () => {
  localStorage.clear();
  resetRoster();
  const card = studentCard();
  let m = mount(rowFor(card.id));
  const rowButton = rowCheckIn();
  assert.ok(rowButton, 'Check In on a non-competitor row, on the same top line as the belt');
  assert.equal(rowButton?.previousElementSibling?.getAttribute('role'), 'switch', 'after the Competitor switch');
  assert.ok(rowButton?.classList.contains('roster-card__checkin'), 'the same Check In style as the competitor list');
  assert.equal(rowButton?.getAttribute('aria-pressed'), 'false');
  assert.equal(rowButton?.getAttribute('aria-label'), 'Check In Ana Lima');
  unmount(m);
  m = mount(sheet(fresh(card.id)));
  const cardButton = cardCheckIn();
  assert.ok(cardButton, 'Check In in the top block with Competitor off');
  assert.equal(cardButton?.previousElementSibling?.getAttribute('role'), 'switch', 'right after Add to Competitor Roster');
  assert.equal(readRosterCard(card.id).competitorOn, false);
  click(document.querySelector('[data-testid="clipboard-top"] [role="switch"]') as Element);
  assert.ok(cardCheckIn(), 'still there once Competitor is on');
  unmount(m);
  m = mount(rowFor(card.id));
  assert.ok(rowCheckIn(), 'and on the row once Competitor is on');
  unmount(m);
});

test('a checked-in non-competitor student goes in Fill from check-in; no competitor card is made', () => {
  localStorage.clear();
  resetRoster();
  const card = studentCard();
  const m = mount(rowFor(card.id));
  click(rowCheckIn() as Element);
  assert.match(text(), /Ana Lima is checked in/);
  unmount(m);
  assert.equal(fresh(card.id).checkedIn, true, 'unlinked: Check In lives on the Student Roster card');
  assert.equal(competitorCards(getRoster().students).length, 0, 'Check In never makes a competitor card');
  assert.equal(readRosterCard(card.id).competitorOn, false);
  assert.deepEqual(filledIds(), [card.id], 'Fill from check-in sees the student');
  assert.deepEqual(competitorsForBracketFill(getRoster().students, 'Any bracket').competitors.map((s) => s.id), [card.id]);
  assert.deepEqual(orderCheckedInByRanking(getRoster().students, []).map((seed) => [seed.name, seed.place]), [['Ana Lima', null]], 'Unranked');
  const sheetM = mount(sheet(fresh(card.id)));
  assert.equal(cardCheckIn()?.getAttribute('aria-pressed'), 'true', 'the card shows the row check-in');
  click(cardCheckIn() as Element);
  assert.equal(fresh(card.id).checkedIn, false);
  assert.equal(cardCheckIn()?.getAttribute('aria-pressed'), 'false', 'the card re-renders from the roster store');
  unmount(sheetM);
  assert.deepEqual(filledIds(), []);
});

test('a linked pair is one person: row, card and competitor list stay in sync, and the fill lists them once', () => {
  localStorage.clear();
  resetRoster();
  const card = studentCard();
  // Checked in first, then made a competitor: the new card starts checked in too.
  assert.equal(toggleStudentCheckIn(card.id).checkedIn, true);
  assert.equal(toggleCompetitor(card.id).on, true);
  const competitorId = readRosterCard(card.id).competitorCardId as string;
  assert.equal(fresh(competitorId).checkedIn, true, 'linking keeps one check-in');
  assert.deepEqual(filledIds(), [competitorId], 'one entry for the pair');

  // 1. Row unchecks both.
  let m = mount(rowFor(card.id));
  assert.equal(rowCheckIn()?.getAttribute('aria-pressed'), 'true');
  click(rowCheckIn() as Element);
  unmount(m);
  assert.equal(fresh(card.id).checkedIn, false);
  assert.equal(fresh(competitorId).checkedIn, false);
  assert.deepEqual(filledIds(), []);

  // 2. Card top checks both.
  m = mount(sheet(fresh(card.id)));
  click(cardCheckIn() as Element);
  assert.equal(cardCheckIn()?.textContent, 'Checked In');
  unmount(m);
  assert.equal(fresh(card.id).checkedIn, true);
  assert.equal(fresh(competitorId).checkedIn, true);
  assert.deepEqual(filledIds(), [competitorId], 'still once');

  // 3. The competitor list unchecks both; the row and the card show it.
  m = mount(row(fresh(competitorId), undefined, undefined, true));
  const listButton = buttons(/^Check(ed)? In$/)[0] ?? buttons('Check In')[0];
  click(listButton);
  unmount(m);
  assert.equal(fresh(competitorId).checkedIn, false);
  assert.equal(fresh(card.id).checkedIn, false, 'the list writes the Student Roster card too');
  m = mount(rowFor(card.id));
  assert.equal(rowCheckIn()?.getAttribute('aria-pressed'), 'false');
  unmount(m);
  m = mount(sheet(fresh(card.id)));
  assert.equal(cardCheckIn()?.getAttribute('aria-pressed'), 'false');
  unmount(m);

  // 4. The list checks both back in.
  m = mount(row(fresh(competitorId), undefined, undefined, true));
  click(buttons('Check In')[0]);
  unmount(m);
  assert.equal(personCheckedIn(card.id), true);
  m = mount(rowFor(card.id));
  assert.equal(rowCheckIn()?.getAttribute('aria-pressed'), 'true', 'the row shows the list check-in');
  unmount(m);
  assert.deepEqual(filledIds(), [competitorId]);
});

test('switching Competitor off keeps Check In; the person stays in the fill once; the card stays', () => {
  localStorage.clear();
  resetRoster();
  const card = studentCard();
  toggleCompetitor(card.id);
  const competitorId = readRosterCard(card.id).competitorCardId as string;
  assert.equal(toggleStudentCheckIn(card.id).checkedIn, true);
  assert.equal(toggleCompetitor(card.id).on, false);
  assert.ok(fresh(competitorId), 'the competitor card is kept');
  assert.equal(fresh(competitorId).checkedIn, true, 'off does not clear Check In');
  assert.equal(fresh(card.id).checkedIn, true);
  assert.deepEqual(filledIds(), [competitorId], 'still one entry while off');
  const result = toggleStudentCheckIn(card.id);
  assert.equal(result.error, undefined, 'no "Turn on Competitor first" refusal');
  assert.equal(result.checkedIn, false);
  assert.equal(fresh(competitorId).checkedIn, false, 'still one state while off');
});

test('Fill from check-in sheet lists checked-in students and competitors, once each, and never writes the roster', () => {
  localStorage.clear();
  resetRoster();
  const solo = studentCard('Ana Lima');
  const paired = studentCard('Bia Souza');
  toggleCompetitor(paired.id);
  const pairedCompetitor = readRosterCard(paired.id).competitorCardId as string;
  const competitorOnly = addStudent({ name: 'Caio Reis', belt: 'Purple', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '', photo: '' }) as Student;
  studentCard('Duda Melo'); // not checked in
  setPersonCheckedIn(solo.id, true);
  setPersonCheckedIn(paired.id, true);
  setPersonCheckedIn(competitorOnly.id, true);
  const before = JSON.stringify(getRoster().students);
  const applied: string[][] = [];
  const m = mount(
    <CheckInFillSheet open onClose={() => undefined} students={getRoster().students} files={[]} bracketTitle="" hasNames={false} hasResults={false} sizeMax={16} onApply={(names) => applied.push(names)} />,
    '/tournament',
  );
  const seeds = [...document.querySelectorAll('.checkin-seeds__place')].map((el) => el.parentElement?.querySelector('strong')?.textContent);
  assert.deepEqual([...seeds].sort(), ['Ana Lima', 'Bia Souza', 'Caio Reis'], 'student, pair once, competitor');
  assert.equal(document.querySelectorAll('.checkin-seeds__place').length, 3);
  assert.ok([...document.querySelectorAll('.checkin-seeds__place')].every((el) => el.textContent === 'Unranked'));
  assert.doesNotMatch(text(), /Duda Melo/);
  click(buttons('Fill bracket')[0]);
  assert.equal(applied.length, 1);
  assert.deepEqual([...applied[0]].filter(Boolean).sort(), ['Ana Lima', 'Bia Souza', 'Caio Reis']);
  assert.equal(JSON.stringify(getRoster().students), before, 'Fill never writes the roster');
  assert.equal(fresh(pairedCompetitor).checkedIn, true);
  unmount(m);
});

test('the empty Fill from check-in sheet points at both rosters', () => {
  localStorage.clear();
  resetRoster();
  studentCard();
  const m = mount(
    <CheckInFillSheet open onClose={() => undefined} students={getRoster().students} files={[]} bracketTitle="" hasNames={false} hasResults={false} sizeMax={16} onApply={() => undefined} />,
    '/tournament',
  );
  assert.match(text(), /Nobody is checked in\. On the Student Roster or the Competitor Roster, tap Check In/);
  assert.ok([...document.querySelectorAll('a')].some((a) => a.textContent === 'Open Student Roster'));
  assert.ok([...document.querySelectorAll('a')].some((a) => a.textContent === 'Open Competitor Roster'));
  unmount(m);
});

test('Check In is hidden where brackets are locked (the same coach door as Tournament)', async () => {
  localStorage.clear();
  resetRoster();
  const card = studentCard();
  assert.equal(studentCheckInFor(card.id, false), undefined, 'the row gets no Check In when locked');
  let m = mount(row(fresh(card.id), undefined, studentCheckInFor(card.id, false)));
  assert.equal(checkInButton(), null);
  unmount(m);
  m = mount(
    <RosterCardSheet student={fresh(card.id)} onClose={() => undefined} onEditBelt={() => undefined} onLink={() => undefined} competitorRosterOpen={false} onOpenCompetitorRoster={() => undefined} />,
  );
  assert.equal(checkInButton(), null, 'no Check In on the card when locked');
  unmount(m);
  const { readFileSync } = await import('node:fs');
  const page = readFileSync('src/pages/Roster.tsx', 'utf8');
  assert.match(page, /studentCheckIn=\{studentCheckInFor\(competitor\.id, studentRoster && competitorRosterOpen\)\}/);
  assert.match(page, /const competitorRosterOpen = coachDoorOpen\(proUnlocked, coachUnlocked, seat !== null\);/);
  assert.match(page, /onToggleCheckIn=\{\(\) => setPersonCheckedIn\(competitor\.id, !competitor\.checkedIn\)\}/, 'the competitor list uses the same person check-in');
  const app = readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /path="\/tournament"\s*element=\{\s*<CoachRoute>/, 'Tournament (Fill from check-in) sits behind CoachRoute');
  assert.match(app, /if \(!coachDoorOpen\(pro, coach, seated\)\)/, 'CoachRoute is the same coachDoorOpen as competitorRosterOpen');
});

// ---------- Rolodex rows and the Competition card ----------

const { CompetitionCard } = await import('./CompetitionCard.tsx');
const { competitionPlanFixture } = await import('../../lib/testFixtures/competitionPlan.ts');

function rolodexRow(student: Student, competitorList: boolean, onOpenFace: () => void) {
  const noop = () => undefined;
  return (
    <ul>
      <StudentCard
        student={student}
        studentRoster={!competitorList}
        pending={false}
        onEdit={noop}
        onAskRemove={noop}
        onCancelRemove={noop}
        onConfirmRemove={noop}
        onToggleCheckIn={() => setPersonCheckedIn(student.id, !student.checkedIn)}
        onLink={noop}
        onSamePerson={noop}
        onSendCompetition={noop}
        onOpenCard={competitorList ? undefined : noop}
        onCoachSync={noop}
        sendAllowed={false}
        competitorSwitch={competitorList ? undefined : { on: false, onToggle: () => toggleCompetitor(student.id) }}
        studentCheckIn={competitorList ? undefined : studentCheckInFor(student.id, true)}
        onOpenFace={onOpenFace}
      />
    </ul>
  );
}

test('Rolodex mini card: every row control stays, in order, and the face opens the full card', () => {
  localStorage.clear();
  resetRoster();
  const card = studentCard();
  let opened = 0;
  const m = mount(rolodexRow(fresh(card.id), false, () => { opened += 1; }));
  const article = document.querySelector('article.roster-card') as HTMLElement;
  assert.ok(article.classList.contains('rolodex-card'), 'rolodex class');
  const face = document.querySelector('button.rolodex-card__face') as HTMLButtonElement;
  assert.equal(face.getAttribute('aria-label'), 'Open Ana Lima Student roster card');
  assert.ok(!/edit/i.test(face.getAttribute('aria-label') ?? ''), 'no "edit" in the face name (e2e Edit match)');
  click(face);
  assert.equal(opened, 1, 'face opens the card');
  click(document.querySelector('.roster-card h2') as Element);
  assert.equal(opened, 2, 'the name opens the card too');
  assert.equal(document.querySelector('.roster-card__belt-row'), null, 'no small belt tile row on the mini card');
  assert.equal(document.querySelector('.belt-tip'), null, 'the small belt tile is gone');
  const who = document.querySelector('.roster-card__who') as HTMLElement;
  const h2 = who.querySelector('h2') as HTMLElement;
  const belt = h2.nextElementSibling as HTMLElement;
  assert.ok(belt?.matches('[data-testid="rank-belt"]'), 'the full belt sits directly under the name');
  assert.ok(belt.querySelector('.s-belt-mark .belt__bar'), 'full belt with its rank bar');
  const buttons = belt.nextElementSibling as HTMLElement;
  assert.ok(buttons?.classList.contains('rolodex-card__buttons'), 'the letter buttons sit under the belt');
  const sw = buttons.querySelector('[role="switch"]') as HTMLButtonElement;
  const checkIn = buttons.querySelector('.roster-card__checkin') as HTMLButtonElement;
  assert.ok(sw && checkIn, 'Competitor then Check In');
  assert.equal(checkIn.previousElementSibling, sw);
  click(sw);
  assert.equal(readRosterCard(card.id).competitorOn, true, 'Competitor still toggles');
  click(checkIn);
  assert.ok(filledIds().includes(card.id) || filledIds().includes(readRosterCard(card.id).competitorCardId as string), 'Check In still feeds Fill from check-in');
  const actions = [...document.querySelectorAll('.roster-card__actions button')].map((b) => b.textContent?.trim());
  assert.deepEqual(actions, ['Edit', 'Open card', 'Link to student', 'Remove']);
  assert.equal(document.querySelector('.rolodex-card__kicker')?.getAttribute('aria-hidden'), 'true');
  assert.equal(document.querySelector('.roster-card h2')?.textContent, 'Ana Lima', 'heading text unchanged');
  unmount(m);
});

test('Rolodex on the Competitor Roster: the face names the Competition card and shows initials when No photos is on', () => {
  localStorage.clear();
  resetRoster();
  const card = addStudent({ name: 'Maya Alvarez', belt: 'purple', division: 'Adult', gym: 'Advantage', lastPromotion: '', lastPromotionDetail: '', note: '', photo: 'data:image/png;base64,AAAA' });
  assert.ok(card);
  let m = mount(rolodexRow(fresh(card.id), true, () => undefined));
  const face = document.querySelector('button.rolodex-card__face') as HTMLButtonElement;
  assert.equal(face.getAttribute('aria-label'), 'Open Maya Alvarez Competition card');
  assert.ok(face.querySelector('img.roster-card__photo'), 'photo on the face');
  unmount(m);
  setNoPhotos(card.id, true);
  m = mount(rolodexRow(fresh(card.id), true, () => undefined));
  assert.equal(document.querySelector('button.rolodex-card__face img'), null, 'no photo when No photos is on');
  assert.match(document.querySelector('button.rolodex-card__face')?.textContent ?? '', /MA/);
  unmount(m);
});

function compCard(student: Student, extra: Partial<{ plan: ReturnType<typeof competitionPlanFixture> | null; onToggle: () => void; onChange: () => void; scores: Record<string, number> | null; look: { style: 'clipboard' | 'fighter'; skin: 'dark' | 'light' } }> = {}) {
  return (
    <CompetitionCard
      student={student}
      plan={extra.plan === undefined ? competitionPlanFixture() : extra.plan}
      look={extra.look}
      gymName="Advantage BJJ"
      coachScores={(extra.scores ?? null) as never}
      coachScoredOn="2026-10-20"
      checkIn={{ checkedIn: Boolean(student.checkedIn), onToggle: extra.onToggle ?? (() => undefined) }}
      onChangeDetails={extra.onChange ?? (() => undefined)}
      today="2026-11-04"
    />
  );
}

test('Competition card: sections in order, record and upcoming from the imported plan, every look', () => {
  for (const look of CARD_LOOKS) {
    localStorage.clear();
    resetRoster();
    const card = addStudent({ name: 'Maya Alvarez', belt: 'purple', division: 'Adult Featherweight', gym: 'Ellijay Academy', lastPromotion: '2026-06-01', lastPromotionDetail: 'Purple belt', note: '', photo: '' });
    assert.ok(card);
    const scores = Object.fromEntries(ASSESSMENT_AREAS.map((a) => [a.id, 4]));
    const m = mount(compCard(fresh(card.id), { look, scores }));
    const root = document.querySelector('[data-testid="competition-card"]') as HTMLElement;
    assert.equal(root.dataset.style, look.style);
    assert.equal(root.dataset.skin, look.skin);
    assert.ok(!root.classList.contains('roster-card'), 'not a .roster-card (e2e counts rows)');
    assert.equal(document.querySelector('.comp-card__sheet')?.getAttribute('aria-label'), 'Maya Alvarez Competition card');
    const order = [...document.querySelectorAll('[data-testid^="comp-"]')].map((el) => (el as HTMLElement).dataset.testid);
    assert.deepEqual(order.filter((id) => id !== 'comp-archive'), ['comp-ready', 'comp-record', 'comp-upcoming', 'comp-assessment', 'comp-results', 'comp-scouting', 'comp-game']);
    const readyItems = [...document.querySelectorAll('[data-ready-item]')].map((el) => el.getAttribute('data-ready-item'));
    assert.deepEqual(readyItems, ['medical', 'gi', 'division', 'travel', 'waiver', 'weighIn']);
    const giHref = document.querySelector('[data-ready-item="gi"]')?.getAttribute('href') ?? '';
    assert.match(giHref, new RegExp(`/competition-ready\\?id=${card.id}&item=gi`));
    const body = text();
    assert.match(body, /Competition card/);
    assert.match(body, /60% win rate/);
    assert.match(body, /Appalachian Grappling Open/);
    assert.ok(!body.includes('Peach State Spring Open · Registered'), 'past event is not upcoming');
    assert.match(body, /139\.6 lb/);
    assert.match(body, /141\.5 lb/);
    assert.match(body, /Riley Thompson/);
    assert.ok(document.querySelector('.clipboard__radar'), 'assessment radar');
    unmount(m);
  }
});

test('Competition card: Results, Scouting and Archive fold on phone; Record, Upcoming, Assessment never fold', () => {
  localStorage.clear();
  resetRoster();
  const card = addStudent({ name: 'Maya Alvarez', belt: 'purple', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '', photo: '' });
  assert.ok(card);
  const m = mount(compCard(fresh(card.id)));
  for (const id of ['comp-results', 'comp-scouting']) {
    const details = document.querySelector(`[data-testid="${id}"]`)?.closest('details') ?? document.querySelector(`[data-testid="${id}"] details, details[data-testid="${id}"]`);
    assert.ok(details, `${id} folds`);
    assert.equal((details as HTMLDetailsElement).open, false, `${id} starts closed on phone`);
  }
  for (const id of ['comp-record', 'comp-upcoming', 'comp-assessment']) {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    assert.equal(el.tagName === 'DETAILS' || Boolean(el.querySelector('details')), false, `${id} never folds`);
  }
  unmount(m);
});

test('Competition card: Check in toggles, Change details calls back, Calendar downloads, and empty plans read plainly', () => {
  localStorage.clear();
  resetRoster();
  downloads.length = 0;
  const card = addStudent({ name: 'Maya Alvarez', belt: 'purple', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '', photo: '' });
  assert.ok(card);
  let toggled = 0;
  let changed = 0;
  let m = mount(compCard(fresh(card.id), { onToggle: () => { toggled += 1; }, onChange: () => { changed += 1; } }));
  const check = buttons(/^Check(ed)? in$/)[0];
  assert.equal(check.getAttribute('aria-pressed'), 'false');
  click(check);
  assert.equal(toggled, 1);
  click(buttons('Change details')[0]);
  assert.equal(changed, 1);
  assert.equal(buttons(/edit/i).length, 0, 'no button named Edit on the Competition card');
  const cal = buttons(/Calendar/)[0];
  assert.equal(cal.disabled, false);
  click(cal);
  assert.equal(downloads.length, 1);
  assert.match(downloads[0], /\.ics$/);
  unmount(m);
  m = mount(compCard(fresh(card.id), { plan: null }));
  assert.equal(buttons(/Calendar/)[0].disabled, true, 'Calendar off with nothing upcoming');
  assert.equal(document.querySelector('[data-testid="comp-archive"]'), null, 'no archive without belt history');
  assert.ok(document.querySelector('[data-testid="comp-record"]'), 'record still shows');
  unmount(m);
});

test('Roster page: Rolodex wraps both lists in the card look and opens the right full card', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync('src/pages/Roster.tsx', 'utf8');
  assert.match(page, /className="clipboard rolodex"/);
  assert.match(
    page,
    /onOpenFace=\{\s*studentRoster\s*\?\s*\(\) => setCardTarget\(competitor\.id\)\s*:[\s\S]*?setCompCardTarget\(competitor\.id\)/,
  );
  assert.match(page, /<CompetitionCard\b/);
  const css = readFileSync('src/components/rosterCard/rolodex.css', 'utf8');
  assert.match(css, /scroll-snap-type:\s*none/);
  assert.match(css, /max-height:\s*none/);
  assert.match(css, /\.roster-index\s*\{[^}]*position:\s*fixed/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('A and B sit below the measured Upgrade header at 390 and 400', () => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  installGlobal('ResizeObserver', ResizeObserverStub);
  const viewWithObserver = window as Window & { ResizeObserver: typeof ResizeObserverStub };
  viewWithObserver.ResizeObserver = ResizeObserverStub;
  const header = document.createElement('div');
  header.className = 'seat-session';
  header.textContent = 'Upgrade';
  document.body.appendChild(header);
  const original = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function rect() {
    if (this.classList.contains('seat-session')) {
      return { x: 0, y: 128, top: 128, bottom: 196, left: 0, right: 400, width: 400, height: 68, toJSON() { return {}; } } as DOMRect;
    }
    if (this.classList.contains('roster-index') && !this.style.getPropertyValue('--roster-index-top')) {
      return { x: 350, y: 128, top: 128, bottom: 975, left: 350, right: 390, width: 40, height: 847, toJSON() { return {}; } } as DOMRect;
    }
    return original.call(this);
  };
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('').map((letter) => ({
    letter,
    count: 1,
    firstId: letter,
  }));
  try {
    for (const width of [390, 400]) {
      const top = rosterIndexTopPx(196, 128);
      assert.equal(top, '204px', `${width}px wide`);
      assert.ok(Number.parseFloat(top ?? '0') >= 196);
    }
    const mounted = mount(<RosterIndex letters={letters} onJump={() => undefined} />);
    const strip = document.querySelector('[data-testid="roster-index"]') as HTMLElement;
    assert.equal(strip.style.getPropertyValue('--roster-index-top'), '204px');
    const a = strip.querySelector('[data-letter="A"]') as HTMLElement;
    const b = strip.querySelector('[data-letter="B"]') as HTMLElement;
    assert.ok(a && b);
    assert.equal(a.textContent?.trim(), 'A');
    assert.equal(b.textContent?.trim(), 'B');
    const hash = strip.querySelector('[data-letter="#"]');
    assert.ok(hash, '# stays on the strip');
    unmount(mounted);
  } finally {
    HTMLElement.prototype.getBoundingClientRect = original;
    header.remove();
  }
});

test('open card Close restores page scroll, including belt Edit', () => {
  resetPageScrollLockForTests(document);
  localStorage.clear();
  resetRoster();
  const card = studentCard();
  function Harness({ closeCardFromEdit = false }: { closeCardFromEdit?: boolean }) {
    const [cardOn, setCardOn] = useState(true);
    const [editOn, setEditOn] = useState(false);
    return (
      <>
        <RosterCardSheet
          student={cardOn ? fresh(card.id) : null}
          onClose={() => setCardOn(false)}
          onEditBelt={() => setEditOn(true)}
          onLink={() => undefined}
          onOpenPhotos={() => undefined}
          competitorRosterOpen
          onOpenCompetitorRoster={() => undefined}
        />
        <Sheet
          open={editOn}
          title="Edit student"
          onClose={() => {
            setEditOn(false);
            if (closeCardFromEdit) setCardOn(false);
          }}
          portal
          stacked
        >
          <p>Stripes</p>
        </Sheet>
      </>
    );
  }
  const wheelOk = () => {
    const wheel = new view.WheelEvent('wheel', { deltaY: 40, cancelable: true, bubbles: true });
    document.dispatchEvent(wheel);
    assert.equal(wheel.defaultPrevented, false);
  };
  const restored = () => {
    assert.equal(document.body.style.overflow, '');
    assert.equal(document.body.style.touchAction, '');
    assert.equal(document.documentElement.style.overflow, '');
    assert.equal(document.documentElement.style.touchAction, '');
    assert.equal(pageScrollIsLocked(document), false);
    wheelOk();
  };
  let mounted = mount(<Harness />);
  try {
    assert.equal(document.body.style.overflow, 'hidden');
    assert.equal(document.documentElement.style.touchAction, 'none');
    click(buttons('Close')[0]);
    restored();
  } finally {
    unmount(mounted);
    resetPageScrollLockForTests(document);
  }

  mounted = mount(<Harness />);
  try {
    const belt = document.querySelector('button.clipboard__belt') as HTMLButtonElement;
    assert.ok(belt, 'belt opens Edit');
    click(belt);
    assert.equal(document.querySelectorAll('.sheet').length, 2);
    assert.equal(pageScrollIsLocked(document), true);
    const editClose = buttons('Close').at(-1);
    assert.ok(editClose);
    click(editClose);
    assert.equal(document.querySelectorAll('.sheet').length, 1, 'card stays open after Edit closes');
    assert.equal(pageScrollIsLocked(document), true);
    click(buttons('Close')[0]);
    restored();
  } finally {
    unmount(mounted);
    resetPageScrollLockForTests(document);
  }

  mounted = mount(<Harness closeCardFromEdit />);
  try {
    click(document.querySelector('button.clipboard__belt') as HTMLButtonElement);
    click(buttons('Close').at(-1) as HTMLButtonElement);
    assert.equal(document.querySelector('.sheet'), null);
    restored();
  } finally {
    unmount(mounted);
    resetPageScrollLockForTests(document);
  }
});

test('Coach card: the name and belt open Change details; no new control is named edit; tap hint is described', () => {
  for (const look of CARD_LOOKS) {
    localStorage.clear();
    resetRoster();
    writeCardLook(look);
    const card = studentCard();
    let opened = 0;
    const m = mount(
      <RosterCardSheet
        student={card}
        onClose={() => undefined}
        onEditBelt={() => {
          opened += 1;
        }}
        onLink={() => undefined}
        onOpenPhotos={() => undefined}
        competitorRosterOpen
        onOpenCompetitorRoster={() => undefined}
      />,
    );
    const name = document.querySelector('h2.clipboard__n button.clipboard__tap--name') as HTMLButtonElement;
    assert.ok(name, `${look.style}-${look.skin}: name is a button inside the heading`);
    assert.equal(name.textContent?.trim(), 'Ana Lima', 'heading name unchanged');
    assert.equal(name.getAttribute('aria-label'), null, 'name keeps its own text as its name');
    const hint = document.getElementById(name.getAttribute('aria-describedby') as string);
    assert.equal(hint?.textContent?.trim(), 'Tap the name or belt to change details');
    click(name);
    const belt = document.querySelector('button.clipboard__belt') as HTMLButtonElement;
    assert.equal(belt.getAttribute('aria-label'), 'Change belt and stripes');
    click(belt);
    const pencil = document.querySelector('button.clipboard__pencil') as HTMLButtonElement;
    assert.equal(pencil.getAttribute('aria-label'), 'Edit belt and stripes', 'pencil kept');
    click(pencil);
    assert.equal(opened, 3, 'name, belt and pencil all open Change details');
    for (const b of [name, belt]) {
      const label = (b.getAttribute('aria-label') ?? b.textContent ?? '').toLowerCase();
      assert.ok(!label.includes('edit'), `new control "${label}" must not match getByRole name Edit`);
    }
    const hdr = document.querySelector('.clipboard__hdr') as HTMLElement;
    assert.deepEqual(
      [...hdr.children].map((c) => c.className),
      ['clipboard__idc', 'clipboard__who', 'clipboard__crest', 'clipboard__brow'],
      'header order kept',
    );
    unmount(m);
  }
});

test('Coach card CSS: 12px text floor and 44px targets', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync('src/components/rosterCard/coachClipboard.css', 'utf8');
  const small = [...css.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1])).filter((px) => px < 12);
  assert.deepEqual(small, [], 'no px font-size under 12');
  for (const sel of ['.clipboard__tap', '.clipboard__pencil', '.clipboard__btn', '.clipboard__choose', '.clipboard__nophotos-toggle']) {
    assert.ok(new RegExp(`${sel.replace(/[.]/g, '\\.')}[^{]*\\{[^}]*height:\\s*44px`).test(css), `${sel} min-height 44`);
  }
  assert.match(css, /\.clipboard__radar text\s*\{[^}]*font-size:\s*15px/, 'radar labels reach 12px rendered');
});

test('My profile: the card face shows saved fields, jumps to each field, and keeps Save profile last', () => {
  localStorage.clear();
  const report = blankStudentReport();
  saveStudentReport(localStorage, {
    ...report,
    profile: { ...report.profile, displayName: 'Ana Lima', gymName: 'Advantage', startedOn: '2023-02-14', trainingStyle: 'both' },
  });
  localStorage.setItem(
    'matboard.studentEdition.coachOverlay.v1',
    JSON.stringify({ version: 1, assessments: [], beltProgress: {}, notes: [{ updateId: 'u1', issuedOn: '2026-10-01', journalDate: '2026-10-01', note: 'x', cardLook: 'fighter-light' }] }),
  );
  const m = mount(<ProfilePage />, '/student/profile?student=1');
  const face = document.querySelector('[data-testid="profile-card-face"]') as HTMLElement;
  assert.ok(face, 'card face renders');
  const card = face.querySelector('.clipboard') as HTMLElement;
  assert.ok(card.dataset.style && card.dataset.skin, 'card face uses a card look');
  const faceText = face.textContent ?? '';
  for (const part of ['Student card', 'Ana Lima', 'Gym · Advantage', 'Training since', 'Trains · Gi and No-Gi', 'White belt']) {
    assert.ok(faceText.includes(part), part);
  }
  // Labels on the face must not collide with the form's labels or existing e2e names.
  for (const el of face.querySelectorAll('button, a')) {
    if (el.getAttribute('data-testid') === 'mat-timer') continue; // icon-only control; spec requires aria-label 'Add mat time'
    assert.equal(el.getAttribute('aria-label'), null, 'face controls use visible text only');
    const name = (el.textContent ?? '').trim();
    assert.ok(!/edit|start|my profile|^my rank$|^gi$|^both$|^close$/i.test(name), `face name "${name}" collides`);
  }
  assert.equal(face.querySelectorAll('[role="status"], [aria-live]').length, 0, 'no status region on the face');
  assert.equal(face.querySelectorAll('img.profile-avatar').length, 0, 'face image is not the profile avatar');
  // Each part jumps to its field.
  const nameInput = document.querySelector('form[aria-label="My profile"] input[aria-label="Name"]') as HTMLInputElement;
  click(buttons('Ana Lima')[0]);
  assert.equal(document.activeElement, nameInput, 'name focuses the Name field');
  click(buttons('Gym · Advantage')[0]);
  assert.equal(document.activeElement, document.querySelector('form[aria-label="My profile"] input[aria-label="Gym"]'));
  click(buttons(/^Training since/)[0]);
  assert.equal(document.activeElement, document.querySelector('form[aria-label="My profile"] input[aria-label="Training start date"]'));
  click(buttons(/^Trains ·/)[0]);
  assert.equal((document.activeElement as HTMLElement)?.getAttribute('role'), 'radio', 'trains focuses the Training style choice');
  const belt = face.querySelector('a.profile-face__belt') as HTMLAnchorElement;
  assert.match(belt.getAttribute('href') ?? '', /\/student\/rank\?student=1$/, 'belt opens My rank');
  // Save profile is still last on the page; the face is before the stack.
  const main = document.querySelector('main.student') as HTMLElement;
  const all = [...main.querySelectorAll('button, input, a[href], label.profile-action')].filter((el) => !el.closest('[data-testid="student-card-preview"]') && !el.closest('.profile-after-save'));
  assert.equal(all[all.length - 1], buttons('Save profile')[0], 'Save profile last');
  assert.equal(buttons('Gi').length, 1, 'Gi stays unique');
  assert.equal(buttons('Both').length, 1, 'Both stays unique');
  unmount(m);
});

test('My profile: choosing Both sticks on the editable card after save and reload', () => {
  seedStudent();
  const style = (label: string) =>
    [...document.querySelectorAll('[role="radiogroup"][aria-label="Training style"] [role="radio"]')].find(
      (el) => (el.textContent ?? '').trim() === label,
    ) as HTMLButtonElement;
  const storedStyle = () =>
    (JSON.parse(localStorage.getItem('matboard.studentEdition.v1') ?? '{}') as { profile?: { trainingStyle?: string } }).profile
      ?.trainingStyle;
  let m = mount(<ProfilePage />, '/student/profile?student=1');
  assert.equal(style('Both').getAttribute('aria-checked'), 'true', 'adult default reads as Both');
  click(style('Gi'));
  assert.equal(style('Gi').getAttribute('aria-checked'), 'true');
  assert.equal(storedStyle(), 'gi');
  click(style('No-Gi'));
  assert.equal(storedStyle(), 'nogi');
  click(style('Both'));
  assert.equal(style('Both').getAttribute('aria-checked'), 'true');
  assert.equal(style('Gi').getAttribute('aria-checked'), 'false');
  assert.equal(storedStyle(), 'both', 'Both is written, not dropped as the adult default');
  submitProfile();
  assert.equal(document.querySelector('[data-testid="student-card-preview"]'), null, 'Save stays off the preview shell');
  assert.match(document.querySelector('[data-testid="profile-card-face"]')?.textContent ?? '', /Trains · Gi and No-Gi/);
  assert.equal(storedStyle(), 'both', 'Save profile keeps Both');
  unmount(m);
  m = mount(<ProfilePage />, '/student/profile?student=1');
  assert.equal(style('Both').getAttribute('aria-checked'), 'true', 'Both is still selected after reload');
  assert.equal(style('Gi').getAttribute('aria-checked'), 'false');
  assert.equal(style('No-Gi').getAttribute('aria-checked'), 'false');
  assert.match(document.querySelector('[data-testid="profile-card-face"]')?.textContent ?? '', /Trains · Gi and No-Gi/);
  assert.equal(storedStyle(), 'both');
  unmount(m);
});

test('My profile: with No photos on, the face shows initials, never the photo', () => {
  seedStudent();
  localStorage.setItem(STUDENT_NO_PHOTOS_KEY, JSON.stringify({ on: true, setBy: 'family' }));
  const m = mount(<ProfilePage />, '/student/profile?student=1');
  const face = document.querySelector('[data-testid="profile-card-face"]') as HTMLElement;
  assert.equal(face.querySelectorAll('.profile-face__photo img').length, 0);
  assert.ok((face.textContent ?? '').includes('AL'));
  unmount(m);
});

test('My profile CSS: inline links and Exit demo reach 44px', async () => {
  const { readFileSync } = await import('node:fs');
  const profile = readFileSync('src/pages/student/profile.css', 'utf8');
  assert.match(profile, /\.profile-mode a\s*\{[^}]*min-height:\s*44px/);
  assert.match(profile, /\.profile-face__row\s*\{[^}]*min-height:\s*44px/);
  const se = readFileSync('src/student-edition.css', 'utf8');
  assert.match(se, /\.student-demo-banner a\s*\{[^}]*min-height:\s*44px/);
});

test('Rolodex and Competition card: the belt under the name shows the rank stripes', () => {
  localStorage.clear();
  resetRoster();
  const card = addStudent({ name: 'Maya Alvarez', belt: 'Purple', stripes: 3, division: 'Adult', gym: 'Advantage', lastPromotion: '', lastPromotionDetail: '', note: '', photo: '' });
  assert.ok(card);
  updateStudent(card.id, { stripes: 3 });
  assert.equal(fresh(card.id).stripes, 3);
  let m = mount(<ul><RankBeltProbe id={card.id} /></ul>);
  const belt = document.querySelector('[data-testid="rank-belt"]') as HTMLElement;
  assert.equal(belt.getAttribute('data-stripes'), '3');
  assert.equal(belt.querySelector('.s-belt-mark')?.getAttribute('data-stripes'), '3', 'three stripes filled on the bar');
  assert.equal(belt.getAttribute('aria-label'), 'Purple belt, 3 stripes');
  unmount(m);
  const source = readFileSync('src/components/rosterCard/CompetitionCard.tsx', 'utf8');
  assert.match(source, /<h3 className="comp-card__name">[\s\S]*<RankBelt student=\{student\} \/>[\s\S]*comp-card__controls/, 'Competition card: name, belt, then the buttons');
  assert.doesNotMatch(source, /BeltTip/, 'no small belt tile on the Competition card');
  const coach = readFileSync('src/components/rosterCard/CoachClipboardCard.tsx', 'utf8');
  assert.doesNotMatch(coach, /RankBelt/, 'the coach card keeps its own tappable belt');
  assert.match(coach, /className="clipboard__belt clipboard__tap" aria-label="Change belt and stripes" onClick=\{props\.onEditBelt\}/);
});

function RankBeltProbe({ id }: { id: string }) {
  return <li><RankBelt student={fresh(id)} /></li>;
}

test('mini card, open card, and edit belt share the promotion stripe count', () => {
  localStorage.clear();
  resetRoster();
  const oliver = addStudent({ name: 'Oliver Tibbetts', belt: 'Blue', stripes: 1, division: 'Adult', gym: 'Gracie Barra Ellijay', lastPromotion: '2026-09-26', lastPromotionDetail: '', note: '', photo: '' }, { rosterList: 'student' });
  assert.ok(oliver);
  updateStudent(oliver.id, { stripes: 1, lastPromotion: '2026-09-26' });
  let m = mount(<ul><RankBeltProbe id={oliver.id} /></ul>);
  const blue = document.querySelector('[data-testid="rank-belt"]') as HTMLElement;
  assert.equal(blue.getAttribute('data-stripes'), '1');
  assert.equal(blue.querySelectorAll('.stripe.is-on').length, 1);
  assert.equal(blue.querySelectorAll('.stripe').length, 4);
  unmount(m);

  const micah = addStudent({ name: 'Micah Bates', belt: 'Grey', stripes: 0, division: 'Kids', gym: 'Gracie Barra Ellijay', lastPromotion: '', lastPromotionDetail: '', note: '', photo: '' }, { rosterList: 'student' });
  assert.ok(micah);
  m = mount(<ul><RankBeltProbe id={micah.id} /></ul>);
  const grey = document.querySelector('[data-testid="rank-belt"]') as HTMLElement;
  assert.equal(grey.querySelector('.s-belt-mark')?.getAttribute('data-system'), 'kids');
  assert.equal(grey.querySelectorAll('.stripe').length, 4, 'grey does not draw 11 stripe marks');
  assert.equal(grey.querySelectorAll('.stripe.is-on').length, 0);
  assert.equal(grey.querySelector('.belt--kids') instanceof HTMLElement, true);
  unmount(m);

  const page = readFileSync('src/pages/Roster.tsx', 'utf8');
  assert.match(page, /focusStripes/);
  assert.match(page, /portal stacked/);
  const css = readFileSync('src/components/rosterCard/coachClipboard.css', 'utf8');
  assert.match(css, /grid-column:\s*1\s*\/\s*-1/);
  assert.match(css, /button\.clipboard__belt[\s\S]*z-index:\s*2/);
});

test('a new assessment keeps its scores and note, and Save assessment stays a submit button', () => {
  localStorage.clear();
  resetRoster();
  const card = studentCard('Rio Assessment');
  const m = mount(sheet(card));
  click(buttons(/^Assessments/)[0]);
  click(buttons('+ New assessment')[0]);
  const form = document.querySelector('form.clipboard--form') as HTMLFormElement;
  assert.ok(form);
  const save = [...form.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Save assessment') as HTMLButtonElement;
  assert.equal(save.type, 'submit');
  assert.equal(save.classList.contains('btn'), true);
  const note = form.querySelector('textarea') as HTMLTextAreaElement;
  const selects = [...form.querySelectorAll('select')] as HTMLSelectElement[];
  assert.equal(note.value, '');
  assert.equal(selects.length, ASSESSMENT_FORM_AREAS.length, 'all eight faces, Sweeps included');
  assert.equal(selects.length, 8);
  assert.ok(selects.every((item) => item.value === '3'));
  const labels = [...form.querySelectorAll('.clipboard__scores label')].map((node) => node.firstChild?.textContent?.trim());
  assert.deepEqual(labels, ASSESSMENT_FORM_AREAS.map((area) => area.label));
  const sweepsSelect = selects[ASSESSMENT_FORM_AREAS.findIndex((area) => area.id === 'sweeps')];
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(sweepsSelect), 'value')?.set;
    setter?.call(sweepsSelect, '1');
    sweepsSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });
  assert.equal(sweepsSelect.value, '1');
  click(save);
  const saved = readRosterCard(card.id).coachAssessments.at(-1);
  assert.equal(saved?.note, '');
  assert.equal(saved?.scores.mindset, 3);
  assert.equal(saved?.scores.sweeps, 1, 'coach-entered Sweeps saves');
  assert.equal(fresh(card.id).name, 'Rio Assessment');
  assert.equal(fresh(card.id).belt, 'Blue');
  assert.equal(document.querySelector('form.clipboard--form'), null);
  unmount(m);

  // Reload: the saved Sweeps shows on the card's eight-row assessment table.
  const again = mount(sheet(fresh(card.id)));
  click(buttons(/^Assessments/)[0]);
  const rows = [...document.querySelectorAll('.clipboard table tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim()).slice(0, 2).join(' '),
  );
  assert.equal(rows.length, 8);
  assert.deepEqual(rows.map((r) => r.split(' ').slice(0, -1).join(' ')), ASSESSMENT_FORM_AREAS.map((area) => area.label));
  assert.ok(rows.includes('Sweeps 1'), rows.join(' | '));
  assert.equal(readRosterCard(card.id).coachAssessments.at(-1)?.scores.sweeps, 1, 'reloads');
  unmount(again);
});

test('a coach assessment saved before Sweeps shows Sweeps as not rated on the roster card', () => {
  localStorage.clear();
  resetRoster();
  const card = studentCard('Old Seven');
  const scores = Object.fromEntries(ASSESSMENT_AREAS.map((a) => [a.id, 4]));
  updateRosterCard(card.id, (r) => ({ ...r, coachAssessments: [{ id: 'old7', date: '2026-10-01', note: '', scores } as never] }));
  const m = mount(sheet(card));
  click(buttons(/^Assessments/)[0]);
  const rows = [...document.querySelectorAll('.clipboard table tbody tr')].map((tr) =>
    [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim()),
  );
  assert.equal(rows.length, 8);
  const sweeps = rows.find((r) => r[0] === 'Sweeps');
  assert.ok(sweeps);
  assert.notEqual(sweeps?.[1], '4', 'not invented');
  assert.notEqual(sweeps?.[1], '0');
  assert.match(text(), /Avg 4/, 'the trend averages the seven it has');
  unmount(m);
});

test('Competition card: approved opponent cards sit beside opponents faced and open onto Me vs them', async () => {
  const { applyStudentCoachUpdate, receiveStudentCoachUpdate } = await import('../../lib/coachProgressFile.ts');
  localStorage.clear();
  resetRoster();
  const card = addStudent({ name: 'Maya Alvarez', belt: 'purple', division: 'Adult', gym: 'Ellijay Academy', lastPromotion: '', lastPromotionDetail: '', note: '', photo: '' });
  assert.ok(card);
  assert.ok(linkRosterCard(card.id, 'stu-alex'));
  const file = {
    schemaVersion: 1,
    kind: 'student-coach-update',
    updateId: 'scu-scout-1',
    studentId: 'stu-alex',
    sentAt: 100,
    since: 0,
    profile: { displayName: 'Alex Kim', gymName: 'North Side', startedOn: '', trainingStyle: 'gi' },
    assessments: [{ id: 'as-self', date: '2026-11-02', note: '', scores: { guard: 4, passing: 3, sweeps: 2, takedowns: 3, escapes: 3, submissions: 4, conditioning: 3, mindset: 5 } }],
    scouting: {
      studentName: 'Alex Kim',
      cards: [
        {
          id: 'scout-jordan',
          name: 'Jordan Hale',
          gym: 'Checkmat',
          group: 'open',
          style: 'pressure passer',
          weightClass: 'Middle',
          belt: 'Purple',
          ratings: { guard: 2, passing: 4, sweeps: 5, takedowns: 3, escapes: 3, submissions: 4, conditioning: 2, mindset: 4 },
          strengths: 'top pressure',
          weaknesses: 'open guard',
          record: { wins: 2, losses: 1, draws: 0, line: '2-1-0' },
          notes: 'likes closed guard',
        },
      ],
    },
  };
  assert.equal(receiveStudentCoachUpdate(localStorage, file), 'pending');
  const applied = applyStudentCoachUpdate(localStorage, file.updateId, { students: getRoster().students, update: updateStudent }, { actor: 'coach', approveRank: false });
  assert.equal(applied.ok, true);
  let m = mount(compCard(fresh(card.id)));
  const section = document.querySelector('[data-testid="comp-scouting"]');
  assert.match(section?.textContent ?? '', /Riley Thompson/);
  assert.match(section?.textContent ?? '', /Scouted by Alex Kim/);
  assert.match(section?.textContent ?? '', /Jordan Hale/);
  const details = document.querySelector('[data-testid="comp-scout-card"]') as HTMLDetailsElement;
  assert.equal(details.open, false);
  const cage = details.querySelector('[data-testid="scout-cage"] svg');
  assert.match(cage?.getAttribute('aria-label') ?? '', /Me versus Jordan Hale/);
  assert.match(cage?.getAttribute('aria-label') ?? '', /Sweeps 2/);
  assert.match(cage?.getAttribute('aria-label') ?? '', /Sweeps 5/);
  assert.match(details.textContent ?? '', /top pressure/);
  assert.match(details.textContent ?? '', /likes closed guard/);
  unmount(m);

  const again = {
    ...file,
    updateId: 'scu-scout-2',
    sentAt: 200,
    scouting: {
      studentName: 'Alex Kim',
      cards: [{ ...file.scouting.cards[0], notes: 'switched to knee cut', ratings: { ...file.scouting.cards[0].ratings, sweeps: 1 } }],
    },
  };
  assert.equal(receiveStudentCoachUpdate(localStorage, again), 'pending');
  applyStudentCoachUpdate(localStorage, again.updateId, { students: getRoster().students, update: updateStudent }, { actor: 'coach', approveRank: false });
  m = mount(compCard(fresh(card.id)));
  const cards = [...document.querySelectorAll('[data-testid="comp-scout-card"]')];
  assert.equal(cards.length, 1);
  assert.match(cards[0].textContent ?? '', /switched to knee cut/);
  assert.doesNotMatch(cards[0].textContent ?? '', /likes closed guard/);
  const nextCage = cards[0].querySelector('[data-testid="scout-cage"] svg');
  assert.match(nextCage?.getAttribute('aria-label') ?? '', /Sweeps 1/);
  unmount(m);
});
