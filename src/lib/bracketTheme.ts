/** Mock Tournament look. Bright is the locked Coach-demo default. */

export type BracketTheme = 'bright' | 'dark';

export const BRACKET_THEME_KEY = 'matboard.bracketTheme.v1';
export const DEFAULT_BRACKET_THEME: BracketTheme = 'bright';

const listeners = new Set<() => void>();

function isTheme(value: string | null): value is BracketTheme {
  return value === 'bright' || value === 'dark';
}

function readTheme(): BracketTheme {
  try {
    const raw = localStorage.getItem(BRACKET_THEME_KEY);
    return isTheme(raw) ? raw : DEFAULT_BRACKET_THEME;
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

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === BRACKET_THEME_KEY || event.key === null) {
      listeners.forEach((fn) => fn());
    }
  });
}
