import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addGlossaryBaseLink,
  emptyGlossaryPanelView,
  ensureGlossaryBaseCards,
  findBaseCard,
  GLOSSARY_BASE_STORAGE_KEY,
  linksFrom,
  linksTo,
  linkSourceLabel,
  loadGlossaryBaseCatalog,
  pushGlossaryTrail,
  saveGlossaryBaseCatalog,
  viewForCard,
  viewForFace,
} from './glossaryBaseCards.ts';
import {
  catalogLinkSegments,
  clampTreeD8Zoom,
  countCardToCardLinks,
  resetTreeD8View,
  TREE_D8_MAX_ZOOM,
  TREE_D8_MIN_ZOOM,
  treeD8AnchorFor,
  visibleCatalogLinkSegments,
  wheelTreeD8View,
  zoomTreeD8View,
} from './glossaryTreeLinks.ts';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

const storage = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

function seedChain() {
  storage.clear();
  const seeded = ensureGlossaryBaseCards();
  const scissor = findBaseCard(seeded.catalog, 'scissor sweep');
  const mount = findBaseCard(seeded.catalog, 'mount');
  const armbar = findBaseCard(seeded.catalog, 'armbar');
  assert.ok(scissor);
  assert.ok(mount);
  assert.ok(armbar);
  const first = addGlossaryBaseLink(seeded.catalog, { type: 'card', cardId: scissor.id }, mount.id, 'branch');
  assert.equal(first.status, 'linked');
  const second = addGlossaryBaseLink(first.catalog, { type: 'card', cardId: mount.id }, armbar.id, 'branch');
  assert.equal(second.status, 'linked');
  const saved = saveGlossaryBaseCatalog(second.catalog);
  assert.equal(saved.saved, true);
  return { scissor, mount, armbar, catalog: saved.catalog };
}

test('incoming links list the cards that connect to a reached card', () => {
  const { scissor, mount, armbar, catalog } = seedChain();
  const intoMount = linksTo(catalog, mount.id);
  assert.equal(intoMount.length, 1);
  assert.equal(linkSourceLabel(catalog, intoMount[0]!.from), scissor.title);
  assert.equal(linksFrom(catalog, { type: 'card', cardId: mount.id }).length, 1);
  assert.equal(linksFrom(catalog, { type: 'card', cardId: mount.id })[0]!.toCardId, armbar.id);
  assert.equal(linksTo(catalog, scissor.id).length, 0);
  assert.equal(linkSourceLabel(catalog, { type: 'tree', treeId: 't', nodeId: 'n', slotId: 's', title: 'My closed guard' }), 'My closed guard');
});

test('a link from a reached card persists after reload', () => {
  const { scissor, mount, armbar, catalog } = seedChain();
  assert.equal(catalog.links.length, 2);
  const raw = localStorage.getItem(GLOSSARY_BASE_STORAGE_KEY);
  assert.ok(raw);
  const reloaded = loadGlossaryBaseCatalog();
  assert.equal(reloaded.links.length, 2);
  const fromScissor = linksFrom(reloaded, { type: 'card', cardId: scissor.id });
  const fromMount = linksFrom(reloaded, { type: 'card', cardId: mount.id });
  assert.equal(fromScissor[0]!.toCardId, mount.id);
  assert.equal(fromMount[0]!.toCardId, armbar.id);
  const intoArmbar = linksTo(reloaded, armbar.id);
  assert.equal(intoArmbar.length, 1);
  assert.equal(linkSourceLabel(reloaded, intoArmbar[0]!.from), mount.title);
});

test('opening a linked card switches to its face and builds a breadcrumb trail', () => {
  const { scissor, mount, armbar, catalog } = seedChain();
  const start = viewForFace('sweeps');
  assert.equal(start.faceId, 'sweeps');
  assert.equal(start.openId, null);
  const atScissor = viewForCard(catalog, scissor.id, start);
  assert.equal(atScissor.faceId, 'sweeps');
  assert.equal(atScissor.openId, scissor.id);
  assert.deepEqual(atScissor.trail, [scissor.id]);
  const atMount = viewForCard(catalog, mount.id, atScissor);
  assert.equal(atMount.faceId, 'guard-control');
  assert.equal(atMount.openId, mount.id);
  assert.equal(atMount.query, '');
  assert.deepEqual(atMount.trail, [scissor.id, mount.id]);
  const atArmbar = viewForCard(catalog, armbar.id, atMount);
  assert.deepEqual(atArmbar.trail, [scissor.id, mount.id, armbar.id]);
  assert.equal(atArmbar.faceId, 'submissions');
  const back = viewForCard(catalog, scissor.id, atArmbar);
  assert.deepEqual(back.trail, [scissor.id]);
  assert.deepEqual(pushGlossaryTrail([scissor.id, mount.id], mount.id, armbar.id), [scissor.id, mount.id, armbar.id]);
  assert.equal(emptyGlossaryPanelView().faceId, 'guard-control');
});

