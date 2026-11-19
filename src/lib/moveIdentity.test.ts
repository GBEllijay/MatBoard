import test from 'node:test';
import assert from 'node:assert/strict';
import { d8Catalog } from '../indexCards/catalog.ts';
import { assembleCards, emptyIndexCards, withCardLink } from './indexCards.ts';
import { buildGlossaryBaseCards, type GlossaryBaseCatalog } from './glossaryBaseCards.ts';
import { sanitizeArchive, setNodeGlossaryCard, type TechniqueNode, type TechniqueTreeArchive } from './techniqueTreeStore.ts';
import {
  glossaryCardIdForName,
  moveKey,
  singularKey,
  stepIdentity,
  stepIdentityName,
} from './moveIdentity.ts';
import {
  cardTree,
  connectionsForIdentity,
  edgesFromArchive,
  edgesFromCards,
  edgesFromCatalog,
  resolveLinks,
  treeStepFor,
} from './d8TreeLinks.ts';

let seq = 0;
function node(title: string, kind: TechniqueNode['kind'], children: TechniqueNode[] = [], extra: Partial<TechniqueNode> = {}): TechniqueNode {
  seq += 1;
  return { id: `n-${seq}`, slotId: `s-${seq}`, kind, title, notes: '', collapsed: false, children, ...extra };
}

function archiveOf(root: TechniqueNode, id = 'tree-1'): TechniqueTreeArchive {
  return { version: 2, activeId: id, trees: [{ id, name: 'Guard game', root }] };
}

function catalogWith(links: GlossaryBaseCatalog['links']): GlossaryBaseCatalog {
  return { version: 1, cards: buildGlossaryBaseCards().cards, links, collisions: [], skipped: [] };
}

const catalog = d8Catalog();

test('safe normalization: case, punctuation, plural; never a different word', () => {
  assert.equal(moveKey('Closed Guard!'), 'closed-guard');
  assert.equal(moveKey('Hip escapes'), 'hip-escape');
  assert.equal(singularKey('cross'), 'cross', 'double s stays');
  assert.equal(singularKey('pass'), 'pass');
  assert.equal(singularKey('abs'), 'abs', 'short words stay');
  assert.equal(glossaryCardIdForName('closed guards'), 'gbase.closed-guard');
  assert.equal(glossaryCardIdForName('Juji gatame'), 'gbase.armbar', 'glossary alias');
  assert.equal(glossaryCardIdForName('Armbar from mount'), null, 'a roll-up line is not the Armbar card');
  assert.equal(glossaryCardIdForName('Base position'), null);
});

test('a tree step auto-links to its glossary card by name or alias; link and unlink by hand', () => {
  assert.deepEqual(stepIdentity({ title: 'Closed guard' }), { cardId: 'gbase.closed-guard', how: 'auto' });
  assert.deepEqual(stepIdentity({ title: 'Base Position' }), { cardId: null, how: 'none' });
  assert.deepEqual(stepIdentity({ title: 'Base Position', glossaryCardId: 'gbase.closed-guard' }), { cardId: 'gbase.closed-guard', how: 'linked' });
  assert.equal(stepIdentityName({ title: 'Base Position', glossaryCardId: 'gbase.closed-guard' }), 'Closed Guard');
  assert.deepEqual(stepIdentity({ title: 'Closed guard', glossaryCardId: null }), { cardId: null, how: 'unlinked' });
  assert.deepEqual(stepIdentity({ title: 'Mount', glossaryCardId: 'gbase.not-a-term' }), { cardId: 'gbase.mount', how: 'auto' }, 'unknown card falls back');
});

test('the explicit link is saved on the step and survives the store sanitizer', () => {
  const root = node('Base Position', 'root', [node('Scissor sweep', 'branch')]);
  const doc = archiveOf(root).trees[0];
  const linked = setNodeGlossaryCard(doc, root.id, 'gbase.closed-guard');
  assert.equal(linked.root?.glossaryCardId, 'gbase.closed-guard');
  const clean = sanitizeArchive({ version: 2, activeId: doc.id, trees: [linked] });
  assert.equal(clean.archive.trees[0].root?.glossaryCardId, 'gbase.closed-guard');
  assert.equal(clean.repaired, false);
  const unlinked = setNodeGlossaryCard(linked, root.id, null);
  assert.equal(sanitizeArchive({ version: 2, activeId: doc.id, trees: [unlinked] }).archive.trees[0].root?.glossaryCardId, null);
  const auto = setNodeGlossaryCard(unlinked, root.id, undefined);
  assert.equal('glossaryCardId' in (auto.root as object), false);
  assert.equal(setNodeGlossaryCard(doc, root.id, 'javascript:alert(1)'), doc, 'only glossary card ids');
  const junk = sanitizeArchive({ version: 2, activeId: doc.id, trees: [{ ...doc, root: { ...root, glossaryCardId: 42 } }] });
  assert.equal(junk.archive.trees[0].root?.glossaryCardId, undefined);
});

test('old trees without the field read the same (non-destructive)', () => {
  const root = node('Closed guard', 'root', [node('Triangle', 'branch')]);
  const raw = JSON.parse(JSON.stringify(archiveOf(root)));
  const clean = sanitizeArchive(raw);
  assert.equal(clean.repaired, false);
  assert.deepEqual(clean.archive, raw);
});

