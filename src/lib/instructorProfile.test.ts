import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  INSTRUCTOR_NAME_PLACEHOLDER,
  INSTRUCTOR_PROFILE_STORAGE_KEY,
  instructorProfileSeatKey,
  loadInstructorProfile,
  resolveInstructorBelt,
  resolveInstructorName,
  saveInstructorProfile,
  seatInstructorName,
} from './instructorProfile.ts';

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
};

test('instructor name prefers a saved name, then a seat name, then the student profile, and never the academy', () => {
  const academy = 'Gracie Barra Ellijay';
  assert.deepEqual(
    resolveInstructorName({
      savedName: 'Maya Costa',
      seatName: 'Seat Name',
      studentName: 'Justin Guise',
      academyName: academy,
    }),
    { name: 'Maya Costa', placeholder: false },
  );
  assert.deepEqual(
    resolveInstructorName({
      savedName: '  ',
      seatName: 'Coach Rivera',
      studentName: 'Justin Guise',
      academyName: academy,
    }),
    { name: 'Coach Rivera', placeholder: false },
  );
  assert.deepEqual(
    resolveInstructorName({
      savedName: academy,
      seatName: academy,
      studentName: 'Justin Guise',
      academyName: academy,
    }),
    { name: 'Justin Guise', placeholder: false },
  );
  assert.deepEqual(
    resolveInstructorName({
      savedName: '',
      seatName: '',
      studentName: '',
      academyName: academy,
    }),
    { name: INSTRUCTOR_NAME_PLACEHOLDER, placeholder: true },
  );
  assert.deepEqual(
    resolveInstructorName({
      studentName: '  gracie barra ellijay  ',
      academyName: academy,
    }),
    { name: INSTRUCTOR_NAME_PLACEHOLDER, placeholder: true },
  );
  assert.equal(
    resolveInstructorName({ studentName: 'Justin Guise', academyName: academy }).name.includes(academy),
    false,
  );
});

test('a seat instructor name is used when present and is not the academy name', () => {
  assert.equal(seatInstructorName({ name: 'Ava Shaw' }, 'Gracie Barra Ellijay'), 'Ava Shaw');
  assert.equal(seatInstructorName({ displayName: 'Ava Shaw' }, 'Gracie Barra Ellijay'), 'Ava Shaw');
  assert.equal(seatInstructorName({ name: 'Gracie Barra Ellijay' }, 'Gracie Barra Ellijay'), '');
  assert.equal(seatInstructorName({ email: 'ava@gym.test' } as { email: string }, 'Gracie Barra Ellijay'), '');
});

test('saved instructor profile reloads per seat and does not write the gym name key', () => {
  const storage = memory();
  const owner = instructorProfileSeatKey(null);
  const seat = instructorProfileSeatKey('seat-1');
  assert.equal(owner, 'owner');
  assert.equal(INSTRUCTOR_PROFILE_STORAGE_KEY, 'matboard.instructor.profile.v1');
  saveInstructorProfile({ name: 'Justin Guise', belt: 'black' }, storage, owner);
  saveInstructorProfile({ name: 'Coach Rivera', belt: 'brown' }, storage, seat);
  assert.deepEqual(loadInstructorProfile(storage, owner), { name: 'Justin Guise', belt: 'black' });
  assert.deepEqual(loadInstructorProfile(storage, seat), { name: 'Coach Rivera', belt: 'brown' });
  assert.equal(storage.getItem('matboard.gymName.v1'), null);
  assert.equal(resolveInstructorBelt({ savedBelt: 'black', studentBeltLabel: 'Blue belt' }), 'Black belt');
  assert.equal(resolveInstructorBelt({ savedBelt: '', studentBeltLabel: 'Black belt · 1st degree' }), 'Black belt · 1st degree');
});

test('the live instructor sheet no longer uses the academy name as the instructor name', () => {
  const sheet = readFileSync('src/components/InstructorSheet.tsx', 'utf8');
  assert.match(sheet, /resolveInstructorName/);
  assert.doesNotMatch(sheet, /deviceGymName \|\| 'Owner'/);
  assert.doesNotMatch(sheet, /seat\.email\.split/);
});
