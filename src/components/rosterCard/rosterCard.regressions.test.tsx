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
const { StudentCard } = await import('../../pages/Roster.tsx');
const { readRosterCard } = await import('../../lib/rosterCardStore.ts');
const { toggleCompetitor, toggleStudentCheckIn, linkedCompetitorForCheckIn } = await import('../../lib/rosterCardActions.ts');
const { setCheckedIn } = await import('../../lib/rosterStore.ts');
const { checkedInCompetitors, competitorsForBracketFill } = await import('../../lib/checkInSeeds.ts');
const { studentCheckInFor } = await import('../../pages/Roster.tsx');
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
        onToggleCheckIn={() => setCheckedIn(student.id, !student.checkedIn)}
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

test('Check In shows only while Competitor is on, beside the belt and the Competitor switch, and in the card top block', () => {
  localStorage.clear();
  resetRoster();
  const card = studentCard();
  let m = mount(rowFor(card.id));
  assert.equal(checkInButton(), null, 'no Check In before the student is a competitor');
  unmount(m);
  m = mount(sheet(fresh(card.id)));
  assert.equal(checkInButton(document.querySelector('[data-testid="clipboard-top"]') as ParentNode), null);
  click(document.querySelector('[data-testid="clipboard-top"] [role="switch"]') as Element);
  const top = document.querySelector('[data-testid="clipboard-top"]') as HTMLElement;
  const cardButton = checkInButton(top);
  assert.ok(cardButton, 'Check In appears in the top block once Competitor is on');
  assert.equal(cardButton?.previousElementSibling?.getAttribute('role'), 'switch', 'right after Add to Competitor Roster');
  assert.equal(cardButton?.getAttribute('aria-pressed'), 'false');
  unmount(m);
  m = mount(rowFor(card.id));
  const beltRow = document.querySelector('.roster-card__head .roster-card__belt-row') as HTMLElement;
  const rowButton = checkInButton(beltRow);
  assert.ok(rowButton, 'Check In on the same top line as the belt');
  assert.equal(rowButton?.previousElementSibling?.getAttribute('role'), 'switch', 'after the Competitor switch');
  assert.ok(rowButton?.classList.contains('roster-card__checkin'), 'the same 48px Check In style as the competitor list');
  unmount(m);
});

test('Check In from the row, the card and the competitor list is one state, and the bracket fill sees it', () => {
  localStorage.clear();
  resetRoster();
  const card = studentCard();
  assert.equal(toggleCompetitor(card.id).on, true);
  const competitorId = readRosterCard(card.id).competitorCardId as string;
  assert.equal(linkedCompetitorForCheckIn(card.id)?.id, competitorId);

  // 1. From the Student Roster row.
  let m = mount(rowFor(card.id));
  click(checkInButton(document.querySelector('.roster-card__belt-row') as ParentNode) as Element);
  assert.equal(fresh(competitorId).checkedIn, true, 'the row writes the competitor card checkedIn');
  assert.equal(fresh(card.id).checkedIn, false, 'no second check-in on the student card');
  assert.match(text(), /Ana Lima is checked in/);
  assert.deepEqual(checkedInCompetitors(getRoster().students).map((s) => s.id), [competitorId], 'Fill from check-in sees it');
  assert.deepEqual(competitorsForBracketFill(getRoster().students, 'Any bracket').competitors.map((s) => s.id), [competitorId]);
  unmount(m);

  // 2. The card top block and the competitor list show the same state.
  m = mount(sheet(fresh(card.id)));
  const cardButton = checkInButton(document.querySelector('[data-testid="clipboard-top"]') as ParentNode) as HTMLButtonElement;
  assert.equal(cardButton.getAttribute('aria-pressed'), 'true');
  assert.equal(cardButton.textContent, 'Checked In');
  click(cardButton);
  assert.equal(fresh(competitorId).checkedIn, false, 'the card unchecks the same state');
  assert.equal(checkInButton(document.querySelector('[data-testid="clipboard-top"]') as ParentNode)?.getAttribute('aria-pressed'), 'false', 'the card re-renders from the roster store');
  assert.equal(checkedInCompetitors(getRoster().students).length, 0);
  unmount(m);

  // 3. From the competitor list's own Check In.
  m = mount(row(fresh(competitorId), undefined, undefined, true));
  const listButton = buttons('Check In')[0];
  assert.equal(listButton.getAttribute('aria-pressed'), 'false');
  click(listButton);
  assert.equal(fresh(competitorId).checkedIn, true);
  unmount(m);
  m = mount(rowFor(card.id));
  assert.equal(checkInButton(document.querySelector('.roster-card__belt-row') as ParentNode)?.getAttribute('aria-pressed'), 'true', 'the row shows the list check-in');
  unmount(m);
  m = mount(sheet(fresh(card.id)));
  assert.equal(checkInButton(document.querySelector('[data-testid="clipboard-top"]') as ParentNode)?.getAttribute('aria-pressed'), 'true', 'the card shows it too');
  unmount(m);
  assert.deepEqual(checkedInCompetitors(getRoster().students).map((s) => s.id), [competitorId]);
});

test('switching Competitor off clears Check In, so Fill from check-in skips the student; the card stays', () => {
  localStorage.clear();
  resetRoster();
  const card = studentCard();
  toggleCompetitor(card.id);
  const competitorId = readRosterCard(card.id).competitorCardId as string;
  assert.equal(toggleStudentCheckIn(card.id).checkedIn, true);
  assert.equal(checkedInCompetitors(getRoster().students).length, 1);
  assert.equal(toggleCompetitor(card.id).on, false);
  assert.ok(fresh(competitorId), 'the competitor card is kept');
  assert.equal(fresh(competitorId).checkedIn, false);
  assert.equal(checkedInCompetitors(getRoster().students).length, 0, 'not pulled into a bracket');
  const refused = toggleStudentCheckIn(card.id);
  assert.equal(refused.error, true, 'no Check In while Competitor is off');
  assert.equal(fresh(competitorId).checkedIn, false);
  // Back on: still not checked in until the coach taps Check In again.
  toggleCompetitor(card.id);
  assert.equal(fresh(competitorId).checkedIn, false);
});

test('Check In is hidden where the Competitor Roster is locked', async () => {
  localStorage.clear();
  resetRoster();
  const card = studentCard();
  toggleCompetitor(card.id);
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
  assert.match(page, /onToggleCheckIn=\{\(\) => setCheckedIn\(competitor\.id, !competitor\.checkedIn\)\}/, 'the competitor list keeps its own Check In');
});
