/**
 * Shared Advantage packet envelope.
 * Student, instructor, academy, and media packets all use this manifest.
 * See docs/export-packets.md.
 */

import { findPacketSecret, stripPacketSecrets } from './secrets.ts';

export const PACKET_FORMAT = 'advantage-packet';
export const PACKET_VERSION = 1;
export const PACKET_APP_VERSION = '1.0.0';
export const PACKET_EXTENSION = '.advantage';
export const PACKET_MIME = 'application/vnd.advantage.packet+json';

export const PACKET_KINDS = ['student', 'instructor', 'academy', 'media'] as const;
export type PacketKind = (typeof PACKET_KINDS)[number];

export type PacketManifest = {
  format: typeof PACKET_FORMAT;
  version: typeof PACKET_VERSION;
  kind: PacketKind;
  createdAt: string;
  appVersion: string;
  profileId?: string;
  accountId?: string;
  checksums: Record<string, string>;
};

export type AdvantagePacket = PacketManifest & {
  sections: Record<string, unknown>;
};

export type PacketPreview = {
  title: string;
  lines: string[];
  restorable: boolean;
};

export type PacketParse =
  | { ok: true; packet: AdvantagePacket }
  | { ok: false; reason: 'not-packet' | 'invalid'; error: string };

const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPacketKind(value: unknown): value is PacketKind {
  return typeof value === 'string' && (PACKET_KINDS as readonly string[]).includes(value);
}

/** Object keys sorted at every level. Array order stays. */
export function canonicalJson(value: unknown): string {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) return 'null';
  return JSON.stringify(sortValue(JSON.parse(encoded)));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) next[key] = sortValue(source[key]);
  return next;
}

export async function checksumText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}

export async function checksumSections(sections: Record<string, unknown>): Promise<Record<string, string>> {
  const checksums: Record<string, string> = {};
  for (const key of Object.keys(sections).sort()) {
    checksums[key] = await checksumText(canonicalJson(sections[key]));
  }
  return checksums;
}

export async function buildPacket(input: {
  kind: PacketKind;
  sections: Record<string, unknown>;
  createdAt: string;
  appVersion?: string;
  profileId?: string;
  accountId?: string | null;
}): Promise<{ packet: AdvantagePacket; text: string }> {
  const sections: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.sections)) {
    if (value === undefined) continue;
    sections[key] = stripPacketSecrets(value);
  }
  const secret = findPacketSecret(sections);
  if (secret) throw new Error(`Packet section ${secret} still holds a secret.`);
  const accountId = typeof input.accountId === 'string' && ACCOUNT_ID.test(input.accountId) ? input.accountId.toLowerCase() : undefined;
  const profileId = typeof input.profileId === 'string' && input.profileId.trim() ? input.profileId.trim() : undefined;
  const packet: AdvantagePacket = {
    format: PACKET_FORMAT,
    version: PACKET_VERSION,
    kind: input.kind,
    createdAt: input.createdAt,
    appVersion: input.appVersion?.trim() || PACKET_APP_VERSION,
    checksums: await checksumSections(sections),
    sections,
  };
  if (profileId) packet.profileId = profileId;
  if (accountId) packet.accountId = accountId;
  return { packet, text: JSON.stringify(packet) };
}

export async function parsePacket(text: string): Promise<PacketParse> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-packet', error: 'That file is not a packet.' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'not-packet', error: 'That file is not a packet.' };
  }
  const record = raw as Partial<AdvantagePacket>;
  if (record.format !== PACKET_FORMAT) {
    return { ok: false, reason: 'not-packet', error: 'That file is not an Advantage packet.' };
  }
  if (typeof record.version === 'number' && record.version > PACKET_VERSION) {
    return {
      ok: false,
      reason: 'invalid',
      error: 'This packet is from a newer Advantage. Update the app before importing it.',
    };
  }
  if (record.version !== PACKET_VERSION) {
    return { ok: false, reason: 'invalid', error: 'That packet version cannot be read.' };
  }
  if (!isPacketKind(record.kind)) {
    return { ok: false, reason: 'invalid', error: 'That packet kind is not one Advantage knows.' };
  }
  if (typeof record.createdAt !== 'string' || !record.createdAt.trim()) {
    return { ok: false, reason: 'invalid', error: 'That packet has no created date.' };
  }
  if (typeof record.appVersion !== 'string' || !record.appVersion.trim()) {
    return { ok: false, reason: 'invalid', error: 'That packet has no app version.' };
  }
  if (!record.sections || typeof record.sections !== 'object' || Array.isArray(record.sections)) {
    return { ok: false, reason: 'invalid', error: 'That packet has no sections.' };
  }
  if (!record.checksums || typeof record.checksums !== 'object' || Array.isArray(record.checksums)) {
    return { ok: false, reason: 'invalid', error: 'That packet has no checksums.' };
  }
  const secret = findPacketSecret(record.sections);
  if (secret) {
    return { ok: false, reason: 'invalid', error: 'That packet includes a secret Advantage does not import.' };
  }
  const sectionKeys = Object.keys(record.sections).sort();
  const checksumKeys = Object.keys(record.checksums).sort();
  if (sectionKeys.join('\0') !== checksumKeys.join('\0')) {
    return { ok: false, reason: 'invalid', error: 'That packet checksum list does not match its sections.' };
  }
  for (const key of sectionKeys) {
    const expected = record.checksums[key];
    const actual = await checksumText(canonicalJson(record.sections[key]));
    if (typeof expected !== 'string' || expected !== actual) {
      return { ok: false, reason: 'invalid', error: `The ${key} section did not match its checksum.` };
    }
  }
  const packet: AdvantagePacket = {
    format: PACKET_FORMAT,
    version: PACKET_VERSION,
    kind: record.kind,
    createdAt: record.createdAt,
    appVersion: record.appVersion,
    checksums: { ...record.checksums },
    sections: record.sections,
  };
  if (typeof record.profileId === 'string' && record.profileId.trim()) packet.profileId = record.profileId.trim();
  if (typeof record.accountId === 'string' && ACCOUNT_ID.test(record.accountId)) packet.accountId = record.accountId.toLowerCase();
  return { ok: true, packet };
}
