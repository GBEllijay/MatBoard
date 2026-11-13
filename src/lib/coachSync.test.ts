import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptCoachSyncUpdate,
  buildCoachAssessmentUpdate,
  coachAssessmentTrend,
  buildCoachBeltProgressUpdate,
  buildCoachGymLogoUpdate,
  deliverSyncPacket,
  emptyCoachOverlay,
  receiveSyncPacket,
  sendSyncPacketToFolder,
  stubGymLogoSource,
  SYNC_PACKET_KINDS,
  syncActorFromClaims,
  syncActorFromToken,
  syncPacketFile,
  syncSendGate,
  takeSyncPacketsFromFolder,
  versionGymLogo,
} from './coachSync.ts';
import { importCoachText } from './coachInbound.ts';
import { readGymLogoSync } from './studentGymMark.ts';
import { dismissCoachRankUpdate, emptyUpdateLedger, readCoachQueue } from './coachRankUpdate.ts';
import { memoryHandoffFolder } from './driveHandoff.ts';
import { exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import { SYNC_ASSESSMENT_AREA_IDS, readCoachAssessment } from './progress/syncPackets.ts';
import { assessmentSummary } from './rosterCard.ts';
import { ASSESSMENT_AREAS, ASSESSMENT_FORM_AREAS } from './studentAssessment.ts';
import { blankStudentReport } from './studentEdition.ts';
import { assignStudentId } from './studentIdentity.ts';
import { everyTestPacket, TEST_LOGO, TEST_LOGO_2, testMemory } from './testPackets.ts';

const linked = { linkedStudentId: 'stu-alex' } as const;

test('every sync packet kind round-trips through export and parse', () => {
  const packets = everyTestPacket();
  assert.deepEqual(
    packets.map((packet) => packet.kind).sort(),
    [...SYNC_PACKET_KINDS].sort(),
  );
  for (const packet of packets) {
    const parsed = parseProgressPacket(exportProgressPacket(packet));
    assert.equal(parsed.ok, true, packet.kind);
    if (parsed.ok) assert.equal(parsed.value.kind, packet.kind);
  }
});

test('belt progress and assessment refuse a checklist or a met mark', () => {
  for (const packet of everyTestPacket().filter((row) => row.kind !== 'coach-rank-update')) {
    const marked = JSON.parse(exportProgressPacket(packet)) as Record<string, unknown>;
    marked.checklist = [{ id: 'skill-1', met: true }];
    assert.equal(parseProgressPacket(JSON.stringify(marked)).ok, false, packet.kind);
  }
  const met = JSON.parse(exportProgressPacket(everyTestPacket()[2])) as { beltProgress: { benchmarks: Record<string, unknown>[] } };
  met.beltProgress.benchmarks[0].met = true;
  assert.equal(parseProgressPacket(JSON.stringify(met)).ok, false);
});

test('builders refuse bad input', () => {
  assert.equal(
    buildCoachBeltProgressUpdate({ studentId: 'stu-alex', belt: 'Blue', issuedOn: '2026-11-03', benchmarks: [] }).ok,
    false,
  );
  assert.equal(buildCoachAssessmentUpdate({ studentId: 'stu-alex', date: '2026-11-03', scores: { guard: 9 } }).ok, false);
  assert.equal(
    buildCoachGymLogoUpdate({ studentId: 'stu-alex', master: { dataUrl: 'https://x/logo.png', version: 1 } }).ok,
    false,
  );
});

test('assessment area ids match the eight student check-in faces, Sweeps included', () => {
  assert.deepEqual([...SYNC_ASSESSMENT_AREA_IDS], ASSESSMENT_FORM_AREAS.map((area) => area.id));
  assert.equal(SYNC_ASSESSMENT_AREA_IDS.length, 8);
});

const SEVEN = { guard: 4, passing: 3, takedowns: 2, escapes: 4, submissions: 3, conditioning: 2, mindset: 5 };

test('an old seven-face coach assessment packet still imports, with Sweeps not rated', () => {
  // Exactly what an older coach app sent: no sweeps key.
  const old = {
    schemaVersion: 2,
    kind: 'coach-assessment-update',
    id: 'assess-old',
    studentId: 'stu-alex',
    updatedAt: 10,
    issuedAt: 10,
    updateId: 'assess-old',
    assessment: { date: '2026-10-01', note: '', scores: SEVEN, strengths: '', weaknesses: '' },
  };
  const parsed = parseProgressPacket(JSON.stringify(old));
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  if (!parsed.ok || parsed.value.kind !== 'coach-assessment-update') throw new Error('kind');
  assert.equal(Object.hasOwn(parsed.value.assessment.scores, 'sweeps'), false, 'never invented');
  const report = assignStudentId(blankStudentReport(10), 'stu-alex', 10);
  const accepted = acceptCoachSyncUpdate(report, parsed.value, emptyUpdateLedger(), emptyCoachOverlay());
  assert.equal(accepted.applied, true);
  assert.equal(accepted.overlay.assessments[0]?.scores.sweeps, undefined);
  assert.equal(coachAssessmentTrend(accepted.overlay)[0]?.average, Math.round((23 / 7) * 10) / 10, 'averages the seven it has');
  const entry = { id: 'a', date: '2026-10-01', note: '', scores: accepted.overlay.assessments[0].scores as typeof SEVEN };
  const sweepsRow = assessmentSummary([entry], [], 'coach').rows.find((row) => row.id === 'sweeps');
  assert.equal(sweepsRow?.coach, null);
});

test('a new coach assessment carries Sweeps through the file round trip onto the student card', () => {
  const built = buildCoachAssessmentUpdate({ studentId: 'stu-alex', date: '2026-11-03', scores: { ...SEVEN, sweeps: 1 }, updateId: 'assess-8' });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.packet.assessment.scores.sweeps, 1);
  const file = syncPacketFile(built.packet);
  const parsed = parseProgressPacket(file.json);
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'coach-assessment-update') throw new Error('kind');
  assert.equal(parsed.value.assessment.scores.sweeps, 1);
  const report = assignStudentId(blankStudentReport(10), 'stu-alex', 10);
  const accepted = acceptCoachSyncUpdate(report, parsed.value, emptyUpdateLedger(), emptyCoachOverlay());
  assert.equal(accepted.overlay.assessments[0]?.scores.sweeps, 1);
  assert.equal(coachAssessmentTrend(accepted.overlay)[0]?.average, Math.round((24 / 8) * 10) / 10);
  const entry = { id: 'a', date: '2026-11-03', note: '', scores: accepted.overlay.assessments[0].scores as typeof SEVEN };
  const summary = assessmentSummary([entry], [], 'coach');
  assert.deepEqual(summary.rows.map((row) => row.label), ASSESSMENT_FORM_AREAS.map((area) => area.label));
  assert.equal(summary.rows.find((row) => row.id === 'sweeps')?.coach, 1);
  assert.match(summary.weaknesses, /Sweeps \(1\)/);
  // The same file through the gym folder / import path still queues.
  const storage = testMemory();
  assert.equal(importCoachText(storage, report, file.json).kind, 'queued');
  const queued = readCoachQueue(storage)[0];
  assert.equal(queued?.kind, 'coach-assessment-update');
  if (queued?.kind === 'coach-assessment-update') assert.equal(queued.assessment.scores.sweeps, 1);
});

