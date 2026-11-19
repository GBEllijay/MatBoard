/**
 * Technique Tree links for the live D8 and the index (glossary) cards.
 *
 * Three real sources, read only:
 * - the Technique Tree on this device (`matboard.coach.techniqueTree.v1`): every
 *   parent → child step (branch = leads to, defense = defended by) and every extra
 *   link between steps;
 * - the Technique Tree glossary card links (`matboard.coach.techniqueTree.glossaryBase.v1`);
 * - connections the student added from a card (stored on the index card, so they sync
 *   with the signed-in D8 data).
 * Nothing here writes a record. No example graph is used.
 *
 * Name mapping (see moveIdentity.ts), first hit wins:
 * 1. the card's own name, tile name, or built-in name (case, punctuation, and
 *    plural folded);
 * 2. the glossary headword or one of its aliases ("Juji gatame" → "Armbar").
 * Nothing else: a glossary roll-up line or a shared prefix is a different
 * move, so "Armbar from guard" never becomes "Armbar from mount".
 * A name with no hit, or with two equally good hits, is left off the D8.
 * A tree step linked to a glossary card by hand goes by that card's name; a
 * step the coach unlinked matches by its exact name only.
 */

import { GLOSSARY, GLOSSARY_FACE_LABELS } from './glossary.ts';
import { glossaryCardIdForName, glossaryNameKeys, glossaryTermForName, moveKey, stepIdentity, stepIdentityName, type StepLike } from './moveIdentity.ts';
import { termKey, type CardLinkRelation, type IndexCardFile, type LiveCard } from './indexCards.ts';
import type { GlossaryBaseCatalog } from './glossaryBaseCards.ts';
import type { TechniqueNode, TechniqueTreeArchive } from './techniqueTreeStore.ts';
import { followChain, type D8Branch, type D8Chain, type TreeEdge } from '../preview/crystallineSweeps/branches.ts';
import type { TopoModel } from '../preview/crystallineSweeps/topo.ts';

export type LinkSource = 'tree' | 'glossary' | 'card';

/** One saved link, by name (tree and glossary links) or by card id (card links). */
export type NamedEdge = {
  from: string;
  to: string;
  /** Card ids, when the link was made between two cards. */
  fromId?: string;
  toId?: string;
  relation: CardLinkRelation;
  source: LinkSource;
  /** Where the link lives in the Technique Tree, for "Open in Technique Tree". */
  treeId?: string;
  nodeId?: string;
  /** The coach unlinked this end from the glossary, so it matches by its exact name only. */
  fromExact?: boolean;
  toExact?: boolean;
  /** Glossary base card id of each end, when it has one. */
  fromCard?: string | null;
  toCard?: string | null;
};

export const BRANCHES_EMPTY_HINT = 'Add connections in your Technique Tree to see branches.';
export const BRANCHES_UNMATCHED_HINT = 'Your Technique Tree links do not join two moves on your D8 yet.';
export const CHAIN_MAX = 8;
export const CHAIN_STEPS = 5;

function walk(node: TechniqueNode | null, visit: (node: TechniqueNode, parent: TechniqueNode | null) => void, parent: TechniqueNode | null = null) {
  if (!node) return;
  visit(node, parent);
  for (const child of node.children) walk(child, visit, node);
}

function stepEdge(a: TechniqueNode, b: TechniqueNode, relation: CardLinkRelation, treeId: string): NamedEdge | null {
  const from = stepIdentityName(a);
  const to = stepIdentityName(b);
  if (!from || !to) return null;
  const left = stepIdentity(a);
  const right = stepIdentity(b);
  const edge: NamedEdge = { from, to, relation, source: 'tree', treeId, nodeId: a.id, fromCard: left.cardId, toCard: right.cardId };
  if (left.how === 'unlinked') edge.fromExact = true;
  if (right.how === 'unlinked') edge.toExact = true;
  return edge;
}

