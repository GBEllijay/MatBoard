/** Scoreboard line for Round. An empty field is omitted — no "Round —" or "Bout" placeholder. */
export function roundDisplay(round: string, linked: boolean): string {
  const value = round.trim();
  if (!value) return '';
  if (linked) return value;
  return `Round ${value}`;
}
