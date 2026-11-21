/**
 * Path to Mastery: connections between instructor D12 cards and faces.
 * The instructor analog of the student Technique Tree on the D8.
 *
 * - "Connects to": this card leads into another card or face (the D8's Leads to).
 *   These are the arrows Follow the chain travels.
 * - "Builds on": this card grows out of another (the D8's Comes from). Saved as
 *   the other card connecting to this one, so it is the same arrow seen from the
 *   other end.
 * - "Supports": this card helps another without being a step toward it (the
 *   D8's side relation, like Defended by). Drawn as a branch, never chained.
 *
 * Saved under INSTRUCTOR_D12_LINKS_STORAGE_KEY, keyed by instructor seat. The
 * card file (matboard.instructor.d12.cards.v1) and the daily check-in
 * (matboard.instructor.d12.v1) are never written here.
 */
import { INSTRUCTOR_D12_FACES, instructorD12SeatKey, type InstructorD12FaceId } from './instructorD12.ts';
import { isInstructorD12FaceId, type InstructorD12Card } from './instructorD12Cards.ts';
import type { D8Branch, D8Chain } from '../preview/crystallineSweeps/branches.ts';
import type { TopoModel } from '../preview/crystallineSweeps/topo.ts';

/** Placeholder name. Rename here and every label follows. */
export const PATH_TO_MASTERY = 'Path to Mastery';
export const VIEW_ON_PATH_TO_MASTERY = `View on ${PATH_TO_MASTERY}`;
export const PATH_TO_MASTERY_EMPTY = `No ${PATH_TO_MASTERY} connections for this card yet.`;
export const PATH_TO_MASTERY_EMPTY_HINT = `Open a card and add a connection to see your ${PATH_TO_MASTERY}.`;
export const PATH_TO_MASTERY_SAME_FACE_HINT = `Your ${PATH_TO_MASTERY} connections stay on one face, so there is no branch to draw through the D12 yet.`;

export const INSTRUCTOR_D12_LINKS_STORAGE_KEY = 'matboard.instructor.d12.links.v1';

export const D12_CHAIN_STEPS = 5;
export const D12_CHAIN_MAX = 8;
const LINK_MAX = 600;

export type D12LinkRelation = 'connects' | 'supports';
export type D12AddRelation = 'connects' | 'builds-on' | 'supports';

export const D12_RELATION_CHOICES: readonly { id: D12AddRelation; label: string }[] = [
  { id: 'connects', label: 'Connects to' },
  { id: 'builds-on', label: 'Builds on' },
  { id: 'supports', label: 'Supports' },
];

/** A card id, or `face:<faceId>` for a whole face. */
export type D12Endpoint = string;
export type D12Link = { from: D12Endpoint; to: D12Endpoint; relation: D12LinkRelation };

export type D12LinksFile = { v: 1; linksBySeat: Record<string, D12Link[]> };

export function d12FaceEndpoint(faceId: InstructorD12FaceId): D12Endpoint {
  return `face:${faceId}`;
}

export function d12EndpointFace(endpoint: D12Endpoint): InstructorD12FaceId | null {
  if (!endpoint.startsWith('face:')) return null;
  const id = endpoint.slice(5);
  return isInstructorD12FaceId(id) ? id : null;
}

function faceLabel(faceId: InstructorD12FaceId): string {
  return INSTRUCTOR_D12_FACES.find((face) => face.id === faceId)?.label ?? faceId;
}

export type D12Node = { endpoint: D12Endpoint; kind: 'card' | 'face'; name: string; faceId: InstructorD12FaceId; faceLabel: string };

/** What an endpoint points at now. A deleted card resolves to null and its links are ignored. */
export function resolveD12Endpoint(cards: readonly InstructorD12Card[], endpoint: D12Endpoint): D12Node | null {
  const face = d12EndpointFace(endpoint);
  if (face) return { endpoint, kind: 'face', name: faceLabel(face), faceId: face, faceLabel: faceLabel(face) };
  const card = cards.find((item) => item.id === endpoint);
  return card ? { endpoint, kind: 'card', name: card.name, faceId: card.faceId, faceLabel: faceLabel(card.faceId) } : null;
}