test('a newer packet degrades safely in an older reader: same schema and kind, and the seven old faces survive', () => {
  const built = buildCoachAssessmentUpdate({ studentId: 'stu-alex', date: '2026-11-03', scores: { ...SEVEN, sweeps: 1 }, updateId: 'assess-8' });
  const legacy = buildCoachAssessmentUpdate({ studentId: 'stu-alex', date: '2026-11-03', scores: SEVEN, updateId: 'assess-8' });
  assert.ok(built.ok && legacy.ok);
  if (!built.ok || !legacy.ok) return;
  // No version bump: an older app checks schemaVersion and kind, and those are unchanged.
  assert.equal(built.packet.schemaVersion, legacy.packet.schemaVersion);
  assert.equal(built.packet.kind, legacy.packet.kind);
  // The only difference on the wire is one extra score key.
  const { sweeps, ...rest } = built.packet.assessment.scores;
  assert.equal(sweeps, 1);
  assert.deepEqual({ ...built.packet, assessment: { ...built.packet.assessment, scores: rest } }, legacy.packet);
  // An older reader keeps only the ids it knows. Reading through the seven old ids gives the old packet.
  const olderIds = ASSESSMENT_AREAS.map((area) => area.id) as readonly string[];
  const errors: string[] = [];
  const read = readCoachAssessment(built.packet.assessment, errors);
  assert.deepEqual(errors, []);
  const olderView = Object.fromEntries(Object.entries(read.scores).filter(([key]) => olderIds.includes(key)));
  assert.deepEqual(olderView, SEVEN);
});

