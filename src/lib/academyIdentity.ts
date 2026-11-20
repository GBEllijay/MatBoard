/**
 * Founders and Belt Chain lineage helpers for the academy Identity card.
 * Saved gymProfile.founders and gymProfile.lineage stay free text.
 * Parsing never throws away a saved name. Public preview data is separate
 * and stays franchise-clean (no academy brand names or source links).
 */

export const LINEAGE_STEP_CAP = 16;
export const LINEAGE_COLLAPSE_AFTER = 6;

export const TITLE_PREFIXES = [
  'Grand Master',
  'Grandmaster',
  'Professor',
  'Mestre',
  'Sensei',
  'Master',
  'Coach',
] as const;

export type LineageBelt = 'red' | 'coral' | 'black' | 'navy';

export type LineageStep = {
  raw: string;
  name: string;
  title: string;
  belt: LineageBelt;
};

export type FounderChip = {
  raw: string;
  name: string;
  initials: string;
};

export type FoundersStyle = 'nameplates' | 'plaque' | 'crest';
export type LineageStyle = 'rail' | 'cards' | 'ribbon';
export const FOUNDERS_STYLES = ['nameplates', 'plaque', 'crest'] as const;
export const LINEAGE_STYLES = ['rail', 'cards', 'ribbon'] as const;
export const DEFAULT_FOUNDERS_STYLE: FoundersStyle = 'crest';
export const DEFAULT_LINEAGE_STYLE: LineageStyle = 'ribbon';

export type SuggestedMaster = {
  name: string;
  title: string;
  teacher: string | null;
  teacherNote: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** Historical teaching catalog used for typeahead and auto-suggest. No URLs. */
export const HISTORICAL_MASTERS: readonly SuggestedMaster[] = [
  { name: 'Jigoro Kano', title: 'Professor', teacher: null, teacherNote: 'Founding teacher in this line' },
  { name: 'Mitsuyo Maeda', title: 'Master', teacher: 'Jigoro Kano', teacherNote: 'student of Jigoro Kano' },
  { name: 'Carlos Gracie Sr.', title: 'Grand Master', teacher: 'Mitsuyo Maeda', teacherNote: 'student of Mitsuyo Maeda' },
  { name: 'Carlos Gracie', title: 'Grand Master', teacher: 'Mitsuyo Maeda', teacherNote: 'student of Mitsuyo Maeda' },
  { name: 'Helio Gracie', title: 'Grand Master', teacher: 'Carlos Gracie Sr.', teacherNote: 'student of Carlos Gracie Sr.' },
  { name: 'Carlos Gracie Jr.', title: 'Master', teacher: 'Helio Gracie', teacherNote: 'student of Helio Gracie' },
  { name: 'Carlson Gracie', title: 'Master', teacher: 'Carlos Gracie Sr.', teacherNote: 'student of Carlos Gracie Sr.' },
  { name: 'Carlson Gracie Jr.', title: 'Master', teacher: 'Carlson Gracie', teacherNote: 'student of Carlson Gracie' },
  { name: 'Rolls Gracie', title: 'Master', teacher: 'Helio Gracie', teacherNote: 'student of Helio Gracie' },
  { name: 'Rickson Gracie', title: 'Grand Master', teacher: 'Helio Gracie', teacherNote: 'student of Helio Gracie' },
  { name: 'Rorion Gracie', title: 'Master', teacher: 'Helio Gracie', teacherNote: 'student of Helio Gracie' },
  { name: 'Relson Gracie', title: 'Master', teacher: 'Helio Gracie', teacherNote: 'student of Helio Gracie' },
  { name: 'Royler Gracie', title: 'Master', teacher: 'Helio Gracie', teacherNote: 'student of Helio Gracie' },
  { name: 'Royce Gracie', title: 'Master', teacher: 'Helio Gracie', teacherNote: 'student of Helio Gracie' },
  { name: 'Luiz França', title: 'Master', teacher: 'Mitsuyo Maeda', teacherNote: 'student of Mitsuyo Maeda' },
  { name: 'Oswaldo Fadda', title: 'Master', teacher: 'Luiz França', teacherNote: 'student of Luiz França' },
];

export function parseFounders(text: string): FounderChip[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.map((name) => ({ raw: name, name, initials: founderInitials(name) }));
}

export function founderInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) return words[0]!.charAt(0).toUpperCase();
  return `${words[0]!.charAt(0)}${words[words.length - 1]!.charAt(0)}`.toUpperCase();
}

