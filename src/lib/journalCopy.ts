/**
 * Words and the written date shared by the journal form, the card, and the PDF.
 * The file still stores YYYY-MM-DD. Only the words on screen and in the report change.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const JOURNAL_PARTNERS_LABEL = 'Training partners';
export const JOURNAL_DRILLS_LABEL = 'Drills';
export const JOURNAL_ROLLS_LABEL = 'Rolls';
export const JOURNAL_NOTES_LABEL = 'Drill notes';
export const JOURNAL_STOP_LABEL = 'Stop doing';
export const JOURNAL_SAVED_TOAST = 'Entry saved';
export const JOURNAL_SEE_CARD = 'See saved card';

/** October 11, 2026. The same words on the form, the card, the buttons, and the PDF. */
export function formatJournalDate(iso: string): string {
  const match = ISO_DATE.exec(iso);
  if (!match) return iso;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return iso;
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date);
}

/**
 * Date plus the first technique, so two cards on the same day are not the same button.
 * A card with no technique uses the class name. A card with neither is the date alone.
 */
export function journalActionLabel(date: string, technique: string, className = ''): string {
  const when = formatJournalDate(date);
  const name = technique.trim() || className.trim();
  return name ? `${when} · ${name}` : when;
}
