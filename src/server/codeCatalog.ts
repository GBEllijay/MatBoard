import { timingSafeEqual } from './codeCrypto.ts';
import {
  FREE_WHITE_DAILY_CAP,
  FREE_WHITE_GRANT_DAYS,
  FREE_WHITE_PER_EMAIL,
  FREE_WHITE_PER_IP_PER_DAY,
  FREE_WHITE_TOTAL_CAP,
} from './paywallDecisions.ts';

export const CODE_KINDS = ['owner', 'alpha-coach', 'alpha-pro', 'alpha-student', 'free-white'] as const;

export type CodeKind = (typeof CODE_KINDS)[number];

export type GrantDoor = 'white' | 'student' | 'coach' | 'pro' | 'seat';

export type CodeRecord = {
  id: string;
  hash: string;
  kind: CodeKind;
  grants: GrantDoor[];
  maxUses: number | null;
  dailyCap: number | null;
  perEmail: number | null;
  perIpPerDay: number | null;
  /** Campaign end. After this, the code fails like an unknown code. */
  expiresAt: string | null;
  /** How long a successful redemption lasts. Null means this browser keeps the flag. */
  grantDays: number | null;
  retired: boolean;
};

const DOORS: readonly GrantDoor[] = ['white', 'student', 'coach', 'pro', 'seat'];

/** Pro opens Student Edition on the client and does not open White. */
const DEFAULT_GRANTS: Record<CodeKind, GrantDoor[]> = {
  owner: ['white', 'student', 'coach', 'pro'],
  'alpha-coach': ['coach'],
  'alpha-pro': ['pro', 'student'],
  'alpha-student': ['student'],
  'free-white': ['white'],
};

export function grantsForKind(kind: CodeKind): GrantDoor[] {
  return [...DEFAULT_GRANTS[kind]];
}

function isKind(value: unknown): value is CodeKind {
  return typeof value === 'string' && (CODE_KINDS as readonly string[]).includes(value);
}

function optionalCount(value: unknown, fallback: number | null): number | null {
  if (value === undefined || value === '') return fallback;
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}

export function parseCodeRecord(raw: unknown): CodeRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const kind = typeof row.kind === 'string' ? row.kind.trim().toLowerCase() : row.kind;
  if (!isKind(kind)) return null;
  const hash = typeof row.hash === 'string' ? row.hash.trim().toLowerCase() : '';
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim().slice(0, 80) : kind;
  const grants = Array.isArray(row.grants)
    ? row.grants.filter((door): door is GrantDoor => typeof door === 'string' && (DOORS as readonly string[]).includes(door))
    : grantsForKind(kind);
  const free = kind === 'free-white';
  return {
    id,
    hash,
    kind,
    grants: grants.length ? grants : grantsForKind(kind),
    maxUses: optionalCount(row.maxUses, free ? FREE_WHITE_TOTAL_CAP : null),
    dailyCap: optionalCount(row.dailyCap, free ? FREE_WHITE_DAILY_CAP : null),
    perEmail: optionalCount(row.perEmail, free ? FREE_WHITE_PER_EMAIL : null),
    perIpPerDay: optionalCount(row.perIpPerDay, free ? FREE_WHITE_PER_IP_PER_DAY : null),
    expiresAt: typeof row.expiresAt === 'string' && row.expiresAt ? row.expiresAt : null,
    grantDays: optionalCount(row.grantDays, free ? FREE_WHITE_GRANT_DAYS : null),
    retired: row.retired === true,
  };
}

export type CatalogParse = {
  records: CodeRecord[];
  /** Rows that looked like records but had a bad kind or hash. */
  rejected: number;
  /** Rejected rows by reason. */
  badKind: number;
  badHash: number;
  /** False when the value was set but nothing in it could be read. */
  readable: boolean;
  /** Rows whose hash was already in the catalog. Only one of them is kept. */
  duplicates?: number;
};

