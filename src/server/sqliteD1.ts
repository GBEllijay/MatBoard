import { DatabaseSync } from 'node:sqlite';
import { entitlementSchemaSql } from './d1Schema.ts';
import type { D1Database, D1Prepared } from './d1.ts';

/**
 * D1-shaped wrapper around Node's SQLite for `npm run dev` and unit tests.
 * Cloudflare Pages uses the ENTITLEMENTS_DB binding instead.
 */
export function sqliteD1(path = ':memory:'): D1Database {
  const db = new DatabaseSync(path);
  db.exec(entitlementSchemaSql());
  return {
    prepare(sql: string): D1Prepared {
      const statement = db.prepare(sql);
      let bound: (string | number | bigint | null)[] = [];
      const prepared: D1Prepared = {
        bind(...values: unknown[]) {
          bound = values.map((value) => {
            if (value === undefined || value === null) return null;
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return value;
            return String(value);
          });
          return prepared;
        },
        async run() {
          const info = statement.run(...bound);
          return { meta: { changes: Number(info.changes ?? 0) } };
        },
        async all<T>() {
          return { results: statement.all(...bound) as T[] };
        },
        async first<T>() {
          const row = statement.get(...bound);
          return (row as T | undefined) ?? null;
        },
      };
      return prepared;
    },
    async exec(sql: string) {
      db.exec(sql);
    },
  };
}
