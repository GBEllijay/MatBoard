/** Object bag from JSON. Arrays and null are not records. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Stored text. Non-strings become empty. */
export function clampText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}
