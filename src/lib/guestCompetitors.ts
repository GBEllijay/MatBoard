/**
 * Guest competitors are not Advantage students.
 * The archive stays on this device so the same card can be edited and reused.
 * Placing one on the competitor roster never links a student id and never sends a message.
 */

import { addStudent, getRoster, tagGuestCard, updateStudent, type Student } from './rosterStore.ts';

export const GUEST_ARCHIVE_KEY = 'matboard.guestCompetitors.v1';

export type GuestCompetitor = {
  id: string;
  name: string;
  belt: string;
  division: string;
  gym: string;
  note: string;
  /** Last event this card was used for. Empty until a coach types one. */
  lastEvent: string;
};

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function readGuest(value: unknown): GuestCompetitor | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<GuestCompetitor>;
  const name = clip(row.name, 80);
  const belt = clip(row.belt, 40);
  const id = clip(row.id, 80);
  if (!name || !belt || !id) return null;
  return {
    id,
    name,
    belt,
    division: clip(row.division, 80),
    gym: clip(row.gym, 80),
    note: clip(row.note, 500),
    lastEvent: clip(row.lastEvent, 80),
  };
}

export function loadGuests(storage: Pick<MemoryStore, 'getItem'>): GuestCompetitor[] {
  try {
    const raw = storage.getItem(GUEST_ARCHIVE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const guests: GuestCompetitor[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      const guest = readGuest(item);
      if (!guest || seen.has(guest.id)) continue;
      seen.add(guest.id);
      guests.push(guest);
    }
    return guests.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  } catch {
    return [];
  }
}

export function saveGuests(storage: MemoryStore, guests: readonly GuestCompetitor[]): void {
  storage.setItem(GUEST_ARCHIVE_KEY, JSON.stringify(guests));
}

export function createGuestId(now = Date.now()): string {
  const noise = Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .padStart(4, '0');
  return `guest-${now.toString(36)}-${noise}`;
}

export function upsertGuest(
  storage: MemoryStore,
  draft: Omit<GuestCompetitor, 'id'> & { id?: string },
  now = Date.now(),
): GuestCompetitor | null {
  const name = clip(draft.name, 80);
  const belt = clip(draft.belt, 40);
  if (!name || !belt) return null;
  const guests = loadGuests(storage);
  const id = draft.id && guests.some((guest) => guest.id === draft.id) ? draft.id : createGuestId(now);
  const next: GuestCompetitor = {
    id,
    name,
    belt,
    division: clip(draft.division, 80),
    gym: clip(draft.gym, 80),
    note: clip(draft.note, 500),
    lastEvent: clip(draft.lastEvent, 80),
  };
  saveGuests(
    storage,
    guests.some((guest) => guest.id === id) ? guests.map((guest) => (guest.id === id ? next : guest)) : [...guests, next],
  );
  return next;
}

export function findGuest(storage: Pick<MemoryStore, 'getItem'>, id: string): GuestCompetitor | undefined {
  return loadGuests(storage).find((guest) => guest.id === id);
}

/** Find or update the competitor card for this guest. A second use does not add another card. */
export function useGuestOnRoster(guest: GuestCompetitor): Student | null {
  const existing = getRoster().students.find((row) => row.guestId === guest.id);
  if (existing) {
    return updateStudent(existing.id, {
      name: guest.name,
      belt: guest.belt,
      division: guest.division,
      gym: guest.gym,
      note: guest.note,
      lastPromotion: existing.lastPromotion,
      lastPromotionDetail: existing.lastPromotionDetail,
    });
  }
  const added = addStudent({
    name: guest.name,
    belt: guest.belt,
    division: guest.division,
    gym: guest.gym,
    note: guest.note,
    lastPromotion: '',
  });
  if (!added) return null;
  return tagGuestCard(added.id, guest.id);
}
