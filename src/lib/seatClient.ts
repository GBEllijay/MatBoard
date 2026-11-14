import { ENTITLEMENT_TOKEN_KEY, acceptServerToken, entitlementSnapshot, readDeviceId } from './entitlement.ts';
import { ownerPassOutranksSeat } from './ownerPassRank.ts';
import {
  acceptInstructorInvite,
  instructorPreset,
  installAcceptedSeat,
  issueInstructorInvite,
  listInstructorSeats,
  type InstructorPermissions,
  type InstructorPresetId,
  type IssueInviteResult,
} from './instructorSeats.ts';
import { isSignedSeatInvite } from './seatSunset.ts';

function readToken(): string {
  try {
    return localStorage.getItem(ENTITLEMENT_TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * Ask the server for a signed seat. The email is only a label.
 * When the server is unreachable, the caller keeps the local invite during the sunset window.
 */
export async function requestServerSeat(input: {
  email: string;
  presetId: InstructorPresetId | null;
}): Promise<{ invite: string; seatId: string } | { reason: 'cap' | 'owner' | 'closed' | 'offline'; detail?: string }> {
  const token = readToken();
  if (!token) return { reason: 'offline' };
  try {
    const response = await fetch('/api/seats/issue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, email: input.email, preset: input.presetId }),
    });
    const body = (await response.json()) as { ok?: boolean; invite?: string; seatId?: string; reason?: string; error?: string };
    const failure = seatIssueClientFailure(response.status, body);
    if (failure?.reason === 'cap') return { reason: 'cap' };
    if (failure) {
      const sentence = typeof body.error === 'string' ? body.error : '';
      if (response.status === 403 && /only the gym owner/i.test(sentence)) {
        return { reason: 'owner', ...(failure.detail ? { detail: failure.detail } : {}) };
      }
      return failure.detail ? { reason: 'closed', detail: failure.detail } : { reason: 'closed' };
    }
    if (!body.invite || !body.seatId) return { reason: 'closed' };
    return { invite: body.invite, seatId: body.seatId };
  } catch {
    return { reason: 'offline' };
  }
}

/** Map a seat-issue response. Cap stays cap. Any other failure keeps the server sentence. */
export function seatIssueClientFailure(
  status: number,
  body: { error?: unknown; reason?: unknown; ok?: unknown; invite?: unknown; seatId?: unknown },
): { reason: 'cap' } | { reason: 'closed'; detail?: string } | null {
  if (status === 409 || body.reason === 'cap') return { reason: 'cap' };
  if (status >= 200 && status < 300 && body.ok !== false) return null;
  const detail = typeof body.error === 'string' && body.error.trim() ? body.error.trim() : undefined;
  return { reason: 'closed', ...(detail ? { detail } : {}) };
}

export async function issueSeatWithServer(input: {
  email: string;
  permissions?: Partial<InstructorPermissions>;
  presetId?: InstructorPresetId | null;
  origin: string;
}): Promise<IssueInviteResult> {
  const server = await requestServerSeat({ email: input.email, presetId: input.presetId ?? null });
  if ('reason' in server && server.reason === 'cap') return { ok: false, reason: 'cap' };
  if ('reason' in server && server.reason === 'owner') {
    return { ok: false, reason: 'owner', ...(server.detail ? { detail: server.detail } : {}) };
  }
  if ('reason' in server && server.reason === 'closed') {
    return { ok: false, reason: 'unavailable', ...(server.detail ? { detail: server.detail } : {}) };
  }
  return issueInstructorInvite({
    email: input.email,
    permissions: input.permissions,
    presetId: input.presetId,
    origin: input.origin,
    token: 'invite' in server ? server.invite : undefined,
    id: 'seatId' in server ? server.seatId : undefined,
  });
}

/** Register seats already stored on this device. Their invite token stays the seat id. */
export async function syncLegacySeats(): Promise<void> {
  const token = readToken();
  if (!token) return;
  const seats = listInstructorSeats().map((seat) => ({
    id: seat.id,
    inviteToken: seat.inviteToken,
    email: seat.email,
    preset: seat.presetId,
    status: seat.status,
  }));
  if (!seats.length) return;
  try {
    await fetch('/api/seats/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, seats }),
    });
  } catch {
    /* the local seats keep working until sunset */
  }
}

export type SeatAcceptReason = 'expired' | 'revoked' | 'claimed' | 'invalid' | 'offline' | 'unavailable';
export type SeatAcceptResult =
  | { ok: true; seatId: string; email: string; presetId: InstructorPresetId | null; gymName: string }
  | { ok: false; reason: SeatAcceptReason; message: string };

export const SEAT_ACCEPT_OFFLINE =
  "This phone couldn't reach Advantage. Check your connection, then tap Try again.";
export const SEAT_ACCEPT_UNAVAILABLE = "The invite couldn't be checked right now. Wait a minute, then tap Try again.";
export const SEAT_ACCEPT_INVALID = 'This invite is not valid. Ask the owner for a new link.';
export const SEAT_ACCEPT_NOT_SAVED = "The seat was accepted but this phone couldn't save its pass. Tap Try again.";

/** Turn a refused /api/seats/accept answer into a reason and the words to show. Server text wins for 4xx. */
export function seatAcceptFailure(status: number, error?: unknown): { ok: false; reason: SeatAcceptReason; message: string } {
  const text = typeof error === 'string' ? error.trim() : '';
  if (status >= 500 || status === 0) return { ok: false, reason: 'unavailable', message: SEAT_ACCEPT_UNAVAILABLE };
  if (status === 409) return { ok: false, reason: 'claimed', message: text || 'This seat is already open on another device. The owner can reset it.' };
  if (status === 403) return { ok: false, reason: 'revoked', message: text || 'This seat was revoked.' };
  if (/expired/i.test(text)) return { ok: false, reason: 'expired', message: text };
  return { ok: false, reason: 'invalid', message: text || SEAT_ACCEPT_INVALID };
}

function seatPreset(value: unknown): InstructorPresetId | null {
  return value === 'assistant-coach' || value === 'coach' || value === 'program-director' || value === 'instructors' ? value : null;
}

/** Accept an invite link on this phone. Says why when it does not open. */
export async function acceptSignedSeat(invite: string): Promise<SeatAcceptResult> {
  if (!isSignedSeatInvite(invite)) {
    const local = acceptInstructorInvite(invite);
    if (local.ok) {
      const seat = local.seat;
      return { ok: true, seatId: seat.id, email: seat.email, presetId: seat.presetId, gymName: '' };
    }
    if (local.reason === 'revoked') return { ok: false, reason: 'revoked', message: 'This seat was revoked.' };
    return { ok: false, reason: 'invalid', message: SEAT_ACCEPT_INVALID };
  }
  let response: Response;
  try {
    response = await fetch('/api/seats/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ invite, deviceId: readDeviceId() }),
    });
  } catch {
    return { ok: false, reason: 'offline', message: SEAT_ACCEPT_OFFLINE };
  }
  let body: {
    ok?: boolean;
    error?: unknown;
    token?: string;
    seatId?: string;
    email?: string | null;
    preset?: string | null;
    gymName?: unknown;
  } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    return seatAcceptFailure(response.ok ? 500 : response.status);
  }
  if (!response.ok || !body.ok) return seatAcceptFailure(response.ok ? 400 : response.status, body.error);
  if (!body.token || !body.seatId) return seatAcceptFailure(500);
  const preset = seatPreset(body.preset);
  const email = body.email || 'instructor';
  installAcceptedSeat({
    id: body.seatId,
    email,
    presetId: preset,
    inviteToken: invite,
  });
  const ok: SeatAcceptResult = {
    ok: true,
    seatId: body.seatId,
    email,
    presetId: preset,
    gymName: typeof body.gymName === 'string' ? body.gymName.trim() : '',
  };
  // The seat stays signed in locally. It must not replace an owner or alpha-pro pass.
  if (ownerPassOutranksSeat(entitlementSnapshot().claims)) return ok;
  try {
    if (await acceptServerToken(body.token)) return ok;
  } catch {
    /* fall through */
  }
  return { ok: false, reason: 'unavailable', message: SEAT_ACCEPT_NOT_SAVED };
}

const acceptsInFlight = new Map<string, Promise<SeatAcceptResult>>();

/** One accept per invite per page load (the early boot read and the screen share it). */
export function acceptSignedSeatOnce(invite: string): Promise<SeatAcceptResult> {
  const running = acceptsInFlight.get(invite);
  if (running) return running;
  const next = acceptSignedSeat(invite);
  acceptsInFlight.set(invite, next);
  return next;
}

/** Try again: forget the last answer for this invite. */
export function forgetSeatAccept(invite: string): void {
  acceptsInFlight.delete(invite);
}

/** "You're in" line: names the gym and the seat (preset label) when known. */
export function seatWelcomeLine(result: Extract<SeatAcceptResult, { ok: true }>): string {
  const gym = result.gymName || 'Your academy';
  const seat = result.presetId ? instructorPreset(result.presetId).label : 'an instructor';
  return `${gym} added you as ${seat}. This phone now opens the instructor screens the gym owner picked.`;
}
