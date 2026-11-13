/**
 * Lesson plan source bar ("Gym template" vs "My plan"), mounted in happy-dom,
 * plus source checks that the Daily Lesson Plan page saves edits to the instructor's copy.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LessonPlanSourceBar } from './LessonPlanSourceBar.tsx';

const dom = new Window({ url: 'http://localhost/notes' });
const view = dom as unknown as Window & typeof globalThis;
function installGlobal(key: string, value: unknown) {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('Element', view.Element);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return { root, host };
}

const base = {
  editable: true,
  templateExists: true,
  canEditTemplate: false,
  planHasContent: true,
  busy: false,
  note: '',
  onBackToTemplate: () => {},
  onUpdateTemplate: () => {},
};

test('template label, no reset, no template update for an instructor seat', () => {
  const { root, host } = mount(<LessonPlanSourceBar {...base} source="template" />);
  assert.equal(host.querySelector('[data-lesson-source-label]')?.textContent, 'Gym template');
  assert.match(host.textContent ?? '', /Edits save to your own plan/);
  assert.equal(host.querySelector('[data-lesson-back-to-template]'), null);
  assert.equal(host.querySelector('[data-lesson-update-template]'), null);
  act(() => root.unmount());
});

test('my plan: back to template needs a second tap', () => {
  let resets = 0;
  const { root, host } = mount(<LessonPlanSourceBar {...base} source="mine" onBackToTemplate={() => (resets += 1)} />);
  assert.equal(host.querySelector('[data-lesson-source-label]')?.textContent, 'My plan');
  const reset = host.querySelector('[data-lesson-back-to-template]') as HTMLButtonElement;
  assert.ok(reset);
  act(() => reset.click());
  assert.equal(resets, 0);
  assert.match(reset.textContent ?? '', /Tap again/);
  act(() => reset.click());
  assert.equal(resets, 1);
  act(() => root.unmount());
});

test('owner / Coach: Update gym template, two taps; hidden on a past day', () => {
  let updates = 0;
  const { root, host } = mount(
    <LessonPlanSourceBar {...base} source="mine" canEditTemplate onUpdateTemplate={() => (updates += 1)} />,
  );
  const update = host.querySelector('[data-lesson-update-template]') as HTMLButtonElement;
  assert.ok(update);
  act(() => update.click());
  act(() => update.click());
  assert.equal(updates, 1);
  act(() => root.unmount());
  const past = mount(<LessonPlanSourceBar {...base} source="mine" canEditTemplate editable={false} />);
  assert.equal(past.host.querySelector('[data-lesson-update-template]'), null);
  assert.equal(past.host.querySelector('[data-lesson-back-to-template]'), null);
  act(() => past.root.unmount());
});

test('the lesson page saves edits to my copy and keeps the phone copy for casting', () => {
  const page = readFileSync('src/pages/TrainingNotes.tsx', 'utf8');
  const lib = readFileSync('src/lib/advantageCloudMedia.ts', 'utf8');
  assert.match(page, /decideLessonOpen/);
  assert.match(page, /saveDay\(dateKey, next, todayKey\)/, 'an opened plan is kept on this phone for the board and casting');
  assert.match(page, /writeLessonSource\(localStorage, lessonCloudRead\.instructorId, todayKey, 'mine'\)/);
  assert.match(page, /<LessonPlanSourceBar/);
  assert.match(lib, /planTarget: 'mine'/);
  assert.doesNotMatch(page, /planTarget: 'template'/, 'the page only updates the template through saveCloudLessonTemplate');
});
