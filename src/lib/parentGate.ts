/**
 * Parent approvals on the student device. One generic gate for every inbound
 * coach packet: rank, competition, belt progress, assessment, coach notes and
 * plans, clips on the coach shelf, the gym logo prompt, and any future kind.
 *
 * Off (the default): nothing changes, packets go where they always went.
 * On: every inbound coach packet waits here until a parent enters the PIN and
 * approves it. Approve hands it on to the normal flow (the student still
 * accepts where acceptance applies). Decline drops it on this phone, and the
 * same packet is not held again. Nothing is deleted from Advantage Cloud.
 *
 * The PIN is kept only as a SHA-256 hash on this phone. Turning the gate off
 * or changing the PIN needs the current PIN.
 */

import { sha256Hex } from './entitlementToken.ts';

export const PARENT_GATE_KEY = 'matboard.studentEdition.parentGate.v1';
export const PARENT_GATE_HELD_MAX = 60;
const DECLINED_MAX = 300;
const PIN_RE = /^\d{4,8}$/;

type Store = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

/** `sync` is a typed coach → student packet. `coach-file` is a coach plan / feedback / shelf file. */
export type HeldRoute = 'sync' | 'coach-file';

export type HeldItem = {
  holdId: string;
  route: HeldRoute;
  kind: string;
  text: string;
  receivedAt: number;
  /** The cloud inbox id, when the packet came from the inbox. */
  updateId?: string;
};

export type ParentGateState = {
  version: 1;
  on: boolean;
  pinHash: string;
  held: HeldItem[];
  declined: string[];
};

export const PARENT_GATE_COPY = {
  held: 'Waiting for a parent to approve.',
  lead: 'A parent approves each coach update before it shows on this phone.',
  pinWrong: 'Parent PIN did not match.',
  pinShape: 'Use a 4 to 8 digit PIN.',
} as const;

function empty(): ParentGateState {
  return { version: 1, on: false, pinHash: '', held: [], declined: [] };
}

export function readParentGate(storage: Pick<Store, 'getItem'>): ParentGateState {
  try {
    const raw = storage.getItem(PARENT_GATE_KEY);
    if (!raw) return empty();
    const row = JSON.parse(raw) as Partial<ParentGateState>;
    if (row.version !== 1) return empty();
    const held = Array.isArray(row.held)
      ? row.held.filter(
          (item): item is HeldItem =>
            Boolean(item) &&
            typeof item.holdId === 'string' &&
            (item.route === 'sync' || item.route === 'coach-file') &&
            typeof item.kind === 'string' &&
            typeof item.text === 'string' &&
            typeof item.receivedAt === 'number',
        )
      : [];
    const pinHash = typeof row.pinHash === 'string' ? row.pinHash : '';
    return {
      version: 1,
      // The gate is only on with a PIN to open it.
      on: row.on === true && Boolean(pinHash),
      pinHash,
      held,
      declined: Array.isArray(row.declined) ? row.declined.filter((id): id is string => typeof id === 'string') : [],
    };
  } catch {
    return empty();
  }
}

function write(storage: Store, state: ParentGateState): void {
  try {
    storage.setItem(PARENT_GATE_KEY, JSON.stringify(state));
  } catch {
    /* storage full: the gate keeps its last saved state */
  }
}

export function parentGateOn(storage: Pick<Store, 'getItem'>): boolean {
  return readParentGate(storage).on;
}

export async function hashGatePin(pin: string): Promise<string> {
  return sha256Hex(`advantage-parent-gate:${pin}`);
}

async function pinMatches(state: ParentGateState, pin: string): Promise<boolean> {
  return Boolean(state.pinHash) && PIN_RE.test(pin) && (await hashGatePin(pin)) === state.pinHash;
}

/** Turn the gate on. A first PIN is set here; once a PIN exists, the current PIN is needed. */
export async function enableParentGate(
  storage: Store,
  pin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const state = readParentGate(storage);
  if (!PIN_RE.test(pin)) return { ok: false, error: PARENT_GATE_COPY.pinShape };
  if (state.pinHash && !(await pinMatches(state, pin))) return { ok: false, error: PARENT_GATE_COPY.pinWrong };
  write(storage, { ...state, on: true, pinHash: state.pinHash || (await hashGatePin(pin)) });
  return { ok: true };
}