function cleanLink(value: unknown): D12Link | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<D12Link>;
  const from = typeof row.from === 'string' ? row.from.trim() : '';
  const to = typeof row.to === 'string' ? row.to.trim() : '';
  const relation = row.relation === 'connects' || row.relation === 'supports' ? row.relation : null;
  if (!from || !to || from === to || !relation || from.length > 90 || to.length > 90) return null;
  if (from.startsWith('face:') && !d12EndpointFace(from)) return null;
  if (to.startsWith('face:') && !d12EndpointFace(to)) return null;
  return { from, to, relation };
}

export function cleanD12Links(raw: unknown): D12Link[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: D12Link[] = [];
  for (const row of raw) {
    const link = cleanLink(row);
    if (!link) continue;
    const key = `${link.from}>${link.to}>${link.relation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link);
    if (out.length >= LINK_MAX) break;
  }
  return out;
}

function readFile(storage: Pick<Storage, 'getItem'>): D12LinksFile {
  try {
    const raw = storage.getItem(INSTRUCTOR_D12_LINKS_STORAGE_KEY);
    if (!raw) return { v: 1, linksBySeat: {} };
    const parsed = JSON.parse(raw) as { v?: number; linksBySeat?: Record<string, unknown> };
    if (!parsed || parsed.v !== 1 || !parsed.linksBySeat || typeof parsed.linksBySeat !== 'object') return { v: 1, linksBySeat: {} };
    return { v: 1, linksBySeat: Object.fromEntries(Object.entries(parsed.linksBySeat).map(([key, value]) => [key, cleanD12Links(value)])) };
  } catch {
    return { v: 1, linksBySeat: {} };
  }
}

export function loadInstructorD12Links(storage: Pick<Storage, 'getItem'> = localStorage, seatKey = 'owner'): D12Link[] {
  return readFile(storage).linksBySeat[instructorD12SeatKey(seatKey)] ?? [];
}

export function saveInstructorD12Links(
  links: readonly D12Link[],
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
  seatKey = 'owner',
): D12Link[] {
  const file = readFile(storage);
  const clean = cleanD12Links(links);
  file.linksBySeat[instructorD12SeatKey(seatKey)] = clean;
  storage.setItem(INSTRUCTOR_D12_LINKS_STORAGE_KEY, JSON.stringify(file));
  return clean;
}

/**
 * Add one connection from a card's point of view. Builds on is saved as the
 * other end connecting to this card. Returns the same array when nothing changed.
 */
export function withD12Link(links: readonly D12Link[], cardId: string, relation: D12AddRelation, target: D12Endpoint): readonly D12Link[] {
  const link: D12Link =
    relation === 'builds-on' ? { from: target, to: cardId, relation: 'connects' } : { from: cardId, to: target, relation };
  if (!cleanLink(link)) return links;
  if (links.some((row) => row.from === link.from && row.to === link.to && row.relation === link.relation)) return links;
  return [...links, link];
}

export function withoutD12Link(links: readonly D12Link[], link: D12Link): D12Link[] {
  return links.filter((row) => !(row.from === link.from && row.to === link.to && row.relation === link.relation));
}

export type D12Neighbor = D12Node & { link: D12Link };

export type D12CardMastery = {
  connectsTo: D12Neighbor[];
  buildsOn: D12Neighbor[];
  supports: D12Neighbor[];
  supportedBy: D12Neighbor[];
};

/** This card's connections, both directions. Links to a deleted card are skipped. */
export function d12CardMastery(card: InstructorD12Card, cards: readonly InstructorD12Card[], links: readonly D12Link[]): D12CardMastery {
  const view: D12CardMastery = { connectsTo: [], buildsOn: [], supports: [], supportedBy: [] };
  for (const link of links) {
    const out = link.from === card.id;
    const into = link.to === card.id;
    if (!out && !into) continue;
    const other = resolveD12Endpoint(cards, out ? link.to : link.from);
    if (!other) continue;
    const row = { ...other, link };
    if (link.relation === 'connects') (out ? view.connectsTo : view.buildsOn).push(row);
    else (out ? view.supports : view.supportedBy).push(row);
  }
  return view;
}

export function d12MasteryEmpty(view: D12CardMastery): boolean {
  return !view.connectsTo.length && !view.buildsOn.length && !view.supports.length && !view.supportedBy.length;
}

export type D12ConnectionOption = D12Node;

/** Cards and faces that match the query. The card itself and its own face are left out. */
export function d12ConnectionOptions(query: string, cards: readonly InstructorD12Card[], card: InstructorD12Card, max = 8): D12ConnectionOption[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const nodes: D12Node[] = [
    ...cards.filter((item) => item.id !== card.id).map((item) => resolveD12Endpoint(cards, item.id)!),
    ...INSTRUCTOR_D12_FACES.filter((face) => face.id !== card.faceId).map((face) => resolveD12Endpoint(cards, d12FaceEndpoint(face.id))!),
  ];
  const hits = nodes.filter((node) => node.name.toLocaleLowerCase().includes(needle) || node.faceLabel.toLocaleLowerCase().includes(needle));
  hits.sort((left, right) => {
    const a = left.name.toLocaleLowerCase().startsWith(needle) ? 0 : 1;
    const b = right.name.toLocaleLowerCase().startsWith(needle) ? 0 : 1;
    return a - b || (left.kind === right.kind ? 0 : left.kind === 'card' ? -1 : 1) || left.name.localeCompare(right.name);
  });
  return hits.slice(0, max);
}

/** Tile for an endpoint on the D12 mesh: the card's own tile, or the first tile of a face. */
export function d12EndpointTile(model: TopoModel, endpoint: D12Endpoint): number | null {
  const face = d12EndpointFace(endpoint);
  if (face) {
    const faceIndex = model.faces.findIndex((item) => (item.id as string) === face);
    const tile = model.tiles.find((item) => item.faceIndex === faceIndex);
    return tile ? tile.index : null;
  }
  const tile = model.tiles.find((item) => item.move?.id === endpoint);
  return tile ? tile.index : null;
}

export type D12MasteryState =
  | { kind: 'ready'; branches: D8Branch[]; chains: D8Chain[] }
  | { kind: 'empty'; hint: string }
  | { kind: 'same-face'; hint: string; saved: number };

type Edge = { from: number; to: number; fromName: string; toName: string; relation: D12LinkRelation; fromFace: number; toFace: number };

function meshEdges(model: TopoModel, cards: readonly InstructorD12Card[], links: readonly D12Link[]): Edge[] {
  const out: Edge[] = [];
  for (const link of links) {
    const a = resolveD12Endpoint(cards, link.from);
    const b = resolveD12Endpoint(cards, link.to);
    if (!a || !b) continue;
    const from = d12EndpointTile(model, link.from);
    const to = d12EndpointTile(model, link.to);
    if (from == null || to == null || from === to) continue;
    out.push({
      from,
      to,
      fromName: a.name,
      toName: b.name,
      relation: link.relation,
      fromFace: model.tiles[from]!.faceIndex,
      toFace: model.tiles[to]!.faceIndex,
    });
  }
  return out;
}

/**
 * Branches drawn through the inside of the D12, like the D8's Technique Tree
 * branches. Same-face connections stay on the surface, so they are left out.
 */
export function d12MasteryBranches(model: TopoModel, cards: readonly InstructorD12Card[], links: readonly D12Link[]): D8Branch[] {
  const seen = new Set<string>();
  const out: D8Branch[] = [];
  for (const edge of meshEdges(model, cards, links)) {
    if (edge.fromFace === edge.toFace) continue;
    const key = edge.from < edge.to ? `${edge.from}:${edge.to}` : `${edge.to}:${edge.from}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `${edge.from}->${edge.to}`, from: edge.from, to: edge.to, fromName: edge.fromName, toName: edge.toName });
  }
  return out;
}