/** Find a step anywhere in the saved trees. */
export function findStep(archive: TechniqueTreeArchive | null | undefined, treeId: string, nodeId: string): TechniqueNode | null {
  const tree = archive?.trees.find((row) => row.id === treeId);
  let found: TechniqueNode | null = null;
  walk(tree?.root ?? null, (node) => {
    if (!found && node.id === nodeId) found = node;
  });
  return found;
}

/** Every step in every saved tree on this device, as name → name links. */
export function edgesFromArchive(archive: TechniqueTreeArchive | null | undefined): NamedEdge[] {
  if (!archive) return [];
  const out: NamedEdge[] = [];
  for (const tree of archive.trees) {
    const bySlot = new Map<string, TechniqueNode>();
    walk(tree.root, (node, parent) => {
      bySlot.set(node.slotId, node);
      if (!parent) return;
      const edge = stepEdge(parent, node, node.kind === 'defense' ? 'defense' : 'leads', tree.id);
      if (edge) out.push(edge);
    });
    for (const link of tree.links ?? []) {
      const a = bySlot.get(link.fromSlotId);
      const b = bySlot.get(link.toSlotId);
      if (!a || !b) continue;
      const edge = stepEdge(a, b, link.relation === 'defense' ? 'defense' : 'leads', tree.id);
      if (edge) out.push(edge);
    }
  }
  return out;
}

/**
 * Links saved on the Technique Tree glossary cards. A link from a tree step
 * uses that step's current name and glossary card, read from the archive.
 */
export function edgesFromCatalog(
  catalog: GlossaryBaseCatalog | null | undefined,
  archive: TechniqueTreeArchive | null = null,
): NamedEdge[] {
  if (!catalog) return [];
  const titles = new Map(catalog.cards.map((card) => [card.id, card.title]));
  const out: NamedEdge[] = [];
  for (const link of catalog.links) {
    const to = titles.get(link.toCardId)?.trim() ?? '';
    let from = '';
    let fromCard: string | null = null;
    let fromExact = false;
    if (link.from.type === 'card') {
      from = titles.get(link.from.cardId)?.trim() ?? '';
      fromCard = link.from.cardId;
    } else {
      const step: StepLike = findStep(archive, link.from.treeId, link.from.nodeId) ?? { title: link.from.title };
      from = stepIdentityName(step);
      const identity = stepIdentity(step);
      fromCard = identity.cardId;
      fromExact = identity.how === 'unlinked';
    }
    if (!from || !to) continue;
    const edge: NamedEdge = {
      from,
      to,
      relation: link.relation === 'defense' ? 'defense' : 'leads',
      source: 'glossary',
      fromCard,
      toCard: link.toCardId,
    };
    if (fromExact) edge.fromExact = true;
    if (link.from.type === 'tree') {
      edge.treeId = link.from.treeId;
      edge.nodeId = link.from.nodeId;
    }
    out.push(edge);
  }
  return out;
}

/** Connections the student added from their cards. Names are filled from the live cards. */
export function edgesFromCards(file: IndexCardFile, cards: readonly LiveCard[]): NamedEdge[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const out: NamedEdge[] = [];
  for (const stored of file.cards) {
    for (const link of stored.links ?? []) {
      const from = byId.get(stored.id);
      const to = byId.get(link.to);
      const toName = to?.name ?? link.name ?? '';
      if (!from || !toName) continue;
      // A glossary move that is not a card keeps its gl. id, so it can be removed, and maps by name.
      out.push({
        from: from.name,
        to: toName,
        fromId: from.id,
        toId: link.to,
        relation: link.relation,
        source: 'card',
        fromCard: glossaryCardIdForName(from.name) ?? glossaryCardIdForName(from.baseName),
        toCard: link.to.startsWith('gl.') ? `gbase.${link.to.slice(3)}` : glossaryCardIdForName(toName) ?? (to ? glossaryCardIdForName(to.baseName) : null),
      });
    }
  }
  return out;
}

/** Identity keys for a name through the glossary: the headword and aliases, only when the name IS one of them. */
function glossaryKeys(name: string): string[] {
  const term = glossaryTermForName(name);
  return term ? glossaryNameKeys(term) : [];
}

