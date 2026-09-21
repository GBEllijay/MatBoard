/** Coach-only class notes. Local device storage. */

export const TRAINING_NOTES_STORAGE_KEY = 'matboard.trainingNotes.v1';
export const TRAINING_NOTES_MAX = 8_000;

export function loadTrainingNotes(): string {
  try {
    const raw = localStorage.getItem(TRAINING_NOTES_STORAGE_KEY);
    return typeof raw === 'string' ? raw.slice(0, TRAINING_NOTES_MAX) : '';
  } catch {
    return '';
  }
}

export function saveTrainingNotes(text: string): string {
  const next = text.slice(0, TRAINING_NOTES_MAX);
  try {
    localStorage.setItem(TRAINING_NOTES_STORAGE_KEY, next);
  } catch {
    /* ignore quota / private mode */
  }
  return next;
}
