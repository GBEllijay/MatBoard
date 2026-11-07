import assert from 'node:assert/strict';
import test from 'node:test';
import { exportProgressPacket } from './progress/format.ts';
import { RANK_PHOTO_MAX_CHARS } from './progress/types.ts';
import { blankStudentReport } from './studentEdition.ts';
import { addCompetitionMatch, addCompetitionResult } from './studentCompetition.ts';
import { buildCoachUpdateFile } from './coachProgressFile.ts';
import {
  PODIUM_PHOTO_KEY,
  PODIUM_PHOTO_MAX,
  addPodiumPhoto,
  forgetPodiumPhotos,
  loadPodiumPhotoStore,
  podiumPhotos,
  removePodiumPhoto,
} from './podiumPhotos.ts';

const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const other = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

function withStorage(run: () => void) {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const memory = new Map<string, string>();
  const storage = {
    get length() {
      return memory.size;
    },
    clear: () => memory.clear(),
    getItem: (key: string) => memory.get(key) ?? null,
    key: (index: number) => [...memory.keys()][index] ?? null,
    removeItem: (key: string) => {
      memory.delete(key);
    },
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  try {
    run();
  } finally {
    if (prior) Object.defineProperty(globalThis, 'localStorage', prior);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

test('podium photos stay on their result when matches change and do not cross students', () => {
  withStorage(() => {
    let report = addCompetitionResult(blankStudentReport(1), { tournamentId: '', tournamentName: 'Spring Open', division: 'Adult Blue' }, 2);
    const first = report.competition?.results[0]?.id ?? '';
    report = addCompetitionResult(report, { tournamentId: '', tournamentName: 'Fall Open', division: 'Adult Blue' }, 3);
    const second = report.competition?.results[1]?.id ?? '';
    report = addCompetitionMatch(report, first, { opponent: 'Sam', result: 'win', method: 'points', note: '' }, 4);
    addPodiumPhoto('student-a', first, image);
    addPodiumPhoto('student-a', first, other);
    assert.deepEqual(podiumPhotos('student-a', first), [image, other]);
    assert.deepEqual(podiumPhotos('student-a', second), []);
    assert.deepEqual(podiumPhotos('student-b', first), []);
    assert.equal(report.competition?.results[0]?.id, first);
    assert.equal(exportProgressPacket(report).includes('data:image'), false);
    const coach = buildCoachUpdateFile(report, { storage: localStorage, assessments: [], studentId: 'student-a' });
    assert.equal(coach.json.includes('data:image'), false);
    assert.equal(coach.json.includes('podium'), false);
  });
});

test('an old result with no podium list stays empty, and extras past 8 are dropped', () => {
  withStorage(() => {
    const tooMany = Array.from({ length: 10 }, () => image);
    localStorage.setItem(
      PODIUM_PHOTO_KEY,
      JSON.stringify({
        byStudent: {
          'student-a': {
            'result.old': tooMany,
            'result.string': image,
            'result.bad id': [image],
          },
          '../other': { 'result.old': [other] },
        },
      }),
    );
    assert.equal(podiumPhotos('student-a', 'result.old').length, PODIUM_PHOTO_MAX);
    assert.deepEqual(podiumPhotos('student-a', 'result.string'), []);
    assert.deepEqual(podiumPhotos('student-a', 'result.missing'), []);
    assert.equal(loadPodiumPhotoStore().byStudent['../other'], undefined);
    assert.throws(() => addPodiumPhoto('student-a', 'result.old', other), /already has 8 photos/);
    const kept = removePodiumPhoto('student-a', 'result.old', 0);
    assert.equal(kept.length, 7);
    assert.equal(kept[0], image);
    forgetPodiumPhotos('student-a', 'result.old');
    assert.deepEqual(podiumPhotos('student-a', 'result.old'), []);
    const raw = localStorage.getItem(PODIUM_PHOTO_KEY) ?? '';
    assert.equal(raw.includes('result.old'), false);
  });
});

test('a photo over the belt size limit is refused', () => {
  withStorage(() => {
    const huge = `data:image/jpeg;base64,${'A'.repeat(RANK_PHOTO_MAX_CHARS)}`;
    assert.throws(() => addPodiumPhoto('student-a', 'result.1', huge), /too large/);
    assert.deepEqual(podiumPhotos('student-a', 'result.1'), []);
  });
});
