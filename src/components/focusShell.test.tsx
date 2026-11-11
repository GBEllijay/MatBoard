/**
 * Focus + drawer: Hide screen stays put while the coach steps through
 * techniques, and the drawer tabs switch.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { FocusShell } from './FocusShell.tsx';

const dom = new Window({ url: 'http://localhost/notes?from=coach' });
const view = dom as unknown as Window & typeof globalThis;

function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('Element', view.Element);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return {
    host,
    root,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
    },
  };
}

function buttonNamed(host: ParentNode, name: string) {
  const found = [...host.querySelectorAll('button')].find((item) => {
    const label = item.getAttribute('aria-label');
    return label === name || item.textContent?.trim() === name;
  });
  assert.ok(found, name);
  return found as HTMLButtonElement;
}

const STEPS = [
  { label: 'Technique 1 of 4', title: 'Closed guard frames', notes: 'Lock closed guard, then walk your hips off the line.' },
  { label: 'Technique 2 of 4', title: 'Knee slice', notes: 'When they open, drop a knee in the middle and slice through.' },
  { label: 'Technique 3 of 4', title: 'Kneebar', notes: 'From the failed pass, catch the knee.' },
  { label: 'Technique 4 of 4', title: 'Butterfly recovery', notes: 'Recover the guard when the pass stalls.' },
];

function Harness({ tabs }: { tabs: 'notes' | 'videos' }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index] ?? STEPS[0];
  const drawer =
    tabs === 'notes'
      ? [
          { id: 'plan', label: 'Plan', panel: <p>Plan outline</p> },
          { id: 'videos', label: 'Videos', panel: <p>Video list</p> },
          { id: 'details', label: 'Details', panel: <p>Block details</p> },
        ]
      : [
          { id: 'clips', label: 'Clips', panel: <p>Clip list</p> },
          { id: 'notes', label: 'Notes', panel: <p>Lesson notes</p> },
          { id: 'details', label: 'Details', panel: <p>Loop length</p> },
        ];
  return (
    <FocusShell
      title="Closed guard retention"
      player={<div data-player="">Clip</div>}
      stepLabel={step.label}
      onPrev={() => setIndex((current) => Math.max(0, current - 1))}
      onNext={() => setIndex((current) => Math.min(STEPS.length - 1, current + 1))}
      prevDisabled={index === 0}
      nextDisabled={index === STEPS.length - 1}
      summaryTitle={step.title}
      summaryText={step.notes}
      hide={
        <section aria-label="Hide screen">
          <button type="button">Hide screen</button>
          <div role="radiogroup" aria-label="What the hidden screen shows">
            <button type="button" role="radio">Logo</button>
            <button type="button" role="radio">Schedule</button>
            <button type="button" role="radio">Black</button>
          </div>
        </section>
      }
      tabs={drawer}
    />
  );
}

test('Hide screen stays mounted and sticky while technique changes', async () => {
  const css = readFileSync('src/components/focusShell.css', 'utf8');
  assert.match(css, /\.focus-shell__hide\s*\{[^}]*position:\s*sticky/s);
  const { host, unmount } = mount(<Harness tabs="videos" />);
  const hide = host.querySelector('[data-focus-hide]') as HTMLElement;
  const button = buttonNamed(hide, 'Hide screen');
  assert.equal(button.isConnected, true);
  assert.equal(hide.querySelector('[aria-label="What the hidden screen shows"]')?.textContent, 'LogoScheduleBlack');
  assert.equal(host.querySelector('[data-focus-step]')?.textContent, 'Technique 1 of 4');

  await act(async () => {
    buttonNamed(host, 'Next technique').click();
  });
  assert.equal(host.querySelector('[data-focus-step]')?.textContent, 'Technique 2 of 4');
  assert.equal(host.querySelector('[data-focus-hide]'), hide);
  assert.equal(button.isConnected, true);
  assert.equal(buttonNamed(hide, 'Hide screen'), button);

  await act(async () => {
    buttonNamed(host, 'Next technique').click();
    buttonNamed(host, 'Next technique').click();
  });
  assert.equal(host.querySelector('[data-focus-step]')?.textContent, 'Technique 4 of 4');
  assert.equal(host.querySelector('[data-focus-hide] button')?.textContent, 'Hide screen');
  assert.equal(button.isConnected, true);
  await unmount();
});

test('Plan, Videos, and Details switch, and Clips, Notes, and Details switch', async () => {
  const notes = mount(<Harness tabs="notes" />);
  assert.equal(notes.host.querySelector('[data-focus-panel]')?.getAttribute('data-focus-panel'), 'plan');
  assert.match(notes.host.querySelector('[data-focus-panel]')?.textContent ?? '', /Plan outline/);
  await act(async () => {
    buttonNamed(notes.host, 'Videos').click();
  });
  assert.equal(notes.host.querySelector('[data-focus-panel]')?.getAttribute('data-focus-panel'), 'videos');
  assert.match(notes.host.querySelector('[data-focus-panel]')?.textContent ?? '', /Video list/);
  await act(async () => {
    buttonNamed(notes.host, 'Details').click();
  });
  assert.match(notes.host.querySelector('[data-focus-panel]')?.textContent ?? '', /Block details/);
  await notes.unmount();

  const videos = mount(<Harness tabs="videos" />);
  assert.equal(videos.host.querySelector('[data-focus-panel]')?.getAttribute('data-focus-panel'), 'clips');
  await act(async () => {
    buttonNamed(videos.host, 'Notes').click();
  });
  assert.match(videos.host.querySelector('[data-focus-panel]')?.textContent ?? '', /Lesson notes/);
  await act(async () => {
    buttonNamed(videos.host, 'Details').click();
  });
  assert.match(videos.host.querySelector('[data-focus-panel]')?.textContent ?? '', /Loop length/);
  await videos.unmount();
});

test('the coach pages reuse Hide screen inside the focus shell', () => {
  const notes = readFileSync('src/pages/TrainingNotes.tsx', 'utf8');
  const techniques = readFileSync('src/pages/Techniques.tsx', 'utf8');
  const shell = readFileSync('src/components/FocusShell.tsx', 'utf8');
  assert.match(notes, /COACH_BOARD_FROM/);
  assert.match(notes, /hide=\{<LessonScreenHide/);
  assert.match(techniques, /from'\) === 'coach'/);
  assert.match(techniques, /hide=\{<LessonScreenHide/);
  assert.match(shell, /data-focus-hide/);
  assert.match(shell, /\{hide\}/);
  assert.doesNotMatch(shell, /requestElementFullscreen|LESSON_COVER_MODES/);
});