test('a hand-linked step goes by its glossary card on the D8; an unlinked step matches its exact name only', () => {
  const cards = assembleCards(catalog, emptyIndexCards());
  const root = node('Base Position', 'root', [node('Scissor sweep', 'branch')], { glossaryCardId: 'gbase.closed-guard' });
  const links = resolveLinks(cards, edgesFromArchive(archiveOf(root)));
  assert.deepEqual(links.map((link) => [link.from.id, link.to.id]), [['pos.closed-guard', 'sweep.scissor']]);
  const guard = cards.find((card) => card.id === 'pos.closed-guard')!;
  assert.deepEqual(treeStepFor(guard, cards, archiveOf(root)), { treeId: 'tree-1', nodeId: root.id });

  const unlinked = node('Triangle', 'root', [node('Mount', 'branch')], { glossaryCardId: null });
  assert.deepEqual(resolveLinks(cards, edgesFromArchive(archiveOf(unlinked))), [], 'alias match is off once unlinked');
  const exact = node('Closed guard', 'root', [node('Mount', 'branch')], { glossaryCardId: null });
  assert.equal(resolveLinks(cards, edgesFromArchive(archiveOf(exact))).length, 1, 'its own exact name still matches');
});

test('a link added in the tree shows on the glossary card and the D8 card', () => {
  const root = node('Closed guard', 'root', [node('Triangle', 'branch')]);
  const archive = archiveOf(root);
  const edges = edgesFromArchive(archive);
  const onGlossaryCard = connectionsForIdentity({ cardId: 'gbase.closed-guard', name: 'Closed Guard' }, edges);
  assert.deepEqual(onGlossaryCard.map((row) => [row.direction, row.name, row.cardId, row.source]), [
    ['leads', 'Triangle', 'gbase.triangle-choke', 'tree'],
  ]);
  const cards = assembleCards(catalog, emptyIndexCards());
  const d8 = cardTree(cards.find((card) => card.id === 'pos.closed-guard')!, cards, edges);
  assert.deepEqual(d8.leadsTo.map((row) => row.cardId), ['sub.triangle']);
});

test('a link added on a glossary card or a D8 card shows on the tree step', () => {
  const step = { cardId: 'gbase.closed-guard', name: 'Closed guard' };
  const glossary = catalogWith([
    { id: 'l1', from: { type: 'card', cardId: 'gbase.closed-guard' }, toCardId: 'gbase.kimura', relation: 'branch', label: '' },
  ]);
  const fromGlossary = connectionsForIdentity(step, edgesFromCatalog(glossary, null));
  assert.deepEqual(fromGlossary.map((row) => [row.direction, row.name, row.source]), [['leads', 'Kimura', 'glossary']]);

  const file = withCardLink(catalog, emptyIndexCards(), 'pos.closed-guard', { to: 'sweep.scissor', relation: 'leads' });
  const cards = assembleCards(catalog, file);
  const fromCard = connectionsForIdentity(step, edgesFromCards(file, cards));
  assert.deepEqual(fromCard.map((row) => [row.direction, row.name, row.source]), [['leads', 'Scissor sweep', 'card']]);

  // A step named differently but linked by hand to the same card sees the same links.
  const base = node('Base Position', 'root', [], { glossaryCardId: 'gbase.closed-guard' });
  const identity = stepIdentity(base);
  assert.equal(connectionsForIdentity({ cardId: identity.cardId, name: stepIdentityName(base) }, edgesFromCards(file, cards)).length, 1);
});

test('a link from a tree step on a glossary card follows the step identity', () => {
  const root = node('Base Position', 'root', [], { glossaryCardId: 'gbase.mount' });
  const archive = archiveOf(root);
  const glossary = catalogWith([
    {
      id: 'l2',
      from: { type: 'tree', treeId: 'tree-1', nodeId: root.id, slotId: root.slotId, title: 'Base Position' },
      toCardId: 'gbase.kimura',
      relation: 'branch',
      label: '',
    },
  ]);
  const edges = edgesFromCatalog(glossary, archive);
  assert.deepEqual(edges.map((edge) => [edge.from, edge.to, edge.fromCard]), [['Mount', 'Kimura', 'gbase.mount']]);
  const cards = assembleCards(catalog, emptyIndexCards());
  const mount = cardTree(cards.find((card) => card.id === 'pos.mount')!, cards, edges);
  assert.deepEqual(mount.leadsTo.map((row) => row.cardId), ['sub.kimura']);
});

test('the same link from two places is shown once (union, nothing deleted)', () => {
  const root = node('Closed guard', 'root', [node('Triangle', 'branch')]);
  const glossary = catalogWith([
    { id: 'l3', from: { type: 'card', cardId: 'gbase.closed-guard' }, toCardId: 'gbase.triangle-choke', relation: 'branch', label: '' },
  ]);
  const edges = [...edgesFromArchive(archiveOf(root)), ...edgesFromCatalog(glossary, archiveOf(root))];
  assert.equal(edges.length, 2, 'both saved links are kept');
  const rows = connectionsForIdentity({ cardId: 'gbase.closed-guard', name: 'Closed guard' }, edges);
  assert.equal(rows.length, 1);
  const cards = assembleCards(catalog, emptyIndexCards());
  const links = resolveLinks(cards, edges);
  assert.deepEqual(links.map((link) => link.sources), [['tree', 'glossary']]);
});
