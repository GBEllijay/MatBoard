import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  EMPTY_VIDEOS,
  JOURNAL,
  JOURNAL_PREVIEW_COUNT,
  NEUTRAL_NOTE,
  NEUTRAL_RATING,
  OPTIONAL_NOTE,
  TERM_CARD_PATH,
  TERMS,
  previewEntries,
  ratingNote,
  seeAllLabel,
  shouldCloseSwipe,
  shownRating,
  termById,
  termIdFromSearch,
} from './model.ts';

const root = fileURLToPath(new URL('../../..', import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(tsx?|css)$/.test(name)) out.push(path);
  }
  return out;
}

test('sample terms stay fictional and the untouched rating is 3', () => {
  const armbar = termById('armbar');
  const escape = termById('side-control-escape');
  assert.ok(armbar);
  assert.ok(escape);
  assert.equal(armbar.face, 'Submissions');
  assert.equal(armbar.entries.length, 7);
  assert.equal(armbar.videos.length, 1);
  assert.equal(armbar.videos[0]?.title, 'Armbar from closed guard');
  assert.equal(armbar.videos[0]?.length, '1:42');
  assert.equal(previewEntries(armbar, false).length, JOURNAL_PREVIEW_COUNT);
  assert.equal(previewEntries(armbar, true).length, 7);
  assert.equal(seeAllLabel(armbar.entries.length), 'See all 7 entries');
  assert.equal(escape.face, 'Escapes / Defense');
  assert.equal(escape.videos.length, 0);
  assert.equal(escape.entries[0]?.line, "Stayed calm under side control, didn't panic.");
  assert.equal(previewEntries(escape, false).length, escape.entries.length);
  assert.equal(EMPTY_VIDEOS, 'No videos linked yet.');
  assert.equal(shownRating(null), NEUTRAL_RATING);
  assert.equal(shownRating(undefined), 3);
  assert.equal(shownRating(3), 3);
  assert.equal(shownRating(4), 4);
  assert.equal(shownRating(0), 3);
  assert.equal(shownRating(3.2), 3);
  assert.equal(ratingNote(undefined), NEUTRAL_NOTE);
  assert.equal(ratingNote(3), NEUTRAL_NOTE);
  assert.equal(ratingNote(5), OPTIONAL_NOTE);
  assert.equal(NEUTRAL_NOTE, 'Defaults to 3 — neutral. Rate only if you want to.');
  assert.equal(shouldCloseSwipe(72, 0), true);
  assert.equal(shouldCloseSwipe(71, 0), false);
  assert.equal(shouldCloseSwipe(90, 40), true);
  assert.equal(shouldCloseSwipe(90, 90), false);
  assert.equal(shouldCloseSwipe(-80, 0), false);
});

test('the sample journal links armbar, guard, side control, and side control escape', () => {
  const linked = JOURNAL.flatMap((block) => block.parts.filter((part) => part.kind === 'term').map((part) => part.id));
  assert.deepEqual(linked, ['guard', 'armbar', 'side-control', 'side-control-escape']);
  for (const id of linked) assert.ok(termById(id), id);
  assert.equal(termById('side-control')?.face, 'Guard / Control');
  assert.equal(termById('guard')?.face, 'Guard / Control');
  assert.equal(termIdFromSearch('?term=armbar'), 'armbar');
  assert.equal(termIdFromSearch('?term=missing'), null);
  assert.equal(termIdFromSearch(''), null);
  const prose = JOURNAL.map((block) => block.parts.map((part) => part.text).join('')).join('\n');
  assert.match(prose, /armbar/);
  assert.match(prose, /side control/);
  assert.match(prose, /guard/);
  assert.match(prose, /Side control escape/);
});

test('the preview route is standalone and does not touch storage or live pages', () => {
  const previewFiles = ['model.ts', 'TermCardPreview.tsx', 'termCard.css'];
  for (const name of previewFiles) {
    const text = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /localStorage|sessionStorage|indexedDB|saveStudentReport|writeAssessments/);
    assert.doesNotMatch(text, /#fcc000|#f5c400|logo-yellow|gold/i);
  }
  const css = readFileSync(new URL('./termCard.css', import.meta.url), 'utf8');
  assert.match(css, /#004eba/);
  assert.match(css, /#6ea8ff/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /safe-area-inset|--safe-b/);
  const page = readFileSync(new URL('./TermCardPreview.tsx', import.meta.url), 'utf8');
  assert.match(page, /Your journal/);
  assert.match(page, /Videos/);
  assert.match(page, /Rate it/);
  assert.match(page, />\s*Close\s*</);
  assert.match(page, /Escape/);
  assert.match(page, /history\.back/);
  assert.match(page, /Sample/);
  const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
  const at = app.indexOf('TERM_CARD_PATH');
  assert.ok(at > 0);
  const route = app.slice(at, at + 180);
  assert.match(route, /TermCardPreviewPage/);
  assert.doesNotMatch(route, /CoachRoute|StudentEdition|MediaConsoleRoute/);
  assert.equal(TERM_CARD_PATH, '/preview/term-card');
  for (const dir of ['src/pages', 'src/components', 'src/lib']) {
    for (const file of walk(join(root, dir))) {
      const text = readFileSync(file, 'utf8');
      assert.equal(text.includes('preview/termCard') || text.includes('TermCardPreview') || text.includes('/preview/term-card'), false, file);
    }
  }
});
