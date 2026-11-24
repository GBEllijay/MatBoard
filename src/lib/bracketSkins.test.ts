import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { BRACKET_SKIN_DECO } from '../skins/bracket/deco.generated.ts';
import {
  BRACKET_SKIN_FLAVOR,
  BRACKET_SKIN_SLUGS,
  bracketLinkEdges,
  bracketSkinClasses,
  bracketSkinsPreviewOpen,
} from './bracketSkins.ts';
import { BRACKET_SKIN_THEMES, BRACKET_THEME_LABELS } from './bracketTheme.ts';
import { POLISHED_SKINS, POLISHED_TIMER_SKINS } from './polishedSkins.ts';
import { sampleBracket, sampleSize } from './bracketSkinsSample.ts';

const root = new URL('../skins/bracket/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const skinCss = (slug: string) => read(`skins/${slug}.css`);
const loader = read('load.ts');
const thumbs = read('thumbs.ts');
const common = read('common.generated.css');
const layoutBefore = read('layout.css');
const layoutAfter = read('layout-after.css');
const layout = layoutBefore + layoutAfter;
const previewCss = readFileSync(new URL('../preview/bracketSkins/bracketSkinsPreview.css', import.meta.url), 'utf8');
const previewTsx = readFileSync(new URL('../preview/bracketSkins/BracketSkinsPreview.tsx', import.meta.url), 'utf8');

const APPROVED = [
  'brasil', 'calcadao', 'creature-anime', 'heavy-metal', 'idol-hunters', 'keynote', 'kids-arcade', 'kids-sticker',
  'psychedelic', 'reggae', 'shinobi-anime', 'visionary', 'woodblock', 'dungeon-quest', 'mech-battle', 'arcade-fighter',
];

/** Phone media blocks of a stylesheet (portrait, as the mockups). */
function phoneBlocks(css: string): string {
  return css
    .split('@media (max-aspect-ratio: 3/4)')
    .slice(1)
    .map((chunk) => chunk.slice(chunk.indexOf('{') + 1, chunk.indexOf('\n}')))
    .join('\n');
}

test('all 16 owner-approved bracket skins are registered', () => {
  assert.deepEqual([...BRACKET_SKIN_SLUGS].sort(), [...APPROVED].sort());
  assert.deepEqual([...BRACKET_SKIN_THEMES], POLISHED_TIMER_SKINS.map((s) => s.slug));
});

test('every registered skin has bracket styling, art, a thumbnail, a loader and a label', () => {
  for (const { slug, label } of POLISHED_TIMER_SKINS) {
    assert.ok(existsSync(new URL(`skins/${slug}.css`, root)), `${slug}: skins/${slug}.css`);
    assert.match(skinCss(slug), new RegExp(`bskin-${slug}`), `${slug}: css scoped to the skin`);
    assert.ok(BRACKET_SKIN_DECO[slug]?.length > 0, `${slug}: deco art`);
    assert.ok(existsSync(new URL(`thumbs/${slug}.jpg`, root)), `${slug}: thumbnail`);
    assert.ok(thumbs.includes(`${slug}.jpg`), `${slug}: thumbnail import`);
    assert.ok(loader.includes(`./skins/${slug}.css`), `${slug}: lazy loader entry`);
    assert.equal(BRACKET_THEME_LABELS[slug], label, `${slug}: picker label matches the timer`);
    assert.ok(BRACKET_SKIN_FLAVOR[slug], `${slug}: flavor`);
  }
});

test('three screens: every scoreboard skin also has a timer and a bracket', () => {
  const timer = new Set(POLISHED_TIMER_SKINS.map((s) => s.slug));
  const bracket = new Set(BRACKET_SKIN_SLUGS);
  for (const skin of POLISHED_SKINS) {
    assert.ok(timer.has(skin.slug), `${skin.slug}: timer`);
    assert.ok(bracket.has(skin.slug), `${skin.slug}: bracket`);
  }
});

test('per-skin rules never leak outside their skin', () => {
  for (const slug of BRACKET_SKIN_SLUGS) {
    const selectors = skinCss(slug)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('{')
      .slice(0, -1)
      .map((chunk) => chunk.slice(Math.max(chunk.lastIndexOf('}'), chunk.lastIndexOf(';')) + 1).trim())
      .filter((sel) => sel && !sel.startsWith('@'));
    for (const group of selectors) {
      for (const sel of group.split(/,(?![^(]*\))/)) {
        assert.match(sel.trim(), new RegExp(`^main\\.tournament\\.tournament--skin\\.bskin-${slug}\\b`), `${slug}: ${sel}`);
      }
    }
  }
});

test('deco art is static markup only', () => {
  for (const slug of BRACKET_SKIN_SLUGS) {
    const html = BRACKET_SKIN_DECO[slug];
    assert.doesNotMatch(html, /<script|\son[a-z]+=|javascript:/i, slug);
  }
});

test('no Gracie Barra branding in bracket skins', () => {
  const all = [common, layout, loader, ...BRACKET_SKIN_SLUGS.map(skinCss), ...Object.values(BRACKET_SKIN_DECO)].join('\n');
  assert.doesNotMatch(all, /gracie|barra/i);
});

test('classes keep the live layout and add the skin flavor', () => {
  assert.equal(bracketSkinClasses('brasil'), 'tournament--bright tournament--skin bskin-brasil');
  assert.equal(
    bracketSkinClasses('mech-battle'),
    'tournament--bright tournament--skin bskin-mech-battle bskin--t bskin--crest bskin--mascots',
  );
  assert.equal(bracketSkinClasses('creature-anime'), 'tournament--bright tournament--skin bskin-creature-anime bskin--crest bskin--mascots');
  for (const slug of BRACKET_SKIN_SLUGS) assert.match(bracketSkinClasses(slug), /\btournament--bright\b/);
});

test('phones hide the characters except on Creature Anime', () => {
  const keep = BRACKET_SKIN_SLUGS.filter((slug) => BRACKET_SKIN_FLAVOR[slug].phoneMascots);
  assert.deepEqual(keep, ['creature-anime']);
  const phone = phoneBlocks(common);
  assert.match(phone, /bskin--mascots \.bracket__side--left \.bracket__round--1::after,\s*main[^{]*bskin--mascots \.bracket__side--right \.bracket__round--1::after \{display:none\}/);
  assert.match(phoneBlocks(skinCss('creature-anime')), /\.bracket__champ::before/);
  for (const slug of BRACKET_SKIN_SLUGS.filter((s) => s !== 'creature-anime')) {
    assert.doesNotMatch(phoneBlocks(skinCss(slug)), /::(before|after)\s*\{[^}]*display:\s*block/, `${slug}: no phone mascot`);
  }
});

test('polish: Arcade Fighter phone labels are at least 11px', () => {
  const phone = phoneBlocks(skinCss('arcade-fighter'));
  const sizes = (sel: string) =>
    [...phone.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(([, s]) => s.includes(sel))
      .flatMap(([, , body]) => [...body.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])));
  for (const sel of ['.bracket__round > h2', '.t-match__finals-label > span', '.bracket__champ > span', '.t-live-pill']) {
    const found = sizes(sel);
    assert.ok(found.length, `${sel}: phone size set`);
    assert.ok(found[found.length - 1] >= 11, `${sel}: last phone size ${found.at(-1)}px`);
  }
});

test('polish: Psychedelic round pills get spacing', () => {
  const css = skinCss('psychedelic');
  assert.match(css, /bskin-psychedelic \.bracket__round > h2 \{letter-spacing:\.1em\}/);
  assert.match(css, /bskin-psychedelic \.bracket__round > h2 > span \{padding-inline:/);
});

test('polish: Heavy Metal empty Winner slots are high contrast', () => {
  const css = skinCss('heavy-metal');
  const rule = /\.t-slot\.t-slot:has\(input:placeholder-shown\) \{([^}]*)\}/.exec(css);
  assert.ok(rule, 'empty slot rule');
  assert.match(rule[1], /color:#e6e8ec!important/);
  assert.match(rule[1], /solid #9aa0a8/);
  assert.match(css, /:has\(input:placeholder-shown\) input \{opacity:1\}/);
});

test('connector edges follow the 8-person tree', () => {
  const edges = bracketLinkEdges(['qf-0', 'qf-1', 'qf-2', 'qf-3', 'sf-0', 'sf-1', 'final-0']);
  assert.deepEqual(edges, [
    { from: 'qf-0', to: 'sf-0', slot: 0, side: 'left' },
    { from: 'qf-1', to: 'sf-0', slot: 1, side: 'left' },
    { from: 'qf-2', to: 'sf-1', slot: 0, side: 'right' },
    { from: 'qf-3', to: 'sf-1', slot: 1, side: 'right' },
    { from: 'sf-0', to: 'final-0', slot: 'card', side: 'left' },
    { from: 'sf-1', to: 'final-0', slot: 'card', side: 'right' },
  ]);
});

test('the review gallery opens on previews and local dev only', () => {
  assert.equal(bracketSkinsPreviewOpen('bracket-skins-16.matboard.pages.dev'), true);
  assert.equal(bracketSkinsPreviewOpen('localhost'), true);
  assert.equal(bracketSkinsPreviewOpen('matboard.pages.dev'), false);
  assert.equal(bracketSkinsPreviewOpen('advantagebjjtimer.com'), false);
  assert.equal(bracketSkinsPreviewOpen('www.advantagebjjtimer.com'), false);
  assert.equal(bracketSkinsPreviewOpen('evil-matboard.pages.dev.example.com'), false);
});

test('review: the Finals column is the mockup width, not Advantage\'s 20rem cap', () => {
  assert.match(layoutBefore, /\.bracket__finals \{[^}]*width: auto;[^}]*max-width: none;/);
});

test('review: long Finals eyebrows wrap inside the card', () => {
  assert.match(layoutAfter, /\.t-match__finals-label > span \{[^}]*white-space: normal;/);
  assert.match(skinCss('psychedelic'), /bskin-psychedelic \.t-match--final \.t-match__finals-label > span \{font-size:calc\(1\.3\*var\(--bu\)\);letter-spacing:\.02em\}/);
  assert.match(skinCss('woodblock'), /bskin-woodblock \.t-match--final \.t-match__finals-label > span \{letter-spacing:\.12em\}/);
});

test('review: the Woodblock seal sits on the corner outside the Finals card', () => {
  assert.match(skinCss('woodblock'), /bskin-woodblock \.t-match--final::after \{right:calc\(-3\.6\*var\(--bu\)\);top:calc\(-3\.6\*var\(--bu\)\)\}/);
});

test('review: Advantage stub connectors do not paint skin corner pseudos (Shinobi L corners)', () => {
  assert.match(layoutBefore, /\.t-match__bouts::after \{\s*content: none;[^}]*inset: auto;[^}]*background: none;/);
});

test('review: on phones the Sign in pill is icon only and the title stays clear of both corners', () => {
  const phone = phoneBlocks(layoutAfter);
  assert.match(phone, /body:has\(main\.tournament\.tournament--skin\) \.header-account__label \{\s*display: none;/);
  assert.match(phone, /\.bracket-headline__pill \{\s*max-width: calc\(100vw - 120px/);
});

test('review: phone rows spread over the board, room above Finals, Finals and Champion equal width', () => {
  const phone = phoneBlocks(layoutAfter);
  assert.match(phone, /container-type: size;/);
  assert.match(phone, /align-content: space-evenly;/);
  assert.match(phone, /\.bracket__finals \{\s*margin-top: 14px;/);
  assert.match(phone, /\.bracket--tree-8 \.t-match--final \{\s*flex: 1 1 0;/);
  assert.match(phone, /\.bracket--tree-8 \.bracket__champ \{\s*flex: 1 1 0;/);
});

test('larger trees keep the mockup card sizes', () => {
  for (const tree of [16, 32, 64]) {
    assert.match(layoutBefore, new RegExp(`\\.bracket--tree-${tree} \\.bracket__side--left \\{ grid-template-columns: calc\\(32\\.85`));
  }
});

test('preview samples: 8 and 16 fictional competitors on the live match ids', () => {
  assert.equal(sampleSize('16'), 16);
  assert.equal(sampleSize('8'), 8);
  assert.equal(sampleSize(null), 8);
  assert.equal(sampleSize('64'), 8);
  for (const size of [8, 16] as const) {
    const sample = sampleBracket(size);
    const ids = [...sample.left, ...sample.right].flatMap((round) => round.ids);
    assert.equal(ids.length + 1, size - 1, `${size}: every match but the final sits on a side`);
    for (const id of [...ids, 'final-0']) assert.ok(sample.matches[id], id);
    const seeds = Object.values(sample.matches).flatMap((m) => [m.a.seed, m.b.seed]).filter(Boolean);
    assert.deepEqual([...seeds].sort((a, b) => a! - b!), Array.from({ length: size }, (_, i) => i + 1));
    assert.equal(Object.values(sample.matches).filter((m) => m.live).length, 1);
    assert.equal(bracketLinkEdges([...ids, 'final-0']).length, size - 2);
  }
});

test('preview page never ships to production and keeps its labels off the board', () => {
  assert.match(previewTsx, /if \(!previewOpenHere\(\)\) return <Closed \/>;/);
  assert.doesNotMatch(previewTsx, /bskin-preview__tag/);
  assert.doesNotMatch(previewCss, /bskin-preview__tag/);
  assert.match(previewCss, /body:has\(main\.bskin-preview\) \.preview-white-badge \{\s*display: none;/);
  assert.match(previewTsx, /<PlayExitMark /);
});