test('the technique-link toggle draws one line per card-to-card link and draws none when off', () => {
  const { scissor, mount, armbar, catalog } = seedChain();
  const fromTree = addGlossaryBaseLink(
    catalog,
    { type: 'tree', treeId: 'tree-1', nodeId: 'node-1', slotId: 'slot-1', title: 'My scissor' },
    armbar.id,
    'branch',
  );
  assert.equal(fromTree.status, 'linked');
  assert.equal(fromTree.catalog.links.length, 3);
  assert.equal(countCardToCardLinks(fromTree.catalog), 2);

  const off = visibleCatalogLinkSegments(fromTree.catalog, false);
  assert.deepEqual(off, []);
  assert.equal(visibleCatalogLinkSegments(fromTree.catalog, false).length, catalogLinkSegments(fromTree.catalog).length ? 0 : 0);

  const on = visibleCatalogLinkSegments(fromTree.catalog, true);
  assert.equal(on.length, 2);
  assert.ok(on.some((line) => line.fromCardId === scissor.id && line.toCardId === mount.id));
  assert.ok(on.some((line) => line.fromCardId === mount.id && line.toCardId === armbar.id));
  assert.ok(on.every((line) => line.fromFaceId === 'sweeps' || line.fromFaceId === 'guard-control'));
  assert.ok(on.some((line) => line.fromFaceId === 'sweeps' && line.toFaceId === 'guard-control'));
  assert.ok(on.some((line) => line.fromFaceId === 'guard-control' && line.toFaceId === 'submissions'));
  const scissorFace = treeD8AnchorFor('sweeps');
  const mountFace = treeD8AnchorFor('guard-control');
  const armbarFace = treeD8AnchorFor('submissions');
  assert.ok(scissorFace && mountFace && armbarFace);
  assert.notEqual(scissorFace.side, armbarFace.side);
  const first = on.find((line) => line.fromCardId === scissor.id);
  assert.ok(first);
  assert.ok(Math.hypot(first.x1 - scissorFace.center.x, first.y1 - scissorFace.center.y) < 8);
  assert.ok(Math.hypot(first.x2 - mountFace.center.x, first.y2 - mountFace.center.y) < 8);
});

test('diamond zoom stays in range and reset returns to the starting view', () => {
  const start = resetTreeD8View();
  assert.deepEqual(start, { scale: 1, x: 0, y: 0 });
  assert.equal(clampTreeD8Zoom(0), TREE_D8_MIN_ZOOM);
  assert.equal(clampTreeD8Zoom(99), TREE_D8_MAX_ZOOM);
  const inClose = zoomTreeD8View(start, 2, 100, 80);
  assert.equal(inClose.scale, 2);
  assert.equal((100 - inClose.x) / inClose.scale, 100);
  assert.equal((80 - inClose.y) / inClose.scale, 80);
  const wheeled = wheelTreeD8View(start, -400, 0, 0);
  assert.ok(wheeled.scale > 1);
  assert.deepEqual(resetTreeD8View(), start);
});

test('Mindset and Conditioning cards can be linked and drawn on the diamond', () => {
  storage.clear();
  const seeded = ensureGlossaryBaseCards();
  const breath = findBaseCard(seeded.catalog, 'breathing');
  const stamina = findBaseCard(seeded.catalog, 'stamina');
  const closed = findBaseCard(seeded.catalog, 'closed guard');
  assert.ok(breath && stamina && closed);
  assert.equal(breath.faceId, 'mindset');
  assert.equal(stamina.faceId, 'conditioning');
  const first = addGlossaryBaseLink(seeded.catalog, { type: 'card', cardId: breath.id }, closed.id, 'branch');
  const second = addGlossaryBaseLink(first.catalog, { type: 'card', cardId: closed.id }, stamina.id, 'branch');
  assert.equal(second.status, 'linked');
  const on = visibleCatalogLinkSegments(second.catalog, true);
  assert.ok(on.some((line) => line.fromFaceId === 'mindset' && line.toFaceId === 'guard-control'));
  assert.ok(on.some((line) => line.fromFaceId === 'guard-control' && line.toFaceId === 'conditioning'));
  assert.equal(visibleCatalogLinkSegments(second.catalog, false).length, 0);
  assert.ok(treeD8AnchorFor('mindset') && treeD8AnchorFor('conditioning'));
});
