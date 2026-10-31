/** First-screen designs the owner can compare with ?hero=a|b|c|d. d is B v2 (keynote reveal). */
export const HERO_VARIANTS = ['a', 'b', 'c', 'd'] as const;
export type HeroVariant = (typeof HERO_VARIANTS)[number];
export const DEFAULT_HERO_VARIANT: HeroVariant = 'a';

export function heroVariantOf(raw: string | null): HeroVariant {
  const value = (raw ?? '').trim().toLowerCase();
  return (HERO_VARIANTS as readonly string[]).includes(value) ? (value as HeroVariant) : DEFAULT_HERO_VARIANT;
}
