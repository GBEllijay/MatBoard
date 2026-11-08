/**
 * Where an Advantage Pro or Pro + Cloud control goes.
 * Unlocked Pro opens /pro. Unlocked Pro + Cloud opens /pro-plus-cloud.
 * Both pages show the same academy profile. Cloud tools stay on the Cloud page.
 * A coach seat is not sent to the owner homepage. A saved pass that is still
 * being checked is not sent to a buy or alpha page.
 */

export type OwnerEditionEntry = 'pro' | 'pro-cloud';

export function ownerEditionTarget(input: {
  entry: OwnerEditionEntry;
  /** False only while a saved pass is still being verified. */
  settled: boolean;
  seated: boolean;
  proConsoleOpen: boolean;
  cloudOpen: boolean;
}): '/pro' | '/pro-plus-cloud' | '/editions/pro' | '/editions/pro-cloud' {
  if (!input.settled) return input.entry === 'pro-cloud' ? '/pro-plus-cloud' : '/pro';
  if (input.entry === 'pro-cloud') {
    if (input.cloudOpen && !input.seated) return '/pro-plus-cloud';
    return '/editions/pro-cloud';
  }
  if (input.proConsoleOpen) return '/pro';
  return '/editions/pro';
}
