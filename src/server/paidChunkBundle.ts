/**
 * Build graph for paid screens. A chunk is paid when it is one of the four
 * screen chunks, or when every chunk that imports it is paid. Shared modules
 * the public entry also imports stay in /assets.
 */

import { posix } from 'node:path';
import { PAID_CHUNK_IDS, isPaidChunkId, type PaidChunkId } from '../lib/paidChunkAccess.ts';

export const PAID_PAGE_MODULES: Readonly<Record<string, PaidChunkId>> = {
  '/src/pages/Pro.tsx': 'pro-console',
  '/src/pages/Screensaver.tsx': 'media-console',
  '/src/pages/MediaEditionHub.tsx': 'media-console',
  '/src/pages/Schedule.tsx': 'media-console',
  '/src/pages/ClassHistory.tsx': 'lesson-cloud',
  '/src/pages/CoachUnlimited.tsx': 'coach-unlimited',
  '/src/pages/ReviewInbox.tsx': 'coach-unlimited',
};

export const PAID_MANIFEST_PLACEHOLDER = '__PAID_CHUNK_MANIFEST__';

export function paidChunkNameForModule(id: string): PaidChunkId | undefined {
  const norm = id.replaceAll('\\', '/');
  for (const [suffix, name] of Object.entries(PAID_PAGE_MODULES)) {
    if (norm.endsWith(suffix)) return name;
  }
  return undefined;
}

export type BundleChunk = {
  fileName: string;
  name: string;
  /** HTML or JS entry. Paid screens import shared code from it, so it must stay public. */
  isEntry: boolean;
  imports: readonly string[];
  dynamicImports: readonly string[];
};

export type PaidBundlePlan = {
  moves: Map<string, string>;
  protectedFiles: Set<string>;
  filesForChunk: Record<PaidChunkId, string[]>;
  manifestFiles: Record<string, PaidChunkId[]>;
};

function emptyFiles(): Record<PaidChunkId, string[]> {
  return {
    'pro-console': [],
    'media-console': [],
    'lesson-cloud': [],
    'coach-unlimited': [],
  };
}

export function planPaidBundle(chunks: readonly BundleChunk[]): PaidBundlePlan {
  const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const importers = new Map<string, Set<string>>();
  for (const chunk of chunks) {
    for (const target of [...chunk.imports, ...chunk.dynamicImports]) {
      let parents = importers.get(target);
      if (!parents) {
        parents = new Set();
        importers.set(target, parents);
      }
      parents.add(chunk.fileName);
    }
  }

  const protectedFiles = new Set<string>();
  for (const chunk of chunks) {
    if (isPaidChunkId(chunk.name)) protectedFiles.add(chunk.fileName);
  }

  let grew = true;
  while (grew) {
    grew = false;
    for (const chunk of chunks) {
      if (protectedFiles.has(chunk.fileName)) continue;
      if (chunk.isEntry) continue;
      const parents = importers.get(chunk.fileName);
      if (!parents || parents.size === 0) continue;
      let onlyPaid = true;
      for (const parent of parents) {
        if (!protectedFiles.has(parent)) {
          onlyPaid = false;
          break;
        }
      }
      if (!onlyPaid) continue;
      protectedFiles.add(chunk.fileName);
      grew = true;
    }
  }

  const moves = new Map<string, string>();
  for (const file of protectedFiles) {
    const base = file.split('/').pop() ?? file;
    const next = file.startsWith('paid/') ? file : `paid/${base}`;
    if (next !== file) moves.set(file, next);
  }

  const filesForChunk = emptyFiles();
  const manifestSets = new Map<string, Set<PaidChunkId>>();
  for (const chunk of chunks) {
    if (!isPaidChunkId(chunk.name) || !protectedFiles.has(chunk.fileName)) continue;
    const root = chunk.name;
    const seen = new Set<string>();
    const queue = [chunk.fileName];
    while (queue.length) {
      const current = queue.pop();
      if (!current || seen.has(current) || !protectedFiles.has(current)) continue;
      seen.add(current);
      const node = byFile.get(current);
      if (!node) continue;
      for (const target of [...node.imports, ...node.dynamicImports]) {
        if (protectedFiles.has(target)) queue.push(target);
      }
    }
    for (const file of seen) {
      const base = (moves.get(file) ?? file).split('/').pop() ?? file;
      const url = `/paid/${base}`;
      if (!filesForChunk[root].includes(url)) filesForChunk[root].push(url);
      let ids = manifestSets.get(base);
      if (!ids) {
        ids = new Set();
        manifestSets.set(base, ids);
      }
      ids.add(root);
    }
  }

  const manifestFiles: Record<string, PaidChunkId[]> = {};
  for (const [base, ids] of manifestSets) {
    manifestFiles[base] = PAID_CHUNK_IDS.filter((id) => ids.has(id));
  }
  return { moves, protectedFiles, filesForChunk, manifestFiles };
}