export type CardMatcher = (name: string, id?: string, exact?: boolean) => LiveCard | null;

/** Name → live card, by the two safe tiers in the file comment. */
export function cardMatcher(cards: readonly LiveCard[]): CardMatcher {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const direct = new Map<string, LiveCard | null>();
  const alias = new Map<string, LiveCard | null>();
  const put = (map: Map<string, LiveCard | null>, key: string, card: LiveCard) => {
    if (!key) return;
    const had = map.get(key);
    if (had === undefined) map.set(key, card);
    else if (had && had.id !== card.id) map.set(key, null);
  };
  for (const card of cards) {
    for (const name of [card.name, card.tile, card.baseName]) put(direct, moveKey(name), card);
  }
  for (const card of cards) {
    for (const name of [card.name, card.tile, card.baseName]) {
      for (const key of glossaryKeys(name)) if (!direct.has(key)) put(alias, key, card);
    }
  }
  const cache = new Map<string, LiveCard | null>();
  return (name: string, id?: string, exact = false) => {
    if (id && byId.has(id)) return byId.get(id)!;
    const key = moveKey(name);
    if (!key) return null;
    if (exact) return direct.get(key) ?? null;
    if (cache.has(key)) return cache.get(key)!;
    let hit: LiveCard | null | undefined = direct.get(key);
    if (hit === undefined) {
      for (const other of glossaryKeys(name)) {
        hit = direct.get(other) ?? alias.get(other);
        if (hit !== undefined) break;
      }
      if (hit === undefined) hit = alias.get(key);
    }
    const result = hit ?? null;
    cache.set(key, result);
    return result;
  };
}

export type ResolvedLink = {
  from: LiveCard;
  to: LiveCard;
  relation: CardLinkRelation;
  sources: LinkSource[];
  /** Saved names, before mapping. */
  fromName: string;
  toName: string;
};

/** Links whose two ends are both live cards. Self links and repeats are dropped. */
export function resolveLinks(cards: readonly LiveCard[], edges: readonly NamedEdge[]): ResolvedLink[] {
  const match = cardMatcher(cards);
  const out = new Map<string, ResolvedLink>();
  for (const edge of edges) {
    const from = match(edge.from, edge.fromId, edge.fromExact);
    const to = match(edge.to, edge.toId, edge.toExact);
    if (!from || !to || from.id === to.id) continue;
    const key = `${from.id}>${to.id}>${edge.relation}`;
    const had = out.get(key);
    if (had) {
      if (!had.sources.includes(edge.source)) had.sources.push(edge.source);
      continue;
    }
    out.set(key, { from, to, relation: edge.relation, sources: [edge.source], fromName: edge.from, toName: edge.to });
  }
  return [...out.values()];
}

/** Tile index for each card drawn on the diamond. Cards past a face's cap are not drawn. */
export function tileIndexByCard(model: TopoModel): Map<string, number> {
  const map = new Map<string, number>();
  for (const tile of model.tiles) {
    if (tile.move && !map.has(tile.move.id)) map.set(tile.move.id, tile.index);
  }
  return map;
}

/**
 * "Leads to" links between two moves drawn on the diamond, once per pair.
 * Defenses stay on the cards. Same-face pairs are kept: their arc still dips through the inside.
 */
export function liveBranches(model: TopoModel, links: readonly ResolvedLink[]): D8Branch[] {
  const tiles = tileIndexByCard(model);
  const seen = new Set<string>();
  const out: D8Branch[] = [];
  for (const link of links) {
    if (link.relation !== 'leads') continue;
    const a = tiles.get(link.from.id);
    const b = tiles.get(link.to.id);
    if (a === undefined || b === undefined || a === b) continue;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `${link.from.id}->${link.to.id}`, from: a, to: b, fromName: link.from.name, toName: link.to.name });
  }
  return out;
}

