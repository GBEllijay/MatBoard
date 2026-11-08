/**
 * The Sweeps preview can be opened, selected, and drawn without writing storage.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { ASSESSMENT_STORAGE_KEY, emptyAssessments, saveAssessment, writeAssessments, type AssessmentScores } from '../../lib/studentAssessment.ts';
import { STUDENT_EDITION_STORAGE_KEY } from '../../lib/studentEdition.ts';
import { TECHNIQUE_TREE_STORAGE_KEY } from '../../lib/techniqueTreeStore.ts';
import { PREVIEW_STORAGE_KEY } from '../../lib/techniqueTreePreview.ts';
import { CRYSTAL_PREVIEW_PATH, CrystallineSweepsPreview } from './CrystallineSweepsPreview.tsx';

const dom = new Window({ url: 'http://localhost/preview/crystalline-sweeps' });
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
installGlobal('SVGElement', view.SVGElement);
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('Event', view.Event);
installGlobal('MouseEvent', view.MouseEvent);
installGlobal('PointerEvent', view.PointerEvent);
installGlobal('KeyboardEvent', view.KeyboardEvent);
installGlobal('getComputedStyle', view.getComputedStyle.bind(view));
installGlobal('requestAnimationFrame', view.requestAnimationFrame.bind(view));
installGlobal('cancelAnimationFrame', view.cancelAnimationFrame.bind(view));
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function labeled(host: ParentNode, text: string): HTMLElement {
  const found = [...host.querySelectorAll('button, a, h2, label')].find((node) => node.textContent?.includes(text));
  if (!(found instanceof view.HTMLElement)) throw new Error(`Missing ${text}`);
  return found;
}

function mount(node: ReactNode, entry = CRYSTAL_PREVIEW_PATH): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={[entry]}>{node}</MemoryRouter>);
  });
  return { root, host };
}

function snapshot(): string {
  return [ASSESSMENT_STORAGE_KEY, STUDENT_EDITION_STORAGE_KEY, TECHNIQUE_TREE_STORAGE_KEY, PREVIEW_STORAGE_KEY]
    .map((key) => `${key}=${localStorage.getItem(key) ?? ''}`)
    .join('\n');
}

function seven(): AssessmentScores {
  return { guard: 4, passing: 5, takedowns: 2, escapes: 3, submissions: 4, conditioning: 2, mindset: 3 };
}

function TreeStub() {
  const navigate = useNavigate();
  return (
    <div>
      <p>Tree destination {window.location.search}</p>
      <button type="button" onClick={() => navigate(-1)}>
        History back
      </button>
    </div>
  );
}

test('example relief, list selection, curved toggle, and back do not write storage', () => {
  localStorage.clear();
  writeAssessments(
    localStorage,
    saveAssessment(emptyAssessments(), { date: '2026-11-01', note: 'seven', scores: seven() }, 4),
  );
  const before = snapshot();
  const mounted = mount(<CrystallineSweepsPreview />);
  const host = mounted.host;
  assert.match(host.textContent ?? '', /Nothing on this page is written/);
  assert.match(host.textContent ?? '', /Fundamentals catalog 47 names/);
  assert.equal(labeled(host, 'Sweeps factor').parentElement?.textContent?.includes('Not rated'), true);
  assert.match(host.textContent ?? '', /no Sweeps field/);
  assert.equal(host.querySelector('[data-tile="sweep.scissor"]')?.getAttribute('data-score'), '1');
  assert.equal(host.querySelector('[data-tile="sweep.pendulum"]')?.getAttribute('data-score'), '3');
  assert.equal(host.querySelector('[data-tile="sweep.butterfly"]')?.getAttribute('data-score'), 'unrated');
  assert.equal(host.querySelector('.crystal-label'), null);
  assert.equal(host.querySelector('[data-style]')?.getAttribute('data-style'), 'pyramid');
  assert.equal(host.querySelectorAll('.crystal-face').length, 15);
  act(() => {
    labeled(host, 'Curved relief').click();
  });
  assert.equal(host.querySelector('[data-style]')?.getAttribute('data-style'), 'curved');
  assert.equal(host.querySelector('[data-tile="sweep.scissor"]')?.getAttribute('data-score'), '1');
  assert.equal(host.querySelector('[data-tile="sweep.butterfly"]')?.getAttribute('data-score'), 'unrated');
  assert.equal(host.querySelectorAll('path.crystal-face').length, 15);
  act(() => {
    labeled(host, 'Scissor sweep').click();
  });
  assert.match(host.textContent ?? '', /Move detail/);
  assert.equal(host.querySelector('[aria-label="About Sweeps"]'), null);
  assert.match(host.textContent ?? '', /No saved technique-tree node and no journal card/);
  assert.match(host.textContent ?? '', /temporary example data/i);
  act(() => {
    labeled(host, 'Back').click();
  });
  assert.ok(host.querySelector('[aria-label="About Sweeps"]'));
  assert.match(host.textContent ?? '', /No saved note/);
  act(() => {
    labeled(host, 'Zoom in').click();
    labeled(host, 'Fit face').click();
    labeled(host, 'Saved on this device').click();
  });
  assert.equal(host.querySelector('[data-tile="sweep.scissor"]')?.getAttribute('data-score'), 'unrated');
  assert.equal(host.querySelector('[data-tile="sweep.pendulum"]')?.getAttribute('data-score'), 'unrated');
  assert.equal(snapshot(), before);
  act(() => {
    mounted.root.unmount();
  });
});

test('a tree link opens the saved node and history back returns to the preview', () => {
  localStorage.clear();
  localStorage.setItem(
    TECHNIQUE_TREE_STORAGE_KEY,
    JSON.stringify({
      version: 2,
      activeId: 'tree-sweeps',
      trees: [
        {
          id: 'tree-sweeps',
          name: 'Guard',
          root: {
            id: 'node-sweeps',
            slotId: 'slot-sweeps',
            kind: 'root',
            title: 'Sweeps',
            notes: 'Only the note I saved.',
            collapsed: false,
            children: [
              {
                id: 'node-scissor',
                slotId: 'slot-scissor',
                kind: 'branch',
                title: 'Scissor sweep',
                notes: '',
                collapsed: false,
                children: [],
              },
            ],
          },
        },
      ],
    }),
  );
  const before = snapshot();
  const mounted = mount(
    <Routes>
      <Route path={CRYSTAL_PREVIEW_PATH} element={<CrystallineSweepsPreview />} />
      <Route path="/technique-tree" element={<TreeStub />} />
    </Routes>,
  );
  const host = mounted.host;
  assert.match(host.textContent ?? '', /Only the note I saved/);
  const category = host.querySelector('a[href="/technique-tree?tree=tree-sweeps&node=node-sweeps"]');
  assert.ok(category);
  act(() => {
    labeled(host, 'Scissor sweep').click();
  });
  const moveLink = host.querySelector('a[href="/technique-tree?tree=tree-sweeps&node=node-scissor"]');
  assert.ok(moveLink);
  assert.match(host.textContent ?? '', /Sweeps → Scissor sweep/);
  assert.match(host.textContent ?? '', /No saved note/);
  act(() => {
    (moveLink as HTMLAnchorElement).click();
  });
  assert.match(host.textContent ?? '', /Tree destination/);
  act(() => {
    labeled(host, 'History back').click();
  });
  assert.match(host.textContent ?? '', /Nothing on this page is written/);
  assert.equal(snapshot(), before);
  act(() => {
    mounted.root.unmount();
  });
});

test('keyboard can choose a move from the list and Escape clears it', () => {
  localStorage.clear();
  const mounted = mount(<CrystallineSweepsPreview />);
  const host = mounted.host;
  const button = labeled(host, 'Flower sweep');
  act(() => {
    button.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    button.click();
  });
  assert.match(host.textContent ?? '', /Flower sweep/);
  assert.match(host.textContent ?? '', /Move detail/);
  const stage = host.querySelector('.crystal-svg');
  assert.ok(stage);
  act(() => {
    stage.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  assert.ok(host.querySelector('[aria-label="About Sweeps"]'));
  act(() => {
    mounted.root.unmount();
  });
});