test('send gate: toggle off, guest, unlinked and assistant are blocked', () => {
  assert.equal(syncSendGate(linked, 'owner'), 'send');
  assert.equal(syncSendGate(linked, 'head'), 'send');
  assert.equal(syncSendGate(linked, 'coach'), 'send');
  assert.equal(syncSendGate({ ...linked, coachSync: 'off' }, 'owner'), 'sync-off');
  assert.equal(syncSendGate(linked, 'owner', [{ ...linked, coachSync: 'off' }]), 'sync-off');
  assert.equal(syncSendGate({ ...linked, guestId: 'g-1' }, 'owner'), 'guest');
  assert.equal(syncSendGate({}, 'owner'), 'unlinked');
  assert.equal(syncSendGate(linked, 'assistant'), 'assistant');
});

test('actor from seat claims: instructors is head, coach is coach, others are assistants', () => {
  assert.equal(syncActorFromClaims({ src: 'seat', preset: 'instructors' }), 'head');
  assert.equal(syncActorFromClaims({ src: 'seat', preset: 'coach' }), 'coach');
  assert.equal(syncActorFromClaims({ src: 'seat', preset: 'assistant' }), 'assistant');
  assert.equal(syncActorFromClaims({ src: 'seat', preset: 'director' }), 'assistant');
  assert.equal(syncActorFromToken(''), 'owner');
  assert.equal(syncActorFromToken('a.%%%.c'), 'assistant');
});

test('toggle off sends nothing: no cloud call, no folder file, no download', async () => {
  const folder = memoryHandoffFolder();
  let calls = 0;
  const deliver = async () => {
    calls += 1;
    return { mode: 'cloud' as const, studentPass: 'x' };
  };
  for (const gate of ['sync-off', 'guest', 'assistant', 'unlinked'] as const) {
    for (const packet of everyTestPacket()) {
      const result = await deliverSyncPacket(packet, gate, { deliver, folder });
      assert.equal(result.mode, 'blocked');
    }
  }
  assert.equal(calls, 0);
  assert.equal(folder.files.size, 0);
});

test('transport order: cloud first, then the gym folder, then a file', async () => {
  const packet = everyTestPacket()[2];
  const cloud = await deliverSyncPacket(packet, 'send', {
    deliver: async () => ({ mode: 'cloud', studentPass: 'p' }),
    folder: memoryHandoffFolder(),
  });
  assert.equal(cloud.mode, 'cloud');
  const fileDelivery = { mode: 'file' as const, ...syncPacketFile(packet), reason: 'no cloud' };
  const folder = memoryHandoffFolder();
  const viaFolder = await deliverSyncPacket(packet, 'send', { deliver: async () => fileDelivery, folder });
  assert.equal(viaFolder.mode, 'folder');
  assert.equal(folder.files.size, 1);
  const viaFile = await deliverSyncPacket(packet, 'send', { deliver: async () => fileDelivery, folder: null });
  assert.equal(viaFile.mode, 'file');
});

