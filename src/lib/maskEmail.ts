/** Mask a purchase email for on-screen hints. Never print the full address. */
export function maskEmail(raw: string): string {
  const email = raw.trim();
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return '';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const lead = local.charAt(0);
  return lead ? `${lead}***@${domain}` : '';
}
