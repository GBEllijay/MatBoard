/**
 * Connect to my academy, restyled: every control still works.
 * Not connected: Scan gym QR, Take a photo of the QR, Paste invite link,
 * Use this academy link → Sign in, Show my student ID, Save inbox code.
 * Connected: Send my ID to coach, Share my card, Disconnect academy folder,
 * Leave academy (confirm sheet), Changing gyms (switch sheet),
 * stale-link banner with Rescan. One page title, no journal skin.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

const dom = new Window({ url: 'http://localhost/student/academy?student=1' });
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
installGlobal('indexedDB', view.indexedDB);

const { AcademyConnectPage, ConnectionsPage } = await import('./ConnectionsPage.tsx');
const { academyPathwayUrl, loadAcademyLink, saveStudentDriveLink } = await import('../../lib/academyPathway.ts');
const { joinAcademy, markAcademyStale, readMembership, ACADEMY_STALE_COPY } = await import('../../lib/academyMembership.ts');
const { STUDENT_GYM_LOGO_KEY } = await import('../../lib/studentGymMark.ts');
const { ACADEMY_LICENSE_KEY } = await import('../../lib/studentInboxClient.ts');
const { addJournalEntry, blankStudentReport, loadStudentReport, saveStudentReport } = await import('../../lib/studentEdition.ts');
const { readFileSync } = await import('node:fs');

function mount(node: ReactNode, entry: string) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<MemoryRouter initialEntries={[entry]}>{node}</MemoryRouter>));
  return { root, host };
}
function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}
const buttons = (host: ParentNode) => [...host.querySelectorAll('button')].map((node) => node.textContent?.trim() ?? '');
function button(host: ParentNode, name: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === name);
  assert.equal(found?.tagName, 'BUTTON', name);
  return found as HTMLButtonElement;
}
function reactProps(node: Element): Record<string, (event: unknown) => void> | null {
  const key = Object.keys(node).find((name) => name.startsWith('__reactProps'));
  return key ? (node as unknown as Record<string, Record<string, (event: unknown) => void>>)[key] : null;
}
async function settle() {
  for (let i = 0; i < 6; i += 1) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}
async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new view.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await settle();
}
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    input.value = value;
    reactProps(input)?.onChange?.({ target: input, currentTarget: input });
  });
}

const link = (folderId: string, gymName: string) =>
  academyPathwayUrl({ v: 1, provider: 'googleDrive', folderId, folderName: `${gymName} folder`, gymName }, 'https://advantagebjjtimer.com');

function connect(gymName = 'North Side BJJ') {
  saveStudentDriveLink(localStorage, { role: 'academy', provider: 'googleDrive', folderId: 'gym-folder-aaa', folderName: 'Team folder', accountLabel: null, gymName });
  joinAcademy(localStorage, { folderId: 'gym-folder-aaa', provider: 'googleDrive', gymName, license: 'licA-1234' }, Date.UTC(2026, 8, 12, 15));
}

test('not connected: one title, scan first, paste second, student ID card, all controls present', async () => {
  localStorage.clear();
  const page = mount(<AcademyConnectPage />, '/student/academy?student=1');
  const host = page.host;
  assert.equal(host.querySelectorAll('h1').length, 1);
  assert.equal(host.querySelector('h1')?.textContent, 'Connect to my academy');
  assert.ok(host.querySelector('main.academy-modern'));
  assert.equal(host.querySelector('.student-paper'), null);
  const names = buttons(host);
  assert.equal(names[0], 'Scan gym QR');
  assert.ok(button(host, 'Scan gym QR').className.includes('am-btn--primary'));
  assert.match(host.textContent ?? '', /Take a photo of the QR/);
  assert.ok(host.querySelector('input[type="file"][accept="image/*"]'));
  assert.ok(names.includes('Show my student ID'));
  assert.ok(names.includes('Save inbox code'));
  assert.ok(host.querySelector('textarea[aria-label="Coach inbox code"], input[aria-label="Coach inbox code"]'));

  await click(button(host, 'Paste invite link'));
  const input = host.querySelector('input[aria-label="Academy link"]') as HTMLInputElement;
  assert.ok(input);
  await type(input, 'nope');
  await click(button(host, 'Use this academy link'));
  assert.match(host.textContent ?? '', /That is not an academy link/);
  await type(input, link('gym-folder-aaa', 'North Side BJJ'));
  await click(button(host, 'Use this academy link'));
  assert.ok(buttons(host).includes('Sign in to Google Drive'));

  await click(button(host, 'Show my student ID'));
  assert.ok(host.querySelector('input[aria-label="Your student ID"]'));
  unmount(page);
});

test('connected: gym card uses initials not a logo, Leave confirms without a logo question, stored logo stays', async () => {
  localStorage.clear();
  saveStudentReport(
    localStorage,
    addJournalEntry(blankStudentReport(1), { date: '2026-11-01', className: 'Open mat', gameTag: '', techniques: [], partners: '', drills: '', rolls: '', notes: 'keep me' }, 2),
  );
  connect();
  localStorage.setItem(STUDENT_GYM_LOGO_KEY, 'data:image/png;base64,AAAA');
  const page = mount(<AcademyConnectPage />, '/student/academy?student=1');
  const host = page.host;
  assert.match(host.textContent ?? '', /North Side BJJ/);
  assert.match(host.textContent ?? '', /Connected since .*2026 · Google Drive/);
  assert.match(host.textContent ?? '', /Coach updates & notes/);
  assert.equal(host.querySelector('img.am-crest, .am-crest--img'), null, 'linked academy card has no gym logo image');
  const crest = host.querySelector('.am-crest');
  assert.ok(crest);
  assert.equal(crest?.textContent?.trim(), 'NS');
  for (const name of ['Send my ID to coach', 'Share my card with my coach', 'Disconnect academy folder', 'Leave academy', 'Scan new gym QR', 'Paste invite link']) {
    assert.ok(buttons(host).includes(name), name);
  }
  assert.ok(button(host, 'Leave academy').className.includes('am-btn--danger'));

  await click(button(host, 'Leave academy'));
  assert.match(host.textContent ?? '', /Leave North Side BJJ\?/);
  await click(button(host, 'Keep connected'));
  assert.ok(loadAcademyLink(localStorage));

  await click(button(host, 'Leave academy'));
  const sheet = host.querySelector('[role="dialog"]') as HTMLElement;
  await click(button(sheet, 'Leave academy'));
  assert.doesNotMatch(host.textContent ?? '', /Remove old gym logo|Keep logo|Remove logo/);
  assert.equal(loadAcademyLink(localStorage), null);
  assert.equal(localStorage.getItem(ACADEMY_LICENSE_KEY), null);
  assert.equal(readMembership(localStorage).current, null);
  assert.ok(localStorage.getItem(STUDENT_GYM_LOGO_KEY), 'leaving does not wipe the stored gym logo');
  assert.equal(loadStudentReport(localStorage).journal.length, 1);
  assert.match(host.textContent ?? '', /You left North Side BJJ/);
  assert.ok(buttons(host).includes('Scan gym QR'));
  unmount(page);
});

test('connected: a different gym link opens the switch sheet; Cancel keeps the old gym', async () => {
  localStorage.clear();
  connect();
  const page = mount(<AcademyConnectPage />, '/student/academy?student=1');
  const host = page.host;
  await click(button(host, 'Paste invite link'));
  await type(host.querySelector('input[aria-label="Academy link"]') as HTMLInputElement, link('gym-folder-bbb', 'Riverside Grappling'));
  await click(button(host, 'Use this academy link'));
  assert.match(host.textContent ?? '', /Switch to Riverside Grappling\?/);
  assert.match(host.textContent ?? '', /This replaces North Side BJJ/);
  await click(button(host, 'Cancel'));
  assert.equal(loadAcademyLink(localStorage)?.folderId, 'gym-folder-aaa');
  unmount(page);
});

test('stale link shows the warning with Rescan; Disconnect academy folder clears the license', async () => {
  localStorage.clear();
  connect();
  markAcademyStale(localStorage);
  const page = mount(<AcademyConnectPage />, '/student/academy?student=1');
  const host = page.host;
  assert.match(host.textContent ?? '', new RegExp(ACADEMY_STALE_COPY.replace(/[?]/g, '\\?')));
  assert.ok(buttons(host).includes('Rescan'));
  await click(button(host, 'Disconnect academy folder'));
  assert.equal(loadAcademyLink(localStorage), null);
  assert.equal(localStorage.getItem(ACADEMY_LICENSE_KEY), null);
  unmount(page);
});

test('Connections page keeps academy, personal drive, export, import and clear', () => {
  localStorage.clear();
  const page = mount(<ConnectionsPage />, '/student/connections?student=1');
  const text = page.host.textContent ?? '';
  for (const part of ['Connect to my academy', 'Scan gym QR', 'Export and print', 'Import from coach', 'Clear all Student Edition data']) {
    assert.match(text, new RegExp(part), part);
  }
  assert.equal(page.host.querySelectorAll('h1').length, 1);
  unmount(page);
});

test('dark look: tokens, 46px buttons, 12px labels, no yellow demo banner here', () => {
  const css = readFileSync('src/student-edition.css', 'utf8');
  const block = css.slice(css.indexOf('/* ── Connect to my academy'));
  for (const token of ['#070b14', '#0e1726', '#14203a', '#eef2f8', '#b9c3d4', '#2a3a60', '#004eba', '#6ea8ff', '#ff8a8a', '#5a2a35']) {
    assert.ok(block.includes(token), token);
  }
  assert.match(block, /min-height: 46px/);
  assert.match(block, /border-radius: 16px;\s*padding: 20px/);
  assert.match(block, /body:has\(main\.academy-modern\) \.student-demo-banner \{\s*background: #14203a/);
  const sizes = [...block.matchAll(/font-size: (\d+)px/g)].map((match) => Number(match[1]));
  assert.ok(sizes.every((size) => size >= 12), String(sizes));
});

test('owner answer 7: the Connections page is titled Connect to my academy', () => {
  localStorage.clear();
  const page = mount(<ConnectionsPage />, '/student/connections?student=1');
  assert.equal(page.host.querySelectorAll('h1').length, 1);
  assert.equal(page.host.querySelector('h1')?.textContent, 'Connect to my academy');
  unmount(page);
});

test('owner answer 5: old-gym alert after disconnect + a different gym; Keep and Remove old gym', async () => {
  const { forgetAcademyFolder, readPreviousGym } = await import('../../lib/academyMembership.ts');
  const seed = () => {
    localStorage.clear();
    const link = (folderId: string, gymName: string) =>
      saveStudentDriveLink(localStorage, { role: 'academy', provider: 'googleDrive', folderId, folderName: `${gymName} folder`, accountLabel: null, gymName });
    link('folder-old', 'Old Gym');
    joinAcademy(localStorage, { folderId: 'folder-old', provider: 'googleDrive', gymName: 'Old Gym', license: 'lic-old-1234' }, 1000);
    forgetAcademyFolder(localStorage);
    link('folder-new', 'New Gym');
    joinAcademy(localStorage, { folderId: 'folder-new', provider: 'googleDrive', gymName: 'New Gym', license: 'lic-new-5678' }, 2000);
  };
  seed();
  let page = mount(<AcademyConnectPage />, '/student/academy?student=1');
  assert.match(page.host.textContent ?? '', /You were connected to Old Gym\. Remove it\?/);
  act(() => button(page.host, 'Keep').click());
  assert.doesNotMatch(page.host.textContent ?? '', /You were connected to Old Gym/);
  assert.equal(readPreviousGym(localStorage), null);
  assert.equal(readMembership(localStorage).left.length, 0);
  unmount(page);

  seed();
  localStorage.setItem(STUDENT_GYM_LOGO_KEY, 'data:image/png;base64,AAAA');
  page = mount(<AcademyConnectPage />, '/student/academy?student=1');
  act(() => button(page.host, 'Remove old gym').click());
  assert.doesNotMatch(page.host.textContent ?? '', /Remove old gym logo|Keep logo|Remove logo/);
  assert.equal(readPreviousGym(localStorage), null);
  assert.deepEqual(readMembership(localStorage).left.map((row) => row.name), ['Old Gym']);
  assert.equal(localStorage.getItem(ACADEMY_LICENSE_KEY), 'lic-new-5678');
  assert.equal(loadAcademyLink(localStorage)?.folderId, 'folder-new');
  assert.ok(localStorage.getItem(STUDENT_GYM_LOGO_KEY), 'removing the old gym does not wipe the stored logo');
  assert.match(page.host.textContent ?? '', /Removed Old Gym/);
  unmount(page);
});

test('owner answer 8: Parent approvals strip on the academy pages is navy, 12px+, 44px targets', () => {
  const css = readFileSync('src/student-edition.css', 'utf8');
  const block = css.slice(css.indexOf('/* Parent approvals strip on the academy pages'));
  assert.ok(block.includes('body:has(main.academy-modern) .parent-approvals'));
  assert.ok(block.includes('#14203a'));
  for (const size of [...block.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]))) assert.ok(size >= 12, String(size));
  assert.ok((block.match(/min-height: 44px/g) ?? []).length >= 3);
});

/* ---------------- QR scan feedback sits under the scanner (owner, Nov 14 2026) ---------------- */

