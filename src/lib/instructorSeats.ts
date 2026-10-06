/**
 * Owner-issued instructor seats for Instructor Collaboration and Advantage Coach Unlimited.
 * Soft beta: records stay on this device. No email send, billing, or invite cap.
 *
 * This app has no separate gym id. The Media Console gym name
 * (`matboard.gymName.v1`) is the gym identity when one is saved. A blank name
 * uses a stable device gym id kept in this archive.
 */

import { readGymName } from './gymName.ts';

export const INSTRUCTOR_SEATS_STORAGE_KEY = 'matboard.pro.instructorSeats.v1';
export const INSTRUCTOR_SEAT_SESSION_KEY = 'matboard.pro.instructorSeatSession.v1';
/** Invite token that must not be restored by a hard refresh of the signed-out page. */
export const INSTRUCTOR_SEAT_SIGNED_OUT_KEY = 'matboard.pro.instructorSeatSignedOut.v1';
const SIGNED_OUT_TOAST_KEY = 'matboard.pro.instructorSeatSignedOutToast.v1';
const SEATS_EVENT = 'matboard-instructor-seats';
const SESSION_EVENT = 'matboard-instructor-seat-session';
const TOAST_EVENT = 'matboard-instructor-seat-signed-out';
const SESSION_CHANNEL = 'matboard-instructor-seat-session';
const EMAIL_MAX = 254;

export type SeatStatus = 'invited' | 'active' | 'revoked';

export type InstructorPermissions = {
  galleryUpload: boolean;
  dailyLessonPlanAccess: boolean;
  rosterSubmit: boolean;
  rosterPull: boolean;
  downloadTodaysVideos: boolean;
  uploadForDistribution: boolean;
  eventsAccess: boolean;
  proShopAccess: boolean;
};

/** Used when the owner has not picked a preset yet. Events and Pro Shop stay off. */
export const DEFAULT_INSTRUCTOR_PERMISSIONS: InstructorPermissions = {
  galleryUpload: false,
  dailyLessonPlanAccess: true,
  rosterSubmit: true,
  rosterPull: true,
  downloadTodaysVideos: true,
  uploadForDistribution: true,
  eventsAccess: false,
  proShopAccess: false,
};

export const INSTRUCTOR_PERMISSION_FIELDS: readonly {
  key: keyof InstructorPermissions;
  label: string;
}[] = [
  { key: 'galleryUpload', label: 'Gallery upload' },
  { key: 'dailyLessonPlanAccess', label: 'Daily training lesson plan access' },
  { key: 'rosterSubmit', label: 'Roster submit' },
  { key: 'rosterPull', label: 'Roster pull' },
  { key: 'downloadTodaysVideos', label: "Download today's videos" },
  { key: 'uploadForDistribution', label: 'Upload for instructor distribution' },
  { key: 'eventsAccess', label: 'Events access' },
  { key: 'proShopAccess', label: 'Pro Shop access' },
];

export type InstructorPresetId = 'assistant-coach' | 'coach' | 'program-director' | 'instructors';

/** Product plan behind a named invite tier. Not stored separately from the preset. */
export type InstructorPlanName = 'Coach Unlimited' | 'Coach Unlimited + Pro' | 'Pro · Gallery';

export type InstructorPreset = {
  id: InstructorPresetId;
  label: string;
  /** Which product plan this tier sits on. */
  plan: InstructorPlanName;
  /**
   * Lines under the role button.
   * The first line is which menus this invite opens.
   * Cloud and sharing stay full inside those menus for every role.
   */
  detail: readonly string[];
  permissions: InstructorPermissions;
};

