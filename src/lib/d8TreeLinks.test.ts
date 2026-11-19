import test from 'node:test';
import assert from 'node:assert/strict';
import { d8Catalog } from '../indexCards/catalog.ts';
import { FACES } from '../preview/d8Subfactors/model.ts';
import { buildSubfactorTopo, faceGridSize, showOnDiamond } from '../preview/d8Subfactors/topoModel.ts';
import { assembleCards, emptyIndexCards, withCardLink, withCustomCard, type IndexCardFile, type LiveCard } from './indexCards.ts';
import type { TechniqueNode, TechniqueTreeArchive } from './techniqueTreeStore.ts';
import type { GlossaryBaseCatalog } from './glossaryBaseCards.ts';
import {
  BRANCHES_EMPTY_HINT,
  BRANCHES_UNMATCHED_HINT,
  branchState,
  cardMatcher,
  cardTree,
  edgesFromArchive,
  edgesFromCards,
  edgesFromCatalog,
  glossaryCardIdFor,
  liveBranches,
  liveChains,
  resolveLinks,
  techniqueTreeHref,
  treeStepFor,
  connectionOptions,
  type NamedEdge,
} from './d8TreeLinks.ts';

let seq = 0;
function node(title: string, kind: TechniqueNode['kind'], children: TechniqueNode[] = []): TechniqueNode {
  seq += 1;
  return { id: `node-${seq}`, slotId: `slot-${seq}`, kind, title, notes: '', collapsed: false, children };
}

/** Fictional tree, the shape the Technique Tree page saves. */
function sampleArchive(): TechniqueTreeArchive {
  const scissor = node('Scissor sweep', 'branch', [node('Mount', 'branch', [node('Cross collar choke', 'branch'), node('Armbar from guard', 'branch')])]);
  const root = node('Closed guard', 'root', [scissor, node('Triangle', 'branch'), node('Posture up', 'defense'), node('Knee slice', 'branch')]);
  return {
    version: 2,
    activeId: 'tree-a',
    trees: [
      {
        id: 'tree-a',
        name: 'Guard game',
        root,
        links: [{ id: 'link-1', fromSlotId: root.children[1].slotId, toSlotId: root.children[0].children[0].slotId, relation: 'follow', label: '' }],
      },
    ],
  };
}

const catalog = d8Catalog();

function liveCards(file: IndexCardFile = emptyIndexCards()): LiveCard[] {
  return assembleCards(catalog, file);
}

/** The same mesh the live D8 draws: every face's strongest cards on the diamond. */
function liveModel(cards: readonly LiveCard[]) {
  const grids = FACES.map((face) => faceGridSize(cards.filter((card) => card.faceId === face.id).length));
  const model = buildSubfactorTopo(FACES, () => null, (index) => grids[index] ?? faceGridSize(0));
  FACES.forEach((face, index) => {
    const mine = cards.filter((card) => card.faceId === face.id);
    showOnDiamond(model, index, mine.map((card) => ({ id: card.id, name: card.tile, rating: card.rating })));
  });
  return model;
}

test('tree steps become leads-to and defense links, plus extra links between steps', () => {
  const edges = edgesFromArchive(sampleArchive());
  const pairs = edges.map((edge) => `${edge.from}>${edge.to}:${edge.relation}`);
  assert.ok(pairs.includes('Closed guard>Scissor sweep:leads'));
  assert.ok(pairs.includes('Closed guard>Posture up:defense'));
  assert.ok(pairs.includes('Mount>Armbar from guard:leads'));
  assert.ok(pairs.includes('Triangle>Mount:leads'), 'follow link between steps');
  assert.ok(edges.every((edge) => edge.source === 'tree' && edge.treeId === 'tree-a' && edge.nodeId));
  assert.deepEqual(edgesFromArchive(null), []);
});

test('glossary card links in the Technique Tree are read too', () => {
  const glossary: GlossaryBaseCatalog = {
    version: 1,
    cards: [
      { id: 'gbase.kimura', slotId: 's1', glossaryTermId: 'gl.kimura', termKey: 'kimura', title: 'Kimura', faceId: 'submissions', aliases: [], definition: '', subFactor: '' },
      { id: 'gbase.side-control', slotId: 's2', glossaryTermId: 'gl.side-control', termKey: 'side-control', title: 'Side Control', faceId: 'guard-control', aliases: [], definition: '', subFactor: '' },
    ],
    links: [{ id: 'l1', from: { type: 'card', cardId: 'gbase.side-control' }, toCardId: 'gbase.kimura', relation: 'branch', label: '' }],
    collisions: [],
    skipped: [],
  };
  assert.deepEqual(
    edgesFromCatalog(glossary).map((edge) => [edge.from, edge.to, edge.relation, edge.source]),
    [['Side Control', 'Kimura', 'leads', 'glossary']],
  );
});

