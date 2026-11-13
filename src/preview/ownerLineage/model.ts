/**
 * Isolated design preview of one proposed line.
 * Relationship words are typed. They are not a verified primary-teacher chain.
 * Nothing here is written to a student record.
 */

export const OWNER_LINE_NOTE =
  'Design preview. Not saved to a student record. This is a proposed line with a relationship on each step, not a verified primary-teacher chain.';

export const PROMOTION_NOTE = 'Black belt awarded by Carlos Gracie Jr. · Brazil';

export type ProposedStep = {
  name: string;
  /** How this person connects to the one below them. You has none. */
  linkBelow?: string;
  detail?: string;
};

export const PROPOSED_LINE: readonly ProposedStep[] = [
  {
    name: 'Carlos Gracie Sr.',
    linkBelow: 'taught',
    detail:
      'Gracie University’s about page says Carlos introduced his brother Helio to jiu-jitsu, and that Helio observed lessons taught by his older brothers. Checked 8 November 2026.',
  },
  {
    name: 'Helio Gracie',
    linkBelow: 'awarded black belt',
    detail:
      'A fighter profile says Helio awarded Carlos Gracie Jr. his black belt, and also says Carlos Jr. spent most of his training time under Rolls Gracie. The award is not a claim that Helio was his only teacher. A primary teacher above Professor Fabio Costa still needs confirmation.',
  },
  {
    name: 'Carlos Gracie Jr.',
    linkBelow: 'awarded black belt',
    detail:
      'A 2024 interview page says Professor Fabio Costa was promoted to black belt by Master Carlos Gracie Jr.',
  },
  {
    name: 'Professor Fabio Costa',
    linkBelow: 'trained',
    detail: 'Your account: Professor Fabio Costa trained you. This preview does not publish that as a certification.',
  },
  { name: 'You' },
];

export const PROPOSED_SOURCES = [
  'https://www.gracieuniversity.com/Pages/Public/about',
  'https://www.bjjheroes.com/bjj-fighters/carlos-carlinhos-gracie-jr',
  'https://www.thehomepagenetwork.com/jiu-jitsu-episode-1-meet-professor-fabio-costa/',
] as const;
