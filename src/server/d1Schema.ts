import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '../../migrations');

/** Checked-in phase 2 migration. Later files are separate and are not edited into this one. */
export function entitlementMigrationSql(): string {
  return readFileSync(join(migrationsDir, '0001_entitlements.sql'), 'utf8');
}

/** Every migration, in filename order. Local dev and unit tests apply this. */
export function entitlementSchemaSql(): string {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(join(migrationsDir, name), 'utf8'))
    .join('\n');
}
