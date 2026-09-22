/** Coach class plan. One plan on this device — no cloud, no history. */

export const TRAINING_NOTES_STORAGE_KEY = 'matboard.coach.trainingNotes.v1';
/** Previous free-text jot. Read once into Intro, then removed. */
export const LEGACY_TRAINING_NOTES_STORAGE_KEY = 'matboard.trainingNotes.v1';

export const COACH_NAME_MAX = 80;
export const INTRO_MAX = 8_000;
export const WARMUP_NOTE_MAX = 1_500;
export const COOLDOWN_NOTE_MAX = 1_500;
export const CLOSING_MAX = 2_000;
export const TECHNIQUE_TITLE_MAX = 120;
export const TECHNIQUE_NOTES_MAX = 2_000;
export const MIN_TECHNIQUES = 3;
export const MAX_TECHNIQUES = 20;

export type TechniqueBlock = {
  id: string;
  /**
   * Stable hook for a later Daily Training Videos link.
   * Unused by this screen — no video UI.
   */
  slotId: string;
  title: string;
  notes: string;
  waterBreak: boolean;
};

export type TrainingNotesPlan = {
  version: 1;
  coachName: string;
  intro: string;
  warmupNote: string;
  techniques: TechniqueBlock[];
  cooldownNote: string;
  closing: string;
};

let idSeq = 0;

function createId(prefix: string): string {
  idSeq += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${idSeq.toString(36)}-${rand}`;
}

function clampText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function createTechnique(): TechniqueBlock {
  return {
    id: createId('tech'),
    slotId: createId('slot'),
    title: '',
    notes: '',
    waterBreak: false,
  };
}

export function emptyPlan(): TrainingNotesPlan {
  return {
    version: 1,
    coachName: '',
    intro: '',
    warmupNote: '',
    techniques: [createTechnique(), createTechnique(), createTechnique()],
    cooldownNote: '',
    closing: '',
  };
}

function sanitizeTechnique(value: unknown): { block: TechniqueBlock; repaired: boolean } {
  const raw = asRecord(value);
  let repaired = !raw;
  const idValue = raw && typeof raw.id === 'string' ? raw.id.trim() : '';
  const slotValue = raw && typeof raw.slotId === 'string' ? raw.slotId.trim() : '';
  const id = idValue ? idValue.slice(0, 80) : createId('tech');
  const slotId = slotValue
    ? slotValue.slice(0, 80)
    : idValue
      ? `slot-${idValue.slice(0, 70)}`
      : createId('slot');
  if (!idValue || !slotValue) repaired = true;
  if (raw && raw.waterBreak !== true && raw.waterBreak !== false) repaired = true;
  const title = clampText(raw?.title, TECHNIQUE_TITLE_MAX);
  const notes = clampText(raw?.notes, TECHNIQUE_NOTES_MAX);
  if (raw && (raw.title !== title || raw.notes !== notes)) repaired = true;
  return {
    repaired,
    block: {
      id,
      slotId,
      title,
      notes,
      waterBreak: raw?.waterBreak === true,
    },
  };
}

function uniquify(techniques: TechniqueBlock[]): boolean {
  const ids = new Set<string>();
  const slots = new Set<string>();
  let changed = false;
  for (const tech of techniques) {
    if (ids.has(tech.id)) {
      tech.id = createId('tech');
      changed = true;
    }
    ids.add(tech.id);
    if (slots.has(tech.slotId)) {
      tech.slotId = createId('slot');
      changed = true;
    }
    slots.add(tech.slotId);
  }
  return changed;
}

export function sanitizePlan(input: unknown): { plan: TrainingNotesPlan; repaired: boolean } {
  const raw = asRecord(input);
  let repaired = !raw || raw.version !== 1;
  const source = Array.isArray(raw?.techniques) ? raw.techniques : [];
  if (!raw || !Array.isArray(raw.techniques) || source.length < MIN_TECHNIQUES || source.length > MAX_TECHNIQUES) {
    repaired = true;
  }
  const techniques = source.slice(0, MAX_TECHNIQUES).map((item) => {
    const next = sanitizeTechnique(item);
    if (next.repaired) repaired = true;
    return next.block;
  });
  while (techniques.length < MIN_TECHNIQUES) {
    techniques.push(createTechnique());
    repaired = true;
  }
  if (uniquify(techniques)) repaired = true;

  const coachName = clampText(raw?.coachName, COACH_NAME_MAX);
  const intro = clampText(raw?.intro, INTRO_MAX);
  const warmupNote = clampText(raw?.warmupNote, WARMUP_NOTE_MAX);
  const cooldownNote = clampText(raw?.cooldownNote, COOLDOWN_NOTE_MAX);
  const closing = clampText(raw?.closing, CLOSING_MAX);
  if (
    raw &&
    (raw.coachName !== coachName ||
      raw.intro !== intro ||
      raw.warmupNote !== warmupNote ||
      raw.cooldownNote !== cooldownNote ||
      raw.closing !== closing)
  ) {
    repaired = true;
  }

  return {
    repaired,
    plan: {
      version: 1,
      coachName,
      intro,
      warmupNote,
      techniques,
      cooldownNote,
      closing,
    },
  };
}

function writePlan(plan: TrainingNotesPlan): TrainingNotesPlan | null {
  try {
    localStorage.setItem(TRAINING_NOTES_STORAGE_KEY, JSON.stringify(plan));
    return plan;
  } catch {
    return null;
  }
}

export function saveTrainingNotes(plan: TrainingNotesPlan): TrainingNotesPlan {
  const { plan: next } = sanitizePlan(plan);
  return writePlan(next) ?? next;
}

function readLegacyIntro(): string | null {
  try {
    const raw = localStorage.getItem(LEGACY_TRAINING_NOTES_STORAGE_KEY);
    if (typeof raw !== 'string') return null;
    const text = raw.slice(0, INTRO_MAX);
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

export function loadTrainingNotes(): TrainingNotesPlan {
  try {
    const raw = localStorage.getItem(TRAINING_NOTES_STORAGE_KEY);
    if (typeof raw === 'string' && raw.trim()) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
      if (parsed) {
        const { plan, repaired } = sanitizePlan(parsed);
        if (repaired) writePlan(plan);
        return plan;
      }
    }
  } catch {
    /* fall through */
  }

  const legacy = readLegacyIntro();
  if (!legacy) return emptyPlan();

  const plan = emptyPlan();
  plan.intro = legacy.slice(0, INTRO_MAX);
  const saved = writePlan(plan);
  if (saved) {
    try {
      localStorage.removeItem(LEGACY_TRAINING_NOTES_STORAGE_KEY);
    } catch {
      /* keep the legacy jot if the new key could not be confirmed */
    }
  }
  return saved ?? plan;
}

export function addTechnique(plan: TrainingNotesPlan): TrainingNotesPlan {
  if (plan.techniques.length >= MAX_TECHNIQUES) return plan;
  return {
    ...plan,
    techniques: [...plan.techniques, createTechnique()],
  };
}

/** Drop a block only after the first three. Earlier blocks stay. */
export function removeTechnique(plan: TrainingNotesPlan, id: string): TrainingNotesPlan {
  const index = plan.techniques.findIndex((tech) => tech.id === id);
  if (index < MIN_TECHNIQUES) return plan;
  return {
    ...plan,
    techniques: plan.techniques.filter((tech) => tech.id !== id),
  };
}
