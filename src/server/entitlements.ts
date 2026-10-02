import { API_PRODUCT_ID } from './routes.ts';

export type WhiteEntitlement = {
  email: string;
  sessionId: string;
  product: typeof API_PRODUCT_ID;
  amountTotal: number | null;
  currency: string | null;
  createdAt: string;
};

export type EntitlementIndex = {
  sessions: Record<string, WhiteEntitlement>;
  emails: Record<string, string>;
};

export type EntitlementStore = {
  save(record: WhiteEntitlement): Promise<WhiteEntitlement>;
  findByEmail(email: string): Promise<WhiteEntitlement | null>;
  findBySessionId(sessionId: string): Promise<WhiteEntitlement | null>;
};

/** Cloudflare KV binding shape used by Pages Functions. */
export type KvBinding = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<unknown>;
};

const INDEX_KEY = 'advantage-white-entitlements';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emptyEntitlementIndex(): EntitlementIndex {
  return { sessions: {}, emails: {} };
}

export function parseWhiteEntitlement(raw: unknown): WhiteEntitlement | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.product !== API_PRODUCT_ID) return null;
  if (typeof row.sessionId !== 'string' || !row.sessionId) return null;
  if (typeof row.email !== 'string') return null;
  if (typeof row.createdAt !== 'string' || !row.createdAt) return null;
  const amountTotal = typeof row.amountTotal === 'number' ? row.amountTotal : null;
  const currency = typeof row.currency === 'string' ? row.currency : null;
  return {
    email: normalizeEmail(row.email),
    sessionId: row.sessionId,
    product: API_PRODUCT_ID,
    amountTotal,
    currency,
    createdAt: row.createdAt,
  };
}

export function parseEntitlementIndex(raw: string): EntitlementIndex {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object') return emptyEntitlementIndex();
  const body = parsed as { sessions?: unknown; emails?: unknown };
  const sessions: Record<string, WhiteEntitlement> = {};
  const emails: Record<string, string> = {};
  if (body.sessions && typeof body.sessions === 'object') {
    for (const value of Object.values(body.sessions)) {
      const record = parseWhiteEntitlement(value);
      if (record) sessions[record.sessionId] = record;
    }
  }
  if (body.emails && typeof body.emails === 'object') {
    for (const [email, sessionId] of Object.entries(body.emails)) {
      if (typeof sessionId === 'string' && sessions[sessionId]) emails[normalizeEmail(email)] = sessionId;
    }
  }
  return { sessions, emails };
}

/** Insert a purchase. The same Checkout session is stored once. Email points at the latest purchase. */
export function applyEntitlement(index: EntitlementIndex, record: WhiteEntitlement): WhiteEntitlement {
  const existing = index.sessions[record.sessionId];
  if (existing) return existing;
  const stored = parseWhiteEntitlement(record);
  if (!stored) throw new Error('Entitlement record is not valid.');
  index.sessions[stored.sessionId] = stored;
  if (stored.email) {
    const currentId = index.emails[stored.email];
    const current = currentId ? index.sessions[currentId] : undefined;
    if (!current || current.createdAt <= stored.createdAt) index.emails[stored.email] = stored.sessionId;
  }
  return stored;
}

export function entitlementByEmail(index: EntitlementIndex, email: string): WhiteEntitlement | null {
  const sessionId = index.emails[normalizeEmail(email)];
  if (!sessionId) return null;
  return index.sessions[sessionId] ?? null;
}

export function entitlementBySession(index: EntitlementIndex, sessionId: string): WhiteEntitlement | null {
  return index.sessions[sessionId] ?? null;
}

export function memoryEntitlementStore(initial?: EntitlementIndex): EntitlementStore {
  const index = initial ?? emptyEntitlementIndex();
  return {
    async save(record) {
      return applyEntitlement(index, record);
    },
    async findByEmail(email) {
      return entitlementByEmail(index, email);
    },
    async findBySessionId(sessionId) {
      return entitlementBySession(index, sessionId);
    },
  };
}

export function kvEntitlementStore(kv: KvBinding): EntitlementStore {
  const read = async (): Promise<EntitlementIndex> => {
    const raw = await kv.get(INDEX_KEY);
    if (!raw) return emptyEntitlementIndex();
    return parseEntitlementIndex(raw);
  };

  return {
    async save(record) {
      const index = await read();
      const stored = applyEntitlement(index, record);
      await kv.put(INDEX_KEY, JSON.stringify(index));
      return stored;
    },
    async findByEmail(email) {
      return entitlementByEmail(await read(), email);
    },
    async findBySessionId(sessionId) {
      return entitlementBySession(await read(), sessionId);
    },
  };
}

export function entitlementStatus(record: WhiteEntitlement | null): {
  entitled: boolean;
  product?: typeof API_PRODUCT_ID;
  email?: string;
  sessionId?: string;
  createdAt?: string;
} {
  if (!record) return { entitled: false };
  return {
    entitled: true,
    product: record.product,
    email: record.email,
    sessionId: record.sessionId,
    createdAt: record.createdAt,
  };
}
