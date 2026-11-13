/**
 * Built-in Technique Tree glossary base cards.
 *
 * One solo card per glossary term on six D8 faces. Mindset and Conditioning
 * are left out. Cards start with no parents, children, or links. The instructor
 * adds links later, including by picking a glossary suggestion.
 *
 * Storage key: `matboard.coach.techniqueTree.glossaryBase.v1`
 * This module never reads or writes `matboard.coach.techniqueTree.v1`, so the
 * instructor's own trees stay as they are.
 */

import { GLOSSARY, GLOSSARY_FACE_LABELS } from './glossary.ts';
import { glossaryTermById, matchGlossary, type GlossaryMatch } from './glossaryMatch.ts';
import { isIndexFaceId, termKey } from './indexCards.ts';
import { asRecord, clampText } from './plainValue.ts';
import { isStorageQuotaError } from './storageQuota.ts';
import { TITLE_MAX, type TechniqueTreeArchive, type TechniqueTreeDoc } from './techniqueTreeStore.ts';

export const GLOSSARY_BASE_STORAGE_KEY = 'matboard.coach.techniqueTree.glossaryBase.v1';

export const GLOSSARY_BASE_FACE_IDS = [
  'guard-control',
  'passing',
  'sweeps',
  'takedowns',
  'escapes-defense',
  'submissions',
] as const;

export type GlossaryBaseFaceId = (typeof GLOSSARY_BASE_FACE_IDS)[number];

/** Exact counts from the shipped glossary. Tests lock these in. */
export const GLOSSARY_BASE_FACE_COUNTS: Record<GlossaryBaseFaceId, number> = {
  'guard-control': 75,
  passing: 21,
  sweeps: 21,
  takedowns: 42,
  'escapes-defense': 28,
  submissions: 44,
};

export const GLOSSARY_BASE_CARD_TOTAL = 231;

export const EXCLUDED_GLOSSARY_FACES = ['mindset', 'conditioning'] as const;

export function isGlossaryBaseFace(faceId: string): faceId is GlossaryBaseFaceId {
  return (GLOSSARY_BASE_FACE_IDS as readonly string[]).includes(faceId);
}

export function glossaryBaseFaceLabel(faceId: string): string {
  return isIndexFaceId(faceId) ? GLOSSARY_FACE_LABELS[faceId] : faceId;
}

export type GlossaryBaseCard = {
  id: string;
  slotId: string;
  glossaryTermId: string;
  termKey: string;
  title: string;
  faceId: GlossaryBaseFaceId;
  aliases: string[];
  definition: string;
  subFactor: string;
};

export type GlossaryBaseLinkSource =
  | { type: 'card'; cardId: string }
  | { type: 'tree'; treeId: string; nodeId: string; slotId: string; title: string };

export type GlossaryBaseLink = {
  id: string;
  from: GlossaryBaseLinkSource;
  toCardId: string;
  relation: 'branch' | 'defense' | 'follow';
  label: string;
};

export type GlossaryBaseCollision = {
  glossaryTermId: string;
  title: string;
  treeId: string;
  treeName: string;
  nodeId: string;
  nodeTitle: string;
};

export type GlossaryBaseSkip = {
  term: string;
  faceId: string;
  reason: 'blank-name' | 'odd-face' | 'duplicate-term';
};

export type GlossaryBaseBuild = {
  cards: GlossaryBaseCard[];
  skipped: GlossaryBaseSkip[];
};

export type GlossaryBaseCatalog = {
  version: 1;
  cards: GlossaryBaseCard[];
  links: GlossaryBaseLink[];
  collisions: GlossaryBaseCollision[];
  skipped: GlossaryBaseSkip[];
};

export type EnsureGlossaryBaseResult = {
  catalog: GlossaryBaseCatalog;
  created: number;
  reused: number;
  written: boolean;
  quota: boolean;
};

let idSeq = 0;