/**
 * Turn the gate off with the PIN. Anything still held is released to the
 * normal flow by the caller (returned here), so nothing is lost.
 */
export async function disableParentGate(
  storage: Store,
  pin: string,
): Promise<{ ok: true; released: HeldItem[] } | { ok: false; error: string }> {
  const state = readParentGate(storage);
  if (!state.on) return { ok: true, released: [] };
  if (!(await pinMatches(state, pin))) return { ok: false, error: PARENT_GATE_COPY.pinWrong };
  write(storage, { ...state, on: false, held: [] });
  return { ok: true, released: state.held };
}

/** Stable id for any packet: its updateId or photoId, else a hash of the text. */
export function packetHoldId(text: string): string {
  try {
    const row = JSON.parse(text) as { updateId?: unknown; photoId?: unknown; kind?: unknown };
    if (typeof row.updateId === 'string' && row.updateId) return `u:${row.updateId}`;
    if (typeof row.photoId === 'string' && row.photoId) return `p:${row.photoId}`;
  } catch {
    /* not JSON: hash the text */
  }
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `h:${hash.toString(36)}:${text.length.toString(36)}`;
}

function packetKind(text: string): string {
  try {
    const row = JSON.parse(text) as { kind?: unknown };
    return typeof row.kind === 'string' ? row.kind.slice(0, 60) : 'coach-file';
  } catch {
    return 'coach-file';
  }
}

export type HoldResult = 'held' | 'already-held' | 'declined';

/** The one gate. Callers check `parentGateOn` first; this only holds. */
export function holdForParent(
  storage: Store,
  input: { route: HeldRoute; raw: unknown; now?: number },
): HoldResult {
  const text = typeof input.raw === 'string' ? input.raw : JSON.stringify(input.raw);
  const state = readParentGate(storage);
  const holdId = packetHoldId(text);
  if (state.declined.includes(holdId)) return 'declined';
  if (state.held.some((item) => item.holdId === holdId)) return 'already-held';
  const item: HeldItem = { holdId, route: input.route, kind: packetKind(text), text, receivedAt: input.now ?? Date.now() };
  if (holdId.startsWith('u:')) item.updateId = holdId.slice(2);
  // Oldest drops off the end of the list only when the list is full; it is still in the cloud inbox.
  write(storage, { ...state, held: [item, ...state.held].slice(0, PARENT_GATE_HELD_MAX) });
  return 'held';
}

export function heldForParent(storage: Pick<Store, 'getItem'>): HeldItem[] {
  return readParentGate(storage).held;
}

/** Did a parent already decline this packet on this phone? */
export function parentDeclined(storage: Pick<Store, 'getItem'>, raw: unknown): boolean {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  return readParentGate(storage).declined.includes(packetHoldId(text));
}

/**
 * Parent decides one held packet with the PIN. Approve returns the item so the
 * caller hands it to the normal flow with `parentApproved: true`. Decline
 * drops it and remembers the id so it is not held again.
 */
export async function parentDecide(
  storage: Store,
  holdId: string,
  pin: string,
  decision: 'approve' | 'decline',
): Promise<{ ok: true; item: HeldItem; decision: 'approve' | 'decline' } | { ok: false; error: string }> {
  const state = readParentGate(storage);
  if (!(await pinMatches(state, pin))) return { ok: false, error: PARENT_GATE_COPY.pinWrong };
  const item = state.held.find((row) => row.holdId === holdId);
  if (!item) return { ok: false, error: 'That update is no longer waiting.' };
  const held = state.held.filter((row) => row.holdId !== holdId);
  const declined =
    decision === 'decline' ? [holdId, ...state.declined.filter((id) => id !== holdId)].slice(0, DECLINED_MAX) : state.declined;
  write(storage, { ...state, held, declined });
  return { ok: true, item, decision };
}