/** Leads-to links as tile-name edges, for followChain. */
export function chainEdges(model: TopoModel, links: readonly ResolvedLink[]): TreeEdge[] {
  const tiles = tileIndexByCard(model);
  const edges: TreeEdge[] = [];
  for (const link of links) {
    if (link.relation !== 'leads') continue;
    const a = tiles.get(link.from.id);
    const b = tiles.get(link.to.id);
    const from = a === undefined ? '' : model.tiles[a].move?.name ?? '';
    const to = b === undefined ? '' : model.tiles[b].move?.name ?? '';
    if (from && to && a !== b) edges.push({ from, to });
  }
  return edges;
}

function contains(outer: readonly number[], inner: readonly number[]): boolean {
  if (inner.length > outer.length) return false;
  for (let start = 0; start + inner.length <= outer.length; start += 1) {
    if (inner.every((value, offset) => outer[start + offset] === value)) return true;
  }
  return false;
}

/**
 * Chains for the picker, from the student's own links through followChain.
 * Starts with moves nothing leads into, then the busiest moves. A chain already inside a longer one is dropped.
 */
export function liveChains(model: TopoModel, links: readonly ResolvedLink[], max = CHAIN_MAX): D8Chain[] {
  const edges = chainEdges(model, links);
  if (!edges.length) return [];
  const names = new Map<number, string>();
  const tiles = tileIndexByCard(model);
  for (const link of links) {
    for (const card of [link.from, link.to]) {
      const tile = tiles.get(card.id);
      if (tile !== undefined) names.set(tile, card.name);
    }
  }
  const out = new Map<string, number>();
  const into = new Map<string, number>();
  for (const edge of edges) {
    out.set(edge.from, (out.get(edge.from) ?? 0) + 1);
    into.set(edge.to, (into.get(edge.to) ?? 0) + 1);
  }
  const starts = [...out.keys()].sort((left, right) => {
    const rootLeft = into.has(left) ? 1 : 0;
    const rootRight = into.has(right) ? 1 : 0;
    return rootLeft - rootRight || (out.get(right) ?? 0) - (out.get(left) ?? 0) || left.localeCompare(right);
  });
  const chains: D8Chain[] = [];
  for (const start of starts) {
    const chain = followChain(model, start, CHAIN_STEPS, edges);
    if (!chain) continue;
    if (chains.some((other) => contains(other.tiles, chain.tiles))) continue;
    const shown = chain.tiles.map((tile, index) => names.get(tile) ?? chain.names[index]);
    chains.push({ id: `chain:${chain.tiles.join('>')}`, tiles: chain.tiles, names: shown, sample: false });
    if (chains.length >= max) break;
  }
  return chains;
}

export type BranchState =
  | { kind: 'ready'; branches: D8Branch[]; chains: D8Chain[] }
  | { kind: 'empty'; hint: string }
  | { kind: 'unmatched'; hint: string; saved: number };

/** What the live D8 shows: branches, or a friendly hint. Never example data. */
export function branchState(model: TopoModel, cards: readonly LiveCard[], edges: readonly NamedEdge[]): BranchState {
  const leads = edges.filter((edge) => edge.relation === 'leads');
  if (!leads.length) return { kind: 'empty', hint: BRANCHES_EMPTY_HINT };
  const links = resolveLinks(cards, leads);
  const branches = liveBranches(model, links);
  if (!branches.length) return { kind: 'unmatched', hint: BRANCHES_UNMATCHED_HINT, saved: leads.length };
  return { kind: 'ready', branches, chains: liveChains(model, links) };
}

export type Neighbor = {
  name: string;
  /** The live card for this name, when it is one. */
  cardId: string | null;
  sources: LinkSource[];
  /** Present for a connection added on this card, so it can be removed. */
  removable?: { from: string; to: string; relation: CardLinkRelation };
};

export type CardTree = {
  leadsTo: Neighbor[];
  defenses: Neighbor[];
  comesFrom: Neighbor[];
  /** Moves this one defends or counters. */
  counters: Neighbor[];
  /** A Technique Tree step with this card's name, for "Open in Technique Tree". */
  treeStep: { treeId: string; nodeId: string } | null;
};

