import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { NEUTRAL_NOTE, OPTIONAL_NOTE, ratingNote } from '../termCard/model.ts';
import {
  INDEX_CARD_PATH,
  INITIAL_PROFICIENCY,
  JOURNAL_ENTRIES,
  OTHER_ITEM,
  SAMPLE_CHIP,
  SAMPLE_DISCLAIMER,
  SAMPLE_TECHNIQUE,
  SAMPLE_TREE,
  SAMPLE_VIDEO,
  SCISSOR,
  addNamedBranch,
  chooseProficiency,
  nextBranchName,
  scissorPlacement,
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

test('proficiency starts at 3 and a chosen rating stays in range', () => {
  assert.equal(INITIAL_PROFICIENCY, 3);
  assert.equal(chooseProficiency(3), 3);
  assert.equal(chooseProficiency(1), 1);
  assert.equal(chooseProficiency(5), 5);
  assert.equal(chooseProficiency(0), 3);
  assert.equal(chooseProficiency(9), 3);
  assert.equal(chooseProficiency(3.2), 3);
  assert.equal(ratingNote(null), NEUTRAL_NOTE);
  assert.equal(ratingNote(3), NEUTRAL_NOTE);
  assert.equal(ratingNote(4), OPTIONAL_NOTE);
});

test('add branch names a follow-up in memory and leaves the sample tree alone', () => {
  const before = JSON.stringify(SAMPLE_TREE);
  assert.equal(nextBranchName(SAMPLE_TREE), 'New branch');
  const once = addNamedBranch(SAMPLE_TREE, nextBranchName(SAMPLE_TREE));
  assert.equal(JSON.stringify(SAMPLE_TREE), before);
  assert.equal(once.children.at(-3)?.name, 'New branch');
  assert.equal(once.children.at(-3)?.kind, 'follow');
  assert.equal(once.children.at(-1)?.kind, 'defense');
  assert.equal(nextBranchName(once), 'New branch 2');
  const twice = addNamedBranch(once, 'Knee cut');
  assert.equal(twice.children.some((child) => child.name === 'Knee cut' && child.kind === 'follow'), true);
  assert.equal(addNamedBranch(SAMPLE_TREE, '   '), SAMPLE_TREE);
});

test('the Other row is one uncategorized item flagged for review', () => {
  assert.equal(OTHER_ITEM.category, 'Other');
  assert.equal(OTHER_ITEM.label, 'Needs review');
  assert.match(OTHER_ITEM.note, /Not filed/);
  assert.equal(JOURNAL_ENTRIES.length, 3);
  assert.equal(SAMPLE_VIDEO.href, 'https://www.youtube.com/watch?v=sample-scissor-sweep');
  assert.match(SAMPLE_VIDEO.label, /youtube\.com/);
  assert.equal(SAMPLE_TECHNIQUE.name, 'Collar-and-sleeve scissor sweep');
  const defenses = SAMPLE_TREE.children.filter((child) => child.kind === 'defense').map((child) => child.name);
  assert.deepEqual(defenses, ['Posture and base', 'Stand up']);
  const mount = SAMPLE_TREE.children.find((child) => child.name === 'Mount');
  assert.deepEqual(mount?.children.map((child) => child.name), ['Armbar from mount', 'Cross collar choke', 'Americana']);
});

test('Scissor sweep sits on the Sweeps face in the Sweep group', () => {
  const place = scissorPlacement();
  assert.equal(place.name, 'Scissor sweep');
  assert.equal(place.face, 'Sweeps');
  assert.equal(place.group, 'Sweep');
  assert.equal(SCISSOR.face, 'Sweeps');
  assert.equal(SCISSOR.group, 'Sweep');
  assert.equal(SAMPLE_CHIP, 'Sample data');
  assert.match(SAMPLE_DISCLAIMER, /Nothing is written/);
});

test('the index card route is standalone and does not touch storage or the term card', () => {
  const files = ['model.ts', 'IndexCardPreview.tsx', 'indexCard.css'];
  for (const name of files) {
    const text = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /localStorage|sessionStorage|indexedDB|saveStudentReport|writeAssessments|fetch\(|iframe|autoplay/);
    assert.doesNotMatch(text, /#fcc000|#f5c400|logo-yellow|gold/i);
  }
  const page = readFileSync(new URL('./IndexCardPreview.tsx', import.meta.url), 'utf8');
  const model = readFileSync(new URL('./model.ts', import.meta.url), 'utf8');
  assert.match(page, /Add branch/);
  assert.match(page, /OTHER_ITEM\.label/);
  assert.match(model, /Needs review/);
  assert.match(model, /youtube\.com/);
  assert.doesNotMatch(page, /<video|<iframe/);
  const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
  const at = app.indexOf('INDEX_CARD_PATH');
  assert.ok(at > 0);
  const route = app.slice(app.lastIndexOf('INDEX_CARD_PATH'), app.lastIndexOf('INDEX_CARD_PATH') + 180);
  assert.match(route, /IndexCardPreviewPage/);
  assert.doesNotMatch(route, /CoachRoute|StudentEdition|MediaConsoleRoute/);
  assert.equal(INDEX_CARD_PATH, '/preview/index-card');
  assert.match(app, /TERM_CARD_PATH/);
  assert.match(app, /\/preview\/term-card|TERM_CARD_PATH/);
  for (const dir of ['src/pages', 'src/components', 'src/lib']) {
    for (const file of walk(join(root, dir))) {
      const text = readFileSync(file, 'utf8');
      assert.equal(text.includes('preview/indexCard') || text.includes('IndexCardPreview') || text.includes('/preview/index-card'), false, file);
    }
  }
});
