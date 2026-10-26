/**
 * Pathway from a Pro account's connected folder to a Student Edition phone.
 * The student does not pay. The link and QR name the folder. The student
 * signs in with their own Google Drive or OneDrive account. Upload and
 * download then use that folder id with the existing Drive and OneDrive calls.
 * This does not replace the gym folder saved for Coach and Pro.
 */

import { driveFolderWebUrl } from './openMyDrive.ts';

export const ACADEMY_PATHWAY_VERSION = 1;
export const ACADEMY_BINDING_KEY = 'matboard.studentEdition.academyDrive.v1';
export const PERSONAL_DRIVE_KEY = 'matboard.studentEdition.personalDrive.v1';
export const STUDENT_ONEDRIVE_INTENT_KEY = 'matboard.studentEdition.oneDriveIntent.v1';
const PENDING_PATHWAY_KEY = 'matboard.studentEdition.academyPending.v1';

export const ACADEMY_CONNECT_LABEL = 'Connect to my academy';
export const ACADEMY_ACCESS_ERROR =
  'This account cannot open that academy folder. Ask your coach to share the folder so you can add files, then try again.';
export const ACADEMY_SHARE_FALLBACK =
  'This app could not share the folder on its own. Open the folder and share it so students can add files. Students do not pay.';
export const ACADEMY_NO_FOLDER =
  'Connect the academy Google Drive or OneDrive folder before you send students a pathway. Student seats expect that folder.';
export const ACADEMY_FREE_NOTE = 'Students do not pay to use this folder.';

export type AcademyProvider = 'googleDrive' | 'oneDrive';
export type StudentDriveRole = 'academy' | 'personal';

export type AcademyPathway = {
  v: typeof ACADEMY_PATHWAY_VERSION;
  provider: AcademyProvider;
  folderId: string;
  folderName: string;
  gymName: string;
};

export type StudentDriveLink = {
  role: StudentDriveRole;
  provider: AcademyProvider;
  folderId: string;
  folderName: string;
  accountLabel: string | null;
  gymName: string;
};

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

const FOLDER_ID = /^[A-Za-z0-9_!-]{8,}$/;

export function studentOneDriveReturnPath(intent: string | null): string | null {
  if (intent === 'academy' || intent === 'personal') return '/student/connections?student=1';
  return null;
}

export function rememberStudentOneDriveIntent(intent: 'academy' | 'personal'): void {
  try {
    sessionStorage.setItem(STUDENT_ONEDRIVE_INTENT_KEY, intent);
  } catch {
    /* the sign-in can still finish if the student returns to Connections */
  }
}

export function rememberPendingPathway(pathway: AcademyPathway): void {
  try {
    sessionStorage.setItem(PENDING_PATHWAY_KEY, JSON.stringify(pathway));
  } catch {
    /* the link can be pasted again after sign-in */
  }
}

export function readPendingPathway(): AcademyPathway | null {
  try {
    const raw = sessionStorage.getItem(PENDING_PATHWAY_KEY);
    if (!raw) return null;
    return parseAcademyInput(raw) ?? academyPathway(JSON.parse(raw) as AcademyPathway);
  } catch {
    return null;
  }
}

export function clearPendingPathway(): void {
  try {
    sessionStorage.removeItem(PENDING_PATHWAY_KEY);
  } catch {
    /* ignore */
  }
}

export function takeStudentOneDriveIntent(): 'academy' | 'personal' | null {
  try {
    const value = sessionStorage.getItem(STUDENT_ONEDRIVE_INTENT_KEY);
    sessionStorage.removeItem(STUDENT_ONEDRIVE_INTENT_KEY);
    return value === 'academy' || value === 'personal' ? value : null;
  } catch {
    return null;
  }
}

