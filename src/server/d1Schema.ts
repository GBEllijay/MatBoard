import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Checked-in migration. Tests compare this read with the SQL the adapter applies. */
export function entitlementMigrationSql(): string {
  return readFileSync(join(here, '../../migrations/0001_entitlements.sql'), 'utf8');
}
