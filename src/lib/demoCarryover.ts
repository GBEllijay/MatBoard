/**
 * Demo work staged on this phone until a real purchase can use it.
 * The query string from checkout does not unlock anything. Adoption runs only
 * when the caller passes doors a confirmed grant already opened.
 * The example technique cloud is not a demo store and is never read here.
 */

import type { Door } from './entitlementToken.ts';
import { impliedDoors } from './tierImplications.ts';

export const DEMO_CARRY_KEY = 'matboard.demoCarryover.v1';
export const DEMO_CARRY_APPLIED_KEY = 'matboard.demoCarryover.applied.v1';
export const DEMO_CARRY_MAX_CHARS = 350_000;

const PRODUCT_DOOR: Record<string, Door> = {
  'advantage-white': 'white',
  'advantage-student': 'student',
  'advantage-media': 'media',
  'advantage-coach': 'coach',
  'advantage-pro': 'pro',
};

const UNSAFE = /advantage\.entitlement|licenseToken|inviteToken|sk_live|BEGIN PRIVATE/i;

export type StagedDemo = {
  version: 1;
  source: 'student-demo';
  door: 'student';
  savedAt: number;
  fingerprint: string;
  text: string;
};

export type CarryAction = 'adopted' | 'unchanged' | 'waiting' | 'needs-choice' | 'kept-real' | 'none';

export type CarryResult = {
  action: CarryAction;
  message: string;
  /** True only when the real student file should be replaced with the staged text. */
  writeText: string | null;
};

type Store = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

export function doorsForProduct(product: string): Door[] {
  const door = PRODUCT_DOOR[product];
  return door ? impliedDoors([door]) : [];
}

export function demoFingerprint(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `d${(hash >>> 0).toString(16)}`;
}

export function demoTextUnsafe(text: string): boolean {
  return UNSAFE.test(text);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function readStagedDemo(storage: Pick<Store, 'getItem'>): StagedDemo | null {
  const raw = storage.getItem(DEMO_CARRY_KEY);
  if (!raw) return null;
  try {
    const row = asRecord(JSON.parse(raw));
    if (!row || row.version !== 1 || row.source !== 'student-demo' || row.door !== 'student') return null;
    if (typeof row.text !== 'string' || typeof row.fingerprint !== 'string' || typeof row.savedAt !== 'number') return null;
    if (demoTextUnsafe(row.text) || row.text.length > DEMO_CARRY_MAX_CHARS) return null;
    if (row.fingerprint !== demoFingerprint(row.text)) return null;
    return { version: 1, source: 'student-demo', door: 'student', savedAt: row.savedAt, fingerprint: row.fingerprint, text: row.text };
  } catch {
    return null;
  }
}

/** Remember user-entered student demo text. The sample seed and stress-test demos are not staged. */
export function stageStudentDemoFile(storage: Store, text: string, seed: string, now = Date.now()): 'staged' | 'skipped' | 'too-large' | 'unsafe' {
  if (!text.trim() || text === seed) return 'skipped';
  if (demoTextUnsafe(text)) return 'unsafe';
  if (text.length > DEMO_CARRY_MAX_CHARS) return 'too-large';
  const staged: StagedDemo = {
    version: 1,
    source: 'student-demo',
    door: 'student',
    savedAt: now,
    fingerprint: demoFingerprint(text),
    text,
  };
  storage.setItem(DEMO_CARRY_KEY, JSON.stringify(staged));
  return 'staged';
}

function realIsEmpty(text: string | null): boolean {
  if (!text || !text.trim()) return true;
  try {
    const row = asRecord(JSON.parse(text));
    if (!row) return false;
    const profile = asRecord(row.profile);
    const name = typeof profile?.displayName === 'string' ? profile.displayName.trim() : '';
    const journal = Array.isArray(row.journal) ? row.journal : [];
    const working = asRecord(row.working);
    const nodes = working && Array.isArray(working.nodes) ? working.nodes : [];
    return !name && journal.length === 0 && nodes.length === 0;
  } catch {
    return false;
  }
}

function waitingMessage(open: ReadonlySet<string>): string {
  if (open.has('white') && !open.has('student')) {
    return 'This purchase opens Advantage White. The Student Edition demo is still saved on this phone and was not opened, because White does not include Student Edition.';
  }
  return 'This purchase does not include Student Edition. The demo is still saved on this phone and was not copied into a locked edition.';
}

/**
 * Decide what to do with staged student demo work.
 * Does not write storage and does not set an unlock flag. The caller writes `writeText` only when present.
 */
export function planDemoCarryover(
  storage: Pick<Store, 'getItem'>,
  grants: readonly string[],
  realText: string | null,
  choice: 'keep-real' | 'use-demo' = 'keep-real',
): CarryResult {
  const staged = readStagedDemo(storage);
  if (!staged) return { action: 'none', message: '', writeText: null };
  const open = new Set(impliedDoors(grants));
  if (!open.has('student')) {
    return { action: 'waiting', message: waitingMessage(open), writeText: null };
  }
  const realFingerprint = realText ? demoFingerprint(realText) : '';
  if (realFingerprint && realFingerprint === staged.fingerprint) {
    return { action: 'unchanged', message: 'The demo work is already in Student Edition.', writeText: null };
  }
  const applied = storage.getItem(DEMO_CARRY_APPLIED_KEY);
  if (applied === staged.fingerprint && realFingerprint === staged.fingerprint) {
    return { action: 'unchanged', message: 'The demo work is already in Student Edition.', writeText: null };
  }
  if (!realIsEmpty(realText)) {
    if (choice === 'use-demo') {
      return {
        action: 'adopted',
        message: 'The demo copy replaced the Student Edition file on this phone because that choice was explicit.',
        writeText: staged.text,
      };
    }
    return {
      action: 'needs-choice',
      message: 'Student Edition already has a file on this phone. The demo copy was kept and was not copied over.',
      writeText: null,
    };
  }
  const included =
    open.has('pro') || open.has('coach')
      ? 'This edition includes Student Edition. The demo work was saved into Student Edition.'
      : open.has('media')
        ? 'Media Edition includes Student Edition. The demo work was saved into Student Edition.'
        : 'The demo work was saved into Student Edition.';
  return { action: 'adopted', message: included, writeText: staged.text };
}

/** Apply a plan. A waiting or conflicting result leaves the staged copy in place. */
export function settleDemoCarryover(storage: Store, grants: readonly string[], choice: 'keep-real' | 'use-demo' = 'keep-real'): CarryResult {
  const realText = storage.getItem('matboard.studentEdition.v1');
  const plan = planDemoCarryover(storage, grants, realText, choice);
  if (plan.writeText) {
    storage.setItem('matboard.studentEdition.v1', plan.writeText);
    const staged = readStagedDemo(storage);
    if (staged) storage.setItem(DEMO_CARRY_APPLIED_KEY, staged.fingerprint);
    storage.removeItem?.(DEMO_CARRY_KEY);
  } else if (plan.action === 'unchanged') {
    storage.removeItem?.(DEMO_CARRY_KEY);
  }
  return plan;
}

export function demoCarryActive(storage: Pick<Store, 'getItem'>): boolean {
  return readStagedDemo(storage) !== null;
}