const { AcademyQrScanner } = await import('../../components/AcademyQrScanner.tsx');

test('scan feedback: a pasted or scanned link answers right under the scanner, not at the page bottom', async () => {
  localStorage.clear();
  const page = mount(<AcademyConnectPage />, '/student/academy?student=1');
  const host = page.host;
  await click(button(host, 'Paste invite link'));
  const input = host.querySelector('input[aria-label="Academy link"]') as HTMLInputElement;
  await type(input, 'nope');
  await click(button(host, 'Use this academy link'));
  const alert = host.querySelector('.academy-scan [role="alert"]');
  assert.match(alert?.textContent ?? '', /That is not an academy link/);
  assert.equal((host.textContent?.match(/That is not an academy link/g) ?? []).length, 1, 'shown once, by the scanner');
  await type(input, link('gym-folder-aaa', 'North Side BJJ'));
  await click(button(host, 'Use this academy link'));
  assert.equal(host.querySelector('.academy-scan [role="alert"]'), null);
  assert.match(host.querySelector('.academy-scan [role="status"]')?.textContent ?? '', /North Side BJJ folder on Google Drive/);
  unmount(page);
});

test('scanner: looking hint while live, then the still-looking hint; result prop shows ✓ or an alert', async () => {
  const mediaDevices = { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) };
  Object.defineProperty(view.navigator, 'mediaDevices', { value: mediaDevices, configurable: true });
  const proto = view.HTMLMediaElement.prototype as unknown as { play: () => Promise<void> };
  const play = proto.play;
  proto.play = async () => {};
  const srcDesc = Object.getOwnPropertyDescriptor(view.HTMLMediaElement.prototype, 'srcObject');
  Object.defineProperty(view.HTMLMediaElement.prototype, 'srcObject', { configurable: true, get: () => null, set: () => {} });
  const scanner = mount(<AcademyQrScanner onScan={() => {}} slowAfterMs={20} />, '/student/academy');
  await click(button(scanner.host, 'Scan academy QR'));
  assert.match(scanner.host.querySelector('[role="status"]')?.textContent ?? '', /Looking for the QR/);
  assert.ok(buttons(scanner.host).includes('Stop camera'));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 60)));
  assert.match(scanner.host.querySelector('[role="status"]')?.textContent ?? '', /Still can't read it/);
  await click(button(scanner.host, 'Stop camera'));
  assert.equal(scanner.host.querySelector('[role="status"]'), null);
  unmount(scanner);
  proto.play = play;
  if (srcDesc) Object.defineProperty(view.HTMLMediaElement.prototype, 'srcObject', srcDesc);

  const ok = mount(<AcademyQrScanner onScan={() => {}} result={{ kind: 'ok', text: 'Connected to GB Ellijay.' }} />, '/student/academy');
  const okLine = ok.host.querySelector('[role="status"]');
  assert.match(okLine?.textContent ?? '', /✓ Connected to GB Ellijay\./);
  assert.ok(okLine?.className.includes('academy-scan__feedback--ok'));
  unmount(ok);
  const bad = mount(<AcademyQrScanner onScan={() => {}} result={{ kind: 'error', text: 'This coach connect QR was replaced.' }} />, '/student/academy');
  assert.match(bad.host.querySelector('[role="alert"]')?.textContent ?? '', /was replaced/);
  assert.equal(bad.host.querySelector('.academy-scan__tip'), null, 'no iPhone tip off iOS');
  unmount(bad);
});