test('names map to D8 cards only by exact name, glossary alias, or safe normalization', () => {
  const match = cardMatcher(liveCards());
  assert.equal(match('closed guard')?.id, 'pos.closed-guard');
  assert.equal(match('CLOSED-GUARD!')?.id, 'pos.closed-guard', 'case and punctuation');
  assert.equal(match('Closed guards')?.id, 'pos.closed-guard', 'plural');
  assert.equal(match('Triangle')?.id, 'sub.triangle', 'glossary alias');
  assert.equal(match('Hip escapes')?.id, 'escape.shrimp', 'glossary alias, plural');
  assert.equal(match('Wrist lock'), null);
  assert.equal(match('Posture up'), null);
});

test('a move never maps to a different technique', () => {
  const match = cardMatcher(liveCards());
  assert.equal(match('Armbar from guard'), null, 'not the D8 line Armbar from mount');
  assert.equal(match('Armbar'), null, 'the glossary roll-up line is a different move');
  assert.equal(match('Juji gatame'), null, 'alias of Armbar, still not Armbar from mount');
  assert.equal(match('Knee slice'), null, 'a shared prefix is not the same move as Knee slice pass');
  assert.equal(match('Armbar from mount')?.id, 'sub.armbar-mount', 'its own exact name still works');
  assert.equal(match('Mount', undefined, true)?.id, 'pos.mount', 'exact-only lookups still match the exact name');
  assert.equal(match('Triangle', undefined, true), null, 'exact-only lookups skip glossary aliases');
});

test("a student's own move matches by its own name", () => {
  const added = withCustomCard(catalog, emptyIndexCards(), 'submissions', 'Wrist lock', 3);
  assert.ok(!('error' in added));
  const match = cardMatcher(liveCards(added.file));
  assert.equal(match('wrist lock')?.id, 'term.wrist-lock');
});

test('branches join only moves drawn on the diamond, once per pair, leads-to only', () => {
  const cards = liveCards();
  const model = liveModel(cards);
  const links = resolveLinks(cards, edgesFromArchive(sampleArchive()));
  const branches = liveBranches(model, links);
  const names = branches.map((branch) => `${branch.fromName}>${branch.toName}`);
  assert.ok(names.includes('Closed Guard>Scissor sweep'));
  assert.ok(names.includes('Mount>Cross collar choke'));
  assert.ok(!names.some((name) => name.includes('Armbar')), 'Armbar from guard is not Armbar from mount, so it stays off');
  assert.ok(!names.some((name) => name.includes('Knee slice')), 'Knee slice is not Knee slice pass');
  assert.ok(names.includes('Closed Guard>Triangle choke'), 'glossary alias');
  assert.ok(!names.some((name) => name.includes('Posture')), 'defense and unknown names stay off');
  const keys = branches.map((branch) => [branch.from, branch.to].sort((a, b) => a - b).join(':'));
  assert.equal(new Set(keys).size, keys.length);
  for (const branch of branches) {
    assert.equal(model.tiles[branch.from].move?.id, branch.id.split('->')[0]);
  }
});

test('empty state: no links, or links that miss the D8, never fall back to example data', () => {
  const cards = liveCards();
  const model = liveModel(cards);
  assert.deepEqual(branchState(model, cards, []), { kind: 'empty', hint: BRANCHES_EMPTY_HINT });
  const onlyDefense: NamedEdge[] = [{ from: 'Closed guard', to: 'Posture up', relation: 'defense', source: 'tree' }];
  assert.equal(branchState(model, cards, onlyDefense).kind, 'empty');
  const missing: NamedEdge[] = [{ from: 'Wrist lock', to: 'Posture up', relation: 'leads', source: 'tree' }];
  assert.deepEqual(branchState(model, cards, missing), { kind: 'unmatched', hint: BRANCHES_UNMATCHED_HINT, saved: 1 });
  const ready = branchState(model, cards, edgesFromArchive(sampleArchive()));
  assert.equal(ready.kind, 'ready');
});

test('chains follow the student links from a root, through followChain, with card names', () => {
  const cards = liveCards();
  const model = liveModel(cards);
  const chains = liveChains(model, resolveLinks(cards, edgesFromArchive(sampleArchive())));
  assert.ok(chains.length >= 1);
  assert.equal(chains[0].names[0], 'Closed Guard');
  assert.deepEqual(chains[0].names.slice(0, 3), ['Closed Guard', 'Scissor sweep', 'Mount']);
  assert.ok(chains.every((chain) => chain.sample === false && chain.tiles.length >= 2));
  assert.deepEqual(liveChains(model, []), []);
});

