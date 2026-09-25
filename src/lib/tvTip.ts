const STORAGE_KEY = 'matboard.tvTip.v1';

/** Large enough to be a laptop / HDMI station — not a phone, even in landscape. */
export function tvStationQuery(): string {
  return '(min-width: 900px) and (min-height: 560px)';
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
