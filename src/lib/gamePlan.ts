/**
 * Competitor Game Plan, stored on the roster save with that bout competitor.
 *
 * Linking is loose. A note never requires a Technique Tree node. A coach can
 * write custom text, attach a node, or do both. Reverse lookups only exist
 * when a link was actually saved.
 *
 * A link points at `treeId` + `nodeId` from `matboard.coach.techniqueTree.v1`.
 * Node ids are the tree's own ids (`findNode`). `slotId` stays the lesson hook.
 */

import type { TechniqueNode, TechniqueTreeArchive, TechniqueTreeDoc, TreeNodeKind } from './techniqueTreeStore.ts';

export const GAME_NOTE_MAX = 400;
export const GAME_LINK_MAX = 8;

export const GAME_AUDITS = ['overdeveloped', 'underdeveloped', 'balanced'] as const;
export type GameAudit = (typeof GAME_AUDITS)[number];

export const GAME_LINK_FLAGS = ['strong', 'needs-work'] as const;
export type GameLinkFlag = (typeof GAME_LINK_FLAGS)[number];

export type GameLayerSection = 'a' | 'b' | 'c';
export type GameSection = GameLayerSection | 'home';

export const GAME_LAYER_SECTIONS = ['a', 'b', 'c'] as const;
export const GAME_SECTIONS = ['a', 'b', 'c', 'home'] as const;

/** Optional pointer at one Technique Tree step. `flag` may stay blank. */
export type TechniqueLink = {
  treeId: string;
  nodeId: string;
  flag: GameLinkFlag | '';
};

export type GameLayer = {
  notes: string;
  /** Blank until a coach picks one. Home focus always stays blank. */
  audit: GameAudit | '';
  links: TechniqueLink[];
};

export type CompetitorGamePlan = {
  a: GameLayer;
  b: GameLayer;
  c: GameLayer;
  home: GameLayer;
};

export type TechniqueTarget = {
  treeId: string;
  treeName: string;
  nodeId: string;
  title: string;
  kind: TreeNodeKind;
};

export type GamePlanMention = {
  competitorId: string;
  name: string;
  section: GameSection;
  flag: GameLinkFlag | '';
};

const ID_MAX = 80;

export function emptyLayer(): GameLayer {
  return { notes: '', audit: '', links: [] };
}

export function emptyGamePlan(): CompetitorGamePlan {
  return { a: emptyLayer(), b: emptyLayer(), c: emptyLayer(), home: emptyLayer() };
}

export function sectionLabel(section: GameSection): string {
  if (section === 'home') return 'Home focus';
  return `${section.toUpperCase()} Game`;
}

export function auditLabel(audit: GameAudit): string {
  if (audit === 'overdeveloped') return 'Overdeveloped';
  if (audit === 'underdeveloped') return 'Underdeveloped';
  return 'Balanced';
}

export function flagLabel(flag: GameLinkFlag): string {
  return flag === 'strong' ? 'Strong' : 'Needs work';
}

export function mentionText(mention: Pick<GamePlanMention, 'section' | 'flag'>): string {
  const section = sectionLabel(mention.section);
  if (!mention.flag) return section;
  return `${section} · ${flagLabel(mention.flag)}`;
}

function layerHasContent(layer: GameLayer): boolean {
  return Boolean(layer.notes.trim() || layer.audit || layer.links.length);
}

export function gamePlanHasContent(plan: CompetitorGamePlan): boolean {
  return GAME_SECTIONS.some((section) => layerHasContent(plan[section]));
}

export function gamePlanStatusLabel(plan: CompetitorGamePlan): string {
  const bits: string[] = [];
  for (const section of GAME_LAYER_SECTIONS) {
    const layer = plan[section];
    if (!layerHasContent(layer)) continue;
    bits.push(layer.audit ? `${sectionLabel(section)} · ${auditLabel(layer.audit)}` : sectionLabel(section));
  }
  if (layerHasContent(plan.home)) bits.push('Home focus');
  return bits.length ? bits.join(' · ') : 'No game plan yet';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clipId(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, ID_MAX) : '';
}

function normalizeFlag(value: unknown): GameLinkFlag | '' {
  return value === 'strong' || value === 'needs-work' ? value : '';
}

