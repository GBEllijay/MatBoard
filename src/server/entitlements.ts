import { API_PRODUCT_ID, API_PRODUCT_PRO } from './routes.ts';

export type WhiteEntitlement = {
  email: string;
  sessionId: string;
  product: typeof API_PRODUCT_ID;
  amountTotal: number | null;
  currency: string | null;
  createdAt: string;
};

/** Advantage Pro subscription. `active` is entitled; `inactive` is canceled or unpaid. */
export type ProEntitlementStatus = 'active' | 'inactive';

export type ProEntitlement = {
  email: string;
  sessionId: string;
  subscriptionId: string;
  product: typeof API_PRODUCT_PRO;
  status: ProEntitlementStatus;
  amountTotal: number | null;
  currency: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EntitlementIndex = {
  sessions: Record<string, WhiteEntitlement>;
  emails: Record<string, string>;
  proSessions: Record<string, ProEntitlement>;
  proEmails: Record<string, string>;
  proSubscriptions: Record<string, string>;
};

export type EntitlementStore = {
  save(record: WhiteEntitlement): Promise<WhiteEntitlement>;
  findByEmail(email: string): Promise<WhiteEntitlement | null>;
  findBySessionId(sessionId: string): Promise<WhiteEntitlement | null>;
  savePro(record: ProEntitlement): Promise<ProEntitlement>;
  findProByEmail(email: string): Promise<ProEntitlement | null>;
  findProBySessionId(sessionId: string): Promise<ProEntitlement | null>;
  findProBySubscriptionId(subscriptionId: string): Promise<ProEntitlement | null>;
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
  return { sessions: {}, emails: {}, proSessions: {}, proEmails: {}, proSubscriptions: {} };
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

function isProSessionId(sessionId: string): boolean {
  return sessionId.startsWith('cs_') || sessionId.startsWith('sub_');
}

export function parseProEntitlement(raw: unknown): ProEntitlement | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.product !== API_PRODUCT_PRO) return null;
  if (typeof row.sessionId !== 'string' || !isProSessionId(row.sessionId)) return null;
  if (typeof row.subscriptionId !== 'string' || !row.subscriptionId.startsWith('sub_')) return null;
  if (row.status !== 'active' && row.status !== 'inactive') return null;
  if (typeof row.email !== 'string') return null;
  if (typeof row.createdAt !== 'string' || !row.createdAt) return null;
  if (typeof row.updatedAt !== 'string' || !row.updatedAt) return null;
  const amountTotal = typeof row.amountTotal === 'number' ? row.amountTotal : null;
  const currency = typeof row.currency === 'string' ? row.currency : null;
  return {
    email: normalizeEmail(row.email),
    sessionId: row.sessionId,
    subscriptionId: row.subscriptionId,
    product: API_PRODUCT_PRO,
    status: row.status,
    amountTotal,
    currency,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function parseEntitlementIndex(raw: string): EntitlementIndex {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object') return emptyEntitlementIndex();
  const body = parsed as {
    sessions?: unknown;
    emails?: unknown;
    proSessions?: unknown;
    proEmails?: unknown;
  };
  const sessions: Record<string, WhiteEntitlement> = {};
  const emails: Record<string, string> = {};
  const proSessions: Record<string, ProEntitlement> = {};
  const proEmails: Record<string, string> = {};
  const proSubscriptions: Record<string, string> = {};
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
  if (body.proSessions && typeof body.proSessions === 'object') {
    for (const value of Object.values(body.proSessions)) {
      const record = parseProEntitlement(value);
      if (!record) continue;
      proSessions[record.sessionId] = record;
      proSubscriptions[record.subscriptionId] = record.sessionId;
    }
  }
  if (body.proEmails && typeof body.proEmails === 'object') {
    for (const [email, sessionId] of Object.entries(body.proEmails)) {
      if (typeof sessionId === 'string' && proSessions[sessionId]) proEmails[normalizeEmail(email)] = sessionId;
    }
  }
  return { sessions, emails, proSessions, proEmails, proSubscriptions };
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

/**
 * Insert or update a Pro subscription. The same Stripe subscription is one record.
 * A later Checkout session id replaces a placeholder `sub_` id for that subscription.
 */
export function applyProEntitlement(index: EntitlementIndex, record: ProEntitlement): ProEntitlement {
  const stored = parseProEntitlement(record);
  if (!stored) throw new Error('Pro entitlement record is not valid.');
  const previousId = index.proSubscriptions[stored.subscriptionId];
  const previous = (previousId ? index.proSessions[previousId] : undefined) ?? index.proSessions[stored.sessionId];
  const sessionId = stored.sessionId.startsWith('cs_')
    ? stored.sessionId
    : previous?.sessionId.startsWith('cs_')
      ? previous.sessionId
      : stored.sessionId;
  const merged: ProEntitlement = {
    email: stored.email || previous?.email || '',
    sessionId,
    subscriptionId: stored.subscriptionId,
    product: API_PRODUCT_PRO,
    status: stored.status,
    amountTotal: stored.amountTotal ?? previous?.amountTotal ?? null,
    currency: stored.currency || previous?.currency || null,
    createdAt: previous?.createdAt ?? stored.createdAt,
    updatedAt: stored.updatedAt,
  };
  if (previous && previous.sessionId !== merged.sessionId) delete index.proSessions[previous.sessionId];
  index.proSessions[merged.sessionId] = merged;
  index.proSubscriptions[merged.subscriptionId] = merged.sessionId;
  if (merged.email) {
    const currentId = index.proEmails[merged.email];
    const current = currentId ? index.proSessions[currentId] : undefined;
    if (!current || current.updatedAt <= merged.updatedAt) index.proEmails[merged.email] = merged.sessionId;
  }
  return merged;
}

export function proEntitlementByEmail(index: EntitlementIndex, email: string): ProEntitlement | null {
  const sessionId = index.proEmails[normalizeEmail(email)];
  if (!sessionId) return null;
  return index.proSessions[sessionId] ?? null;
}

export function proEntitlementBySession(index: EntitlementIndex, sessionId: string): ProEntitlement | null {
  return index.proSessions[sessionId] ?? null;
}

export function proEntitlementBySubscription(index: EntitlementIndex, subscriptionId: string): ProEntitlement | null {
  const sessionId = index.proSubscriptions[subscriptionId];
  if (!sessionId) return null;
  return index.proSessions[sessionId] ?? null;
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
    async savePro(record) {
      return applyProEntitlement(index, record);
    },
    async findProByEmail(email) {
      return proEntitlementByEmail(index, email);
    },
    async findProBySessionId(sessionId) {
      return proEntitlementBySession(index, sessionId);
    },
    async findProBySubscriptionId(subscriptionId) {
      return proEntitlementBySubscription(index, subscriptionId);
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
    async savePro(record) {
      const index = await read();
      const stored = applyProEntitlement(index, record);
      await kv.put(INDEX_KEY, JSON.stringify(index));
      return stored;
    },
    async findProByEmail(email) {
      return proEntitlementByEmail(await read(), email);
    },
    async findProBySessionId(sessionId) {
      return proEntitlementBySession(await read(), sessionId);
    },
    async findProBySubscriptionId(subscriptionId) {
      return proEntitlementBySubscription(await read(), subscriptionId);
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

export function proEntitlementStatus(record: ProEntitlement | null): {
  entitled: boolean;
  product?: typeof API_PRODUCT_PRO;
  email?: string;
  sessionId?: string;
  subscriptionId?: string;
  createdAt?: string;
} {
  if (!record) return { entitled: false };
  return {
    entitled: record.status === 'active',
    product: record.product,
    email: record.email,
    sessionId: record.sessionId,
    subscriptionId: record.subscriptionId,
    createdAt: record.createdAt,
  };
}
