/**
 * Fictional boards for the /preview/bracket-skins review pages. In memory only:
 * nothing here reads or writes the saved bracket, the roster or the match link.
 */

export type SampleSlot = { name: string; seed?: number; mark?: 'won' | 'lost' };
export type SampleMatch = { id: string; a: SampleSlot; b: SampleSlot; done?: boolean; live?: boolean };
export type SampleRound = { label: string; ids: string[] };
export type SampleBracket = {
  size: 8 | 16;
  tree: 8 | 16;
  matches: Record<string, SampleMatch>;
  left: SampleRound[];
  right: SampleRound[];
  roundLine: string;
};

export const SAMPLE_SIZES = [8, 16] as const;

export function sampleSize(value: string | null): 8 | 16 {
  return value === '16' ? 16 : 8;
}

const won = (name: string, seed?: number): SampleSlot => ({ name, seed, mark: 'won' });
const lost = (name: string, seed?: number): SampleSlot => ({ name, seed, mark: 'lost' });
const open = (name = '', seed?: number): SampleSlot => ({ name, seed });

function eight(): SampleBracket {
  const matches: Record<string, SampleMatch> = {
    'qf-0': { id: 'qf-0', done: true, a: won('David', 1), b: lost('Nathan', 8) },
    'qf-1': { id: 'qf-1', done: true, a: won('Beth', 4), b: lost('Matthew', 5) },
    'qf-2': { id: 'qf-2', done: true, a: won('Jon', 2), b: lost('Shaun', 7) },
    'qf-3': { id: 'qf-3', live: true, a: open('Anna', 3), b: open('Milo', 6) },
    'sf-0': { id: 'sf-0', a: open('David'), b: open('Beth') },
    'sf-1': { id: 'sf-1', a: open('Jon'), b: open() },
    'final-0': { id: 'final-0', a: open(), b: open() },
  };
  return {
    size: 8,
    tree: 8,
    matches,
    left: [
      { label: 'Quarterfinals', ids: ['qf-0', 'qf-1'] },
      { label: 'Semifinals', ids: ['sf-0'] },
    ],
    right: [
      { label: 'Semifinals', ids: ['sf-1'] },
      { label: 'Quarterfinals', ids: ['qf-2', 'qf-3'] },
    ],
    roundLine: 'Seeded · Quarterfinals · 8 competitors',
  };
}

function sixteen(): SampleBracket {
  const matches: Record<string, SampleMatch> = {
    'r16-0': { id: 'r16-0', done: true, a: won('Lila', 1), b: lost('Hugo', 16) },
    'r16-1': { id: 'r16-1', done: true, a: lost('Omar', 8), b: won('Teo', 9) },
    'r16-2': { id: 'r16-2', done: true, a: won('Rosa', 4), b: lost('Felix', 13) },
    'r16-3': { id: 'r16-3', done: true, a: won('Iris', 5), b: lost('Ravi', 12) },
    'r16-4': { id: 'r16-4', done: true, a: won('Nina', 2), b: lost('Pia', 15) },
    'r16-5': { id: 'r16-5', done: true, a: won('June', 7), b: lost('Max', 10) },
    'r16-6': { id: 'r16-6', done: true, a: won('Ada', 3), b: lost('Gus', 14) },
    'r16-7': { id: 'r16-7', live: true, a: open('Mona', 6), b: open('Caleb', 11) },
    'qf-0': { id: 'qf-0', done: true, a: won('Lila'), b: lost('Teo') },
    'qf-1': { id: 'qf-1', a: open('Rosa'), b: open('Iris') },
    'qf-2': { id: 'qf-2', a: open('Nina'), b: open('June') },
    'qf-3': { id: 'qf-3', a: open('Ada'), b: open() },
    'sf-0': { id: 'sf-0', a: open('Lila'), b: open() },
    'sf-1': { id: 'sf-1', a: open(), b: open() },
    'final-0': { id: 'final-0', a: open(), b: open() },
  };
  return {
    size: 16,
    tree: 16,
    matches,
    left: [
      { label: 'Round of 16', ids: ['r16-0', 'r16-1', 'r16-2', 'r16-3'] },
      { label: 'Quarterfinals', ids: ['qf-0', 'qf-1'] },
      { label: 'Semifinals', ids: ['sf-0'] },
    ],
    right: [
      { label: 'Semifinals', ids: ['sf-1'] },
      { label: 'Quarterfinals', ids: ['qf-2', 'qf-3'] },
      { label: 'Round of 16', ids: ['r16-4', 'r16-5', 'r16-6', 'r16-7'] },
    ],
    roundLine: 'Seeded · Round of 16 · 16 competitors',
  };
}

export function sampleBracket(size: 8 | 16): SampleBracket {
  return size === 16 ? sixteen() : eight();
}