function contains(outer: readonly number[], inner: readonly number[]): boolean {
  if (inner.length > outer.length) return false;
  for (let start = 0; start + inner.length <= outer.length; start += 1) {
    if (inner.every((value, offset) => outer[start + offset] === value)) return true;
  }
  return false;
}

function walk(edges: readonly Edge[], start: number, names: Map<number, string>, steps: number): D8Chain | null {
  const tiles = [start];
  let current = start;
  for (let step = 0; step < steps; step += 1) {
    const options = edges.filter((edge) => edge.from === current && !tiles.includes(edge.to));
    const currentFace = options[0]?.fromFace;
    const next = options.find((edge) => edge.toFace !== currentFace) ?? options[0];
    if (!next) break;
    tiles.push(next.to);
    current = next.to;
  }
  if (tiles.length < 2) return null;
  return { id: `chain:${tiles.join('>')}`, tiles, names: tiles.map((tile) => names.get(tile) ?? ''), sample: false };
}

/**
 * Chains for Follow the chain, along Connects to arrows only. Same rule as the
 * D8: start with cards nothing connects into, then the busiest, prefer a step
 * onto another face, and drop a chain already inside a longer one.
 */
export function d12MasteryChains(model: TopoModel, cards: readonly InstructorD12Card[], links: readonly D12Link[], max = D12_CHAIN_MAX): D8Chain[] {
  const edges = meshEdges(model, cards, links).filter((edge) => edge.relation === 'connects');
  if (!edges.length) return [];
  const names = new Map<number, string>();
  const out = new Map<number, number>();
  const into = new Map<number, number>();
  for (const edge of edges) {
    names.set(edge.from, edge.fromName);
    names.set(edge.to, edge.toName);
    out.set(edge.from, (out.get(edge.from) ?? 0) + 1);
    into.set(edge.to, (into.get(edge.to) ?? 0) + 1);
  }
  const starts = [...out.keys()].sort((left, right) => {
    const a = into.has(left) ? 1 : 0;
    const b = into.has(right) ? 1 : 0;
    return a - b || (out.get(right) ?? 0) - (out.get(left) ?? 0) || (names.get(left) ?? '').localeCompare(names.get(right) ?? '');
  });
  const chains: D8Chain[] = [];
  for (const start of starts) {
    const chain = walk(edges, start, names, D12_CHAIN_STEPS);
    if (!chain || chains.some((other) => contains(other.tiles, chain.tiles))) continue;
    chains.push(chain);
    if (chains.length >= max) break;
  }
  return chains;
}