function pushNeighbor(list: Neighbor[], next: Neighbor) {
  const key = next.cardId ?? termKey(next.name);
  const had = list.find((row) => (row.cardId ?? termKey(row.name)) === key);
  if (!had) {
    list.push(next);
    return;
  }
  for (const source of next.sources) if (!had.sources.includes(source)) had.sources.push(source);
  if (next.removable && !had.removable) had.removable = next.removable;
}

/**
 * The card's Technique Tree section. The other end is shown even when it is not a D8 card,
 * so a tree step like "Posture up" still reads on the card.
 */
export function cardTree(card: LiveCard, cards: readonly LiveCard[], edges: readonly NamedEdge[]): CardTree {
  const match = cardMatcher(cards);
  const tree: CardTree = { leadsTo: [], defenses: [], comesFrom: [], counters: [], treeStep: null };
  for (const edge of edges) {
    const from = match(edge.from, edge.fromId, edge.fromExact);
    const to = match(edge.to, edge.toId, edge.toExact);
    const removable = edge.source === 'card' && edge.fromId && edge.toId ? { from: edge.fromId, to: edge.toId, relation: edge.relation } : undefined;
    if (from?.id === card.id && to?.id !== card.id) {
      if (!tree.treeStep && edge.treeId && edge.nodeId && edge.source === 'tree') tree.treeStep = { treeId: edge.treeId, nodeId: edge.nodeId };
      const row: Neighbor = { name: to?.name ?? edge.to, cardId: to?.id ?? null, sources: [edge.source], removable };
      pushNeighbor(edge.relation === 'leads' ? tree.leadsTo : tree.defenses, row);
    } else if (to?.id === card.id && from?.id !== card.id) {
      const row: Neighbor = { name: from?.name ?? edge.from, cardId: from?.id ?? null, sources: [edge.source], removable };
      pushNeighbor(edge.relation === 'leads' ? tree.comesFrom : tree.counters, row);
    }
  }
  return tree;
}

/** A Technique Tree step whose title maps to this card, anywhere in the saved trees. */
export function treeStepFor(card: LiveCard, cards: readonly LiveCard[], archive: TechniqueTreeArchive | null | undefined): { treeId: string; nodeId: string } | null {
  if (!archive) return null;
  const match = cardMatcher(cards);
  for (const tree of archive.trees) {
    let found: string | null = null;
    walk(tree.root, (node) => {
      if (found || !node.title.trim()) return;
      const unlinked = stepIdentity(node).how === 'unlinked';
      if (match(stepIdentityName(node), undefined, unlinked)?.id === card.id) found = node.id;
    });
    if (found) return { treeId: tree.id, nodeId: found };
  }
  return null;
}

/** Glossary card id in the Technique Tree for this card, when the move is a glossary term. */
export function glossaryCardIdFor(card: LiveCard): string | null {
  for (const name of [card.name, card.baseName, card.tile]) {
    const term = glossaryTermForName(name);
    if (term) return `gbase.${term.key}`;
  }
  return null;
}

/** Link to the full Technique Tree, focused on this move when it can be. */
export function techniqueTreeHref(step: { treeId: string; nodeId: string } | null, glossaryCardId: string | null): string {
  const params = new URLSearchParams();
  if (step) {
    params.set('tree', step.treeId);
    params.set('node', step.nodeId);
  } else if (glossaryCardId) {
    params.set('card', glossaryCardId);
  }
  const query = params.toString();
  return query ? `/technique-tree?${query}` : '/technique-tree';
}

export type ConnectionOption = {
  /** Card id, or gl.<key> for a glossary move that is not on the D8. */
  id: string;
  name: string;
  faceLabel: string;
  kind: 'card' | 'mine' | 'glossary';
  /** The alias that matched, when it was not the name. */
  matched?: string;
};

export const CONNECTION_OPTIONS_MAX = 8;

