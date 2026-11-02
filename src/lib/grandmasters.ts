/**
 * Five grandmasters for the kids cheer.
 * Face boxes are percentages of the shared 845×1200 canvas (pixels with alpha > 40, chin included).
 * Classic keeps the previous art's box: x 22–72%, y 2–42%.
 * A–D were measured on the cutouts. D's box also covers the nod frame.
 */

export const GRANDMASTER_IDS = ['classic', 'a', 'b', 'c', 'd'] as const;

export type GrandmasterId = (typeof GRANDMASTER_IDS)[number];

export type GrandmasterBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type Grandmaster = {
  id: GrandmasterId;
  src: string;
  /** Second frame for the nod. Absent on masters who hold one pose. */
  nodSrc?: string;
  /** Head the speech bubble must miss. */
  face: GrandmasterBox;
  /** Raised hands the speech bubble must miss, when they sit beside the head. */
  avoid: readonly GrandmasterBox[];
};

export const GRANDMASTERS: readonly Grandmaster[] = [
  {
    id: 'classic',
    src: '/assets/kids/grandmaster-classic.webp',
    face: { left: 22, top: 2, width: 50, height: 40 },
    avoid: [],
  },
  {
    id: 'a',
    src: '/assets/kids/grandmaster-a.webp',
    face: { left: 25, top: 0, width: 48, height: 33 },
    avoid: [
      { left: 0, top: 32, width: 36, height: 26 },
      { left: 70, top: 33, width: 30, height: 25 },
    ],
  },
  {
    id: 'b',
    src: '/assets/kids/grandmaster-b.webp',
    face: { left: 26, top: 0, width: 42, height: 36 },
    avoid: [],
  },
  {
    id: 'c',
    src: '/assets/kids/grandmaster-c.webp',
    face: { left: 30, top: 0, width: 42, height: 32 },
    avoid: [{ left: 4, top: 27, width: 28, height: 16 }],
  },
  {
    id: 'd',
    src: '/assets/kids/grandmaster-d.webp',
    nodSrc: '/assets/kids/grandmaster-d-nod.webp',
    face: { left: 28, top: 0, width: 46, height: 36 },
    avoid: [],
  },
];

const BY_ID = new Map(GRANDMASTERS.map((master) => [master.id, master]));

export function isGrandmasterId(value: unknown): value is GrandmasterId {
  return typeof value === 'string' && BY_ID.has(value as GrandmasterId);
}

export function grandmasterById(id: GrandmasterId): Grandmaster {
  const master = BY_ID.get(id);
  if (!master) return GRANDMASTERS[0];
  return master;
}

/**
 * Random master other than `previous`. A null previous may be any of the five.
 * `random` returns a number in [0, 1).
 */
export function pickGrandmaster(previous: GrandmasterId | null, random: () => number = Math.random): GrandmasterId {
  const pool = previous ? GRANDMASTER_IDS.filter((id) => id !== previous) : GRANDMASTER_IDS;
  const roll = random();
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(roll * pool.length)));
  return pool[index];
}

function mixCheerKey(cheerKey: string): number {
  let hash = 2166136261;
  for (let i = 0; i < cheerKey.length; i += 1) {
    hash ^= cheerKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let h = hash >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Same previous master and cheer key always resolve to the same next master.
 * After the first cheer, step two places around the five. That step is coprime
 * with the set, so every master appears before one repeats, and nearby bout
 * numbers cannot collapse onto a two-master loop.
 */
export function grandmasterForCheer(previous: GrandmasterId | null, cheerKey: string): GrandmasterId {
  if (!previous) return GRANDMASTER_IDS[mixCheerKey(cheerKey) % GRANDMASTER_IDS.length];
  const start = GRANDMASTER_IDS.indexOf(previous);
  return GRANDMASTER_IDS[(start + 2) % GRANDMASTER_IDS.length];
}

/**
 * Master for this cheer. A cheer already stored under `cheerKey` stays put.
 * A new key picks again and skips the master who just appeared.
 */
export function resolveGrandmasterId(
  prefs: { masterId: GrandmasterId | null; cheerKey: string | null },
  cheerKey: string,
): GrandmasterId {
  if (prefs.cheerKey === cheerKey && prefs.masterId) return prefs.masterId;
  return grandmasterForCheer(prefs.masterId, cheerKey);
}

const LAST_KEY = 'matboard.grandmaster.last';

export function readLastGrandmasterId(): GrandmasterId | null {
  try {
    const value = localStorage.getItem(LAST_KEY);
    return isGrandmasterId(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeLastGrandmasterId(id: GrandmasterId): void {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    /* a private window can refuse the write; the cheer still shows */
  }
}
