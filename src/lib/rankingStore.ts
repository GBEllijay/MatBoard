/** On-device tournament result files for the Pro suite. Cloud sync comes later. */

export const RANKING_STORAGE_KEY = 'matboard.rankings.v1';
export const RANKING_NAME_MAX = 80;
export const RANKING_DIVISION_MAX = 80;
export const RANKING_RESULT_MAX = 80;
export const RANKING_ROW_MAX = 64;

export type RankingRow = {
  id: string;
  place: number;
  name: string;
  result: string;
};

export type RankingFile = {
  id: string;
  name: string;
  date: string;
  division: string;
  rows: RankingRow[];
  updatedAt: number;
};

export type RankingLibrary = {
  version: 1;
  files: RankingFile[];
};

export type RankingDraft = {
  name: string;
  date: string;
  division: string;
  rows: RankingRow[];
};

const listeners = new Set<() => void>();
let library: RankingLibrary = loadLibrary();
let seq = 0;

function createId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyRankingDraft(): RankingDraft {
  return { name: '', date: '', division: '', rows: [] };
}

export function draftFromFile(file: RankingFile): RankingDraft {
  return {
    name: file.name,
    date: file.date,
    division: file.division,
    rows: file.rows.map((row) => ({ ...row })),
  };
}

export function emptyRankingRow(place = 1): RankingRow {
  return { id: createId('p'), place, name: '', result: '' };
}

function clip(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function normalizeDate(value: string): string {
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
}

function normalizePlace(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(RANKING_ROW_MAX, Math.max(1, Math.round(value)));
}

export function normalizeRankingRow(raw: unknown): RankingRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<RankingRow>;
  const name = clip(typeof row.name === 'string' ? row.name : '', RANKING_NAME_MAX);
  if (!name) return null;
  return {
    id: typeof row.id === 'string' && row.id.trim() ? row.id.trim() : createId('p'),
    place: normalizePlace(typeof row.place === 'number' ? row.place : 1),
    name,
    result: clip(typeof row.result === 'string' ? row.result : '', RANKING_RESULT_MAX),
  };
}

export function normalizeRankingFile(raw: unknown, fallbackId: string): RankingFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<RankingFile>;
  const name = clip(typeof row.name === 'string' ? row.name : '', RANKING_NAME_MAX);
  if (!name) return null;
  const rows = Array.isArray(row.rows) ? row.rows.map(normalizeRankingRow).filter((item) => item != null) : [];
  rows.sort((a, b) => a.place - b.place || a.name.localeCompare(b.name));
  return {
    id: typeof row.id === 'string' && row.id.trim() ? row.id.trim() : fallbackId,
    name,
    date: normalizeDate(typeof row.date === 'string' ? row.date : ''),
    division: clip(typeof row.division === 'string' ? row.division : '', RANKING_DIVISION_MAX),
    rows: rows.slice(0, RANKING_ROW_MAX),
    updatedAt: typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt) ? row.updatedAt : 0,
  };
}

export function defaultRankingLibrary(): RankingLibrary {
  return { version: 1, files: [] };
}

export function normalizeRankingLibrary(raw: unknown): RankingLibrary {
  if (!raw || typeof raw !== 'object') return defaultRankingLibrary();
  const parsed = raw as Partial<RankingLibrary>;
  if (!Array.isArray(parsed.files)) return defaultRankingLibrary();
  const seen = new Set<string>();
  const files: RankingFile[] = [];
  parsed.files.forEach((row, index) => {
    const next = normalizeRankingFile(row, `rank-${index + 1}`);
    if (!next || seen.has(next.id)) return;
    seen.add(next.id);
    files.push(next);
  });
  files.sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
  return { version: 1, files };
}

function loadLibrary(): RankingLibrary {
  try {
    if (typeof localStorage === 'undefined') return defaultRankingLibrary();
    const raw = localStorage.getItem(RANKING_STORAGE_KEY);
    if (!raw) return defaultRankingLibrary();
    return normalizeRankingLibrary(JSON.parse(raw) as unknown);
  } catch {
    return defaultRankingLibrary();
  }
}

function persist(next: RankingLibrary): void {
  library = next;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(library));
    }
  } catch {
    /* quota / private mode */
  }
  listeners.forEach((fn) => fn());
}

export function getRankings(): RankingLibrary {
  return library;
}

export function subscribeRankings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initRankingSync(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('storage', (event) => {
    if (event.key !== RANKING_STORAGE_KEY) return;
    library = loadLibrary();
    listeners.forEach((fn) => fn());
  });
}

export function rankingFromDraft(draft: RankingDraft, id?: string): RankingFile | null {
  return normalizeRankingFile(
    {
      id,
      name: draft.name,
      date: draft.date,
      division: draft.division,
      rows: draft.rows,
      updatedAt: Date.now(),
    },
    id || createId('rank'),
  );
}

export function saveRankingFile(draft: RankingDraft, id?: string): RankingFile | null {
  const next = rankingFromDraft(draft, id);
  if (!next) return null;
  const files = library.files.some((row) => row.id === next.id)
    ? library.files.map((row) => (row.id === next.id ? next : row))
    : [next, ...library.files];
  persist(normalizeRankingLibrary({ version: 1, files }));
  return library.files.find((row) => row.id === next.id) ?? next;
}

export function removeRankingFile(id: string): void {
  persist({ version: 1, files: library.files.filter((row) => row.id !== id) });
}
