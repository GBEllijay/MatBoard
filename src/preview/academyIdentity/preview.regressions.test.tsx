/**
 * Interactive academy identity preview: founders and lineage styles, no profile writes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { GYM_PROFILE_KEY } from '../../lib/gymProfile.ts';
import { ACADEMY_IDENTITY_PATH, AcademyIdentityPreview } from './AcademyIdentityPreview.tsx';
import { PREVIEW_ACADEMY, PREVIEW_BANNER, PREVIEW_FOUNDERS } from './model.ts';

const dom = new Window({ url: 'http://localhost/preview/academy-identity' });
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
installGlobal('SVGElement', view.SVGElement);
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('Event', view.Event);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function mount(node: ReactNode, path = ACADEMY_IDENTITY_PATH): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);
  });
  return { root, host };
}

function unmount(root: Root, host: HTMLElement) {
  act(() => {
    root.unmount();
  });
  host.remove();
}

test('the preview card separates founders from lineage and starts on nameplates plus classic rail', () => {
  localStorage.clear();
  const { root, host } = mount(<AcademyIdentityPreview />);
  assert.match(host.textContent ?? '', new RegExp(PREVIEW_BANNER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(host.textContent ?? '', new RegExp(PREVIEW_ACADEMY));
  assert.match(host.textContent ?? '', /Marcus Reid/);
  assert.match(host.textContent ?? '', /Elena Vance/);
  assert.match(host.textContent ?? '', /Founded Sep 1, 2019/);
  assert.equal(host.querySelector('[data-testid="academy-founders"]')?.getAttribute('data-founders-style'), 'nameplates');
  assert.equal(host.querySelector('[data-testid="academy-lineage"]')?.getAttribute('data-lineage-style'), 'rail');
  assert.match(host.textContent ?? '', /Carlos Gracie Sr/);
  assert.match(host.textContent ?? '', /Daniel Souza/);
  assert.match(host.textContent ?? '', /This academy/);
  assert.equal(host.textContent?.includes(PREVIEW_FOUNDERS.split(',')[0] ?? 'Marcus'), true);
  assert.equal(host.querySelector('.acad-rail'), host.querySelector('[data-lineage-style="rail"] .acad-rail'));
  assert.equal((host.querySelector('[data-testid="academy-lineage"]')?.compareDocumentPosition(host.querySelector('[data-testid="academy-founders"]') as Node) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING, 0);
  const founders = host.querySelector('[data-testid="academy-founders"]') as HTMLElement;
  const lineage = host.querySelector('[data-testid="academy-lineage"]') as HTMLElement;
  assert.ok(founders && lineage);
  assert.equal(Boolean(founders.compareDocumentPosition(lineage) & Node.DOCUMENT_POSITION_FOLLOWING), true);
  assert.equal(host.querySelectorAll('svg').length, 0);
  assert.equal(/crestSVG|crest-wrap|laurel|viewBox=\"0 0 72 80\"/i.test(host.innerHTML), false);
  unmount(root, host);
});

test('founders and lineage style pickers update the card and never write a gym profile', () => {
  localStorage.clear();
  const { root, host } = mount(<AcademyIdentityPreview />);
  act(() => {
    (host.querySelector('[data-testid="founders-style-plaque"]') as HTMLButtonElement).click();
    (host.querySelector('[data-testid="lineage-style-cards"]') as HTMLButtonElement).click();
  });
  assert.equal(host.querySelector('[data-testid="academy-founders"]')?.getAttribute('data-founders-style'), 'plaque');
  assert.equal(host.querySelector('[data-testid="academy-lineage"]')?.getAttribute('data-lineage-style'), 'cards');
  assert.ok(host.querySelector('.acad-plaque'));
  assert.ok(host.querySelector('.acad-cards'));
  act(() => {
    (host.querySelector('[data-testid="founders-style-crest"]') as HTMLButtonElement).click();
    (host.querySelector('[data-testid="lineage-style-ribbon"]') as HTMLButtonElement).click();
  });
  assert.equal(host.querySelector('[data-testid="academy-founders"]')?.getAttribute('data-founders-style'), 'crest');
  assert.equal(host.querySelector('[data-testid="academy-lineage"]')?.getAttribute('data-lineage-style'), 'ribbon');
  assert.ok(host.querySelector('.acad-crest-strip'));
  assert.ok(host.querySelector('.acad-ribbon'));
  assert.equal(localStorage.getItem(GYM_PROFILE_KEY), null);
  unmount(root, host);
});

test('long chain offers +14 more, lineage off hides the panel, and suggested auto-fill plus Hell typeahead work in memory', () => {
  localStorage.clear();
  const { root, host } = mount(<AcademyIdentityPreview />);
  act(() => {
    (host.querySelector('[data-testid="lineage-demo-long"]') as HTMLButtonElement).click();
  });
  const more = host.querySelector('[data-testid="lineage-more"]') as HTMLButtonElement;
  assert.equal(more?.textContent, '+14 more');
  assert.equal(host.textContent?.includes('Caio Mendonca'), false);
  act(() => {
    more.click();
  });
  const less = host.querySelector('[data-testid="lineage-more"]');
  assert.equal(less?.textContent, 'Show less');
  assert.match(host.textContent ?? '', /Caio Mendonca/);

  act(() => {
    (host.querySelector('[data-testid="lineage-demo-off"]') as HTMLButtonElement).click();
  });
  assert.equal(host.querySelector('[data-testid="academy-lineage"]'), null);
  assert.ok(host.querySelector('[data-testid="academy-founders"]'));
  assert.match(host.textContent ?? '', /Marcus Reid/);

  act(() => {
    (host.querySelector('[data-testid="lineage-demo-edit"]') as HTMLButtonElement).click();
  });
  assert.ok(host.querySelector('[data-testid="academy-lineage-editor"]'));
  assert.match(host.querySelector('[data-testid="lineage-suggested"]')?.textContent ?? '', /Helio Gracie/);
  assert.match(host.querySelector('[data-testid="lineage-suggested"]')?.textContent ?? '', /Suggested/);
  const acceptHelio = [...host.querySelectorAll('.acad-editor__accept')].find((button) =>
    button.parentElement?.parentElement?.textContent?.includes('Helio Gracie'),
  ) as HTMLButtonElement;
  act(() => {
    acceptHelio.click();
  });
  assert.match(host.querySelector('[data-testid="lineage-accepted"]')?.textContent ?? '', /Helio Gracie/);
  const box = host.querySelector('textarea[aria-label="Lineage"]') as HTMLTextAreaElement;
  assert.match(box.value, /Helio Gracie/);

  const add = host.querySelector('input[aria-label="Add a teacher"]') as HTMLInputElement;
  act(() => {
    const key = Object.keys(add).find((name) => name.startsWith('__reactProps'));
    const props = key ? (add as unknown as Record<string, { onChange?: (event: unknown) => void }>)[key] : null;
    Object.getOwnPropertyDescriptor(add.constructor.prototype, 'value')?.set?.call(add, 'Hell');
    props?.onChange?.({ target: add, currentTarget: add });
  });
  assert.match(host.querySelector('[data-testid="lineage-typeahead"]')?.textContent ?? '', /Helio Gracie/);
  assert.equal(/https?:\/\//.test(host.querySelector('[data-testid="lineage-typeahead"]')?.textContent ?? ''), false);
  assert.equal(localStorage.getItem(GYM_PROFILE_KEY), null);
  unmount(root, host);
});
