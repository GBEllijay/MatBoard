/** TV Clean mode for Brackets: hides WIN/DQ/SCORE/UNDO micro-buttons and enlarges names. */

export const BRACKET_CLEAN_KEY = 'matboard.bracketClean.v1';

const listeners = new Set<() => void>();

function readClean(): boolean {
  try {
    return localStorage.getItem(BRACKET_CLEAN_KEY) === '1';
  } catch {
    return false;
  }
}

function writeClean(on: boolean): void {
  try {
    localStorage.setItem(BRACKET_CLEAN_KEY, on ? '1' : '0');
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((fn) => fn());
}

export function getBracketClean(): boolean {
  return readClean();
}

export function subscribeBracketClean(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setBracketClean(on: boolean): void {
  writeClean(Boolean(on));
}

export function toggleBracketClean(): boolean {
  const next = !readClean();
  writeClean(next);
  return next;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === BRACKET_CLEAN_KEY || event.key === null) {
      listeners.forEach((fn) => fn());
    }
  });
}
