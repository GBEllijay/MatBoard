/**
 * Glossary panel and D8 Shape: open a linked card, chain onward, face taps, and link lines.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { createElement, type ReactNode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  addGlossaryBaseLink,
  ensureGlossaryBaseCards,
  findBaseCard,
  saveGlossaryBaseCatalog,
  type GlossaryBaseCatalog,
} from '../lib/glossaryBaseCards.ts';
import { visibleCatalogLinkSegments } from '../lib/glossaryTreeLinks.ts';
import { GlossaryBaseCardsPanel } from './TechniqueTreeGlossary.tsx';
import { TechniqueTreeDiamond } from './TechniqueTreeDiamond.tsx';

const dom = new Window({ url: 'http://localhost/technique-tree' });
const view = dom as unknown as Window & typeof globalThis;

function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('localStorage', view.localStorage);
installGlobal('navigator', view.navigator);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('SVGElement', view.SVGElement);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

function memoryCatalog(): { scissorId: string; mountId: string; armbarId: string; catalog: GlossaryBaseCatalog } {
  view.localStorage.clear();
  const seeded = ensureGlossaryBaseCards();
  const scissor = findBaseCard(seeded.catalog, 'scissor sweep');
  const mount = findBaseCard(seeded.catalog, 'mount');
  const armbar = findBaseCard(seeded.catalog, 'armbar');
  if (!scissor || !mount || !armbar) throw new Error('missing glossary cards');
  const first = addGlossaryBaseLink(seeded.catalog, { type: 'card', cardId: scissor.id }, mount.id, 'branch');
  const second = addGlossaryBaseLink(first.catalog, { type: 'card', cardId: mount.id }, armbar.id, 'branch');
  const saved = saveGlossaryBaseCatalog(second.catalog);
  return { scissorId: scissor.id, mountId: mount.id, armbarId: armbar.id, catalog: saved.catalog };
}

function mount(node: ReactNode): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return { root, host };
}

function unmount(mounted: { root: Root; host: HTMLElement }) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

function labelText(node: Element): string {
  return (node.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function click(host: ParentNode, selector: string, label?: string) {
  const nodes = [...host.querySelectorAll(selector)] as HTMLElement[];
  const node = label
    ? nodes.find((item) => labelText(item) === label) ?? nodes.find((item) => labelText(item).includes(label))
    : nodes[0];
  assert.ok(node, `missing ${selector} ${label ?? ''}`.trim());
  act(() => {
    if (typeof node.click === 'function') node.click();
    else node.dispatchEvent(new view.MouseEvent('click', { bubbles: true }));
  });
}

test('tapping a branch opens the linked card, shows where it comes from, and keeps its Connect to field', () => {
  const data = memoryCatalog();
  let catalog = data.catalog;
  const page = mount(
    createElement(GlossaryBaseCardsPanel, {
      catalog,
      onCatalogChange: (next: GlossaryBaseCatalog) => {
        catalog = next;
      },
    }),
  );
  click(page.host, '.tree-glossary__face', 'Sweeps');
  click(page.host, '.tree-glossary__open', 'Scissor sweep');
  assert.match(page.host.textContent ?? '', /branch\s+Mount/i);
  click(page.host, '[data-testid="tree-glossary-branch"]', 'Mount');
  const open = page.host.querySelector('.tree-glossary__card.is-focus');
  assert.ok(open);
  assert.match(open?.textContent ?? '', /Mount/);
  assert.match(page.host.textContent ?? '', /Comes from Scissor sweep/);
  assert.ok(page.host.querySelector('.tree-connect input'));
  assert.match(page.host.querySelector('[data-testid="tree-glossary-trail"]')?.textContent ?? '', /Scissor sweep/);
  assert.match(page.host.querySelector('[data-testid="tree-glossary-trail"]')?.textContent ?? '', /Mount/);
  unmount(page);
});

test('a link added from a reached card is still there after a reload', () => {
  const data = memoryCatalog();
  const reloaded = saveGlossaryBaseCatalog(data.catalog).catalog;
  assert.ok(reloaded.links.some((link) => link.from.type === 'card' && link.from.cardId === data.mountId && link.toCardId === data.armbarId));
  const page = mount(
    createElement(GlossaryBaseCardsPanel, {
      catalog: reloaded,
      onCatalogChange: () => undefined,
    }),
  );
  click(page.host, '.tree-glossary__face', 'Guard/Control');
  const mountTitle = [...page.host.querySelectorAll('.tree-glossary__title')].find((node) => labelText(node) === 'Mount');
  assert.ok(mountTitle);
  act(() => {
    (mountTitle.closest('button') as HTMLButtonElement).click();
  });
  assert.match(page.host.querySelector('.tree-glossary__card.is-focus')?.textContent ?? '', /branch\s+Armbar/i);
  assert.match(page.host.textContent ?? '', /Comes from Scissor sweep/);
  unmount(page);
});

test('tapping a D8 face lists that face\'s cards, and tapping a term opens the card', () => {
  const data = memoryCatalog();
  let openId: string | null = null;
  let faceId = 'guard-control';
  const page = mount(
    createElement(TechniqueTreeDiamond, {
      catalog: data.catalog,
      activeFaceId: faceId,
      openCardId: openId,
      onOpenFace: (id: string) => {
        faceId = id;
      },
      onOpenCard: (id: string) => {
        openId = id;
      },
    }),
  );
  click(page.host, '[data-testid="tree-d8-face-sweeps"]');
  assert.equal(faceId, 'sweeps');
  act(() => {
    page.root.render(
      createElement(TechniqueTreeDiamond, {
        catalog: data.catalog,
        activeFaceId: 'sweeps',
        openCardId: null,
        onOpenFace: (id: string) => {
          faceId = id;
        },
        onOpenCard: (id: string) => {
          openId = id;
        },
      }),
    );
  });
  assert.match(page.host.querySelector('[data-testid="tree-d8-face-list"]')?.textContent ?? '', /Sweeps/);
  click(page.host, '[data-testid="tree-d8-term"]', 'Scissor sweep');
  assert.equal(openId, data.scissorId);
  unmount(page);
});

test('the technique-link toggle draws two lines for the scissor chain and none when off', () => {
  const data = memoryCatalog();
  assert.equal(visibleCatalogLinkSegments(data.catalog, false).length, 0);
  assert.equal(visibleCatalogLinkSegments(data.catalog, true).length, 2);
  const page = mount(
    createElement(TechniqueTreeDiamond, {
      catalog: data.catalog,
      activeFaceId: null,
      openCardId: null,
      onOpenFace: () => undefined,
      onOpenCard: () => undefined,
    }),
  );
  assert.equal(page.host.querySelectorAll('[data-testid="tree-d8-link"]').length, 0);
  const before = page.host.querySelector('.tree-d8__svg')?.innerHTML ?? '';
  click(page.host, '[data-testid="tree-d8-toggle"]');
  assert.equal(page.host.querySelectorAll('[data-testid="tree-d8-link"]').length, 2);
  click(page.host, '[data-testid="tree-d8-toggle"]');
  assert.equal(page.host.querySelectorAll('[data-testid="tree-d8-link"]').length, 0);
  assert.equal(page.host.querySelector('[data-testid="tree-d8-toggle"]')?.getAttribute('aria-pressed'), 'false');
  const after = page.host.querySelector('.tree-d8__svg')?.innerHTML ?? '';
  assert.equal(after, before);
  unmount(page);
});
