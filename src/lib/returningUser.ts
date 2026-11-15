/** Text for the homepage "Returning user?" line (src/components/ReturningUserPrompt.tsx). */
export function returningUserPrompt(hint: string | null): { signedIn: boolean; lead: string; link: string } {
  const masked = hint?.trim() ?? '';
  if (masked) return { signedIn: true, lead: `Signed in as ${masked}.`, link: 'Account' };
  return { signedIn: false, lead: 'Returning user?', link: 'Sign in here' };
}