export function formatFoundedDate(iso: string): { year: string; longLabel: string; estLabel: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return {
    year: match[1]!,
    longLabel: `Founded ${MONTHS[month - 1]} ${day}, ${year}`,
    estLabel: `Est. ${year}`,
  };
}

export function academyMonogram(gymName: string): string {
  const words = gymName.trim().split(/[\s-]+/).filter(Boolean);
  if (!words.length) return 'GYM';
  return words
    .map((word) => word.charAt(0).toUpperCase())
    .join('')
    .slice(0, 3);
}

export function parseLineageNames(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').trim();
  if (!raw) return [];
  if (/→|->|=>/.test(raw)) {
    return raw
      .split(/\s*(?:→|->|=>)\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (/(?:^|\s)>(?:\s|$)/.test(raw) || /^\s*[^,\n]+(\s*>\s*[^,\n]+)+\s*$/.test(raw)) {
    return raw
      .split(/\s*>\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return raw
    .split(/[\n,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function canonicalTitle(prefix: string): string {
  if (/^grand\s*master$/i.test(prefix)) return 'Grand Master';
  const found = TITLE_PREFIXES.find((item) => item.toLowerCase() === prefix.toLowerCase());
  return found ?? prefix;
}

export function parseLineageStep(raw: string): LineageStep {
  const text = raw.trim().replace(/\s+/g, ' ');
  let title = '';
  let name = text;
  for (const prefix of TITLE_PREFIXES) {
    const match = text.match(new RegExp(`^(${prefix})\\s+(.+)$`, 'i'));
    if (match?.[2]) {
      title = canonicalTitle(prefix);
      name = match[2].trim();
      break;
    }
  }
  return { raw, name: name || text, title, belt: inferBelt(name || text, title) };
}

export function parseLineage(text: string): LineageStep[] {
  return parseLineageNames(text).map(parseLineageStep);
}

export function normalizePersonName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function inferBelt(name: string, title: string): LineageBelt {
  const n = normalizePersonName(name);
  if (n === 'carlos gracie sr' || /(^|\s)gracie sr$/.test(n) || n === 'helio gracie') return 'red';
  if (n === 'carlos gracie jr' || /(^|\s)gracie jr$/.test(n)) return 'coral';
  const t = title.toLowerCase();
  if (t === 'grand master' || t === 'grandmaster') return 'red';
  if (t === 'master' || t === 'mestre') return 'coral';
  if (t === 'professor' || t === 'coach' || t === 'sensei' || /\bblack belt\b/i.test(name)) return 'black';
  return 'navy';
}

export function isRootAncestor(step: LineageStep): boolean {
  const n = normalizePersonName(step.name);
  if (n === 'carlos gracie sr' || /(^|\s)gracie sr$/.test(n)) return true;
  const t = step.title.toLowerCase();
  return t === 'grand master' || t === 'grandmaster';
}

export function isNearAncestor(step: LineageStep): boolean {
  const t = step.title.toLowerCase();
  return t === 'professor' || t === 'coach' || t === 'sensei';
}

/** True when saved text runs newest-to-oldest (professor first, grand master last). */
export function shouldReverseToRootFirst(steps: readonly LineageStep[]): boolean {
  if (steps.length < 2) return false;
  const first = steps[0]!;
  const last = steps[steps.length - 1]!;
  return isNearAncestor(first) && !isRootAncestor(first) && isRootAncestor(last);
}

export function displayLineageSteps(steps: readonly LineageStep[]): LineageStep[] {
  return shouldReverseToRootFirst(steps) ? [...steps].reverse() : [...steps];
}

export function formatLineageStep(step: Pick<LineageStep, 'title' | 'name'>): string {
  const name = step.name.trim();
  const title = step.title.trim();
  return title ? `${title} ${name}` : name;
}

export function serializeLineage(steps: readonly Pick<LineageStep, 'raw' | 'title' | 'name'>[]): string {
  return steps
    .map((step) => {
      const raw = step.raw?.trim();
      if (raw) return raw.replace(/\s+/g, ' ');
      return formatLineageStep(step);
    })
    .filter(Boolean)
    .join(',\n');
}

export function collapsedAncestorIndices(ancestorCount: number, expanded: boolean): { hidden: number; visible: number[] } {
  const visible = Array.from({ length: ancestorCount }, (_, index) => index);
  if (expanded || ancestorCount <= LINEAGE_COLLAPSE_AFTER) return { hidden: 0, visible };
  const hidden = ancestorCount - 3;
  return { hidden, visible: [0, 1, ancestorCount - 1] };
}

function findMaster(name: string): SuggestedMaster | undefined {
  const key = normalizePersonName(name);
  return HISTORICAL_MASTERS.find((row) => normalizePersonName(row.name) === key);
}

function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = Array.from({ length: cols }, (_, j) => (i === 0 ? j : 0));
    row[0] = i;
    return row;
  });
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      grid[i]![j] = Math.min(grid[i - 1]![j]! + 1, grid[i]![j - 1]! + 1, grid[i - 1]![j - 1]! + cost);
    }
  }
  return grid[a.length]![b.length]!;
}

/** Prefix, word, substring, or a single typo against the same-length name prefix ("Hell" → Helio). */
function nameSearchScore(name: string, query: string): number {
  const n = name.toLowerCase();
  const q = query;
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  if (n.split(/\s+/).some((word) => word.startsWith(q))) return 70;
  if (n.includes(q)) return 50;
  if (q.length >= 3) {
    const prefix = n.slice(0, q.length);
    if (prefix && editDistance(prefix, q) <= 1) return 60;
    const first = n.split(/\s+/)[0] ?? '';
    const firstPrefix = first.slice(0, q.length);
    if (firstPrefix && editDistance(firstPrefix, q) <= 1) return 60;
  }
  return 0;
}

export function searchMasters(query: string, limit = 6): SuggestedMaster[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const ranked = HISTORICAL_MASTERS.map((master) => ({
    master,
    score: nameSearchScore(master.name, q),
  })).filter((row) => row.score > 0);
  ranked.sort((a, b) => b.score - a.score || a.master.name.localeCompare(b.master.name));
  const seen = new Set<string>();
  const out: SuggestedMaster[] = [];
  for (const row of ranked) {
    const key = normalizePersonName(row.master.name);
    if (seen.has(key)) continue;
    // Prefer the Sr. form when both "Carlos Gracie" and "Carlos Gracie Sr." match a short query
    if (key === 'carlos gracie' && ranked.some((item) => normalizePersonName(item.master.name) === 'carlos gracie sr')) {
      continue;
    }
    seen.add(key);
    out.push(row.master);
    if (out.length >= limit) break;
  }
  return out;
}

export function suggestAncestors(fromName: string, already: readonly string[], generations = 3): SuggestedMaster[] {
  const have = new Set(already.map((name) => normalizePersonName(name)));
  const out: SuggestedMaster[] = [];
  let current = findMaster(fromName);
  for (let i = 0; i < generations; i += 1) {
    const teacherName = current?.teacher;
    if (!teacherName) break;
    const teacher = findMaster(teacherName);
    if (!teacher) break;
    const key = normalizePersonName(teacher.name);
    current = teacher;
    if (have.has(key)) continue;
    out.push(teacher);
    have.add(key);
  }
  return out;
}

export function remainingStepSlots(currentCount: number, cap = LINEAGE_STEP_CAP): number {
  return Math.max(0, cap - currentCount);
}

/** Look up a catalog row by name, or build a plain accepted step. */
export function masterFromName(name: string, title = ''): SuggestedMaster {
  return findMaster(name) ?? { name, title, teacher: null, teacherNote: '' };
}
