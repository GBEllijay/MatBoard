/**
 * Preview-only 2036 student journal.
 * Sample academy index and lesson plan live here so the page works with no academy link.
 * Students can add to a local list. Nothing in this module writes the academy index.
 */

export const PREVIEW_JOURNAL_PATH = '/preview/journal-2036';
export const PREVIEW_BANNER = 'Preview only — not live journal. Draft for owner review.';

export const MAT_KINDS = ['class', 'openMat', 'misc', 'untimed'] as const;
export type MatKind = (typeof MAT_KINDS)[number];

export const MAT_KIND_LABEL: Record<MatKind, string> = {
  class: 'Class',
  openMat: 'Open mat',
  misc: 'Miscellaneous',
  untimed: 'Untimed',
};

export type IndexSource = 'academy' | 'local';

export type IndexItem = {
  id: string;
  name: string;
  category: string;
  source: IndexSource;
};

export type DrillRow = {
  id: string;
  drill: string;
  learned: string;
  fundamentalId: string;
};

export type CardMark = 'none' | 'injury' | 'break' | 'hiatus';
export type HiatusReason = 'medical' | 'other';

export type PreviewEntry = {
  date: string;
  className: string;
  partners: string;
  howItWent: string;
  matKind: MatKind;
  minutes: number;
  miscNote: string;
  countTowardAnalytics: boolean;
  mark: CardMark;
  injuryArea: string;
  injuryZone: string;
  injuryNote: string;
  breakNote: string;
  hiatusReason: HiatusReason;
  hiatusStart: string;
  hiatusEnd: string;
  hiatusNote: string;
  drills: DrillRow[];
};

export type LessonBlock = { name: string; minutes: number };

export type SampleLessonPlan = {
  title: string;
  coach: string;
  date: string;
  className: string;
  blocks: readonly LessonBlock[];
};

export type PreviewState = {
  entry: PreviewEntry;
  academyIndex: IndexItem[];
  localIndex: IndexItem[];
};

export const INJURY_ZONES = ['Shoulder', 'Elbow', 'Knee', 'Ribs', 'Back', 'Neck'] as const;

/** Friday sample. Block minutes sum to the duration that prefills mat time. */
export const SAMPLE_LESSON_PLAN: SampleLessonPlan = {
  title: 'Friday fundamentals',
  coach: 'Coach sample',
  date: '2026-11-06',
  className: 'Fundamentals',
  blocks: [
    { name: 'Warm-up', minutes: 5 },
    { name: 'Scissor sweep', minutes: 15 },
    { name: 'Knee slice pass', minutes: 15 },
    { name: 'Positional rounds', minutes: 10 },
  ],
};

export function lessonExpectedMinutes(plan: SampleLessonPlan = SAMPLE_LESSON_PLAN): number {
  return plan.blocks.reduce((sum, block) => sum + block.minutes, 0);
}

const ACADEMY_SEED: readonly IndexItem[] = [
  { id: 'sweep.scissor', name: 'Scissor sweep', category: 'Sweeps', source: 'academy' },
  { id: 'sweep.hip-bump', name: 'Hip bump sweep', category: 'Sweeps', source: 'academy' },
  { id: 'pass.knee-slice', name: 'Knee slice pass', category: 'Passes', source: 'academy' },
  { id: 'sub.kimura', name: 'Kimura', category: 'Submissions', source: 'academy' },
  { id: 'sub.armbar-guard', name: 'Armbar from guard', category: 'Submissions', source: 'academy' },
  { id: 'escape.mount', name: 'Mount escape', category: 'Escapes', source: 'academy' },
  { id: 'pos.closed-guard', name: 'Closed guard', category: 'Positions', source: 'academy' },
  { id: 'move.shrimp', name: 'Shrimp', category: 'Movement', source: 'academy' },
];

const LOCAL_SEED: readonly IndexItem[] = [
  { id: 'local.knee-shield-detail', name: 'Knee shield detail', category: 'My list', source: 'local' },
];

