/** First-screen designs the owner can compare with ?hero=a|b|c|d|e. d is B v2 (keynote reveal); e is the mats version with the board and timer stacked. */
export const HERO_VARIANTS = ['a', 'b', 'c', 'd', 'e'] as const;
export type HeroVariant = (typeof HERO_VARIANTS)[number];
/** The combined homepage uses the mats hero (e) by default, so no ?hero param is needed. a-d stay selectable. */
export const DEFAULT_HERO_VARIANT: HeroVariant = 'e';

export function heroVariantOf(raw: string | null): HeroVariant {
  const value = (raw ?? '').trim().toLowerCase();
  return (HERO_VARIANTS as readonly string[]).includes(value) ? (value as HeroVariant) : DEFAULT_HERO_VARIANT;
}
