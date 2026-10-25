/**
 * Every control on Make a file for my coach / Import from coach still does its job.
 * A coach plan still imports. The student's own progress file is explained, then merges only after confirm.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { exportProgressPacket } from '../../lib/progress/format.ts';
import type { CoachFeedbackPacket } from '../../lib/progress/types.ts';
import { addJournalEntry, blankStudentReport, loadStudentReport, saveStudentReport } from '../../lib/studentEdition.ts';
import { COACH_FEEDBACK_STORAGE_KEY, COACH_PLAN_STORAGE_KEY } from '../../lib/studentTools.ts';
import { SharePage } from './SharePage.tsx';

const dom = new Window({ url: 'http://localhost/student/share?student=1' });
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

const saved: { name: string; blob: Blob }[] = [];
let lastBlob: Blob | null = null;
const urlApi = globalThis.URL as unknown as {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
};
urlApi.createObjectURL = (blob: Blob) => {
  lastBlob = blob;
  return 'blob:student-share';
};
urlApi.revokeObjectURL = () => undefined;
view.URL.createObjectURL = urlApi.createObjectURL;
view.URL.revokeObjectURL = urlApi.revokeObjectURL;
view.HTMLAnchorElement.prototype.click = function click() {
  const anchor = this as HTMLAnchorElement;
  if (anchor.download && lastBlob) saved.push({ name: anchor.download, blob: lastBlob });
};

function mount(entry = '/student/share?student=1'): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <SharePage />
      </MemoryRouter>,
    );
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

function button(host: ParentNode, name: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((node) => node.textContent?.trim() === name);
  assert.equal(found?.tagName, 'BUTTON', name);
  return found as HTMLButtonElement;
}

function reactProps(node: Element): Record<string, (event: unknown) => void> | null {
  const key = Object.keys(node).find((name) => name.startsWith('__reactProps'));
  return key ? (node as unknown as Record<string, Record<string, (event: unknown) => void>>)[key] : null;
}

function click(node: HTMLElement) {
  const props = reactProps(node);
  act(() => {
    props?.onClick?.({ preventDefault() {} });
  });
}

async function chooseFile(input: HTMLInputElement, name: string, contents: string, type = 'application/json') {
  const file = new File([contents], name, { type });
  const target = { files: [file], value: name };
  const props = reactProps(input);
  await act(async () => {
    props?.onChange?.({ target, currentTarget: target });
    await file.text();
  });
}

function textOf(blob: Blob): Promise<string> {
  return blob.text();
}

test('share page controls still make a file, explain a coach file, and import one', async () => {
  localStorage.clear();
  const phone = addJournalEntry(
    blankStudentReport(4),
    {
      date: '2026-10-23',
      className: 'Fundamentals',
      gameTag: '',
      techniques: [],
      partners: '',
      drills: '',
      rolls: '',
      notes: 'only on this phone',
    },
    4,
  );
  saveStudentReport(localStorage, phone);
  const page = mount('/student/share?from=coach&student=1#import');

  const back = page.host.querySelector('a[aria-label="Back. Hold for Home."]') as HTMLAnchorElement;
  assert.ok(back);
  assert.equal(back.getAttribute('href'), '/student/coach?student=1');
  const home = page.host.querySelector('a[aria-label="Home"]') as HTMLAnchorElement;
  assert.ok(home);
  assert.match(home.getAttribute('href') ?? '', /student=1/);

  assert.match(page.host.textContent ?? '', /This makes a file\. You send it yourself\./);
  assert.match(page.host.textContent ?? '', /Promotion photos are included when the file has room/);
  assert.match(page.host.textContent ?? '', /This takes a coach plan or coach feedback file/);
  assert.match(page.host.textContent ?? '', /It is not the progress file from Make a file for my coach/);
  assert.equal(page.host.querySelector('#import')?.tagName, 'SECTION');

  const email = page.host.querySelector('a[href^="mailto:"]') as HTMLAnchorElement;
  assert.equal(email.textContent?.trim(), 'Email the file');
  assert.match(email.getAttribute('href') ?? '', /subject=Advantage%20progress%20report/);
  assert.equal(email.closest('[aria-label="Different action"]')?.getAttribute('aria-label'), 'Different action');
  assert.match(email.parentElement?.textContent ?? '', /Different action/);
  assert.match(email.parentElement?.textContent ?? '', /does not attach it/);
  const send = button(page.host, 'Make a file for my coach');
  assert.equal(send.closest('[aria-label="Different action"]'), null);
  assert.equal(send.classList.contains('ink-btn--save'), true);

  const box = page.host.querySelector('input[type="checkbox"]') as HTMLInputElement;
  assert.equal(box.checked, false);
  assert.match(box.parentElement?.textContent ?? '', /Also include the spreadsheet/);

  saved.length = 0;
  click(send);
  assert.equal(saved.length, 1);
  assert.match(saved[0].name, /^advantage-handoff-student-progress-report-/);
  const progressText = await textOf(saved[0].blob);
  const progress = JSON.parse(progressText) as { kind: string; journal: { body: string }[] };
  assert.equal(progress.kind, 'student-progress-report');
  assert.ok(progress.journal.some((entry) => entry.body.includes('only on this phone')));
  assert.match(page.host.textContent ?? '', /Downloaded the progress file on this device/);

  const boxProps = reactProps(box);
  act(() => {
    box.checked = true;
    boxProps?.onChange?.({ target: box, currentTarget: box });
  });
  saved.length = 0;
  click(button(page.host, 'Make a file for my coach'));
  assert.equal(saved.length, 2);
  assert.match(saved[0].name, /\.json$/);
  assert.match(saved[1].name, /\.csv$/);
  const csvText = await textOf(saved[1].blob);
  assert.match(csvText, /Sheet,/);

  const nav = view.navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
    canShare?: (data?: ShareData) => boolean;
  };
  let shared: ShareData | null = null;
  nav.canShare = () => true;
  nav.share = (data) => {
    shared = data;
    return Promise.resolve();
  };
  await act(async () => {
    reactProps(button(page.host, 'Make a file for my coach'))?.onClick?.({ preventDefault() {} });
    await Promise.resolve();
  });
  assert.equal(shared?.title, 'Advantage progress report');
  assert.equal(shared?.files?.length, 2);
  assert.match(page.host.textContent ?? '', /Shared from this device/);

  nav.share = () => Promise.reject(new DOMException('The user aborted a request.', 'AbortError'));
  const beforeAbort = page.host.textContent ?? '';
  await act(async () => {
    reactProps(button(page.host, 'Make a file for my coach'))?.onClick?.({ preventDefault() {} });
    await Promise.resolve();
  });
  assert.equal(page.host.textContent, beforeAbort);
  nav.canShare = () => false;

  saved.length = 0;
  click(button(page.host, 'Download a sample coach file'));
  assert.equal(saved.length, 1);
  assert.match(saved[0].name, /^advantage-handoff-coach-plan-sample-coach-plan-/);
  const sampleText = await textOf(saved[0].blob);
  const sample = JSON.parse(sampleText) as { kind: string; plan: { title: string }; studentId: string };
  assert.equal(sample.kind, 'coach-plan');
  assert.equal(sample.plan.title, 'Sample coach plan');
  assert.equal(sample.studentId, 'student-local');
  assert.match(page.host.textContent ?? '', /Downloaded a sample coach plan/);
  assert.equal(loadStudentReport(localStorage).journal.some((entry) => entry.body.includes('only on this phone')), true);

  const picker = page.host.querySelector('input[type="file"]') as HTMLInputElement;
  assert.equal(picker.getAttribute('aria-label'), 'Import from coach');
  const beforePlan = loadStudentReport(localStorage);
  await chooseFile(picker, sample.name, sampleText);
  assert.match(page.host.textContent ?? '', /Sample coach plan is on this phone/);
  assert.match(page.host.textContent ?? '', /were not changed/);
  assert.equal(loadStudentReport(localStorage).updatedAt, beforePlan.updatedAt);
  const storedPlan = JSON.parse(localStorage.getItem(COACH_PLAN_STORAGE_KEY) ?? '{}') as { plan?: { title?: string } };
  assert.equal(storedPlan.plan?.title, 'Sample coach plan');

  const feedback: CoachFeedbackPacket = {
    schemaVersion: 2,
    kind: 'coach-feedback',
    id: 'feedback-sample',
    studentId: 'student-local',
    updatedAt: 90,
    feedback: {
      planId: 'sample-coach-plan',
      issuedOn: '2026-01-16',
      synopsis: 'Sample coach feedback.',
      suggestions: [{ id: 'sample-note', targetId: '', note: 'Keep showing up.' }],
    },
  };
  await chooseFile(picker, 'coach-feedback.json', exportProgressPacket(feedback));
  assert.match(page.host.textContent ?? '', /Coach feedback is on this phone/);
  const storedFeedback = JSON.parse(localStorage.getItem(COACH_FEEDBACK_STORAGE_KEY) ?? '{}') as {
    feedback?: { synopsis?: string };
  };
  assert.equal(storedFeedback.feedback?.synopsis, 'Sample coach feedback.');
  assert.equal(loadStudentReport(localStorage).journal.some((entry) => entry.body.includes('only on this phone')), true);
  assert.equal(loadStudentReport(localStorage).goals.length, beforePlan.goals.length);

  await chooseFile(picker, 'own-progress.json', progressText);
  assert.match(page.host.textContent ?? '', /This file is the one for your coach/);
  assert.match(page.host.textContent ?? '', /not the file to import/);
  assert.match(page.host.textContent ?? '', /You can still merge this progress file/);
  assert.equal(page.host.querySelector('[role="alert"]'), null);
  assert.equal(loadStudentReport(localStorage).journal.length, beforePlan.journal.length);

  const connections = [...page.host.querySelectorAll('a')].find((node) => node.textContent?.trim() === 'Open Connections');
  assert.match(connections?.getAttribute('href') ?? '', /\/student\/connections\?student=1/);
  click(button(page.host, 'Cancel merge'));
  assert.equal(page.host.textContent?.includes('This file is the one for your coach'), false);
  assert.equal(loadStudentReport(localStorage).journal.length, beforePlan.journal.length);

  await chooseFile(picker, 'own-progress.json', progressText);
  click(button(page.host, 'Merge into my journal'));
  assert.match(page.host.textContent ?? '', /Merged this progress file into the journal on this phone/);
  assert.equal(loadStudentReport(localStorage).journal.some((entry) => entry.body.includes('only on this phone')), true);

  const other = structuredClone(loadStudentReport(localStorage));
  other.studentId = 'student-other';
  await chooseFile(picker, 'other.json', exportProgressPacket(other));
  click(button(page.host, 'Merge into my journal'));
  assert.match(page.host.querySelector('[role="alert"]')?.textContent ?? '', /different student/);
  assert.equal(loadStudentReport(localStorage).studentId, 'student-local');

  await chooseFile(picker, 'backup.json', JSON.stringify({ advantage: 'student-journal-backup', version: 1 }));
  assert.match(page.host.querySelector('[role="alert"]')?.textContent ?? '', /Student Edition backup from Back up my journal/);
  assert.match(page.host.querySelector('[role="alert"]')?.textContent ?? '', /not a coach plan or coach feedback file/);

  await chooseFile(picker, 'sheet.csv', csvText, 'text/csv');
  assert.match(page.host.querySelector('[role="alert"]')?.textContent ?? '', /This is a spreadsheet/);

  await chooseFile(picker, 'notes.txt', 'hello from class', 'text/plain');
  assert.match(page.host.querySelector('[role="alert"]')?.textContent ?? '', /This file is not JSON/);

  await chooseFile(picker, 'mystery.json', '{"hello":1}');
  assert.match(page.host.querySelector('[role="alert"]')?.textContent ?? '', /no coach-plan or coach-feedback kind/);
  assert.match(page.host.querySelector('[role="alert"]')?.textContent ?? '', /schemaVersion missing/);

  await chooseFile(picker, 'empty.json', '   ');
  assert.match(page.host.querySelector('[role="alert"]')?.textContent ?? '', /This file is empty/);

  const marked = {
    ...feedback,
    feedback: { ...feedback.feedback, suggestions: [{ ...feedback.feedback.suggestions[0], met: true }] },
  };
  await chooseFile(picker, 'marked.json', JSON.stringify(marked));
  assert.match(page.host.querySelector('[role="alert"]')?.textContent ?? '', /cannot do that, so it was not imported/);
  assert.equal(loadStudentReport(localStorage).journal.some((entry) => entry.body.includes('only on this phone')), true);

  unmount(page);
});