/** What the live D12 shows when X-ray or branches are on: branches and chains, or a friendly hint. */
export function d12MasteryState(model: TopoModel, cards: readonly InstructorD12Card[], links: readonly D12Link[]): D12MasteryState {
  const live = links.filter((link) => resolveD12Endpoint(cards, link.from) && resolveD12Endpoint(cards, link.to));
  if (!live.length) return { kind: 'empty', hint: PATH_TO_MASTERY_EMPTY_HINT };
  const branches = d12MasteryBranches(model, cards, live);
  // Same rule as the D8: with no branch through the inside, show the hint instead of a chain.
  if (!branches.length) return { kind: 'same-face', hint: PATH_TO_MASTERY_SAME_FACE_HINT, saved: live.length };
  return { kind: 'ready', branches, chains: d12MasteryChains(model, cards, live) };
}

/**
 * The chain to play for "View on Path to Mastery": the first chain that passes
 * through this card. Null when no chain reaches it.
 */
export function d12ChainForCard(model: TopoModel, cardId: string, chains: readonly D8Chain[]): { index: number; chain: D8Chain } | null {
  const tile = d12EndpointTile(model, cardId);
  if (tile == null) return null;
  const index = chains.findIndex((chain) => chain.tiles.includes(tile));
  if (index >= 0) return { index, chain: chains[index]! };
  return null;
}

/** Fictional sample connections for the preview page. Starter ids only. */
export const INSTRUCTOR_D12_SAMPLE_LINKS: readonly D12Link[] = [
  { from: 'starter.preparation.lesson-plan-video-review', to: 'starter.public-speaking.intro-end-of-class-message', relation: 'connects' },
  { from: 'starter.public-speaking.intro-end-of-class-message', to: 'face:time-management', relation: 'connects' },
  { from: 'starter.preparation.mat-inspection', to: 'face:safety', relation: 'supports' },
  { from: 'starter.public-speaking.communicating-with-parents-off-the-mat', to: 'face:student-retention', relation: 'connects' },
];
