/**
 * Cross-device invite and review text.
 * The gym's own cloud folder carries the packets. Google Drive is that folder
 * now. OneDrive can use the same text packets later, when that connector saves
 * into the gym folder. This module does not add scopes and does not change the
 * OAuth client.
 * Packets are JSON text. They never include photo or video bytes.
 * Advantage does not host the files.
 */

import {
  downloadDriveFile,
  listFolderFiles,
  readDriveBinding,
  requestDriveToken,
  saveDriveTextFile,
} from './googleDrive.ts';
import { acceptInstructorInvite, importInstructorSeat, type InstructorSeat } from './instructorSeats.ts';
import { listReviewSubmissions, upsertReviewHandoff, type ReviewSubmission } from './reviewInbox.ts';

export const DRIVE_HANDOFF_CONNECT = 'Connect Drive to send to your coach/instructor';
export const DRIVE_HANDOFF_CHECK = 'Check the gym folder';
export const DRIVE_HANDOFF_SAVED = 'Saved in the gym Google Drive folder. Advantage does not host it.';
export const DRIVE_HANDOFF_LEAD =
  'This stays in the gym Google Drive folder. Advantage does not host it.';
export const DRIVE_HANDOFF_EMPTY = 'Nothing new in the gym Google Drive folder.';
export const DRIVE_HANDOFF_MISSING = 'That invite is not in the gym Google Drive folder yet.';

const HANDOFF_AT_KEY = 'matboard.reviewHandoffAt.v1';
const BYTE_KEY = /blob|bytes|dataurl|base64|filebody|arraybuffer/i;

export type HandoffFolder = {
  writeText(name: string, text: string): Promise<void>;
  readTexts(): Promise<{ name: string; text: string }[]>;
};

type InvitePacket = {
  version: 1;
  kind: 'invite';
  updatedAt: number;
  seat: InstructorSeat;
};

type ReviewPacket = {
  version: 1;
  kind: 'review';
  updatedAt: number;
  submission: ReviewSubmission;
};

type HandoffPacket = InvitePacket | ReviewPacket;

export function planHandoff(connected: boolean): 'send' | 'connect' {
  return connected ? 'send' : 'connect';
}

export function packetCarriesBytes(value: unknown): boolean {
  const stack: unknown[] = [value];
  const seen = new Set<object>();
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    if (current instanceof Uint8Array || current instanceof ArrayBuffer) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (BYTE_KEY.test(key)) return true;
      if (typeof child === 'string' && child.startsWith('data:')) return true;
      if (child && typeof child === 'object') stack.push(child);
    }
  }
  return false;
}

function handoffFileName(kind: 'invite' | 'review', id: string, updatedAt: number): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'item';
  return `advantage-handoff-${kind}-${safe}-${updatedAt}.json`;
}

function seatPacket(seat: InstructorSeat): InstructorSeat {
  return {
    id: seat.id,
    gymId: seat.gymId,
    email: seat.email,
    status: seat.status,
    issuedAt: seat.issuedAt,
    presetId: seat.presetId,
    permissions: { ...seat.permissions },
    inviteToken: seat.inviteToken,
  };
}

function submissionPacket(submission: ReviewSubmission): ReviewSubmission {
  return {
    id: submission.id,
    revisionId: submission.revisionId,
    dateKey: submission.dateKey,
    coachName: submission.coachName,
    planId: submission.planId,
    planLabel: submission.planLabel,
    intro: submission.intro,
    closing: submission.closing,
    photoId: submission.photoId,
    photoName: submission.photoName,
    submittedAt: submission.submittedAt,
    status: submission.status,
    instructorNote: submission.instructorNote,
    plan: submission.plan,
  };
}

function encodePacket(packet: HandoffPacket): string {
  if (packetCarriesBytes(packet)) throw new Error('A handoff packet cannot carry files.');
  return JSON.stringify(packet);
}

export function parseHandoffPacket(text: string): HandoffPacket | null {
  try {
    const parsed = JSON.parse(text) as Partial<HandoffPacket>;
    if (!parsed || parsed.version !== 1) return null;
    if (typeof parsed.updatedAt !== 'number' || !Number.isFinite(parsed.updatedAt)) return null;
    if (packetCarriesBytes(parsed)) return null;
    if (parsed.kind === 'invite' && parsed.seat && typeof parsed.seat === 'object') {
      return { version: 1, kind: 'invite', updatedAt: parsed.updatedAt, seat: parsed.seat };
    }
    if (parsed.kind === 'review' && parsed.submission && typeof parsed.submission === 'object') {
      return { version: 1, kind: 'review', updatedAt: parsed.updatedAt, submission: parsed.submission };
    }
    return null;
  } catch {
    return null;
  }
}

function newestPackets(files: readonly { name: string; text: string }[]): HandoffPacket[] {
  const best = new Map<string, HandoffPacket>();
  for (const file of files) {
    if (!file.name.startsWith('advantage-handoff-') || !file.name.endsWith('.json')) continue;
    const packet = parseHandoffPacket(file.text);
    if (!packet) continue;
    const key = packet.kind === 'invite' ? `invite:${packet.seat.inviteToken}` : `review:${packet.submission.id}`;
    const current = best.get(key);
    if (!current || packet.updatedAt >= current.updatedAt) best.set(key, packet);
  }
  return [...best.values()];
}

export function memoryHandoffFolder(): HandoffFolder & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    async writeText(name: string, text: string) {
      files.set(name, text);
    },
    async readTexts() {
      return [...files.entries()].map(([name, text]) => ({ name, text }));
    },
  };
}

