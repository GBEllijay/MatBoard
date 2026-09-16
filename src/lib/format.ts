export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

export function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

export function minutesToMs(minutes: number): number {
  return Math.round(minutes * 60_000);
}

export function secondsToMs(seconds: number): number {
  return Math.round(seconds * 1000);
}

export function formatMss(totalSeconds: number): string {
  const n = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(n / 60)}:${pad2(n % 60)}`;
}

export function parseMmSs(value: string): number | null {
  const trimmed = value.trim();
  const match = /^(\d{1,3}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (seconds > 59) return null;
  return (minutes * 60 + seconds) * 1000;
}
