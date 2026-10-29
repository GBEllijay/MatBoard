import { ENTITLEMENT_TOKEN_KEY, acceptServerToken, readDeviceId } from './entitlement.ts';
import {
  acceptInstructorInvite,
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
}): Promise<{ invite: string; seatId: string } | { reason: 'cap' | 'closed' | 'offline' }> {
  const token = readToken();
  if (!token) return { reason: 'offline' };
  try {
    const response = await fetch('/api/seats/issue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, email: input.email, preset: input.presetId }),
    });
    const body = (await response.json()) as { ok?: boolean; invite?: string; seatId?: string; reason?: string };
    if (response.status === 409 || body.reason === 'cap') return { reason: 'cap' };
    if (!response.ok || !body.invite || !body.seatId) return { reason: 'closed' };
    return { invite: body.invite, seatId: body.seatId };
  } catch {
    return { reason: 'offline' };
  }
}

export async function issueSeatWithServer(input: {
  email: string;
  permissions?: Partial<InstructorPermissions>;
  presetId?: InstructorPresetId | null;
  origin: string;
}): Promise<IssueInviteResult> {
  const server = await requestServerSeat({ email: input.email, presetId: input.presetId ?? null });
  if ('reason' in server && server.reason === 'cap') return { ok: false, reason: 'cap' };
  if ('reason' in server && server.reason === 'closed') return { ok: false, reason: 'owner' };
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
    return acceptServerToken(body.token);
  } catch {
    return false;
  }
}
