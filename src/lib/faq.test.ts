import assert from 'node:assert/strict';
import test from 'node:test';
import { FAQ_ALL, FAQ_ENTRIES, FAQ_PATH, STUDENT_FAQ_PATH, faqCategories, faqHref, filterFaq } from './faq.ts';
import { studentPageBack, studentScreen } from './studentHubMenu.ts';
import { TECHNIQUE_TREE_PREVIEW_BANNER } from './techniqueTreePreview.ts';

const text = FAQ_ENTRIES.map((entry) =>
  [entry.question, ...entry.paragraphs, ...(entry.steps ?? []), ...(entry.links ?? []).map((link) => `${link.label} ${link.to}`)].join('\n'),
).join('\n');

test('faq entries are easy to address and do not invent prices or rules', () => {
  const ids = new Set(FAQ_ENTRIES.map((entry) => entry.id));
  assert.equal(ids.size, FAQ_ENTRIES.length);
  assert.equal(FAQ_PATH, '/faq');
  assert.equal(STUDENT_FAQ_PATH, '/student/faq');
  assert.equal(studentScreen('faq'), 'faq');
  assert.equal(studentPageBack('/student/faq', '?student=1', null), '/student?student=1');
  assert.ok(faqCategories().includes('Starting out'));
  assert.equal(text.includes('IBJJF'), false);
  assert.equal(/\$\d/.test(text), false);
  assert.equal(/ten-year|10-year|ten years/i.test(text), false);
  assert.equal(text.includes(TECHNIQUE_TREE_PREVIEW_BANNER), true);
  assert.match(text, /does not look through your photo library/i);
  assert.match(text, /not your lifetime/i);
  assert.match(text, /There is no bank/i);
  assert.match(text, /shared index from belt to belt is not available/i);
  assert.match(text, /purchase does not keep that sample/i);
  assert.match(text, /does not sync the journal/i);
  assert.match(text, /no paid Cloud seat/i);
  for (const entry of FAQ_ENTRIES) {
    assert.ok(entry.question.length > 8);
    assert.ok(entry.paragraphs.length > 0);
    for (const link of entry.links ?? []) assert.match(link.to, /^\//);
  }
});

test('search matches every word and a topic can narrow it', () => {
  const hours = filterFaq(FAQ_ENTRIES, 'mat hours', FAQ_ALL);
  assert.equal(hours.length, 1);
  assert.equal(hours[0]?.id, 'mat-hours');
  assert.equal(filterFaq(FAQ_ENTRIES, 'MAT', FAQ_ALL).some((entry) => entry.id === 'mat-hours'), true);
  assert.equal(filterFaq(FAQ_ENTRIES, 'zzzz-no-match', FAQ_ALL).length, 0);
  const academy = filterFaq(FAQ_ENTRIES, '', 'Academy');
  assert.ok(academy.length >= 2);
  assert.ok(academy.every((entry) => entry.category === 'Academy'));
  assert.equal(filterFaq(FAQ_ENTRIES, 'mat hours', 'Academy').length, 0);
  assert.equal(faqHref('/student/rank', true), '/student/rank?student=1');
  assert.equal(faqHref('/student?student=1', true), '/student?student=1');
  assert.equal(faqHref('/restore', true), '/restore');
  assert.equal(faqHref('/student/rank', false), '/student/rank');
});