function rejectReason(raw: unknown): 'kind' | 'hash' {
  if (!raw || typeof raw !== 'object') return 'hash';
  const row = raw as Record<string, unknown>;
  const kind = typeof row.kind === 'string' ? row.kind.trim().toLowerCase() : row.kind;
  return isKind(kind) ? 'hash' : 'kind';
}

const QUOTE_PAIRS: [string, string][] = [
  ["'", "'"],
  ['"', '"'],
  ['`', '`'],
  ['\u2018', '\u2019'],
];

/** Strip what a dashboard paste tends to add around the JSON: BOM, a NAME= prefix, outer quotes. */
function cleanPaste(raw: string): string {
  // Notes apps and word processors turn " into curly quotes. Records are plain ASCII, so put them back.
  let text = raw.replace(/^\uFEFF/, '').replace(/[\u201c\u201d]/g, '"').trim();
  text = text.replace(/^CODE_CATALOG\s*=\s*/, '').trim();
  for (let pass = 0; pass < 2; pass += 1) {
    const pair = QUOTE_PAIRS.find(([open, close]) => text.length >= 2 && text.startsWith(open) && text.endsWith(close));
    if (!pair) break;
    const inner = text.slice(1, -1).trim();
    // A JSON string literal such as "[{\"id\":...}]" is decoded below, not stripped here.
    if (pair[0] === '"' && inner.includes('\\"')) break;
    text = inner;
  }
  return text;
}

/** Every top-level {...} in the text, so one-per-line, comma-separated, or labelled pastes still read. */
function objectChunks(text: string): string[] {
  const chunks: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = depth > 0;
    else if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        chunks.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return chunks;
}

