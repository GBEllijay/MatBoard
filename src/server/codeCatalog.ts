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
  if (!isKind(row.kind)) return null;
  if (typeof row.hash !== 'string' || !/^[0-9a-f]{64}$/.test(row.hash)) return null;
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim().slice(0, 80) : row.kind;
  const grants = Array.isArray(row.grants)
    ? row.grants.filter((door): door is GrantDoor => typeof door === 'string' && (DOORS as readonly string[]).includes(door))
    : grantsForKind(row.kind);
  const kind = row.kind;
  const free = kind === 'free-white';
  return {
    id,
    hash: row.hash,
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

export function parseCodeCatalog(raw: string | undefined | null): CodeRecord[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseCodeRecord).filter((row): row is CodeRecord => row !== null);
  } catch {
    return [];
  }
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
    const record = parseCodeRecord(JSON.parse(raw) as unknown);
    if (record) fromKv.push(record);
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
