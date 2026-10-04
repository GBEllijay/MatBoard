import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyCurriculum, type CurriculumArchive, type CurriculumPlan } from './competitionCurriculum.ts';
import {
  curriculumVideoCardById,
  curriculumVideoCards,
  techniquesPathForCurriculum,
} from './curriculumVideos.ts';

function withVideo(plan: CurriculumPlan, index: number, expected: string): CurriculumPlan {
  const block = plan.blocks[index];
  assert.ok(block);
  block.timing = 'video';
  block.expected = expected;
  block.clipId = `clip-${index}`;
  return plan;
}

test('only looping-video cards are shown in the daily training window', () => {
  const plan = withVideo(emptyCurriculum(), 0, '5:00');
  plan.blocks[1]!.timing = 'timer';
  plan.blocks[1]!.clipId = 'not-shown';
  const custom = plan.blocks.find((block) => block.kind === 'live');
  assert.ok(custom);
  const cards = curriculumVideoCards([plan]);
  assert.deepEqual(
    cards.map((card) => card.title),
    ['Competition Class Warm-Up'],
  );
  assert.equal(cards[0]?.durationMs, 5 * 60_000);
  assert.equal(cards[0]?.clipId, 'clip-0');
  assert.equal(curriculumVideoCards([emptyCurriculum()]).length, 0);
});

test('a short expected duration is the loop length for that card', () => {
  const plan = withVideo(emptyCurriculum(), 2, '0:04');
  const cards = curriculumVideoCards([plan]);
  assert.equal(cards[0]?.title, 'Take Downs');
  assert.equal(cards[0]?.durationMs, 4_000);
});

test('an added card with looping video is included', () => {
  const plan = emptyCurriculum();
  plan.blocks.push({
    id: 'custom-1',
    kind: 'custom',
    title: 'Bag Work',
    notes: '',
    expected: '5',
    waterBreak: false,
    timing: 'video',
    clipId: null,
    mediaName: '',
    rounds: 1,
  });
  const cards = curriculumVideoCards([plan]);
  assert.equal(cards.at(-1)?.title, 'Bag Work');
  assert.equal(cards.at(-1)?.durationMs, 5 * 60_000);
  assert.equal(cards.at(-1)?.clipId, null);
});

test('the daily training link stays on the techniques page', () => {
  assert.equal(
    techniquesPathForCurriculum('block-1', '/competition-curriculum'),
    '/techniques?curriculum=block-1&back=%2Fcompetition-curriculum',
  );
  assert.equal(techniquesPathForCurriculum('block-1', 'https://evil.example'), '/techniques?curriculum=block-1');
  const plan = withVideo(emptyCurriculum(), 0, '5:00');
  const archive: CurriculumArchive = { version: 1, days: { '2026-10-04': { plans: [plan] } } };
  const id = plan.blocks[0]?.id ?? '';
  assert.equal(curriculumVideoCardById(archive, id)?.clipId, 'clip-0');
  assert.equal(curriculumVideoCardById(archive, 'missing'), null);
});