function clip(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function isProvider(value: unknown): value is AcademyProvider {
  return value === 'googleDrive' || value === 'oneDrive';
}

export function academyPathway(input: {
  provider: AcademyProvider;
  folderId: string;
  folderName: string;
  gymName?: string;
}): AcademyPathway | null {
  const folderId = input.folderId.trim();
  if (!isProvider(input.provider) || !FOLDER_ID.test(folderId)) return null;
  return {
    v: ACADEMY_PATHWAY_VERSION,
    provider: input.provider,
    folderId,
    folderName: clip(input.folderName, 120) || 'Academy folder',
    gymName: clip(input.gymName ?? '', 80),
  };
}

function encodeToken(pathway: AcademyPathway): string {
  const bytes = new TextEncoder().encode(JSON.stringify(pathway));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeToken(token: string): AcademyPathway | null {
  const padded = token.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  try {
    const binary = atob(padded + pad);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<AcademyPathway>;
    if (parsed.v !== ACADEMY_PATHWAY_VERSION || !isProvider(parsed.provider)) return null;
    return academyPathway({
      provider: parsed.provider,
      folderId: parsed.folderId ?? '',
      folderName: parsed.folderName ?? '',
      gymName: parsed.gymName ?? '',
    });
  } catch {
    return null;
  }
}

/** Advantage link a student can open, paste, or scan from a QR. */
export function academyPathwayUrl(pathway: AcademyPathway, origin: string): string {
  const root = origin.trim().replace(/\/$/, '') || '';
  const base = root ? `${root}/student/connections` : '/student/connections';
  return `${base}?academy=${encodeURIComponent(encodeToken(pathway))}`;
}

export function googleFolderIdFromUrl(value: string): string | null {
  const match = value.match(/\/folders\/([A-Za-z0-9_-]{8,})/) ?? value.match(/[?&]id=([A-Za-z0-9_-]{8,})/);
  return match?.[1] ?? null;
}

/**
 * Accepts an Advantage academy link, the token on its own, or a Google Drive
 * folder URL. A Drive URL has no gym name until the folder is opened.
 */
export function parseAcademyInput(value: string): AcademyPathway | null {
  const text = value.trim();
  if (!text) return null;
  try {
    const url = new URL(text, 'https://advantage.local');
    const token = url.searchParams.get('academy');
    if (token) {
      const parsed = decodeToken(token);
      if (parsed) return parsed;
    }
  } catch {
    /* a bare token or folder id still gets a chance below */
  }
  const bare = decodeToken(text);
  if (bare) return bare;
  const folderId = googleFolderIdFromUrl(text);
  if (!folderId) return null;
  return academyPathway({ provider: 'googleDrive', folderId, folderName: 'Academy folder', gymName: '' });
}

export function academyFolderWebUrl(pathway: Pick<AcademyPathway, 'provider' | 'folderId'>): string | null {
  if (pathway.provider === 'googleDrive') return driveFolderWebUrl(pathway.folderId);
  return null;
}

export function providerLabel(provider: AcademyProvider): string {
  return provider === 'oneDrive' ? 'OneDrive' : 'Google Drive';
}

function readLink(raw: string | null, role: StudentDriveRole): StudentDriveLink | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StudentDriveLink>;
    const pathway = academyPathway({
      provider: parsed.provider as AcademyProvider,
      folderId: parsed.folderId ?? '',
      folderName: parsed.folderName ?? '',
      gymName: parsed.gymName ?? '',
    });
    if (!pathway || parsed.role !== role) return null;
    return {
      role,
      provider: pathway.provider,
      folderId: pathway.folderId,
      folderName: pathway.folderName,
      accountLabel: typeof parsed.accountLabel === 'string' ? clip(parsed.accountLabel, 120) : null,
      gymName: pathway.gymName,
    };
  } catch {
    return null;
  }
}

export function loadAcademyLink(storage: Pick<MemoryStore, 'getItem'>): StudentDriveLink | null {
  return readLink(storage.getItem(ACADEMY_BINDING_KEY), 'academy');
}

export function loadPersonalDrive(storage: Pick<MemoryStore, 'getItem'>): StudentDriveLink | null {
  return readLink(storage.getItem(PERSONAL_DRIVE_KEY), 'personal');
}

export function saveStudentDriveLink(storage: MemoryStore, link: StudentDriveLink): StudentDriveLink {
  const pathway = academyPathway(link);
  if (!pathway) throw new Error('That folder link is not valid.');
  const saved: StudentDriveLink = {
    role: link.role,
    provider: pathway.provider,
    folderId: pathway.folderId,
    folderName: pathway.folderName,
    accountLabel: link.accountLabel ? clip(link.accountLabel, 120) : null,
    gymName: pathway.gymName,
  };
  const key = link.role === 'academy' ? ACADEMY_BINDING_KEY : PERSONAL_DRIVE_KEY;
  storage.setItem(key, JSON.stringify(saved));
  return saved;
}

export function clearStudentDriveLink(storage: MemoryStore, role: StudentDriveRole): void {
  const key = role === 'academy' ? ACADEMY_BINDING_KEY : PERSONAL_DRIVE_KEY;
  if (storage.removeItem) storage.removeItem(key);
  else storage.setItem(key, '');
}

type FetchLike = typeof fetch;

export async function probeGoogleFolder(
  token: string,
  folderId: string,
  fetcher: FetchLike = fetch,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const response = await fetcher(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return { ok: false, error: ACADEMY_ACCESS_ERROR };
  const body = (await response.json()) as { name?: string; mimeType?: string };
  if (body.mimeType && body.mimeType !== 'application/vnd.google-apps.folder') {
    return { ok: false, error: 'That link is not a Google Drive folder.' };
  }
  return { ok: true, name: body.name?.trim() || 'Academy folder' };
}

export async function probeOneDriveFolder(
  token: string,
  folderId: string,
  fetcher: FetchLike = fetch,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const response = await fetcher(
    `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folderId)}?$select=id,name,folder`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return { ok: false, error: ACADEMY_ACCESS_ERROR };
  const body = (await response.json()) as { name?: string; folder?: unknown };
  if (!body.folder) return { ok: false, error: 'That link is not a OneDrive folder.' };
  return { ok: true, name: body.name?.trim() || 'Academy folder' };
}

/** Best-effort. A refusal leaves the coach on the provider's own Share button. */
export async function shareGoogleFolderWithAnyone(
  token: string,
  folderId: string,
  fetcher: FetchLike = fetch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetcher(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/permissions`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'writer', type: 'anyone' }),
    },
  );
  if (response.ok || response.status === 409) return { ok: true };
  return { ok: false, error: ACADEMY_SHARE_FALLBACK };
}

export async function shareOneDriveFolderWithAnyone(
  token: string,
  folderId: string,
  fetcher: FetchLike = fetch,
): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  const response = await fetcher(
    `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folderId)}/createLink`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'edit', scope: 'anonymous' }),
    },
  );
  if (!response.ok) return { ok: false, error: ACADEMY_SHARE_FALLBACK };
  const body = (await response.json()) as { link?: { webUrl?: string } };
  return { ok: true, url: body.link?.webUrl ?? null };
}