/** Named starting binders. The stored booleans stay overridable after a pick. */
export const INSTRUCTOR_PRESETS: readonly InstructorPreset[] = [
  {
    id: 'assistant-coach',
    label: 'Assistant coach',
    plan: 'Coach Unlimited',
    detail: ['Lesson plans and daily videos', 'Full cloud and sharing in these menus'],
    permissions: {
      galleryUpload: false,
      dailyLessonPlanAccess: true,
      rosterSubmit: false,
      rosterPull: false,
      downloadTodaysVideos: true,
      uploadForDistribution: true,
      eventsAccess: false,
      proShopAccess: false,
    },
  },
  {
    id: 'coach',
    label: 'Coach',
    plan: 'Coach Unlimited',
    detail: ['Lesson plans, daily videos, and uploads', 'Full cloud and sharing in these menus'],
    permissions: {
      galleryUpload: false,
      dailyLessonPlanAccess: true,
      rosterSubmit: true,
      rosterPull: true,
      downloadTodaysVideos: true,
      uploadForDistribution: true,
      eventsAccess: false,
      proShopAccess: false,
    },
  },
  {
    id: 'program-director',
    label: 'Program director',
    plan: 'Pro · Gallery',
    detail: ['Events, Pro Shop, and gallery', 'Full cloud and sharing in these menus'],
    permissions: {
      galleryUpload: true,
      dailyLessonPlanAccess: false,
      rosterSubmit: false,
      rosterPull: false,
      downloadTodaysVideos: false,
      uploadForDistribution: false,
      eventsAccess: true,
      proShopAccess: true,
    },
  },
  {
    id: 'instructors',
    label: 'Instructors',
    plan: 'Coach Unlimited + Pro',
    detail: [
      'Lessons, uploads, events, Pro Shop, and gallery',
      'Full cloud and sharing in these menus',
    ],
    permissions: {
      galleryUpload: true,
      dailyLessonPlanAccess: true,
      rosterSubmit: true,
      rosterPull: true,
      downloadTodaysVideos: true,
      uploadForDistribution: true,
      eventsAccess: true,
      proShopAccess: true,
    },
  },
];

export type InstructorSeat = {
  id: string;
  gymId: string;
  email: string;
  status: SeatStatus;
  issuedAt: number;
  /** Preset the owner started from. Null when they issued without picking one. */
  presetId: InstructorPresetId | null;
  permissions: InstructorPermissions;
  inviteToken: string;
};

type SeatArchive = {
  version: 1;
  deviceGymId: string;
  seats: InstructorSeat[];
};

export type IssueInviteResult =
  | { ok: true; seat: InstructorSeat; inviteLink: string }
  | { ok: false; reason: 'email' | 'duplicate' | 'storage' };

