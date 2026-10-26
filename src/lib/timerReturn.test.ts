import assert from 'node:assert/strict';
import test from 'node:test';
import { safeTimerReturn, trainingPathWithReturn } from './timerReturn.ts';

test('timer return accepts a same-app path and rejects a remote URL', () => {
  assert.equal(safeTimerReturn('/competition-curriculum'), '/competition-curriculum');
  assert.equal(
    safeTimerReturn('/competition-curriculum?plan=unlimited'),
    '/competition-curriculum?plan=unlimited',
  );
  assert.equal(safeTimerReturn('https://evil.example/training'), null);
  assert.equal(safeTimerReturn('//evil.example'), null);
  assert.equal(safeTimerReturn('/training?back=https://evil.example'), null);
  assert.equal(
    trainingPathWithReturn('/competition-curriculum'),
    '/training?back=%2Fcompetition-curriculum',
  );
  assert.equal(trainingPathWithReturn('https://evil.example'), '/training');
});