function seedEntry(): PreviewEntry {
  return {
    date: SAMPLE_LESSON_PLAN.date,
    className: SAMPLE_LESSON_PLAN.className,
    partners: 'Alex, Sam',
    howItWent: 'Felt smoother once I kept the knee shield.',
    matKind: 'class',
    minutes: lessonExpectedMinutes(),
    miscNote: '',
    countTowardAnalytics: false,
    mark: 'none',
    injuryArea: '',
    injuryZone: '',
    injuryNote: '',
    breakNote: '',
    hiatusReason: 'other',
    hiatusStart: '',
    hiatusEnd: '',
    hiatusNote: '',
    drills: [
      {
        id: 'd1',
        drill: 'Scissor sweep',
        learned: 'Pull the collar, then chop the knee.',
        fundamentalId: 'sweep.scissor',
      },
      { id: 'd2', drill: 'Knee slice pass', learned: '', fundamentalId: '' },
      { id: 'd3', drill: '', learned: '', fundamentalId: '' },
    ],
  };
}

export function seedPreview(): PreviewState {
  return {
    entry: seedEntry(),
    academyIndex: ACADEMY_SEED.map((item) => ({ ...item })),
    localIndex: LOCAL_SEED.map((item) => ({ ...item })),
  };
}

export function matTimeReadout(entry: Pick<PreviewEntry, 'matKind' | 'minutes'>): string {
  if (entry.matKind === 'untimed') return 'Untimed';
  return `${MAT_KIND_LABEL[entry.matKind]} · ${entry.minutes} min`;
}

export function fundamentalName(academy: readonly IndexItem[], id: string): string {
  if (!id) return '';
  return academy.find((item) => item.id === id)?.name ?? '';
}

/** Opt-in. Linked drills name the fundamentals this mat time can count toward. */
export function analyticsLine(entry: PreviewEntry, academy: readonly IndexItem[]): string {
  if (!entry.countTowardAnalytics) return 'This entry stays off comprehensive analytics.';
  const names: string[] = [];
  for (const row of entry.drills) {
    const name = fundamentalName(academy, row.fundamentalId);
    if (name && !names.includes(name)) names.push(name);
  }
  if (!names.length) return 'Opted in. Link a drill to a fundamental so mat time can count toward belt progress.';
  return `Mat time counts toward comprehensive analytics and belt progress: ${names.join(', ')}.`;
}

export function learnedSuggestions(query: string, academy: readonly IndexItem[], local: readonly IndexItem[]): IndexItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return [...academy, ...local].filter((item) => item.name.toLowerCase().includes(q)).slice(0, 8);
}

/** True when the typed line is new. An academy name cannot be written back, so it is not "addable". */
export function canAddLocal(name: string, academy: readonly IndexItem[], local: readonly IndexItem[]): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2) return false;
  const key = trimmed.toLowerCase();
  if (academy.some((item) => item.name.toLowerCase() === key)) return false;
  if (local.some((item) => item.name.toLowerCase() === key)) return false;
  return true;
}

/** Returns the local list only. The academy index is consulted and never replaced. */
export function addLocalItem(local: readonly IndexItem[], name: string, academy: readonly IndexItem[]): IndexItem[] {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!canAddLocal(trimmed, academy, local)) return local.map((item) => ({ ...item }));
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'note';
  return [...local.map((item) => ({ ...item })), { id: `local.${slug}.${local.length + 1}`, name: trimmed, category: 'My list', source: 'local' }];
}

export function linkDrill(drills: readonly DrillRow[], drillId: string, fundamentalId: string): DrillRow[] {
  return drills.map((row) => (row.id === drillId ? { ...row, fundamentalId } : { ...row }));
}

export function filterAcademy(academy: readonly IndexItem[], query: string): IndexItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return academy.map((item) => ({ ...item }));
  return academy
    .filter((item) => item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q))
    .map((item) => ({ ...item }));
}

export function nextDrillId(drills: readonly DrillRow[]): string {
  const used = new Set(drills.map((row) => row.id));
  let n = drills.length + 1;
  while (used.has(`d${n}`)) n += 1;
  return `d${n}`;
}

export function stepMinutes(minutes: number, delta: number): number {
  return Math.min(180, Math.max(15, minutes + delta));
}
