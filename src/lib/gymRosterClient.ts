/** Advantage Cloud gym roster: thin fetch helpers for /api/gym/roster. */

import { readCloudBearer } from './advantageCloudMedia.ts';
import type { RosterBackup, RosterMergeReport } from './rosterBackup.ts';

export type GymRosterRole = { canRead: boolean; canSubmit: boolean; canApprove: boolean; isOwner: boolean };

export type GymRosterPending = {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  submittedBy: { kind: 'owner' | 'seat'; seatId: string; preset: string | null };
  summary: { students: number; names: string[] };
};

export type GymRosterState = { role: GymRosterRole; trustMode: boolean; master: RosterBackup | null; pending: GymRosterPending[] };

type Fetcher = typeof fetch;

function headers(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

async function body<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Null when this license or seat has no Advantage Cloud gym roster. The roster tools then stay hidden. */
export async function fetchGymRosterState(fetcher: Fetcher = fetch, token = readCloudBearer()): Promise<GymRosterState | null> {
  if (!token) return null;
  try {
    const response = await fetcher('/api/gym/roster?op=state', { headers: headers(token) });
    if (!response.ok) return null;
    const data = await body<GymRosterState & { ok?: boolean }>(response);
    return data?.role?.canRead ? { role: data.role, trustMode: data.trustMode === true, master: data.master ?? null, pending: data.pending ?? [] } : null;
  } catch {
    return null;
  }
}

async function post<T>(op: string, payload: unknown, fetcher: Fetcher, token: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await fetcher(`/api/gym/roster?op=${op}`, {
      method: 'POST',
      headers: { ...headers(token), 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await body<T & { error?: string }>(response);
    if (!response.ok) return { ok: false, error: data?.error ?? 'That did not save. Try again.' };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: 'Advantage Cloud did not answer. Try again.' };
  }
}

export function submitGymRoster(backup: RosterBackup, fetcher: Fetcher = fetch, token = readCloudBearer()) {
  return post<{ applied: boolean; pending?: boolean; report?: RosterMergeReport }>('submit', { backup }, fetcher, token);
}

export function decideGymRoster(id: string, decision: 'approve' | 'reject', fetcher: Fetcher = fetch, token = readCloudBearer()) {
  return post<{ status: string; report: RosterMergeReport | null }>('decide', { id, decision }, fetcher, token);
}

export function setGymRosterTrust(on: boolean, fetcher: Fetcher = fetch, token = readCloudBearer()) {
  return post<{ trustMode: boolean }>('trust', { on }, fetcher, token);
}

/** This author's private notes, filled into their own cloud file. Never into the shared roster. */
export function saveGymRosterPrivateNotes(notes: Record<string, string>, fetcher: Fetcher = fetch, token = readCloudBearer()) {
  return post<{ added: number }>('private', { notes }, fetcher, token);
}

export async function fetchGymRosterPrivateNotes(fetcher: Fetcher = fetch, token = readCloudBearer()): Promise<{ author: string; notes: Record<string, Record<string, string>> } | null> {
  if (!token) return null;
  try {
    const response = await fetcher('/api/gym/roster?op=private', { headers: headers(token) });
    if (!response.ok) return null;
    return await body<{ author: string; notes: Record<string, Record<string, string>> }>(response);
  } catch {
    return null;
  }
}