function normalizeAudit(value: unknown): GameAudit | '' {
  return value === 'overdeveloped' || value === 'underdeveloped' || value === 'balanced' ? value : '';
}

export function normalizeTechniqueLink(raw: unknown): TechniqueLink | null {
  const row = asRecord(raw);
  if (!row) return null;
  const treeId = clipId(row.treeId);
  const nodeId = clipId(row.nodeId);
  if (!treeId || !nodeId) return null;
  return { treeId, nodeId, flag: normalizeFlag(row.flag) };
}

function normalizeLinks(raw: unknown): TechniqueLink[] {
  if (!Array.isArray(raw)) return [];
  const links: TechniqueLink[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const link = normalizeTechniqueLink(item);
    if (!link) continue;
    const key = linkKey(link.treeId, link.nodeId);
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(link);
    if (links.length >= GAME_LINK_MAX) break;
  }
  return links;
}

function normalizeLayer(raw: unknown, allowAudit: boolean): GameLayer {
  const row = asRecord(raw);
  const notes = typeof row?.notes === 'string' ? row.notes.trim().slice(0, GAME_NOTE_MAX) : '';
  return {
    notes,
    audit: allowAudit ? normalizeAudit(row?.audit) : '',
    links: normalizeLinks(row?.links),
  };
}

/** Blank plans become null so the roster save can omit them. */
export function normalizeGamePlan(raw: unknown): CompetitorGamePlan | null {
  const row = asRecord(raw);
  const plan: CompetitorGamePlan = {
    a: normalizeLayer(row?.a, true),
    b: normalizeLayer(row?.b, true),
    c: normalizeLayer(row?.c, true),
    home: normalizeLayer(row?.home, false),
  };
  return gamePlanHasContent(plan) ? plan : null;
}

export function normalizeGamePlanMap(
  raw: unknown,
  studentIds: Set<string>,
): Record<string, CompetitorGamePlan> {
  const source = asRecord(raw);
  if (!source) return {};
  const gamePlans: Record<string, CompetitorGamePlan> = {};
  for (const [id, value] of Object.entries(source)) {
    if (!studentIds.has(id)) continue;
    const plan = normalizeGamePlan(value);
    if (plan) gamePlans[id] = plan;
  }
  return gamePlans;
}

function linkKey(treeId: string, nodeId: string): string {
  return `${treeId}\n${nodeId}`;
}

function layerWith(plan: CompetitorGamePlan, section: GameSection, layer: GameLayer): CompetitorGamePlan {
  return { ...plan, [section]: section === 'home' ? { ...layer, audit: '' } : layer };
}

export function withGameNotes(plan: CompetitorGamePlan, section: GameSection, notes: string): CompetitorGamePlan {
  const layer = plan[section];
  return layerWith(plan, section, { ...layer, notes: notes.slice(0, GAME_NOTE_MAX) });
}

export function withGameAudit(
  plan: CompetitorGamePlan,
  section: GameLayerSection,
  audit: GameAudit | '',
): CompetitorGamePlan {
  const next = normalizeAudit(audit);
  const layer = plan[section];
  return layerWith(plan, section, { ...layer, audit: layer.audit === next ? '' : next });
}

export function withGameLink(
  plan: CompetitorGamePlan,
  section: GameSection,
  link: { treeId: string; nodeId: string },
): CompetitorGamePlan {
  const treeId = clipId(link.treeId);
  const nodeId = clipId(link.nodeId);
  if (!treeId || !nodeId) return plan;
  const layer = plan[section];
  if (layer.links.some((row) => row.treeId === treeId && row.nodeId === nodeId)) return plan;
  if (layer.links.length >= GAME_LINK_MAX) return plan;
  return layerWith(plan, section, {
    ...layer,
    links: [...layer.links, { treeId, nodeId, flag: '' }],
  });
}

export function withGameLinkFlag(
  plan: CompetitorGamePlan,
  section: GameSection,
  treeId: string,
  nodeId: string,
  flag: GameLinkFlag | '',
): CompetitorGamePlan {
  const layer = plan[section];
  const nextFlag = normalizeFlag(flag);
  let changed = false;
  const links = layer.links.map((link) => {
    if (link.treeId !== treeId || link.nodeId !== nodeId) return link;
    changed = true;
    const flag = link.flag === nextFlag ? '' : nextFlag;
    return flag === link.flag ? link : { ...link, flag };
  });
  if (!changed) return plan;
  return layerWith(plan, section, { ...layer, links });
}