test('accept writes the coach overlay only; the student report is unchanged (no overwrite)', () => {
  const report = assignStudentId(blankStudentReport(10), 'stu-alex', 10);
  const before = JSON.stringify(report);
  const [, , belt, assessment] = everyTestPacket();
  if (belt.kind !== 'coach-belt-progress-update' || assessment.kind !== 'coach-assessment-update') throw new Error('kinds');
  const first = acceptCoachSyncUpdate(report, belt, emptyUpdateLedger(), emptyCoachOverlay());
  assert.equal(first.applied, true);
  assert.equal(first.report, report);
  assert.equal(JSON.stringify(first.report), before);
  assert.equal(first.overlay.beltProgress.blue?.benchmarks[0]?.coachStatus, 'working');
  const second = acceptCoachSyncUpdate(first.report, assessment, first.ledger, first.overlay);
  assert.equal(JSON.stringify(second.report), before);
  assert.equal(second.overlay.assessments.length, 1);
  // A repeat is not applied twice.
  assert.equal(acceptCoachSyncUpdate(report, assessment, second.ledger, second.overlay).applied, false);
});

test('decline (dismiss) records the id and leaves the report alone', () => {
  const report = assignStudentId(blankStudentReport(10), 'stu-alex', 10);
  const assessment = everyTestPacket()[3];
  if (assessment.kind !== 'coach-assessment-update') throw new Error('kind');
  const dismissed = dismissCoachRankUpdate(report, assessment, emptyUpdateLedger());
  assert.equal(JSON.stringify(dismissed.report), JSON.stringify(report));
  assert.ok(dismissed.ledger.dismissed.includes(assessment.updateId));
  const storage = testMemory();
  storage.setItem('matboard.studentEdition.coachUpdateLedger.v1', JSON.stringify(dismissed.ledger));
});

test('receive: accept-card kinds queue, the logo goes to the prompt, not the queue', () => {
  const storage = testMemory();
  const results = everyTestPacket().map((packet) => receiveSyncPacket(storage, packet));
  assert.deepEqual(results, ['queued', 'queued', 'queued', 'queued', 'queued', 'logo-started']);
  assert.equal(readCoachQueue(storage).length, 5);
  assert.equal(receiveSyncPacket(storage, everyTestPacket()[0], 'someone-else'), 'ignored');
});

test('file fallback round trip: the saved file imports on the student phone', () => {
  const storage = testMemory();
  const report = assignStudentId(blankStudentReport(10), 'stu-alex', 10);
  for (const packet of everyTestPacket()) {
    const file = syncPacketFile(packet);
    assert.match(file.name, new RegExp(`^advantage-handoff-${packet.kind}-`));
    const outcome = importCoachText(storage, report, file.json);
    assert.equal(outcome.kind, 'queued', packet.kind);
  }
  assert.deepEqual(
    readCoachQueue(storage).map((packet) => packet.updateId).sort(),
    ['assess-stu-alex', 'belt-stu-alex', 'comp-stu-alex', 'note-stu-alex', 'rank-stu-alex'],
  );
  assert.equal(readGymLogoSync(storage).shown?.dataUrl, TEST_LOGO);
});

test('gym folder round trip delivers only this student’s packets', async () => {
  const folder = memoryHandoffFolder();
  for (const packet of everyTestPacket()) await sendSyncPacketToFolder(folder, packet);
  for (const packet of everyTestPacket('stu-other')) await sendSyncPacketToFolder(folder, packet);
  const storage = testMemory();
  const results = await takeSyncPacketsFromFolder(folder, storage, 'stu-alex');
  assert.equal(results.filter((row) => row === 'queued').length, 5);
  assert.equal(readCoachQueue(storage).every((packet) => packet.studentId === 'stu-alex'), true);
});

test('gym logo stub: versioned by content, new bytes get a newer version', () => {
  const storage = testMemory();
  const first = versionGymLogo(storage, TEST_LOGO, 100);
  assert.equal(versionGymLogo(storage, TEST_LOGO, 500), first);
  const second = versionGymLogo(storage, TEST_LOGO_2, 100);
  assert.ok(second > first);
  let logo: string | null = null;
  const source = stubGymLogoSource(() => logo, storage, 'Advantage', () => 900);
  assert.equal(source.getGymLogo(), null);
  logo = TEST_LOGO;
  assert.equal(source.getGymLogo()?.dataUrl, TEST_LOGO);
});
