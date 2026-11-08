/**
 * Rendered example screens. Student and instructor stay off the academy medal total.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AncestryAcademyPreview, AncestryInstructorPreview, AncestryStudentPreview } from './AncestryScopePreview.tsx';

const dom = new Window({ url: 'http://localhost/preview/ancestry-academy' });
const view = dom as unknown as Window & typeof globalThis;

function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('HTMLButtonElement', view.HTMLButtonElement);
installGlobal('Node', view.Node);
installGlobal('Element', view.Element);
installGlobal('DocumentFragment', view.DocumentFragment);
installGlobal('Event', view.Event);
installGlobal('MouseEvent', view.MouseEvent);
installGlobal('getComputedStyle', view.getComputedStyle.bind(view));
installGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
  callback(0);
  return 1;
});
installGlobal('cancelAnimationFrame', () => {});
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode, path: string): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);
  });
  return { root, host };
}

test('student, instructor, and academy screens stay on their own facts', () => {
  const student = mount(<AncestryStudentPreview />, '/preview/ancestry-student');
  assert.deepEqual(
    [...student.host.querySelectorAll('.ancestry-scope a')].map((link) => link.textContent),
    ['Student profile', 'Instructor profile', 'Academy profile'],
  );
  assert.equal(student.host.querySelector('h1')?.textContent, 'Identity card');
  assert.equal(student.host.querySelectorAll('img').length, 2);
  assert.ok(student.host.querySelector('[data-testid="student-home-surface"]'));
  assert.ok(student.host.querySelector('[data-testid="my-profile-surface"]'));
  assert.equal(student.host.querySelector('[data-testid="trained-with"]')?.textContent?.includes('Ren Park'), true);
  assert.equal(student.host.querySelector('[data-testid="academy-medals"]'), null);
  assert.doesNotMatch(student.host.textContent ?? '', /character sheet/i);
  act(() => student.root.unmount());

  const instructor = mount(<AncestryInstructorPreview />, '/preview/ancestry-instructor');
  assert.equal(instructor.host.querySelector('[data-testid="instructor-line"]')?.textContent, 'You → Professor Fabio Acosta → Master Carlos Gracie Junior');
  assert.match(instructor.host.textContent ?? '', /Example portrait\. Not a photo of you\./);
  assert.match(instructor.host.textContent ?? '', /240/);
  assert.doesNotMatch(instructor.host.textContent ?? '', /4180|4,180|Adele Voss|Jonah Peck|Lila Quinn/);
  assert.equal(instructor.host.querySelector('[data-testid="academy-medals"]'), null);
  assert.match(instructor.host.textContent ?? '', /Not your students/);
  act(() => instructor.root.unmount());

  const academy = mount(<AncestryAcademyPreview />, '/preview/ancestry-academy');
  assert.equal(academy.host.querySelector('[data-testid="academy-medals"] [data-medal="gold"] strong')?.textContent, '2');
  assert.equal(academy.host.querySelector('[data-testid="academy-medals"] [data-medal="silver"] strong')?.textContent, '1');
  assert.equal(academy.host.querySelector('[data-testid="gym-awards"]')?.textContent?.includes('1st'), true);
  assert.match(academy.host.querySelector('[data-testid="award-total"]')?.textContent ?? '', /2 awards/);
  assert.match(academy.host.textContent ?? '', /Example academy image/);
  assert.match(academy.host.querySelector('[data-testid="academy-wins"]')?.textContent ?? '', /Medals, match wins/);
  assert.match(academy.host.querySelector('[data-testid="result-outside"]')?.textContent ?? '', /Winter Classic 2024/);
  assert.match(academy.host.textContent ?? '', /Adding each professor's student list would say 5/);
  assert.doesNotMatch(academy.host.textContent ?? '', /character sheet|Gracie Barra|Tracy Baja/i);
  act(() => academy.root.unmount());
});
