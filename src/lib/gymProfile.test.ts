import assert from 'node:assert/strict';
import test from 'node:test';
import { academySheetOpen, promotionsByYear, sanitizeGymEvent, type GymEvent } from './gymEvents.ts';
import { profileOptIn, readGymProfile, sanitizeGymProfile, writeGymProfile, type GymProfile } from './gymProfile.ts';

function memory() {
  const bag = new Map<string, string>();
  return {
    getItem: (key: string) => bag.get(key) ?? null,
    setItem: (key: string, value: string) => {
      bag.set(key, value);
    },
  };
}

test('gym profile keeps founding date, founders, and lineage, and drops junk', () => {
  const store = memory();
  const saved = writeGymProfile(
    { foundedOn: '1998-04-02', founders: 'Ana and Luis', lineage: 'Carlson Gracie', optIn: ['assistant-coach'] },
    store,
  );
  assert.equal(saved.foundedOn, '1998-04-02');
  assert.equal(readGymProfile(store).lineage, 'Carlson Gracie');
  const dirty = sanitizeGymProfile({ foundedOn: 'yesterday', founders: 'x'.repeat(200), lineage: 'keep', optIn: ['assistant-coach', 'nope'], note: 'private' });
  assert.equal(dirty.foundedOn, '');
  assert.equal(dirty.founders.length, 120);
  assert.deepEqual(dirty.optIn, ['assistant-coach']);
  assert.equal(JSON.stringify(dirty).includes('private'), false);
});

test('founders and lineage keep a trailing space and spaces in the middle while typing', () => {
  const store = memory();
  const trailing = writeGymProfile({ founders: 'Ana ', lineage: 'Carlson  Gracie ' }, store);
  assert.equal(trailing.founders, 'Ana ');
  assert.equal(readGymProfile(store).founders, 'Ana ');
  assert.equal(readGymProfile(store).lineage, 'Carlson  Gracie ');
  const mid = writeGymProfile({ founders: 'Ana  Luis' }, store);
  assert.equal(mid.founders, 'Ana  Luis');
  assert.equal(readGymProfile(store).founders, 'Ana  Luis');
  const clipped = writeGymProfile({ founders: `${'A '.repeat(80)}` }, store);
  assert.equal(clipped.founders, 'A '.repeat(60));
  const dated = sanitizeGymProfile({ foundedOn: ' 1998-04-02 ' });
  assert.equal(dated.foundedOn, '1998-04-02');
});

test('academy sheet stays open for the owner and roster seats, and opt-in opens the others', () => {
  const profile = { v: 1 as const, foundedOn: '', founders: '', lineage: '', optIn: ['program-director'] as GymProfile['optIn'] };
  assert.equal(academySheetOpen({ seatId: null, preset: null, optedIn: false }), true);
  assert.equal(academySheetOpen({ seatId: 's', preset: 'coach', optedIn: false }), true);
  assert.equal(academySheetOpen({ seatId: 's', preset: 'assistant-coach', optedIn: false }), false);
  assert.equal(academySheetOpen({ seatId: 's', preset: 'program-director', optedIn: profileOptIn(profile, 'program-director') }), true);
  assert.equal(profileOptIn(profile, 'assistant-coach'), false);
});

test('belts promoted over time group by year', () => {
  const events = [
    sanitizeGymEvent({ id: 'a', type: 'promotion', studentId: 's1', from: { belt: '', stripes: 0 }, to: { belt: 'Blue', stripes: 0 }, date: '2024-05-01', source: 'backfill', actor: { seatId: 'owner', name: 'Owner' }, v: 1, at: '2024-05-01T12:00:00.000Z', recordedAt: 1, licenseId: 'g' }),
    sanitizeGymEvent({ id: 'b', type: 'promotion', studentId: 's2', from: { belt: 'Blue', stripes: 0 }, to: { belt: 'Purple', stripes: 0 }, date: '2026-01-02', source: 'live', actor: { seatId: 'owner', name: 'Owner' }, v: 1, at: '2026-01-02T12:00:00.000Z', recordedAt: 2, licenseId: 'g' }),
  ].filter((event): event is GymEvent => Boolean(event));
  const years = promotionsByYear(events);
  assert.deepEqual(years.map((row) => row.year), ['2026', '2024']);
  assert.equal(years[1]?.belts[0]?.estimate, 1);
});
