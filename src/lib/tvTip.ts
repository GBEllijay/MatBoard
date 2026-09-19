const STORAGE_KEY = 'matboard.tvTip.v1';

export function tvStationQuery(): string {
  return '(pointer: fine) and (min-width: 800px)';
}

export function isTvStationViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(tvStationQuery()).matches;
}

export function tvTipDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissTvTip(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore quota / private mode */
  }
}
