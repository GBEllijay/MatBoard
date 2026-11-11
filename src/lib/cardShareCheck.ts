/** Feedback for Check for student cards on the Student Roster. Copy only. */
export const CARD_SHARE_CHECK_FAILED =
  'Could not reach Advantage Cloud. Student cards arrive here only when the gym has Advantage Cloud and you are signed in on this device. Nothing here was changed.';

/** One visible line after Check for student cards. */
export function cardShareCheckNote(pending: number, before: number): string {
  const added = Math.max(0, pending - before);
  if (added > 0) return `Found ${added} new student card${added === 1 ? '' : 's'}. ${pending} waiting.`;
  if (pending > 0) return `Nothing new. ${pending} still waiting.`;
  return 'Checked. No student cards are waiting.';
}
