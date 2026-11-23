/** Mock Tournament look. Bright is the locked Coach-demo default. */

export const BRACKET_THEMES = ['bright', 'dark', 'podium'] as const;

export type BracketTheme = (typeof BRACKET_THEMES)[number];

export const BRACKET_THEME_KEY = 'matboard.bracketTheme.v1';
export const DEFAULT_BRACKET_THEME: BracketTheme = 'bright';

/** White-only bracket skin, listed with Bright and Dark when White base skins are open. */
export const WHITE_BRACKET_THEME: BracketTheme = 'podium';

export const BRACKET_THEME_LABELS: Record<BracketTheme, string> = {
  bright: 'Bright',
  dark: 'Dark',
  podium: 'Podium & Mat Strip',
};

const listeners = new Set<() => void>();

export function isBracketTheme(value: string | null): value is BracketTheme {
  return value === 'bright' || value === 'dark' || value === 'podium';
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

/** Themes the picker lists. Podium is gated like other White skins. */
export function bracketThemeOptions(whiteBaseSkins: boolean): readonly BracketTheme[] {
  return podiumThemeOpen(whiteBaseSkins) ? BRACKET_THEMES : (['bright', 'dark'] as const);
}

/** Paint Bright when the Coach demo hides skins, or when Podium is stored but not allowed. */
export function visibleBracketTheme(
  theme: BracketTheme,
  options: { plainCoach?: boolean; whiteBaseSkins?: boolean } = {},
): BracketTheme {
  if (options.plainCoach) return DEFAULT_BRACKET_THEME;
  if (theme === WHITE_BRACKET_THEME && !podiumThemeOpen(options.whiteBaseSkins ?? false)) {
    return DEFAULT_BRACKET_THEME;
  }
  return theme;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === BRACKET_THEME_KEY || event.key === null) {
      listeners.forEach((fn) => fn());
    }
  });
}
