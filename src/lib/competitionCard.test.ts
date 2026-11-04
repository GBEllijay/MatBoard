import assert from 'node:assert/strict';
import test from 'node:test';
import { competitionRecord, latestWeighIn, opponentsFaced, tournamentsIcs, upcomingTournaments } from './competitionCard.ts';
import { competitionPlanFixture } from './testFixtures/competitionPlan.ts';

test('competitionRecord counts wins, losses and how matches end', () => {
  const r = competitionRecord(competitionPlanFixture());
  assert.equal(r.wins, 3);
  assert.equal(r.losses, 2);
  assert.equal(r.draws, 0);
  assert.equal(r.total, 5);
  assert.equal(r.winRate, 60);
  const sub = r.methods.find((m) => m.method === 'sub');
  assert.deepEqual([sub?.label, sub?.wins, sub?.losses], ['Submission', 2, 0]);
  assert.ok(r.methods.find((m) => m.label === 'Advantage' && m.losses === 1));
});

test('competitionRecord is empty without a plan', () => {
  const r = competitionRecord(null);
  assert.equal(r.total, 0);
  assert.deepEqual(r.methods, []);
});

test('upcomingTournaments drops past events and sorts by date', () => {
  const rows = upcomingTournaments(competitionPlanFixture(), '2026-11-04');
  assert.deepEqual(rows.map((t) => t.name), ['Appalachian Grappling Open', 'Chattahoochee No-Gi Invitational', 'North Georgia Submission Series']);
  assert.deepEqual(upcomingTournaments(competitionPlanFixture(), '2027-02-01'), []);
  assert.deepEqual(upcomingTournaments(null, '2026-11-04'), []);
});

test('opponentsFaced groups by opponent and keeps the head-to-head', () => {
  const rows = opponentsFaced(competitionPlanFixture());
  const riley = rows.find((r) => r.opponent === 'Riley Thompson');
  assert.equal(riley?.wins, 2);
  assert.equal(rows.length, 4);
});

test('latestWeighIn picks the newest weigh-in', () => {
  const w = latestWeighIn(competitionPlanFixture());
  assert.equal(w?.weight, 139.6);
  assert.equal(latestWeighIn(null), null);
});

test('tournamentsIcs writes one all-day event per tournament', () => {
  const rows = upcomingTournaments(competitionPlanFixture(), '2026-11-04');
  const ics = tournamentsIcs('Maya Alvarez', rows, new Date('2026-11-04T12:00:00Z'));
  assert.match(ics, /^BEGIN:VCALENDAR/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 3);
  assert.match(ics, /DTSTART;VALUE=DATE:20261115/);
  assert.match(ics, /END:VCALENDAR\s*$/);
});