/** Add a stylesheet that only paid chunks import. */
export function addPaidStylesheet(plan: PaidBundlePlan, cssFile: string, importedBy: readonly string[]): void {
  if (importedBy.length === 0) return;
  if (!importedBy.every((file) => plan.protectedFiles.has(file))) return;
  const base = cssFile.split('/').pop() ?? cssFile;
  const next = cssFile.startsWith('paid/') ? cssFile : `paid/${base}`;
  if (next !== cssFile) plan.moves.set(cssFile, next);
  plan.protectedFiles.add(cssFile);
  const url = `/paid/${base}`;
  const roots = new Set<PaidChunkId>();
  for (const [id, files] of Object.entries(plan.filesForChunk) as [PaidChunkId, string[]][]) {
    const ownsImporter = importedBy.some((file) => {
      const importerBase = (plan.moves.get(file) ?? file).split('/').pop() ?? file;
      return files.includes(`/paid/${importerBase}`);
    });
    if (!ownsImporter) continue;
    if (!files.includes(url)) files.push(url);
    roots.add(id);
  }
  const previous = new Set(plan.manifestFiles[base] ?? []);
  for (const id of roots) previous.add(id);
  plan.manifestFiles[base] = PAID_CHUNK_IDS.filter((id) => previous.has(id));
}

export function specifierBetween(fromFile: string, toFile: string): string {
  let spec = posix.relative(posix.dirname(fromFile), toFile);
  if (!spec.startsWith('.')) spec = `./${spec}`;
  return spec;
}

function rewriteSpec(spec: string, fromOld: string, fromNew: string, oldToNew: ReadonlyMap<string, string>): string | null {
  if (!spec.startsWith('.')) return null;
  const bare = spec.split('?')[0]?.split('#')[0] ?? spec;
  const targetOld = posix.normalize(posix.join(posix.dirname(fromOld), bare));
  if (!oldToNew.has(targetOld)) return null;
  const targetNew = oldToNew.get(targetOld) ?? targetOld;
  const next = specifierBetween(fromNew, targetNew);
  const suffix = spec.slice(bare.length);
  if (next === bare && suffix.length === 0) return null;
  return `${next}${suffix}`;
}

/** Point relative chunk and asset URLs at the path they will be written to. */
export function rewriteRelativeUrls(
  code: string,
  fromOld: string,
  fromNew: string,
  oldToNew: ReadonlyMap<string, string>,
): string {
  const quoted = code.replace(/(["'])(\.\.?\/[^"']+)\1/g, (full, quote: string, spec: string) => {
    const updated = rewriteSpec(spec, fromOld, fromNew, oldToNew);
    return updated ? `${quote}${updated}${quote}` : full;
  });
  return quoted.replace(/url\((\.\.?\/[^)]+)\)/g, (full, spec: string) => {
    const cleaned = spec.trim().replace(/^['"]|['"]$/g, '');
    const updated = rewriteSpec(cleaned, fromOld, fromNew, oldToNew);
    return updated ? `url(${updated})` : full;
  });
}
