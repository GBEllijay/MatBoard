/**
 * One-time copy of the old KV purchase index into D1 SQL.
 * Hashes emails with CODE_HASH_PEPPER. Prints SQL on stdout. Does not print emails.
 *
 *   CODE_HASH_PEPPER='…' node --experimental-strip-types scripts/migrate-kv-entitlements.ts path/to/index.json > /tmp/migrate.sql
 *   npx wrangler d1 execute advantage-entitlements --remote --file=/tmp/migrate.sql
 *
 * The input file is the JSON value of KV key advantage-white-entitlements.
 * It contains emails. Do not commit that file or the SQL if you edit it.
 * Coach purchases were not in that index. Add those from Stripe by hand if any exist.
 */
import { readFileSync } from 'node:fs';
import { keyedHash, normalizeEmail } from '../src/server/codeCrypto.ts';

const pepper = process.env.CODE_HASH_PEPPER?.trim() ?? '';
const file = process.argv[2];
if (!pepper || !file) {
  console.error('Set CODE_HASH_PEPPER and pass the exported index JSON path.');
  process.exit(1);
}

type Row = { email?: string; sessionId?: string; product?: string; createdAt?: string; subscriptionId?: string; status?: string };

const index = JSON.parse(readFileSync(file, 'utf8')) as {
  sessions?: Record<string, Row>;
  studentSessions?: Record<string, Row>;
  coachSessions?: Record<string, Row>;
  proSessions?: Record<string, Row>;
};

function sql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const lines = ['BEGIN;'];
let count = 0;

async function add(row: Row | undefined, product: string, source: 'stripe_payment' | 'stripe_subscription') {
  if (!row?.sessionId || !row.createdAt) return;
  const licenseId = crypto.randomUUID();
  const grantId = crypto.randomUUID();
  lines.push(`INSERT OR IGNORE INTO licenses (id, created_at) VALUES (${sql(licenseId)}, ${sql(row.createdAt)});`);
  if (row.email) {
    const hash = await keyedHash(normalizeEmail(row.email), pepper, 'email');
    lines.push(
      `INSERT INTO identities (license_id, email_hash, created_at) SELECT ${sql(licenseId)}, ${sql(hash)}, ${sql(row.createdAt)} WHERE NOT EXISTS (SELECT 1 FROM identities WHERE email_hash = ${sql(hash)});`,
    );
  }
  const status = row.status === 'inactive' ? 'inactive' : 'active';
  lines.push(
    `INSERT OR IGNORE INTO grants (id, license_id, product, source, source_ref, status, created_at) VALUES (${sql(grantId)}, ${sql(licenseId)}, ${sql(product)}, ${sql(source)}, ${sql(row.sessionId)}, ${sql(status)}, ${sql(row.createdAt)});`,
  );
  if (row.subscriptionId) {
    lines.push(
      `INSERT OR IGNORE INTO subscriptions (stripe_subscription_id, license_id, status, cancel_at_period_end, last_event_at, last_synced_at) VALUES (${sql(row.subscriptionId)}, ${sql(licenseId)}, ${sql(status)}, 0, ${sql(row.createdAt)}, ${sql(row.createdAt)});`,
    );
  }
  count += 1;
}

for (const row of Object.values(index.sessions ?? {})) await add(row, 'advantage-white', 'stripe_payment');
for (const row of Object.values(index.studentSessions ?? {})) await add(row, 'advantage-student', 'stripe_payment');
for (const row of Object.values(index.coachSessions ?? {})) await add(row, 'advantage-coach', 'stripe_payment');
for (const row of Object.values(index.proSessions ?? {})) await add(row, 'advantage-pro', 'stripe_subscription');
lines.push('COMMIT;');
console.error(`Wrote ${count} grant statements. Emails were hashed and were not printed.`);
console.log(lines.join('\n'));
