import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

test('Heavy Metal timer digits do not stretch full-width so TV margin clicks still open Training options', () => {
  const css = read('src/skins/polished/heavy-metal.css');
  assert.match(css, /\.skin-root\[data-skin="heavy-metal"\]\s+\.tm\s+\.digits\s*\{[^}]*left:\s*50%;[^}]*right:\s*auto;/s);
  assert.doesNotMatch(css, /\.skin-root\[data-skin="heavy-metal"\]\s+\.tm\s+\.digits\s*\{[^}]*left:\s*0;\s*right:\s*0;/s);
});

test('skin-root .sk-btn reset uses zero-specificity :where(.skin-root) so scoreboard tile fills stay intact', () => {
  const css = read('src/skins/polished/skin-root.css');
  assert.match(css, /:where\(\.skin-root\)\s+\.sk-btn\s*\{/);
  assert.doesNotMatch(css, /^\.skin-root\s+\.sk-btn\s*\{/m);
});

test('Arcade Fighter scoreboard avoids PTSPTS/ADVADV duplication via ::after pseudo-labels', () => {
  const css = read('src/skins/polished/arcade-layout.css');
  assert.doesNotMatch(css, /\.lab::after\s*\{\s*content:\s*'PTS'/);
  assert.doesNotMatch(css, /\.lab::after\s*\{\s*content:\s*'ADV'/);
  assert.doesNotMatch(css, /\.lab::after\s*\{\s*content:\s*'PEN'/);
});

test('Tournament board styles stack bright/dark/podium/kids brackets on portrait and keep division width for Adult Blue Belt', () => {
  const boardCss = read('src/pages/tournamentBoard.css');
  const indexCss = read('src/index.css');
  assert.match(boardCss, /main\.tournament:is\(\.tournament--bright,\s*\.tournament--dark,\s*\.tournament--podium,\s*\.tournament--kids\)/);
  assert.match(boardCss, /body:has\(main\.tournament\)\s+\.header-account/);
  assert.match(indexCss, /\.tournament--kids\s+\.t-bye-note\s*\{[^}]*background:/s);
  assert.match(indexCss, /\.tournament__title\s*\{[^}]*min-width:\s*11rem;/s);
});