export async function sendInviteHandoff(
  folder: HandoffFolder,
  seat: InstructorSeat,
  updatedAt = Date.now(),
): Promise<void> {
  const packet: InvitePacket = { version: 1, kind: 'invite', updatedAt, seat: seatPacket(seat) };
  await folder.writeText(handoffFileName('invite', seat.inviteToken, updatedAt), encodePacket(packet));
}

export async function sendReviewHandoff(
  folder: HandoffFolder,
  submission: ReviewSubmission,
  updatedAt = Date.now(),
): Promise<void> {
  const packet: ReviewPacket = {
    version: 1,
    kind: 'review',
    updatedAt,
    submission: submissionPacket(submission),
  };
  await folder.writeText(handoffFileName('review', submission.id, updatedAt), encodePacket(packet));
  rememberHandoffAt(submission.id, updatedAt);
}

function readHandoffTimes(): Record<string, number> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(HANDOFF_AT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const times: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value)) times[id] = value;
    }
    return times;
  } catch {
    return {};
  }
}

function rememberHandoffAt(id: string, updatedAt: number): void {
  if (typeof localStorage === 'undefined') return;
  const times = readHandoffTimes();
  times[id] = updatedAt;
  localStorage.setItem(HANDOFF_AT_KEY, JSON.stringify(times));
}

export async function acceptInviteFromFolder(
  folder: HandoffFolder,
  token: string,
): Promise<ReturnType<typeof acceptInstructorInvite>> {
  const packet = newestPackets(await folder.readTexts()).find(
    (item): item is InvitePacket => item.kind === 'invite' && item.seat.inviteToken === token.trim(),
  );
  if (!packet) return { ok: false, reason: 'missing' };
  const imported = importInstructorSeat(packet.seat);
  if (!imported.ok) return { ok: false, reason: 'storage' };
  return acceptInstructorInvite(token);
}

export async function takeReviewHandoffs(folder: HandoffFolder): Promise<number> {
  const packets = newestPackets(await folder.readTexts()).filter((item): item is ReviewPacket => item.kind === 'review');
  packets.sort((a, b) => a.updatedAt - b.updatedAt);
  let merged = 0;
  for (const packet of packets) {
    const submission = packet.submission;
    if (!submission?.id) continue;
    const local = listReviewSubmissions().find((item) => item.id === submission.id);
    const seen = readHandoffTimes()[submission.id] ?? (local ? local.submittedAt : 0);
    if (local && packet.updatedAt <= seen) continue;
    const result = upsertReviewHandoff(submission, local ? 'status' : 'add');
    if (result === 'invalid') continue;
    rememberHandoffAt(submission.id, packet.updatedAt);
    merged += 1;
  }
  return merged;
}

/** The connected gym Google Drive folder, or null when this browser cannot send. */
export async function gymDriveFolder(): Promise<HandoffFolder | null> {
  const binding = readDriveBinding();
  if (!binding) return null;
  const token = await requestDriveToken('silent');
  if (!token) return null;
  return {
    async writeText(name: string, text: string) {
      await saveDriveTextFile(token, { name, text, parentId: binding.folderId });
    },
    async readTexts() {
      const listed = await listFolderFiles(token, binding.folderId);
      const handoffs = listed.filter(
        (file) => file.name.startsWith('advantage-handoff-') && file.name.endsWith('.json'),
      );
      const texts: { name: string; text: string }[] = [];
      for (const file of handoffs) {
        try {
          const blob = await downloadDriveFile(token, file.id);
          texts.push({ name: file.name, text: await blob.text() });
        } catch {
          /* a file this token cannot read stays in the gym folder */
        }
      }
      return texts;
    },
  };
}

export async function publishSeatToGym(seat: InstructorSeat): Promise<'saved' | 'connect'> {
  if (planHandoff(readDriveBinding() !== null) === 'connect') return 'connect';
  try {
    const folder = await gymDriveFolder();
    if (!folder) return 'connect';
    await sendInviteHandoff(folder, seat);
    return 'saved';
  } catch {
    return 'connect';
  }
}

export async function publishReviewToGym(submission: ReviewSubmission): Promise<'saved' | 'connect'> {
  if (planHandoff(readDriveBinding() !== null) === 'connect') return 'connect';
  try {
    const folder = await gymDriveFolder();
    if (!folder) return 'connect';
    await sendReviewHandoff(folder, submission);
    return 'saved';
  } catch {
    return 'connect';
  }
}

export async function pullReviewHandoff(): Promise<'saved' | 'empty' | 'connect'> {
  if (planHandoff(readDriveBinding() !== null) === 'connect') return 'connect';
  try {
    const folder = await gymDriveFolder();
    if (!folder) return 'connect';
    const merged = await takeReviewHandoffs(folder);
    return merged > 0 ? 'saved' : 'empty';
  } catch {
    return 'connect';
  }
}

export async function pullInviteHandoff(token: string): Promise<ReturnType<typeof acceptInstructorInvite> | { ok: false; reason: 'connect' }> {
  if (planHandoff(readDriveBinding() !== null) === 'connect') return { ok: false, reason: 'connect' };
  try {
    const folder = await gymDriveFolder();
    if (!folder) return { ok: false, reason: 'connect' };
    return await acceptInviteFromFolder(folder, token);
  } catch {
    return { ok: false, reason: 'connect' };
  }
}
