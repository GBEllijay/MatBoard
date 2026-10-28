/** Subset of Cloudflare D1 used by the entitlement store. */

export type D1RunResult = { meta: { changes: number } };

export type D1Prepared = {
  bind(...values: unknown[]): D1Prepared;
  run(): Promise<D1RunResult>;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
};

export type D1Database = {
  prepare(sql: string): D1Prepared;
  exec(sql: string): Promise<unknown>;
};
