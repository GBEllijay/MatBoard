import assert from 'node:assert/strict';
import test from 'node:test';
import { findGuest, loadGuests, upsertGuest, useGuestOnRoster } from './guestCompetitors.ts';
import { getRoster, linkRosterCard, resetRoster } from './rosterStore.ts';

function memory() {
  const bag = new Map<string, string>();
  return {
    getItem: (key: string) => bag.get(key) ?? null,
    setItem: (key: string, value: string) => {
      bag.set(key, value);
    },
  };
}

test('a guest card is edited and reused without a second roster card or a message link', () => {
  resetRoster();
  const storage = memory();
  try {
    const created = upsertGuest(storage, {
      name: 'Kid Visitor',
      belt: 'Grey',
      division: 'Kids',
      gym: 'Other School',
      note: 'mock',
      lastEvent: 'November mock',
    });
    assert.ok(created);
    const edited = upsertGuest(storage, { ...created, name: 'Kid Visitor', gym: 'North Gym', lastEvent: 'December mock' });
    assert.equal(edited?.id, created.id);
    assert.equal(loadGuests(storage).length, 1);
    assert.equal(findGuest(storage, created.id)?.gym, 'North Gym');

    const first = useGuestOnRoster(created);
    const second = useGuestOnRoster(edited!);
    assert.ok(first);
    assert.equal(second?.id, first.id);
    assert.equal(getRoster().students.length, 1);
    assert.equal(second?.gym, 'North Gym');
    assert.equal(second?.guestId, created.id);
    assert.equal(second?.linkedStudentId, undefined);
    assert.equal(linkRosterCard(first.id, 'stu-alex'), null);
    assert.equal(getRoster().students[0]?.linkedStudentId, undefined);
  } finally {
    resetRoster();
  }
});
