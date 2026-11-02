import type { Door } from './entitlementToken.ts';

/**
 * Advantage White with no tier above it.
 * The ladder is White < Student < Media < Instructor < Pro. A higher door
 * includes White, so this is false for every tier above White.
 *
 * Skin catalogs call this with the same doors `doorOpen` already reports.
 * Draft PR #353 reopens Media, Student, and White when a higher door is open.
 * That higher door makes this false, so the higher-tier skin list stays.
 * This only reads doors. It does not grant or store one.
 */
export function whiteBaseSkinTier(open: Readonly<Record<Door, boolean>>): boolean {
  return open.white && !open.student && !open.media && !open.coach && !open.pro;
}
