import { MemoryRedemptionLedger, type ReserveInput, type ReserveResult } from '../src/server/redemptionLedger.ts';

type DoStorage = {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
};

type DoState = {
  storage: DoStorage;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
};

/**
 * Optional Cloudflare binding CODE_REDEMPTIONS. One object, one counter key
 * per code, applied inside blockConcurrencyWhile so caps do not lose updates.
 * Leave the binding unset to use the KV fallback documented in the phase plan.
 */
export class CodeRedemptionDo {
  private readonly state: DoState;

  constructor(state: DoState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method not allowed.', { status: 405 });
    const input = (await request.json()) as ReserveInput;
    const result = await this.state.blockConcurrencyWhile(async () => {
      const saved = (await this.state.storage.get<Record<string, number>>('counts')) ?? {};
      const ledger = new MemoryRedemptionLedger(saved);
      const reserved = await ledger.reserve(input);
      await this.state.storage.put('counts', ledger.snapshot());
      return reserved;
    });
    return Response.json(result as ReserveResult);
  }
}
