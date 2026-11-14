import { ENTITLEMENT_TOKEN_KEY, acceptServerToken, entitlementSnapshot, readDeviceId } from './entitlement.ts';
import { ownerPassOutranksSeat } from './ownerPassRank.ts';
import {
  acceptInstructorInvite,
  installAcceptedSeat,
  instructorPresetPermissions,
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
  permissions?: Partial<InstructorPermissions>;
}): Promise<{ invite: string; seatId: string } | { reason: 'cap' | 'owner' | 'closed' | 'offline'; detail?: string }> {
  const token = readToken();
  if (!token) return { reason: 'offline' };
  try {
    const response = await fetch('/api/seats/issue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, email: input.email, preset: input.presetId, permissions: input.permissions }),
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
  const permissions = input.permissions ?? (input.presetId ? instructorPresetPermissions(input.presetId) : undefined);
  const server = await requestServerSeat({ email: input.email, presetId: input.presetId ?? null, permissions });
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

export async function acceptSignedSeat(invite: string): Promise<boolean> {
  if (!isSignedSeatInvite(invite)) return acceptInstructorInvite(invite).ok;
  try {
    const response = await fetch('/api/seats/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ invite, deviceId: readDeviceId() }),
    });
    const body = (await response.json()) as {
      ok?: boolean;
      token?: string;
      seatId?: string;
      email?: string | null;
      preset?: string | null;
    };
    if (!response.ok || !body.ok || !body.token || !body.seatId) return false;
    const preset =
      body.preset === 'assistant-coach' || body.preset === 'coach' || body.preset === 'program-director' || body.preset === 'instructors'
        ? body.preset
        : null;
    installAcceptedSeat({
      id: body.seatId,
      email: body.email || 'instructor',
      presetId: preset,
      inviteToken: invite,
    });
    // The seat stays signed in locally. It must not replace an owner or alpha-pro pass.
    if (ownerPassOutranksSeat(entitlementSnapshot().claims)) return true;
    return acceptServerToken(body.token);
  } catch {
    return false;
  }
}

/**
 * Owner: save one seat's switches on the server (Edit permissions). Also run for every seat
 * on this device by syncSeatPermissions, so seats issued before switches were stored catch up.
 * Best effort: the local seat already saved.
 */
export async function saveSeatPermissionsOnServer(seat: { id: string; presetId: InstructorPresetId | null; permissions: InstructorPermissions }): Promise<boolean> {
  const token = readToken();
  if (!token) return false;
  try {
    const response = await fetch('/api/seats/permissions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, seatId: seat.id, preset: seat.presetId, permissions: seat.permissions }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Owner device: push every open seat's switches to the server once (backfill for older invites). */
export async function syncSeatPermissions(): Promise<void> {
  for (const seat of listInstructorSeats()) {
    if (seat.status === 'revoked') continue;
    await saveSeatPermissionsOnServer(seat);
  }
}
