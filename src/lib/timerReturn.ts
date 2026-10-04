/**
 * Optional return path for the existing round timer.
 * Only a same-app path is accepted. A full URL cannot ride along.
 */

export function safeTimerReturn(value: string | null | undefined): string | null {
  if (!value) return null;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return null;
  if (decoded.includes('://') || decoded.includes('\\') || /[\n\r]/.test(decoded)) return null;
  if (decoded.length > 180) return null;
  if (!/^\/[A-Za-z0-9\-._~/?=&%]*$/.test(decoded)) return null;
  return decoded;
}

/** Round timer with a same-app path back to the screen that opened it. */
export function trainingPathWithReturn(back: string): string {
  const safe = safeTimerReturn(back);
  if (!safe) return '/training';
  return `/training?back=${encodeURIComponent(safe)}`;
}
