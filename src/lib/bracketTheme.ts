import { POLISHED_TIMER_SKINS, isPolishedTimerSlug, type PolishedTimerSlug } from './polishedSkins.ts';

/** Mock Tournament look. Stored id stays "bright"; the user-facing name is Advantage. This is the locked Coach-demo default. */

export const BRACKET_THEMES = ['bright', 'dark', 'podium'] as const;

export type BaseBracketTheme = (typeof BRACKET_THEMES)[number];

/**
 * Every polished skin ships three screens: scoreboard, round timer, and bracket (owner policy).
 * The bracket stores the skin's slug, so the same id names all three screens.
 */
export type BracketSkinTheme = PolishedTimerSlug;

export type BracketTheme = BaseBracketTheme | BracketSkinTheme;

/** Bracket skins in the round timer's picker order (Calçadão right after Brasil). */
export const BRACKET_SKIN_THEMES: readonly BracketSkinTheme[] = POLISHED_TIMER_SKINS.map((skin) => skin.slug);

export function isBracketSkinTheme(value: unknown): value is BracketSkinTheme {
  return isPolishedTimerSlug(value);
}

export const BRACKET_THEME_KEY = 'matboard.bracketTheme.v1';
export const DEFAULT_BRACKET_THEME: BracketTheme = 'bright';

/** White-only bracket skin, listed with Advantage and Dark when White base skins are open. */
export const WHITE_BRACKET_THEME: BracketTheme = 'podium';

export const BRACKET_THEME_LABELS: Record<BracketTheme, string> = {
  bright: 'Advantage',
  dark: 'Dark',
  podium: 'Podium & Mat Strip',
  ...(Object.fromEntries(POLISHED_TIMER_SKINS.map((skin) => [skin.slug, skin.label])) as Record<BracketSkinTheme, string>),
};

const listeners = new Set<() => void>();

export function isBracketTheme(value: string | null): value is BracketTheme {
  return value === 'bright' || value === 'dark' || value === 'podium' || isBracketSkinTheme(value);
}

function readTheme(): BracketTheme {
  try {
    const raw = localStorage.getItem(BRACKET_THEME_KEY);
    return isBracketTheme(raw) ? raw : DEFAULT_BRACKET_THEME;
  } catch {
    return DEFAULT_BRACKET_THEME;
  }
}

function writeTheme(theme: BracketTheme): void {
  try {
    localStorage.setItem(BRACKET_THEME_KEY, theme);
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((fn) => fn());
}

export function getBracketTheme(): BracketTheme {
  return readTheme();
}

export function subscribeBracketTheme(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setBracketTheme(theme: BracketTheme): void {
  writeTheme(theme);
}

/** Same door as White timer and scoreboard skins: White with no higher tier. */
export function podiumThemeOpen(whiteBaseSkins: boolean): boolean {
  return whiteBaseSkins;
}

/**
 * Themes the picker lists. Podium is gated like other White skins.
 * The polished bracket skins follow the scoreboard and timer skins: Media Edition and above only.
 */
export function bracketThemeOptions(whiteBaseSkins: boolean, polishedSkins = false): readonly BracketTheme[] {
  const base: readonly BracketTheme[] = podiumThemeOpen(whiteBaseSkins) ? BRACKET_THEMES : (['bright', 'dark'] as const);
  return polishedSkins ? [...base, ...BRACKET_SKIN_THEMES] : base;
}

/**
 * Paint Advantage (stored as bright) when the Coach demo hides skins, when Podium is stored but not allowed,
 * or when a polished skin is stored on a browser below Media Edition.
 */
export function visibleBracketTheme(
  theme: BracketTheme,
  options: { plainCoach?: boolean; whiteBaseSkins?: boolean; polishedSkins?: boolean } = {},
): BracketTheme {
  if (options.plainCoach) return DEFAULT_BRACKET_THEME;
  if (theme === WHITE_BRACKET_THEME && !podiumThemeOpen(options.whiteBaseSkins ?? false)) {
    return DEFAULT_BRACKET_THEME;
  }
  if (isBracketSkinTheme(theme) && !options.polishedSkins) return DEFAULT_BRACKET_THEME;
  return theme;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === BRACKET_THEME_KEY || event.key === null) {
      listeners.forEach((fn) => fn());
    }
  });
}
