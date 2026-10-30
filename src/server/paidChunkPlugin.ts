import type { Plugin } from 'vite';
import { PAID_CHUNK_IDS, type PaidChunkId } from '../lib/paidChunkAccess.ts';
import {
  PAID_MANIFEST_PLACEHOLDER,
  addPaidStylesheet,
  paidChunkNameForModule,
  planPaidBundle,
  rewriteRelativeUrls,
  type BundleChunk,
} from './paidChunkBundle.ts';

const VIRTUAL_ID = 'virtual:paid-chunks';
const RESOLVED_ID = '\0virtual:paid-chunks';

type BundleFile = {
  type: string;
  fileName: string;
  name?: string;
  facadeModuleId?: string | null;
  isEntry?: boolean;
  imports?: readonly string[];
  dynamicImports?: readonly string[];
  code?: string;
  source?: string | Uint8Array;
  viteMetadata?: { importedCss?: Iterable<string> };
};

function isChunk(item: BundleFile): item is BundleFile & { code: string } {
  return item.type === 'chunk' && typeof item.code === 'string';
}

/**
 * Emits Pro Console, Media Console, Lesson Cloud, and Coach Unlimited as
 * separate chunks under dist/paid. The public entry only dynamic-imports them.
 */
export function paidChunkPlugin(): Plugin {
  let command = 'serve';
  return {
    name: 'paid-chunks',
    config(_config, env) {
      command = env.command;
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      return undefined;
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      if (command !== 'build') return 'export const PAID_CHUNK_FILES = {};\n';
      return `export const PAID_CHUNK_FILES = JSON.parse("${PAID_MANIFEST_PLACEHOLDER}");\n`;
    },
    generateBundle(_options, bundle) {
      const files = Object.values(bundle) as BundleFile[];
      const chunks: BundleChunk[] = [];
      for (const item of files) {
        if (!isChunk(item)) continue;
        const facade = item.facadeModuleId?.replaceAll('\\', '/') ?? '';
        const paid = paidChunkNameForModule(facade);
        chunks.push({
          fileName: item.fileName,
          name: paid ?? item.name ?? item.fileName,
          isEntry: item.isEntry === true && !paid,
          imports: item.imports ?? [],
          dynamicImports: item.dynamicImports ?? [],
        });
      }
      const plan = planPaidBundle(chunks);
      const cssImporters = new Map<string, string[]>();
      for (const item of files) {
        if (!isChunk(item)) continue;
        for (const file of item.viteMetadata?.importedCss ?? []) {
          const list = cssImporters.get(file) ?? [];
          list.push(item.fileName);
          cssImporters.set(file, list);
        }
      }
      for (const [file, importers] of cssImporters) addPaidStylesheet(plan, file, importers);

      const oldToNew = new Map<string, string>();
      for (const item of files) oldToNew.set(item.fileName, item.fileName);
      for (const [from, to] of plan.moves) oldToNew.set(from, to);

      for (const item of files) {
        const nextName = oldToNew.get(item.fileName) ?? item.fileName;
        if (isChunk(item)) {
          item.code = rewriteRelativeUrls(item.code, item.fileName, nextName, oldToNew);
        } else if (typeof item.source === 'string') {
          item.source = rewriteRelativeUrls(item.source, item.fileName, nextName, oldToNew);
        }
      }

      const filesForChunk: Record<PaidChunkId, string[]> = {
        'pro-console': plan.filesForChunk['pro-console'],
        'media-console': plan.filesForChunk['media-console'],
        'lesson-cloud': plan.filesForChunk['lesson-cloud'],
        'coach-unlimited': plan.filesForChunk['coach-unlimited'],
      };
      for (const id of PAID_CHUNK_IDS) {
        if (!filesForChunk[id]) filesForChunk[id] = [];
      }
      const embedded = JSON.stringify(JSON.stringify(filesForChunk));
      let stamped = false;
      for (const item of files) {
        if (!isChunk(item) || !item.code.includes(PAID_MANIFEST_PLACEHOLDER)) continue;
        item.code = item.code.replaceAll(`"${PAID_MANIFEST_PLACEHOLDER}"`, embedded);
        item.code = item.code.replaceAll(`'${PAID_MANIFEST_PLACEHOLDER}'`, embedded);
        stamped = true;
      }
      if (command === 'build' && !stamped) {
        this.error('Paid chunk manifest placeholder was not emitted.');
      }

      for (const [oldName, nextName] of plan.moves) {
        const item = bundle[oldName] as BundleFile | undefined;
        if (!item || oldName === nextName) continue;
        if (bundle[nextName]) this.error(`Paid chunk path collision at ${nextName}`);
        item.fileName = nextName;
        delete bundle[oldName];
        bundle[nextName] = item as (typeof bundle)[string];
      }

      this.emitFile({
        type: 'asset',
        fileName: 'paid/manifest.json',
        source: JSON.stringify({ files: plan.manifestFiles }),
      });
    },
  };
}