test('card connections become links by id and show on both cards', () => {
  const linked = withCardLink(catalog, emptyIndexCards(), 'td.double-leg', { to: 'pos.side-control', relation: 'leads' });
  const cards = liveCards(linked);
  const edges = edgesFromCards(linked, cards);
  assert.deepEqual(edges.map((edge) => [edge.fromId, edge.toId, edge.source]), [['td.double-leg', 'pos.side-control', 'card']]);
  const from = cardTree(cards.find((card) => card.id === 'td.double-leg')!, cards, edges);
  assert.equal(from.leadsTo[0].cardId, 'pos.side-control');
  assert.ok(from.leadsTo[0].removable);
  const to = cardTree(cards.find((card) => card.id === 'pos.side-control')!, cards, edges);
  assert.equal(to.comesFrom[0].cardId, 'td.double-leg');
  assert.deepEqual(to.comesFrom[0].removable, { from: 'td.double-leg', to: 'pos.side-control', relation: 'leads' }, 'removable from either card');
});

test('card tree lists leads-to, defenses, and comes-from, keeping names that are not D8 cards', () => {
  const cards = liveCards();
  const edges = edgesFromArchive(sampleArchive());
  const guard = cardTree(cards.find((card) => card.id === 'pos.closed-guard')!, cards, edges);
  assert.deepEqual(guard.leadsTo.map((row) => [row.name, row.cardId]), [
    ['Scissor sweep', 'sweep.scissor'],
    ['Triangle choke', 'sub.triangle'],
    ['Knee slice', null],
  ]);
  assert.deepEqual(guard.defenses.map((row) => [row.name, row.cardId]), [['Posture up', null]]);
  assert.deepEqual(guard.treeStep, { treeId: 'tree-a', nodeId: guard.treeStep?.nodeId });
  const mount = cardTree(cards.find((card) => card.id === 'pos.mount')!, cards, edges);
  assert.deepEqual(mount.comesFrom.map((row) => row.name).sort(), ['Scissor sweep', 'Triangle choke']);
});

test('Open in Technique Tree focuses the step, else the glossary card', () => {
  const cards = liveCards();
  const archive = sampleArchive();
  const mount = cards.find((card) => card.id === 'pos.mount')!;
  const step = treeStepFor(mount, cards, archive);
  assert.ok(step);
  assert.equal(techniqueTreeHref(step, null), `/technique-tree?tree=tree-a&node=${step!.nodeId}`);
  const kimura = cards.find((card) => card.id === 'sub.kimura')!;
  assert.equal(treeStepFor(kimura, cards, archive), null);
  assert.equal(glossaryCardIdFor(kimura), 'gbase.kimura');
  assert.equal(techniqueTreeHref(null, 'gbase.kimura'), '/technique-tree?card=gbase.kimura');
  assert.equal(techniqueTreeHref(null, null), '/technique-tree');
});

test('inline connection search: D8 cards and own moves first, then glossary moves not on the D8', () => {
  const added = withCustomCard(catalog, emptyIndexCards(), 'submissions', 'Zombie lock', 3);
  assert.ok(!('error' in added));
  const cards = liveCards(added.file);
  assert.deepEqual(connectionOptions('', cards, 'pos.mount'), []);
  const mount = connectionOptions('mount', cards, 'pos.mount');
  assert.ok(!mount.some((row) => row.id === 'pos.mount'), 'never itself');
  assert.equal(mount[0].kind, 'card');
  assert.ok(mount.some((row) => row.id === 'escape.mount'));
  assert.deepEqual(connectionOptions('zomb', cards, 'pos.mount')[0], { id: 'term.zombie-lock', name: 'Zombie lock', faceLabel: 'Submissions', kind: 'mine' });
  const wrist = connectionOptions('wrist', cards, 'pos.mount');
  assert.ok(wrist.some((row) => row.kind === 'glossary' && row.name === 'Wristlock' && row.id.startsWith('gl.')));
  assert.ok(!connectionOptions('closed guard', cards, 'pos.mount').some((row) => row.kind === 'glossary' && row.name === 'Closed Guard'), 'a glossary move already on the D8 is listed once');
});

test('a glossary move that is not on the D8 can be linked by name and stays its own move', () => {
  const file = withCardLink(catalog, emptyIndexCards(), 'pos.mount', { to: 'gl.armbar', relation: 'leads', name: 'Armbar' });
  assert.deepEqual(file.cards[0].links, [{ to: 'gl.armbar', relation: 'leads', name: 'Armbar' }]);
  assert.equal(withCardLink(catalog, emptyIndexCards(), 'pos.mount', { to: 'gl.armbar', relation: 'leads' }).cards.length, 0, 'needs a name');
  const cards = liveCards(file);
  const edges = edgesFromCards(file, cards);
  const mount = cardTree(cards.find((card) => card.id === 'pos.mount')!, cards, edges);
  assert.deepEqual([mount.leadsTo[0].name, mount.leadsTo[0].cardId], ['Armbar', null], 'never Armbar from mount');
  assert.deepEqual(mount.leadsTo[0].removable, { from: 'pos.mount', to: 'gl.armbar', relation: 'leads' });
  assert.equal(edges[0].toCard, 'gbase.armbar', 'same identity as the Armbar glossary card');
  const model = liveModel(cards);
  const state = branchState(model, cards, edges);
  assert.equal(state.kind, 'unmatched', 'Armbar is not on the D8, so no branch is drawn');
});