function rowsFrom(value: unknown, depth = 0): unknown[] | null {
  if (depth > 2) return null;
  if (typeof value === 'string') {
    try {
      return rowsFrom(JSON.parse(cleanPaste(value)) as unknown, depth + 1);
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if ('hash' in row || 'kind' in row) return [row];
  for (const key of ['codes', 'records', 'catalog']) {
    if (Array.isArray(row[key])) return row[key] as unknown[];
  }
  // { "<id>": { hash, kind }, ... }
  const entries = Object.entries(row).filter(([, item]) => item && typeof item === 'object' && !Array.isArray(item));
  if (!entries.length) return null;
  return entries.map(([id, item]) => ({ id, ...(item as Record<string, unknown>) }));
}

/**
 * Read CODE_CATALOG. The documented shape is a JSON array of records, but the generator prints one
 * record at a time, so a single object, several objects (one per line or comma-separated), an object
 * holding a "codes" array, and a value wrapped in quotes all read the same way.
 */
export function parseCodeCatalogDetailed(raw: string | undefined | null): CatalogParse {
  if (!raw || !raw.trim()) return { records: [], rejected: 0, badKind: 0, badHash: 0, readable: true };
  const text = cleanPaste(raw);
  let rows: unknown[] | null = null;
  try {
    rows = rowsFrom(JSON.parse(text) as unknown);
  } catch {
    rows = null;
  }
  if (!rows) {
    const parsed: unknown[] = [];
    for (const chunk of objectChunks(text)) {
      try {
        parsed.push(JSON.parse(chunk) as unknown);
      } catch {
        parsed.push(null);
      }
    }
    rows = parsed.length ? parsed : null;
  }
  if (!rows) return { records: [], rejected: 0, badKind: 0, badHash: 0, readable: false };
  const byHash = new Map<string, CodeRecord>();
  let badKind = 0;
  let badHash = 0;
  let duplicates = 0;
  for (const row of rows) {
    const record = parseCodeRecord(row);
    if (record && byHash.has(record.hash)) duplicates += 1;
    if (record) byHash.set(record.hash, record);
    else if (rejectReason(row) === 'kind') badKind += 1;
    else badHash += 1;
  }
  return { records: [...byHash.values()], rejected: badKind + badHash, badKind, badHash, readable: true, duplicates };
}

export function parseCodeCatalog(raw: string | undefined | null): CodeRecord[] {
  return parseCodeCatalogDetailed(raw).records;
}

const PLAIN_CODE = /\b[A-HJ-NP-Z2-9]{4}(?:[-\s][A-HJ-NP-Z2-9]{4}){3,}\b/i;

export type CatalogStatus = {
  catalogSet: boolean;
  catalogLoaded: boolean;
  entries: number;
  rejected: number;
  /**
   * Loaded records by kind, so the owner can see an owner, alpha, or free White row is really there.
   * Counts only. Never a hash, id, or code.
   */
  kinds: Record<CodeKind, number>;
  /** Pasted rows that repeat a hash already in the catalog. */
  duplicates: number;
  /** One plain-language reason when nothing loaded, otherwise null. Never echoes the value. */
  problem: null | 'not-json' | 'looks-like-a-plain-code' | 'hash-without-record' | 'bad-kind' | 'bad-hash';
};

/** Safe to show anyone: counts and a reason word only, never a hash, id, or code. */
export function codeCatalogStatus(raw: string | undefined | null): CatalogStatus {
  const catalogSet = Boolean(raw && raw.trim());
  const parsed = parseCodeCatalogDetailed(raw);
  let problem: CatalogStatus['problem'] = null;
  if (catalogSet && parsed.records.length === 0) {
    const text = raw as string;
    if (!parsed.readable && /[0-9a-f]{64}/i.test(text)) problem = 'hash-without-record';
    else if (!parsed.readable && PLAIN_CODE.test(text)) problem = 'looks-like-a-plain-code';
    else if (!parsed.readable) problem = 'not-json';
    else if (parsed.badKind) problem = 'bad-kind';
    else if (parsed.badHash) problem = 'bad-hash';
  }
  const kinds = Object.fromEntries(CODE_KINDS.map((kind) => [kind, 0])) as Record<CodeKind, number>;
  const now = Date.now();
  for (const record of parsed.records) {
    if (record.retired) continue;
    if (record.expiresAt && Date.parse(record.expiresAt) <= now) continue;
    kinds[record.kind] += 1;
  }
  return {
    catalogSet,
    catalogLoaded: parsed.records.length > 0,
    entries: parsed.records.length,
    rejected: parsed.rejected + (parsed.readable ? 0 : 1),
    kinds,
    duplicates: parsed.duplicates ?? 0,
    problem,
  };
}

export function catalogHasCaps(record: CodeRecord): boolean {
  return record.maxUses !== null || record.dailyCap !== null || record.perEmail !== null || record.perIpPerDay !== null;
}

export type KvListBinding = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<unknown>;
  list?(options: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
};

/** Env catalog plus any per-code KV records. Records are keyed by hash, never one shared blob. */
export async function loadCodeCatalog(catalogJson: string | undefined, kv: KvListBinding | null): Promise<CodeRecord[]> {
  const fromEnv = parseCodeCatalog(catalogJson);
  if (!kv?.list) return fromEnv;
  let listed: { keys: { name: string }[] };
  try {
    listed = await kv.list({ prefix: 'code:' });
  } catch {
    return fromEnv;
  }
  const fromKv: CodeRecord[] = [];
  for (const key of listed.keys) {
    const raw = await kv.get(key.name);
    if (!raw) continue;
    for (const record of parseCodeCatalog(raw)) fromKv.push(record);
  }
  const byHash = new Map<string, CodeRecord>();
  for (const record of fromEnv) byHash.set(record.hash, record);
  for (const record of fromKv) byHash.set(record.hash, record);
  return [...byHash.values()];
}

/** Compare every hash so a match is not revealed by stopping early. */
export function findCode(records: CodeRecord[], codeHash: string): CodeRecord | null {
  let found: CodeRecord | null = null;
  for (const record of records) {
    if (timingSafeEqual(record.hash, codeHash)) found = record;
  }
  return found;
}
