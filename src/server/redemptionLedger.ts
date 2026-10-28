/**
 * Per-code counters. A Durable Object serializes them when CODE_REDEMPTIONS
 * is bound. Without it, KV uses one key per counter. Two requests at the same
 * moment can both read the old count and both write, so a cap can be exceeded
 * by the number of overlapping requests. That race is per code, not one shared
 * purchase blob. See docs/paywall-phase-plan.md.
 */

export type ReserveInput = {
  codeId: string;
  totalCap: number | null;
  dailyCap: number | null;
  perEmail: number | null;
  perIpPerDay: number | null;
  emailHash: string | null;
  ipHash: string;
  day: string;
};

export type ReserveResult = { ok: true } | { ok: false; reason: 'total' | 'daily' | 'email' | 'ip' };

export type RedemptionLedger = {
  reserve(input: ReserveInput): Promise<ReserveResult>;
};

type CounterFile = Record<string, number>;

export class MemoryRedemptionLedger implements RedemptionLedger {
  private chain: Promise<void> = Promise.resolve();
  private counts: CounterFile = {};

  constructor(initial?: CounterFile) {
    if (initial) this.counts = { ...initial };
  }

  snapshot(): CounterFile {
    return { ...this.counts };
  }

  reserve(input: ReserveInput): Promise<ReserveResult> {
    const run = this.chain.then(() => this.reserveNow(input));
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private reserveNow(input: ReserveInput): ReserveResult {
    const totalKey = `total:${input.codeId}`;
    const dayKey = `day:${input.codeId}:${input.day}`;
    const emailKey = input.emailHash ? `email:${input.codeId}:${input.emailHash}` : '';
    const ipKey = `ip:${input.codeId}:${input.ipHash}:${input.day}`;
    const total = this.counts[totalKey] ?? 0;
    const day = this.counts[dayKey] ?? 0;
    const email = emailKey ? (this.counts[emailKey] ?? 0) : 0;
    const ip = this.counts[ipKey] ?? 0;
    if (input.totalCap !== null && total >= input.totalCap) return { ok: false, reason: 'total' };
    if (input.dailyCap !== null && day >= input.dailyCap) return { ok: false, reason: 'daily' };
    if (input.perEmail !== null && input.emailHash && email >= input.perEmail) return { ok: false, reason: 'email' };
    if (input.perIpPerDay !== null && ip >= input.perIpPerDay) return { ok: false, reason: 'ip' };
    this.counts[totalKey] = total + 1;
    this.counts[dayKey] = day + 1;
    if (emailKey) this.counts[emailKey] = email + 1;
    this.counts[ipKey] = ip + 1;
    return { ok: true };
  }
}

type KvCounter = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<unknown>;
};

/**
 * One KV key per counter. Not atomic across isolates: overlapping redemptions
 * of the same code can overshoot a cap by the overlap count.
 */
export function kvRedemptionLedger(kv: KvCounter): RedemptionLedger {
  return {
    async reserve(input) {
      const totalKey = `cap:${input.codeId}:total`;
      const dayKey = `cap:${input.codeId}:day:${input.day}`;
      const emailKey = input.emailHash ? `cap:${input.codeId}:email:${input.emailHash}` : '';
      const ipKey = `cap:${input.codeId}:ip:${input.ipHash}:${input.day}`;
      const [totalRaw, dayRaw, emailRaw, ipRaw] = await Promise.all([
        kv.get(totalKey),
        kv.get(dayKey),
        emailKey ? kv.get(emailKey) : Promise.resolve(null),
        kv.get(ipKey),
      ]);
      const total = Number(totalRaw ?? 0);
      const day = Number(dayRaw ?? 0);
      const email = Number(emailRaw ?? 0);
      const ip = Number(ipRaw ?? 0);
      if (input.totalCap !== null && total >= input.totalCap) return { ok: false, reason: 'total' };
      if (input.dailyCap !== null && day >= input.dailyCap) return { ok: false, reason: 'daily' };
      if (input.perEmail !== null && input.emailHash && email >= input.perEmail) return { ok: false, reason: 'email' };
      if (input.perIpPerDay !== null && ip >= input.perIpPerDay) return { ok: false, reason: 'ip' };
      await Promise.all([
        kv.put(totalKey, String(total + 1)),
        kv.put(dayKey, String(day + 1)),
        emailKey ? kv.put(emailKey, String(email + 1)) : Promise.resolve(),
        kv.put(ipKey, String(ip + 1)),
      ]);
      return { ok: true };
    },
  };
}

export type DoNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: RequestInfo, init?: RequestInit): Promise<Response> };
};

/** One Durable Object holds every counter and applies them one at a time. */
export function durableRedemptionLedger(namespace: DoNamespace): RedemptionLedger {
  const stub = namespace.get(namespace.idFromName('code-redemptions'));
  return {
    async reserve(input) {
      const response = await stub.fetch('https://redemptions.internal/reserve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = (await response.json()) as ReserveResult;
      if (body && body.ok === false && (body.reason === 'total' || body.reason === 'daily' || body.reason === 'email' || body.reason === 'ip')) {
        return body;
      }
      if (body && body.ok === true) return { ok: true };
      return { ok: false, reason: 'total' };
    },
  };
}