function createId(prefix: string): string {
  idSeq += 1;
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${idSeq.toString(36)}-${rand}`;
}

export function cardIdForTermKey(key: string): string {
  return `gbase.${key}`;
}

export function slotIdForTermKey(key: string): string {
  return `gslot.${key}`;
}

function walkNodes(
  node: TechniqueTreeDoc['root'],
  visit: (node: NonNullable<TechniqueTreeDoc['root']>) => void,
): void {
  if (!node) return;
  visit(node);
  for (const child of node.children) walkNodes(child, visit);
}

/** Name and alias keys for a card, used when checking a user tree for a same-name step. */
function cardNameKeys(card: Pick<GlossaryBaseCard, 'title' | 'aliases'>): Set<string> {
  const keys = new Set<string>();
  const title = termKey(card.title);
  if (title) keys.add(title);
  for (const alias of card.aliases) {
    const key = termKey(alias);
    if (key) keys.add(key);
  }
  return keys;
}

export function findTitleCollisions(
  cards: readonly GlossaryBaseCard[],
  archive: TechniqueTreeArchive | null | undefined,
): GlossaryBaseCollision[] {
  if (!archive) return [];
  const byName = new Map<string, GlossaryBaseCard[]>();
  for (const card of cards) {
    for (const key of cardNameKeys(card)) {
      const list = byName.get(key) ?? [];
      list.push(card);
      byName.set(key, list);
    }
  }
  const collisions: GlossaryBaseCollision[] = [];
  const seen = new Set<string>();
  for (const tree of archive.trees) {
    walkNodes(tree.root, (node) => {
      const key = termKey(node.title);
      if (!key) return;
      const matches = byName.get(key);
      if (!matches) return;
      for (const card of matches) {
        const stamp = `${card.glossaryTermId}::${tree.id}::${node.id}`;
        if (seen.has(stamp)) continue;
        seen.add(stamp);
        collisions.push({
          glossaryTermId: card.glossaryTermId,
          title: card.title,
          treeId: tree.id,
          treeName: tree.name,
          nodeId: node.id,
          nodeTitle: node.title,
        });
      }
    });
  }
  return collisions;
}

export function buildGlossaryBaseCards(): GlossaryBaseBuild {
  const cards: GlossaryBaseCard[] = [];
  const skipped: GlossaryBaseSkip[] = [];
  const seenKeys = new Set<string>();

  for (const term of GLOSSARY) {
    const name = term.term.trim();
    if (!name) {
      skipped.push({ term: term.term, faceId: term.faceId, reason: 'blank-name' });
      continue;
    }
    if (!isGlossaryBaseFace(term.faceId)) {
      if (!(EXCLUDED_GLOSSARY_FACES as readonly string[]).includes(term.faceId)) {
        skipped.push({ term: name, faceId: term.faceId, reason: 'odd-face' });
      }
      continue;
    }
    if (!term.key || seenKeys.has(term.key)) {
      skipped.push({ term: name, faceId: term.faceId, reason: 'duplicate-term' });
      continue;
    }
    seenKeys.add(term.key);
    cards.push({
      id: cardIdForTermKey(term.key),
      slotId: slotIdForTermKey(term.key),
      glossaryTermId: `gl.${term.key}`,
      termKey: term.key,
      title: clampText(name, TITLE_MAX),
      faceId: term.faceId,
      aliases: term.aliases.map((alias) => clampText(alias, TITLE_MAX)).filter(Boolean),
      definition: term.definition,
      subFactor: term.subFactor,
    });
  }

  return { cards, skipped };
}

export function countCardsByFace(cards: readonly GlossaryBaseCard[]): Record<GlossaryBaseFaceId, number> {
  const counts = {
    'guard-control': 0,
    passing: 0,
    sweeps: 0,
    takedowns: 0,
    'escapes-defense': 0,
    submissions: 0,
  } satisfies Record<GlossaryBaseFaceId, number>;
  for (const card of cards) {
    counts[card.faceId] += 1;
  }
  return counts;
}

export function cardsForFace(
  cards: readonly GlossaryBaseCard[],
  faceId: GlossaryBaseFaceId,
): GlossaryBaseCard[] {
  return cards.filter((card) => card.faceId === faceId);
}

export function findBaseCard(
  catalog: GlossaryBaseCatalog,
  termOrId: string,
): GlossaryBaseCard | null {
  const raw = termOrId.trim();
  if (!raw) return null;
  const direct = catalog.cards.find(
    (card) =>
      card.id === raw ||
      card.slotId === raw ||
      card.glossaryTermId === raw ||
      card.termKey === raw ||
      termKey(card.title) === termKey(raw),
  );
  if (direct) return direct;
  const term = glossaryTermById(raw);
  if (!term) return null;
  return catalog.cards.find((card) => card.glossaryTermId === term.id || card.termKey === term.id.replace(/^gl\./, '')) ?? null;
}

export function emptyGlossaryBaseCatalog(): GlossaryBaseCatalog {
  return { version: 1, cards: [], links: [], collisions: [], skipped: [] };
}

function sameSource(left: GlossaryBaseLinkSource, right: GlossaryBaseLinkSource): boolean {
  if (left.type !== right.type) return false;
  if (left.type === 'card' && right.type === 'card') return left.cardId === right.cardId;
  if (left.type === 'tree' && right.type === 'tree') {
    return left.treeId === right.treeId && left.nodeId === right.nodeId;
  }
  return false;
}

function sourceCardId(from: GlossaryBaseLinkSource): string | null {
  return from.type === 'card' ? from.cardId : null;
}

export function addGlossaryBaseLink(
  catalog: GlossaryBaseCatalog,
  from: GlossaryBaseLinkSource,
  toTermOrId: string,
  relation: GlossaryBaseLink['relation'] = 'branch',
  label = '',
): {
  catalog: GlossaryBaseCatalog;
  link: GlossaryBaseLink | null;
  status: 'linked' | 'already' | 'no-card' | 'same-card';
} {
  const target = findBaseCard(catalog, toTermOrId);
  if (!target) return { catalog, link: null, status: 'no-card' };
  if (sourceCardId(from) === target.id) return { catalog, link: null, status: 'same-card' };

  const already = catalog.links.find(
    (link) => sameSource(link.from, from) && link.toCardId === target.id && link.relation === relation,
  );
  if (already) return { catalog, link: already, status: 'already' };

  const link: GlossaryBaseLink = {
    id: createId('glink'),
    from,
    toCardId: target.id,
    relation,
    label: clampText(label, TITLE_MAX),
  };
  return { catalog: { ...catalog, links: [...catalog.links, link] }, link, status: 'linked' };
}

export function removeGlossaryBaseLink(catalog: GlossaryBaseCatalog, linkId: string): GlossaryBaseCatalog {
  const links = catalog.links.filter((link) => link.id !== linkId);
  return links.length === catalog.links.length ? catalog : { ...catalog, links };
}

export function linksFrom(
  catalog: GlossaryBaseCatalog,
  from: GlossaryBaseLinkSource,
): GlossaryBaseLink[] {
  return catalog.links.filter((link) => sameSource(link.from, from));
}

/**
 * Suggestions for the Technique Tree connect field.
 * Reuses matchGlossary (prefix, alias, and light fuzzy) on the 231 terms that
 * have a base card. Mindset and Conditioning are not offered, because there is
 * no card to link to. Limit and scoring stay the glossary defaults (6 results).
 */
export function suggestGlossaryBaseCards(
  query: string,
  options: { blockedIds?: readonly string[]; blockedNames?: readonly string[]; limit?: number } = {},
): GlossaryMatch[] {
  const built = buildGlossaryBaseCards();
  const allowed = new Set(built.cards.map((card) => card.glossaryTermId));
  const terms = built.cards
    .map((card) => glossaryTermById(card.glossaryTermId))
    .filter((term): term is NonNullable<typeof term> => !!term && allowed.has(term.id));
  return matchGlossary(query, {
    terms,
    blockedIds: options.blockedIds,
    blockedNames: options.blockedNames,
    limit: options.limit,
  });
}

export function pickGlossaryBaseSuggestion(
  catalog: GlossaryBaseCatalog,
  from: GlossaryBaseLinkSource,
  match: GlossaryMatch,
  relation: GlossaryBaseLink['relation'] = 'branch',
): {
  catalog: GlossaryBaseCatalog;
  link: GlossaryBaseLink | null;
  status: 'linked' | 'already' | 'no-card' | 'same-card';
  card: GlossaryBaseCard | null;
} {
  const result = addGlossaryBaseLink(catalog, from, match.term.id, relation, match.term.name);
  const card = result.link ? findBaseCard(result.catalog, result.link.toCardId) : findBaseCard(catalog, match.term.id);
  return { ...result, card };
}

function sanitizeCard(value: unknown, seen: Set<string>): GlossaryBaseCard | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const title = clampText(raw.title, TITLE_MAX).trim();
  const key = typeof raw.termKey === 'string' && termKey(raw.termKey) ? termKey(raw.termKey) : termKey(title);
  if (!title || !key || seen.has(key)) return null;
  const faceId = typeof raw.faceId === 'string' ? raw.faceId : '';
  if (!isGlossaryBaseFace(faceId)) return null;
  const glossaryTermId =
    typeof raw.glossaryTermId === 'string' && raw.glossaryTermId.trim()
      ? raw.glossaryTermId.trim()
      : `gl.${key}`;
  const aliases = Array.isArray(raw.aliases)
    ? raw.aliases.map((alias) => clampText(alias, TITLE_MAX).trim()).filter(Boolean)
    : [];
  seen.add(key);
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : cardIdForTermKey(key),
    slotId: typeof raw.slotId === 'string' && raw.slotId.trim() ? raw.slotId.trim() : slotIdForTermKey(key),
    glossaryTermId,
    termKey: key,
    title,
    faceId,
    aliases,
    definition: typeof raw.definition === 'string' ? raw.definition : '',
    subFactor: typeof raw.subFactor === 'string' ? raw.subFactor : '',
  };
}

function sanitizeSource(value: unknown): GlossaryBaseLinkSource | null {
  const raw = asRecord(value);
  if (!raw) return null;
  if (raw.type === 'card' && typeof raw.cardId === 'string' && raw.cardId.trim()) {
    return { type: 'card', cardId: raw.cardId.trim() };
  }
  if (
    raw.type === 'tree' &&
    typeof raw.treeId === 'string' &&
    raw.treeId.trim() &&
    typeof raw.nodeId === 'string' &&
    raw.nodeId.trim() &&
    typeof raw.slotId === 'string' &&
    raw.slotId.trim()
  ) {
    return {
      type: 'tree',
      treeId: raw.treeId.trim(),
      nodeId: raw.nodeId.trim(),
      slotId: raw.slotId.trim(),
      title: clampText(raw.title, TITLE_MAX),
    };
  }
  return null;
}

function sanitizeLink(value: unknown, cardIds: Set<string>, seen: Set<string>): GlossaryBaseLink | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim().slice(0, 80) : '';
  const from = sanitizeSource(raw.from);
  const toCardId = typeof raw.toCardId === 'string' ? raw.toCardId.trim() : '';
  const relation = raw.relation === 'defense' || raw.relation === 'follow' || raw.relation === 'branch' ? raw.relation : '';
  if (!id || !from || !toCardId || !relation || seen.has(id) || !cardIds.has(toCardId)) return null;
  if (from.type === 'card' && from.cardId === toCardId) return null;
  seen.add(id);
  return { id, from, toCardId, relation, label: clampText(raw.label, TITLE_MAX) };
}

function sanitizeCollision(value: unknown): GlossaryBaseCollision | null {
  const raw = asRecord(value);
  if (!raw) return null;
  if (typeof raw.glossaryTermId !== 'string' || typeof raw.nodeId !== 'string' || typeof raw.treeId !== 'string') {
    return null;
  }
  return {
    glossaryTermId: raw.glossaryTermId,
    title: clampText(raw.title, TITLE_MAX),
    treeId: raw.treeId,
    treeName: clampText(raw.treeName, TITLE_MAX),
    nodeId: raw.nodeId,
    nodeTitle: clampText(raw.nodeTitle, TITLE_MAX),
  };
}

export function sanitizeGlossaryBaseCatalog(
  value: unknown,
  options: { fillMissing?: boolean } = {},
): GlossaryBaseCatalog {
  const raw = asRecord(value);
  const built = buildGlossaryBaseCards();
  const byKey = new Map(built.cards.map((card) => [card.termKey, card]));
  const seen = new Set<string>();
  const cards: GlossaryBaseCard[] = [];
  const stored = Array.isArray(raw?.cards) ? raw.cards : [];
  for (const item of stored) {
    const card = sanitizeCard(item, seen);
    if (!card) continue;
    const fresh = byKey.get(card.termKey);
    // Keep the stored card identity. Refresh title, face, aliases, and definition from the glossary.
    cards.push(
      fresh
        ? {
            ...fresh,
            id: card.id,
            slotId: card.slotId,
          }
        : card,
    );
  }
  if (options.fillMissing !== false) {
    for (const card of built.cards) {
      if (seen.has(card.termKey)) continue;
      seen.add(card.termKey);
      cards.push(card);
    }
  }
  const cardIds = new Set(cards.map((card) => card.id));
  const linkIds = new Set<string>();
  const links: GlossaryBaseLink[] = [];
  const storedLinks = Array.isArray(raw?.links) ? raw.links : [];
  for (const item of storedLinks) {
    const link = sanitizeLink(item, cardIds, linkIds);
    if (link) links.push(link);
  }
  const collisions = Array.isArray(raw?.collisions)
    ? raw.collisions.map(sanitizeCollision).filter((row): row is GlossaryBaseCollision => !!row)
    : [];
  const skipped = built.skipped;
  return { version: 1, cards, links, collisions, skipped };
}

function writeCatalog(catalog: GlossaryBaseCatalog): { saved: boolean; quota: boolean } {
  try {
    localStorage.setItem(GLOSSARY_BASE_STORAGE_KEY, JSON.stringify(catalog));
    return { saved: true, quota: false };
  } catch (error) {
    return { saved: false, quota: isStorageQuotaError(error) };
  }
}

export function loadGlossaryBaseCatalog(): GlossaryBaseCatalog {
  try {
    const raw = localStorage.getItem(GLOSSARY_BASE_STORAGE_KEY);
    if (typeof raw !== 'string' || !raw.trim()) return emptyGlossaryBaseCatalog();
    try {
      return sanitizeGlossaryBaseCatalog(JSON.parse(raw), { fillMissing: false });
    } catch {
      return emptyGlossaryBaseCatalog();
    }
  } catch {
    return emptyGlossaryBaseCatalog();
  }
}

export function saveGlossaryBaseCatalog(
  catalog: GlossaryBaseCatalog,
): { catalog: GlossaryBaseCatalog; saved: boolean; quota: boolean } {
  const clean = sanitizeGlossaryBaseCatalog(catalog);
  const write = writeCatalog(clean);
  return { catalog: clean, saved: write.saved, quota: write.quota };
}

/**
 * Seed or refresh the built-in cards. Idempotent: existing cards and instructor
 * links are kept, missing cards are added, and the instructor's own tree
 * archive is never written. A same-name step in a user tree is reported and
 * not merged with the glossary card.
 */
export function ensureGlossaryBaseCards(
  archive: TechniqueTreeArchive | null = null,
): EnsureGlossaryBaseResult {
  const built = buildGlossaryBaseCards();
  const previous = loadGlossaryBaseCatalog();
  const beforeIds = new Set(previous.cards.map((card) => card.termKey));
  const catalog: GlossaryBaseCatalog = {
    version: 1,
    cards: previous.cards,
    links: previous.links,
    collisions: findTitleCollisions(built.cards, archive),
    skipped: built.skipped,
  };
  const merged = sanitizeGlossaryBaseCatalog(catalog);
  const reused = merged.cards.filter((card) => beforeIds.has(card.termKey)).length;
  const created = merged.cards.length - reused;
  const unchanged =
    previous.cards.length === merged.cards.length &&
    previous.links.length === merged.links.length &&
    JSON.stringify(previous.collisions) === JSON.stringify(merged.collisions) &&
    beforeIds.size === merged.cards.length &&
    merged.cards.every((card) => beforeIds.has(card.termKey));
  if (unchanged && previous.cards.length === built.cards.length) {
    return { catalog: merged, created: 0, reused: merged.cards.length, written: false, quota: false };
  }
  const write = writeCatalog(merged);
  return { catalog: merged, created, reused, written: write.saved, quota: write.quota };
}
