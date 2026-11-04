/**
 * Roster card look: a gym-level choice of STYLE and SKIN.
 *
 * - Style: Coach Clipboard (D, default) or Fighter Card (C).
 * - Skin: Dark (default, the navy look) or Light (warm paper).
 *
 * Every combination shows the same fields; only layout tokens and colours change.
 * Saved beside the gym name on the coach device (gym settings are device-local today),
 * included in the coach's full backup, and carried on coach sends as `gym.cardLook`
 * so the student's own card view follows the gym's choice.
 */

export type CardStyle = 'clipboard' | 'fighter';
export type CardSkin = 'dark' | 'light';
export type CardLook = { style: CardStyle; skin: CardSkin };
/** Wire form on `CoachGymBrand.cardLook`. */
export type CardLookCode = `${CardStyle}-${CardSkin}`;

/** Legacy key from the first card build. Read as a fallback only. */
export const CARD_LOOK_KEY = 'matboard.gymCardLook.v1';
/**
 * The look is saved in the roster card file's `settings.cardLook`, so the one roster
 * backup (advantage-roster-backup, cardSettings) carries it to a new device.
 */
const ROSTER_CARD_FILE_KEY = 'matboard.rosterCard.v1';
export const CARD_LOOK_EVENT = 'matboard-card-look';
export const DEFAULT_CARD_LOOK: CardLook = { style: 'clipboard', skin: 'dark' };
export const CARD_STYLES: readonly { id: CardStyle; label: string }[] = [
  { id: 'clipboard', label: 'Coach Clipboard' },
  { id: 'fighter', label: 'Fighter Card' },
];
export const CARD_SKINS: readonly { id: CardSkin; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
];
export const CARD_LOOKS: readonly CardLook[] = [
  { style: 'clipboard', skin: 'dark' },
  { style: 'clipboard', skin: 'light' },
  { style: 'fighter', skin: 'dark' },
  { style: 'fighter', skin: 'light' },
];

type MemoryStore = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

function defaultStorage(): MemoryStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function cleanCardLook(raw: unknown): CardLook {
  const row = raw && typeof raw === 'object' ? (raw as Partial<CardLook>) : {};
  return {
    style: row.style === 'fighter' ? 'fighter' : 'clipboard',
    skin: row.skin === 'light' ? 'light' : 'dark',
  };
}

export function cardLookCode(look: CardLook): CardLookCode {
  return `${look.style}-${look.skin}`;
}

export function parseCardLookCode(value: unknown): CardLook | null {
  if (typeof value !== 'string') return null;
  const [style, skin] = value.split('-');
  if ((style !== 'clipboard' && style !== 'fighter') || (skin !== 'dark' && skin !== 'light')) return null;
  return { style, skin };
}

export function readCardLook(storage: Pick<MemoryStore, 'getItem'> | null = defaultStorage()): CardLook {
  try {
    const file = JSON.parse(storage?.getItem(ROSTER_CARD_FILE_KEY) ?? 'null') as { settings?: { cardLook?: unknown } } | null;
    if (file && typeof file === 'object' && file.settings?.cardLook) return cleanCardLook(file.settings.cardLook);
  } catch {
    /* fall through to the legacy key */
  }
  try {
    const text = storage?.getItem(CARD_LOOK_KEY);
    return text ? cleanCardLook(JSON.parse(text)) : { ...DEFAULT_CARD_LOOK };
  } catch {
    return { ...DEFAULT_CARD_LOOK };
  }
}

export function writeCardLook(look: CardLook, storage: MemoryStore | null = defaultStorage()): CardLook {
  const clean = cleanCardLook(look);
  try {
    if (storage) {
      let file: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(storage.getItem(ROSTER_CARD_FILE_KEY) ?? 'null');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) file = parsed as Record<string, unknown>;
      } catch {
        file = {};
      }
      const settings = file.settings && typeof file.settings === 'object' ? (file.settings as Record<string, unknown>) : {};
      storage.setItem(ROSTER_CARD_FILE_KEY, JSON.stringify({ cards: {}, ...file, settings: { ...settings, cardLook: clean } }));
    }
  } catch {
    /* quota / private mode */
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(CARD_LOOK_EVENT));
  }
  return clean;
}

export function subscribeCardLook(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === CARD_LOOK_KEY) fn();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CARD_LOOK_EVENT, fn);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CARD_LOOK_EVENT, fn);
  };
}

/**
 * The student's card follows the gym: the newest accepted coach update that carried
 * a look wins. With none yet, the default (Coach Clipboard, Dark).
 */
export function studentCardLook(
  entries: readonly { cardLook?: string; issuedOn?: string; date?: string }[],
): CardLook {
  const dated = entries
    .map((row) => ({ look: parseCardLookCode(row.cardLook), on: row.issuedOn ?? row.date ?? '' }))
    .filter((row): row is { look: CardLook; on: string } => row.look !== null);
  if (!dated.length) return { ...DEFAULT_CARD_LOOK };
  // Stable: later entries win ties, matching accept order.
  let best = dated[0];
  for (const row of dated) if (row.on >= best.on) best = row;
  return best.look;
}