export function withoutGameLink(
  plan: CompetitorGamePlan,
  section: GameSection,
  treeId: string,
  nodeId: string,
): CompetitorGamePlan {
  const layer = plan[section];
  const links = layer.links.filter((link) => link.treeId !== treeId || link.nodeId !== nodeId);
  if (links.length === layer.links.length) return plan;
  return layerWith(plan, section, { ...layer, links });
}

function visitTargets(tree: TechniqueTreeDoc, into: TechniqueTarget[], node: TechniqueNode | null): void {
  if (!node) return;
  const title = node.title.trim();
  if (title) {
    into.push({
      treeId: tree.id,
      treeName: tree.name,
      nodeId: node.id,
      title,
      kind: node.kind,
    });
  }
  for (const child of node.children) visitTargets(tree, into, child);
}

/** Titled steps, active tree first. Untitled steps are skipped. */
export function listTechniqueTargets(archive: TechniqueTreeArchive): TechniqueTarget[] {
  const active = archive.trees.find((tree) => tree.id === archive.activeId) ?? archive.trees[0];
  const ordered = active
    ? [active, ...archive.trees.filter((tree) => tree.id !== active.id)]
    : [...archive.trees];
  const into: TechniqueTarget[] = [];
  for (const tree of ordered) visitTargets(tree, into, tree.root);
  return into;
}

export function findTechniqueTarget(
  archive: TechniqueTreeArchive,
  treeId: string,
  nodeId: string,
): TechniqueTarget | null {
  return listTechniqueTargets(archive).find((target) => target.treeId === treeId && target.nodeId === nodeId) ?? null;
}

function words(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3);
}

function targetScore(target: TechniqueTarget, note: string, noteWords: string[], activeId: string): number {
  let score = target.treeId === activeId ? 1 : 0;
  const title = target.title.trim().toLowerCase();
  const noteNorm = note.trim().toLowerCase();
  if (noteNorm && title && (noteNorm.includes(title) || title.includes(noteNorm))) score += 8;
  const titleWords = new Set(words(target.title));
  for (const word of noteWords) {
    if (titleWords.has(word)) score += 3;
  }
  return score;
}

/**
 * Optional hints. A blank note still returns titled steps so a coach can glance
 * at the tree. Already-linked steps are left out. Nothing here is required.
 */
export function suggestTechniqueTargets(
  archive: TechniqueTreeArchive,
  note: string,
  links: readonly TechniqueLink[],
  limit = 6,
): TechniqueTarget[] {
  const taken = new Set(links.map((link) => linkKey(link.treeId, link.nodeId)));
  const available = listTechniqueTargets(archive).filter((target) => !taken.has(linkKey(target.treeId, target.nodeId)));
  if (!available.length || limit <= 0) return [];
  const noteWords = words(note);
  const ranked = available
    .map((target, index) => ({
      target,
      index,
      score: targetScore(target, note, noteWords, archive.activeId),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked.slice(0, limit).map((row) => row.target);
}

export function techniqueNodePath(treeId: string, nodeId: string): string {
  const params = new URLSearchParams({ tree: treeId, node: nodeId });
  return `/technique-tree?${params.toString()}`;
}

export function gamePlanMentionIndex(
  competitors: readonly { id: string; name: string }[],
  plans: Record<string, CompetitorGamePlan>,
): Map<string, GamePlanMention[]> {
  const names = new Map(competitors.map((row) => [row.id, row.name]));
  const index = new Map<string, GamePlanMention[]>();
  for (const [competitorId, plan] of Object.entries(plans)) {
    const name = names.get(competitorId);
    if (!name) continue;
    for (const section of GAME_SECTIONS) {
      for (const link of plan[section].links) {
        const key = linkKey(link.treeId, link.nodeId);
        const list = index.get(key) ?? [];
        list.push({ competitorId, name, section, flag: link.flag });
        index.set(key, list);
      }
    }
  }
  return index;
}

export function mentionsForNode(
  index: Map<string, GamePlanMention[]>,
  treeId: string,
  nodeId: string,
): GamePlanMention[] {
  return index.get(linkKey(treeId, nodeId)) ?? [];
}
