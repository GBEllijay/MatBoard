/** Decorative Media Console header. Not a control. */
export const MEDIA_CONSOLE_ARTS = ['tv', 'monitor', 'roster'] as const;

export type MediaConsoleArt = (typeof MEDIA_CONSOLE_ARTS)[number];

export const MEDIA_CONSOLE_ART_KEY = 'advantage.mediaConsoleArt';

export function isMediaConsoleArt(value: string | null | undefined): value is MediaConsoleArt {
  return MEDIA_CONSOLE_ARTS.some((id) => id === value);
}

/**
 * Next header illustration. Skips the one shown last time so two opens in a
 * row do not land on the same picture.
 */
export function pickMediaConsoleArt(last: string | null, random: () => number = Math.random): MediaConsoleArt {
  const previous = isMediaConsoleArt(last) ? last : null;
  const choices = previous ? MEDIA_CONSOLE_ARTS.filter((id) => id !== previous) : [...MEDIA_CONSOLE_ARTS];
  const roll = random();
  const index = Math.min(choices.length - 1, Math.max(0, Math.floor(roll * choices.length)));
  return choices[index] ?? 'tv';
}