function wordsMatch(text: string, query: string): boolean {
  const key = termKey(text);
  return query.split('-').every((word) => key.split('-').some((part) => part.startsWith(word)));
}

/**
 * Moves the student can connect a card to, for the inline search: their D8 cards
 * (built-in and their own) first, then glossary moves that are not on the D8.
 * Empty query lists nothing.
 */
export function connectionOptions(query: string, cards: readonly LiveCard[], selfId: string, limit = CONNECTION_OPTIONS_MAX): ConnectionOption[] {
  const q = termKey(query);
  if (!q) return [];
  const out: ConnectionOption[] = [];
  const cardKeys = new Set<string>();
  for (const card of cards) for (const name of [card.name, card.tile, card.baseName]) cardKeys.add(termKey(name));
  const rank = (name: string) => (termKey(name) === q ? 0 : termKey(name).startsWith(q) ? 1 : 2);
  const fromCards = cards
    .filter((card) => card.id !== selfId && [card.name, card.tile, card.baseName].some((name) => wordsMatch(name, q)))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  for (const card of fromCards) out.push({ id: card.id, name: card.name, faceLabel: card.faceLabel, kind: card.custom ? 'mine' : 'card' });
  const glossary: ConnectionOption[] = [];
  for (const term of GLOSSARY) {
    if (cardKeys.has(term.key) || !term.term.trim()) continue;
    const alias = wordsMatch(term.term, q) ? null : term.aliases.find((name) => wordsMatch(name, q));
    if (!wordsMatch(term.term, q) && !alias) continue;
    const faceLabel = (GLOSSARY_FACE_LABELS as Record<string, string>)[term.faceId] ?? term.faceId;
    const option: ConnectionOption = { id: `gl.${term.key}`, name: term.term, faceLabel, kind: 'glossary' };
    if (alias) option.matched = alias;
    glossary.push(option);
  }
  glossary.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  const seen = new Set(out.map((row) => row.id));
  for (const row of glossary) if (!seen.has(row.id)) { seen.add(row.id); out.push(row); }
  return out.slice(0, limit);
}

export type IdentityConnection = {
  /** leads: this move leads to `name`; from: `name` leads here; defense: `name` defends this; counters: this defends `name`. */
  direction: 'leads' | 'from' | 'defense' | 'counters';
  name: string;
  /** Glossary base card of the other end, when it has one. */
  cardId: string | null;
  source: LinkSource;
  treeId?: string;
  nodeId?: string;
};

/**
 * Everything connected to one move identity, from every source: the trees,
 * the glossary card links, and the student's D8 card connections. The move is
 * known by its glossary card id when it has one, otherwise by its name.
 * Repeats (same other move, same direction) are shown once.
 */
export function connectionsForIdentity(
  identity: { cardId: string | null; name: string },
  edges: readonly NamedEdge[],
  options: { skip?: (edge: NamedEdge) => boolean } = {},
): IdentityConnection[] {
  const key = moveKey(identity.name);
  const isMe = (card: string | null | undefined, name: string, exact?: boolean) =>
    identity.cardId && card && !exact ? card === identity.cardId : !!key && moveKey(name) === key;
  const out: IdentityConnection[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    if (options.skip?.(edge)) continue;
    const fromMe = isMe(edge.fromCard, edge.from, edge.fromExact);
    const toMe = isMe(edge.toCard, edge.to, edge.toExact);
    if (fromMe === toMe) continue;
    const direction: IdentityConnection['direction'] = fromMe
      ? edge.relation === 'leads' ? 'leads' : 'defense'
      : edge.relation === 'leads' ? 'from' : 'counters';
    const name = fromMe ? edge.to : edge.from;
    const cardId = (fromMe ? edge.toCard : edge.fromCard) ?? null;
    const dedupe = `${direction}|${cardId ?? moveKey(name)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const row: IdentityConnection = { direction, name, cardId, source: edge.source };
    if (edge.treeId) row.treeId = edge.treeId;
    if (edge.nodeId) row.nodeId = edge.nodeId;
    out.push(row);
  }
  return out;
}