export type SeatWriteResult =
  | { ok: true; seat: InstructorSeat }
  | { ok: false; reason: 'missing' | 'revoked' | 'storage' };

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `seat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultInstructorPermissions(): InstructorPermissions {
  return { ...DEFAULT_INSTRUCTOR_PERMISSIONS };
}

const PRESET_IDS: readonly InstructorPresetId[] = [
  'assistant-coach',
  'coach',
  'program-director',
  'instructors',
];

export function instructorPreset(id: InstructorPresetId): InstructorPreset {
  const preset = INSTRUCTOR_PRESETS.find((item) => item.id === id);
  if (!preset) return INSTRUCTOR_PRESETS[1];
  return preset;
}

export function instructorPresetPermissions(id: InstructorPresetId): InstructorPermissions {
  return { ...instructorPreset(id).permissions };
}

/** Plan behind a named tier. A custom binder (no preset) has none. */
export function instructorPresetPlan(presetId: InstructorPresetId | null): InstructorPlanName | null {
  if (!presetId) return null;
  return instructorPreset(presetId).plan;
}

export function normalizeInstructorPresetId(value: unknown): InstructorPresetId | null {
  return PRESET_IDS.find((id) => id === value) ?? null;
}

export function permissionsMatchPreset(
  presetId: InstructorPresetId | null,
  permissions: InstructorPermissions,
): boolean {
  if (!presetId) return false;
  const preset = instructorPresetPermissions(presetId);
  return INSTRUCTOR_PERMISSION_FIELDS.every((field) => preset[field.key] === permissions[field.key]);
}

/** Binder label. The preset name stays even when toggles were changed after. */
export function instructorSeatBinderLabel(
  presetId: InstructorPresetId | null,
  permissions: InstructorPermissions,
): string {
  if (!presetId) return 'Custom binder';
  const name = instructorPreset(presetId).label;
  return permissionsMatchPreset(presetId, permissions) ? name : `${name} · adjusted`;
}

/** Missing keys use the soft-beta defaults. Only real booleans are kept. */
export function normalizeInstructorPermissions(
  value: Partial<InstructorPermissions> | null | undefined,
): InstructorPermissions {
  const next = defaultInstructorPermissions();
  if (!value) return next;
  for (const field of INSTRUCTOR_PERMISSION_FIELDS) {
    const flag = value[field.key];
    if (typeof flag === 'boolean') next[field.key] = flag;
  }
  return next;
}

export function normalizeInviteEmail(value: string): string {
  return value.normalize('NFC').trim().toLowerCase().slice(0, EMAIL_MAX);
}

export function isInviteEmail(value: string): boolean {
  const email = normalizeInviteEmail(value);
  if (!email || email.length > EMAIL_MAX) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function instructorInviteLink(token: string, origin: string): string {
  const base = origin.replace(/\/$/, '');
  const params = new URLSearchParams({ invite: token });
  return `${base}/instructors?${params.toString()}`;
}

/**
 * Whether a Coach control should show for the current seat.
 * Null permissions are a device guest: every collaboration control stays hidden.
 */
export function seatPermissionAllows(
  permissions: InstructorPermissions | null,
  key: keyof InstructorPermissions,
): boolean {
  if (!permissions) return false;
  return permissions[key];
}

/** Signed-in invite that has not been revoked. */
export function isLiveSeat<T extends { status: SeatStatus }>(seat: T | null | undefined): seat is T {
  return !!seat && seat.status !== 'revoked';
}

/** Program director preset. Adjusted toggles keep this role id. */
export function isProgramDirectorSeat(seat: Pick<InstructorSeat, 'status' | 'presetId'> | null): boolean {
  return isLiveSeat(seat) && seat.presetId === 'program-director';
}

/**
 * Gallery, Events, or Pro Shop on the invite.
 * That is the Media Console menu. Coach and Assistant Coach presets leave it off.
 */
export function seatGrantsMediaConsole(seat: Pick<InstructorSeat, 'status' | 'permissions'> | null): boolean {
  if (!isLiveSeat(seat)) return false;
  return (
    seat.permissions.galleryUpload || seat.permissions.eventsAccess || seat.permissions.proShopAccess
  );
}

/** Lesson plan or Daily Training Videos. Those are the coach menus on a Pro invite. */
export function seatGrantsCoachMenus(seat: Pick<InstructorSeat, 'status' | 'permissions'> | null): boolean {
  if (!isLiveSeat(seat)) return false;
  return seat.permissions.dailyLessonPlanAccess || seat.permissions.downloadTodaysVideos;
}

/**
 * No seat: the menu is not limited by an invite.
 * A live seat: only the picker flag for that menu.
 */
export function seatMenuAllowed(
  seat: Pick<InstructorSeat, 'status' | 'permissions'> | null,
  key: keyof InstructorPermissions,
): boolean {
  if (!isLiveSeat(seat)) return true;
  return seat.permissions[key];
}

/**
 * Cloud and sharing inside a menu the invite opened.
 * A live Pro invite matches owner Pro in that menu, including when the
 * browser Pro unlock is off and when an older binder stored uploads as off.
 * No seat: cloud stays on the browser Pro unlock. A closed menu stays closed.
 */
export function menuCloudSharing(
  proUnlocked: boolean,
  seat: Pick<InstructorSeat, 'status'> | null,
  menuAllowed: boolean,
): boolean {
  if (!menuAllowed) return false;
  if (isLiveSeat(seat)) return true;
  return proUnlocked;
}

/**
 * Coach hub links. No seat shows every tool. A signed-in seat hides Daily
 * Lesson Plan or Daily Training Videos when that switch is off. Technique Tree
 * and the folder hubs stay.
 */
export function coachToolVisible(
  to: string,
  seat: Pick<InstructorSeat, 'permissions'> | null,
): boolean {
  if (!seat) return true;
  const path = to.split('?')[0];
  if (path === '/notes') return seatPermissionAllows(seat.permissions, 'dailyLessonPlanAccess');
  if (path === '/techniques') return seatPermissionAllows(seat.permissions, 'downloadTodaysVideos');
  return true;
}

/**
 * Owner with no seat session keeps every control. A signed-in seat uses that
 * seat's booleans. A device guest (no owner unlock, no seat) sees none.
 */
export function visibleCoachControl(
  key: keyof InstructorPermissions,
  access: { owner: boolean; seat: Pick<InstructorSeat, 'status' | 'permissions'> | null },
): boolean {
  if (access.seat && access.seat.status !== 'revoked') {
    return seatPermissionAllows(access.seat.permissions, key);
  }
  return access.owner;
}

function emptyArchive(): SeatArchive {
  return { version: 1, deviceGymId: `device-${newId()}`, seats: [] };
}

function isStatus(value: unknown): value is SeatStatus {
  return value === 'invited' || value === 'active' || value === 'revoked';
}

function readSeat(value: unknown): InstructorSeat | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<InstructorSeat>;
  if (typeof row.id !== 'string' || !row.id) return null;
  if (typeof row.gymId !== 'string') return null;
  if (typeof row.email !== 'string' || !isInviteEmail(row.email)) return null;
  if (!isStatus(row.status)) return null;
  if (typeof row.issuedAt !== 'number' || !Number.isFinite(row.issuedAt)) return null;
  if (typeof row.inviteToken !== 'string' || !row.inviteToken) return null;
  if (!row.permissions || typeof row.permissions !== 'object') return null;
  return {
    id: row.id,
    gymId: row.gymId,
    email: normalizeInviteEmail(row.email),
    status: row.status,
    issuedAt: row.issuedAt,
    presetId: normalizeInstructorPresetId(row.presetId),
    permissions: normalizeInstructorPermissions(row.permissions),
    inviteToken: row.inviteToken,
  };
}

function readArchive(): SeatArchive {
  try {
    if (typeof localStorage === 'undefined') return emptyArchive();
    const raw = localStorage.getItem(INSTRUCTOR_SEATS_STORAGE_KEY);
    if (!raw) return emptyArchive();
    const parsed = JSON.parse(raw) as Partial<SeatArchive>;
    if (parsed.version !== 1 || !Array.isArray(parsed.seats)) return emptyArchive();
    const deviceGymId =
      typeof parsed.deviceGymId === 'string' && parsed.deviceGymId
        ? parsed.deviceGymId
        : `device-${newId()}`;
    const seats = parsed.seats
      .map(readSeat)
      .filter((seat): seat is InstructorSeat => seat !== null);
    return { version: 1, deviceGymId, seats };
  } catch {
    return emptyArchive();
  }
}

function writeArchive(archive: SeatArchive): boolean {
  try {
    localStorage.setItem(
      INSTRUCTOR_SEATS_STORAGE_KEY,
      JSON.stringify({ version: 1, deviceGymId: archive.deviceGymId, seats: archive.seats }),
    );
    return true;
  } catch {
    return false;
  }
}

let seatSnapshot: InstructorSeat | null = null;
let seatSnapshotKey = '';

function invalidateSeatSnapshot(): void {
  // Empty string is also the signed-out cache key. A sentinel forces the next read.
  seatSnapshotKey = '\0';
  seatSnapshot = null;
}

function emitSeats(): void {
  invalidateSeatSnapshot();
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SEATS_EVENT));
}

function gymIdFor(archive: SeatArchive): string {
  const name = readGymName().trim();
  return name || archive.deviceGymId;
}

function cloneSeat(seat: InstructorSeat): InstructorSeat {
  return { ...seat, permissions: { ...seat.permissions } };
}

export function listInstructorSeats(): InstructorSeat[] {
  return readArchive()
    .seats.map(cloneSeat)
    .sort((a, b) => b.issuedAt - a.issuedAt || a.email.localeCompare(b.email));
}

export function subscribeInstructorSeats(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === INSTRUCTOR_SEATS_STORAGE_KEY) fn();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(SEATS_EVENT, fn);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(SEATS_EVENT, fn);
  };
}

function openEmailTaken(seats: readonly InstructorSeat[], email: string): boolean {
  return seats.some(
    (seat) => seat.email === email && (seat.status === 'invited' || seat.status === 'active'),
  );
}

export function issueInstructorInvite(input: {
  email: string;
  permissions?: Partial<InstructorPermissions>;
  presetId?: InstructorPresetId | null;
  origin: string;
  now?: number;
  token?: string;
}): IssueInviteResult {
  const email = normalizeInviteEmail(input.email);
  if (!isInviteEmail(email)) return { ok: false, reason: 'email' };
  const archive = readArchive();
  if (openEmailTaken(archive.seats, email)) return { ok: false, reason: 'duplicate' };
  const token = input.token?.trim() || newId();
  const seat: InstructorSeat = {
    id: newId(),
    gymId: gymIdFor(archive),
    email,
    status: 'invited',
    issuedAt: input.now ?? Date.now(),
    presetId: normalizeInstructorPresetId(input.presetId),
    permissions: normalizeInstructorPermissions(input.permissions),
    inviteToken: token,
  };
  archive.seats.push(seat);
  if (!writeArchive(archive)) return { ok: false, reason: 'storage' };
  emitSeats();
  return {
    ok: true,
    seat: cloneSeat(seat),
    inviteLink: instructorInviteLink(seat.inviteToken, input.origin),
  };
}

export function updateInstructorSeatPermissions(
  id: string,
  permissions: InstructorPermissions,
  presetId?: InstructorPresetId | null,
): SeatWriteResult {
  const archive = readArchive();
  const seat = archive.seats.find((row) => row.id === id);
  if (!seat) return { ok: false, reason: 'missing' };
  if (seat.status === 'revoked') return { ok: false, reason: 'revoked' };
  seat.permissions = normalizeInstructorPermissions(permissions);
  if (presetId !== undefined) seat.presetId = normalizeInstructorPresetId(presetId);
  if (!writeArchive(archive)) return { ok: false, reason: 'storage' };
  emitSeats();
  return { ok: true, seat: cloneSeat(seat) };
}

type SeatSessionRecord = { version: 1; seatId: string };

function readSessionSeatId(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(INSTRUCTOR_SEAT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SeatSessionRecord>;
    if (parsed.version !== 1 || typeof parsed.seatId !== 'string' || !parsed.seatId) return null;
    return parsed.seatId;
  } catch {
    return null;
  }
}

function writeSession(seatId: string): boolean {
  try {
    const record: SeatSessionRecord = { version: 1, seatId };
    localStorage.setItem(INSTRUCTOR_SEAT_SESSION_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

function emitSession(): void {
  invalidateSeatSnapshot();
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SESSION_EVENT));
}

type SignedOutBlock = { version: 1; token: string; seatId: string };

let signedOutToast = false;
let sessionChannel: BroadcastChannel | null = null;

function readSignedOutBlock(): SignedOutBlock | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(INSTRUCTOR_SEAT_SIGNED_OUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SignedOutBlock>;
    if (parsed.version !== 1 || typeof parsed.token !== 'string' || !parsed.token) return null;
    if (typeof parsed.seatId !== 'string' || !parsed.seatId) return null;
    return { version: 1, token: parsed.token, seatId: parsed.seatId };
  } catch {
    return null;
  }
}

function writeSignedOutBlock(block: SignedOutBlock): void {
  try {
    localStorage.setItem(INSTRUCTOR_SEAT_SIGNED_OUT_KEY, JSON.stringify(block));
  } catch {
    /* the session key removal still signs this tab out */
  }
}

function clearSignedOutBlock(): void {
  try {
    localStorage.removeItem(INSTRUCTOR_SEAT_SIGNED_OUT_KEY);
  } catch {
    /* ignore */
  }
}

/** `performance` navigation type, or null when this runtime does not report one. */
export function currentNavigationType(): string | null {
  try {
    if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return null;
    const entry = performance.getEntriesByType('navigation')[0] as { type?: string } | undefined;
    return typeof entry?.type === 'string' ? entry.type : null;
  } catch {
    return null;
  }
}

/**
 * A hard refresh of the invite address must not sign the seat back in.
 * A fresh visit (`navigate`) still opens the invite.
 */
export function inviteReloadBlocked(
  token: string,
  navigationType: string | null,
  inviteInAddress: string | null,
): boolean {
  if (navigationType !== 'reload') return false;
  const block = readSignedOutBlock();
  if (!block) return false;
  const trimmed = token.trim();
  if (!trimmed || block.token !== trimmed) return false;
  return (inviteInAddress ?? '').trim() === trimmed;
}

/** Drop `?invite=` so the next load cannot treat this page as a fresh invite open. */
export function stripInviteFromAddress(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('invite')) return;
  url.searchParams.delete('invite');
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, '', next);
}

function armSignedOutToast(): void {
  signedOutToast = true;
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(SIGNED_OUT_TOAST_KEY, '1');
  } catch {
    /* the in-memory toast still shows in this tab */
  }
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(TOAST_EVENT));
}

function restoreSignedOutToast(): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (sessionStorage.getItem(SIGNED_OUT_TOAST_KEY) === '1') signedOutToast = true;
  } catch {
    /* ignore */
  }
}

restoreSignedOutToast();

export function readSignedOutToast(): boolean {
  return signedOutToast;
}

export function consumeSignedOutToast(): void {
  if (!signedOutToast) {
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(SIGNED_OUT_TOAST_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  signedOutToast = false;
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(SIGNED_OUT_TOAST_KEY);
  } catch {
    /* ignore */
  }
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(TOAST_EVENT));
}

export function subscribeSignedOutToast(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(TOAST_EVENT, fn);
  return () => window.removeEventListener(TOAST_EVENT, fn);
}

function postSeatSignOut(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = sessionChannel ?? new BroadcastChannel(SESSION_CHANNEL);
    channel.postMessage({ type: 'sign-out' });
    if (!sessionChannel) channel.close();
  } catch {
    /* other tabs still hear localStorage */
  }
}

function onRemoteSeatSignOut(): void {
  invalidateSeatSnapshot();
  armSignedOutToast();
  stripInviteFromAddress();
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SESSION_EVENT));
}

function installSessionChannel(): void {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  if (sessionChannel) return;
  try {
    sessionChannel = new BroadcastChannel(SESSION_CHANNEL);
    sessionChannel.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (!data || data.type !== 'sign-out') return;
      onRemoteSeatSignOut();
    };
  } catch {
    sessionChannel = null;
  }
}

installSessionChannel();

function clearDurableSeatSession(): void {
  try {
    localStorage.removeItem(INSTRUCTOR_SEAT_SESSION_KEY);
  } catch {
    /* keep going */
  }
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(INSTRUCTOR_SEAT_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Gym TV casts stay clear of the seat bar and the signed-out toast. */
const SEAT_CHROME_HIDDEN = new Set(['/match', '/training', '/slideshow', '/screensaver']);

export function seatChromeHidden(pathname: string): boolean {
  return SEAT_CHROME_HIDDEN.has(pathname);
}

/** A live instructor seat already has access. Do not push Coach or Pro purchase. */
export function purchasePromptsHidden(seat: { status: SeatStatus } | null): boolean {
  return Boolean(seat && seat.status !== 'revoked');
}

/** Active seat on this device, or null when signed out, missing, or revoked. */
export function readCurrentSeat(): InstructorSeat | null {
  const id = readSessionSeatId();
  const seat = id ? readArchive().seats.find((row) => row.id === id) : undefined;
  const live = seat && seat.status !== 'revoked' ? cloneSeat(seat) : null;
  const key = live ? `${live.id}:${live.status}:${live.email}:${JSON.stringify(live.permissions)}` : '';
  if (key === seatSnapshotKey) return seatSnapshot;
  seatSnapshotKey = key;
  seatSnapshot = live;
  return seatSnapshot;
}

export function subscribeSeatSession(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === INSTRUCTOR_SEAT_SESSION_KEY || event.key === INSTRUCTOR_SEATS_STORAGE_KEY) fn();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(SESSION_EVENT, fn);
  window.addEventListener(SEATS_EVENT, fn);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(SESSION_EVENT, fn);
    window.removeEventListener(SEATS_EVENT, fn);
  };
}

/**
 * End the seat on this device immediately.
 * Other tabs hear it through storage and a broadcast. A hard refresh of the
 * invite address does not sign that seat back in.
 */
export function signOutInstructorSeat(): void {
  const id = readSessionSeatId();
  const seat = id ? readArchive().seats.find((row) => row.id === id) : undefined;
  if (seat) writeSignedOutBlock({ version: 1, token: seat.inviteToken, seatId: seat.id });
  clearDurableSeatSession();
  armSignedOutToast();
  stripInviteFromAddress();
  emitSession();
  postSeatSignOut();
}

/**
 * Read an invite token without starting a session.
 * `open` is a live invited or active seat. Revoked and unknown tokens stay shut.
 * Soft-beta invites have no clock expiry; revoke is what closes them.
 */
export function peekInstructorInvite(token: string): 'open' | 'missing' | 'revoked' {
  const trimmed = token.trim();
  if (!trimmed) return 'missing';
  const seat = readArchive().seats.find((row) => row.inviteToken === trimmed);
  if (!seat) return 'missing';
  if (seat.status === 'revoked') return 'revoked';
  return 'open';
}

/**
 * Open an invite link on this device. Invited seats become active.
 * Revoked or unknown tokens do not start a session.
 * The token is the door. This does not write the owner purchase unlock.
 */
export function acceptInstructorInvite(
  token: string,
): { ok: true; seat: InstructorSeat } | { ok: false; reason: 'missing' | 'revoked' | 'storage' | 'signed-out' } {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, reason: 'missing' };
  if (typeof window !== 'undefined') {
    const inviteInAddress = new URLSearchParams(window.location.search).get('invite');
    if (inviteReloadBlocked(trimmed, currentNavigationType(), inviteInAddress)) {
      return { ok: false, reason: 'signed-out' };
    }
  }
  const archive = readArchive();
  const seat = archive.seats.find((row) => row.inviteToken === trimmed);
  if (!seat) return { ok: false, reason: 'missing' };
  if (seat.status === 'revoked') return { ok: false, reason: 'revoked' };
  if (seat.status === 'invited') seat.status = 'active';
  if (!writeArchive(archive)) return { ok: false, reason: 'storage' };
  if (!writeSession(seat.id)) return { ok: false, reason: 'storage' };
  clearSignedOutBlock();
  consumeSignedOutToast();
  emitSeats();
  emitSession();
  return { ok: true, seat: cloneSeat(seat) };
}

export function revokeInstructorSeat(id: string): SeatWriteResult {
  const archive = readArchive();
  const seat = archive.seats.find((row) => row.id === id);
  if (!seat) return { ok: false, reason: 'missing' };
  if (seat.status !== 'revoked') seat.status = 'revoked';
  if (!writeArchive(archive)) return { ok: false, reason: 'storage' };
  emitSeats();
  return { ok: true, seat: cloneSeat(seat) };
}
