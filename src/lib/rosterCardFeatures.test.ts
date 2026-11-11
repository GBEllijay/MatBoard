/**
 * Coach Clipboard roster card: No photos, CSV and backup round-trips, card look,
 * the family photo flag, Competitor Roster actions, and private notes staying out
 * of student-facing paths.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { addStudent, competitorGamePlan, competitorReady, fillBlankCompetitorFromLinkedStudent, getRoster, linkCompetitorToRosterStudent, linkRosterCard, noPhotosChange, normalizeRoster, resetRoster, setGameNotes, setNoPhotos, setReadyFlag, updateStudent, type Student } from './rosterStore.ts';
import { blankCompetitorPatch, followedCompetitorPhoto } from './competitorCarryOver.ts';
import { importRosterCsv, serializeRosterCsv, NO_PHOTOS_HEADER } from './rosterCsv.ts';
import { buildRosterBackup, mergeRosterBackup, parseRosterBackup, serializeRosterBackup, sharedRosterBackup, type RosterBackupSources } from './rosterBackup.ts';
import { readCardFile, readPrivateNotes } from './rosterCardFields.ts';
import { readPrivateCoachNotes, readRosterCard, updateRosterCard, writePrivateCoachNotes, ROSTER_CARD_PRIVATE_KEY } from './rosterCardStore.ts';
import { CARD_LOOKS, CARD_LOOK_KEY, DEFAULT_CARD_LOOK, cardLookCode, parseCardLookCode, readCardLook, studentCardLook, writeCardLook } from './cardLook.ts';
import { applyStudentPhotoFlag, parseStudentPhotoFlag, readStudentNoPhotos, setStudentNoPhotos, studentPhotoFlagFile } from './studentPhotoFlag.ts';
import { enableParentGate } from './parentGate.ts';
import { addToCompetitorRoster, competitorDraftFromStudentCard, removeLinkedCompetitorCard, shownCardPhoto, turnOffCompetitorToggle } from './rosterCardActions.ts';
import { beltProgressFromCard } from './rosterCardSync.ts';

class MemoryStorage {
  map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

const PHOTO = 'data:image/jpeg;base64,AAAA';

function studentCard(name = 'Ana Lima'): Student {
  const card = addStudent({ name, belt: 'blue', division: '', gym: 'Advantage', lastPromotion: '', lastPromotionDetail: '', note: '', photo: PHOTO }, { rosterList: 'student' });
  assert.ok(card);
  return card;
}

beforeEach(() => resetRoster());

/** The one roster backup (advantage-roster-backup) built from this device's stores. */
function sourcesFrom(store: MemoryStorage, includePrivate: boolean): RosterBackupSources {
  return {
    roster: JSON.parse(JSON.stringify(getRoster())),
    cardFile: readCardFile(store),
    privateNotes: includePrivate ? readPrivateNotes(store) : {},
    inbox: [],
  };
}

function emptySources(): RosterBackupSources {
  return { roster: { version: 1, students: [], ready: [], gamePlans: [], competitionPlans: [] } as unknown as RosterBackupSources['roster'], cardFile: { cards: {} }, privateNotes: {}, inbox: [] };
}

describe('No photos (per student)', () => {
  it('coach sets and clears; the photo is blanked and shownCardPhoto is empty', () => {
    const card = studentCard();
    assert.equal(shownCardPhoto(card), PHOTO);
    const on = setNoPhotos(card.id, true, 'coach');
    assert.ok(on.ok);
    const row = getRoster().students.find((s) => s.id === card.id) as Student;
    assert.equal(row.noPhotos, 'coach');
    assert.equal(shownCardPhoto(row), '');
    assert.equal(row.photo, '', 'the stored photo is cleared too');
    // A later edit cannot put a photo back while No photos is on.
    updateStudent(card.id, { photo: PHOTO });
    assert.equal((getRoster().students.find((s) => s.id === card.id) as Student).photo, '');
    const off = setNoPhotos(card.id, false, 'coach');
    assert.ok(off.ok);
    assert.equal((getRoster().students.find((s) => s.id === card.id) as Student).noPhotos, undefined);
  });

  it('the coach cannot clear a family flag; only the family can', () => {
    const card = studentCard();
    assert.ok(setNoPhotos(card.id, true, 'family').ok);
    const blocked = setNoPhotos(card.id, false, 'coach');
    assert.deepEqual(blocked, { ok: false, reason: 'set-by-family' });
    assert.equal((getRoster().students.find((s) => s.id === card.id) as Student).noPhotos, 'family');
    assert.ok(setNoPhotos(card.id, false, 'family').ok);
    assert.equal((getRoster().students.find((s) => s.id === card.id) as Student).noPhotos, undefined);
  });

  it('a family flag upgrades a coach flag; the family clearing a coach flag leaves it', () => {
    const base = { ...studentCard(), noPhotos: 'coach' as const };
    const upgraded = noPhotosChange(base, true, 'family');
    assert.ok(upgraded.ok && upgraded.student.noPhotos === 'family');
    const kept = noPhotosChange(base, false, 'family');
    assert.ok(kept.ok && kept.student.noPhotos === 'coach');
  });

  it('CSV round-trip keeps the No photos column', () => {
    const a = studentCard('Ana Lima');
    const b = studentCard('Bo Chen');
    setNoPhotos(a.id, true, 'family');
    setNoPhotos(b.id, true, 'coach');
    const c = studentCard('Cy Park');
    const rows = getRoster().students.filter((s) => [a.id, b.id, c.id].includes(s.id));
    const csv = serializeRosterCsv(rows);
    assert.ok(csv.split('\r\n')[0].endsWith(`,${NO_PHOTOS_HEADER}`));
    const back = importRosterCsv(csv);
    const by = Object.fromEntries(back.students.map((s) => [s.name, s.noPhotos]));
    assert.equal(by['Ana Lima'], 'family');
    assert.equal(by['Bo Chen'], 'coach');
    assert.equal(by['Cy Park'], undefined);
  });

  it('full backup (the saved roster) round-trips the flag', () => {
    const a = studentCard();
    setNoPhotos(a.id, true, 'family');
    const saved = JSON.parse(JSON.stringify(getRoster()));
    const restored = normalizeRoster(saved);
    assert.equal(restored.students.find((s) => s.id === a.id)?.noPhotos, 'family');
  });

  it('the roster backup keeps the flag and the family lock, in both scopes, with no photo', () => {
    const store = new MemoryStorage();
    const a = studentCard('Ana Lima');
    const b = studentCard('Bo Chen');
    const c = studentCard('Cy Park');
    setNoPhotos(a.id, true, 'family');
    setNoPhotos(b.id, true, 'coach');
    updateRosterCard(a.id, (row) => ({ ...row, photos: [{ id: 'p1', dataUrl: PHOTO }], shownPhotoId: 'p1' }) as typeof row, store);
    for (const scope of ['coach-private', 'shared'] as const) {
      const backup = buildRosterBackup(sourcesFrom(store, scope === 'coach-private'), { scope });
      assert.equal(backup.kind, 'advantage-roster-backup');
      assert.equal(backup.schemaVersion, 1);
      const parsed = parseRosterBackup(serializeRosterBackup(backup));
      assert.ok(parsed.ok);
      const by = Object.fromEntries(parsed.backup.roster.students.map((s) => [s.name, s]));
      assert.equal(by['Ana Lima'].noPhotos, 'family');
      assert.equal(by['Bo Chen'].noPhotos, 'coach');
      assert.equal(by['Cy Park'].noPhotos, undefined);
      assert.equal(by['Ana Lima'].photo, '');
      assert.equal(by['Bo Chen'].photo, '');
      assert.equal(parsed.backup.cards[a.id]?.photos, undefined);
      assert.equal(parsed.backup.cards[a.id]?.shownPhotoId, undefined);
      assert.ok(!serializeRosterBackup(backup).includes(PHOTO) || scope === 'coach-private');
      if (scope === 'coach-private') assert.equal(by['Cy Park'].photo, PHOTO);
    }
    assert.ok(c);
  });

  it('a shared gym folder or cloud copy never carries a photo of a No photos student', () => {
    const store = new MemoryStorage();
    const a = studentCard('Ana Lima');
    setNoPhotos(a.id, true, 'family');
    // Even a hand-made file with a photo is cleaned on the shared path the cloud uses.
    const backup = buildRosterBackup(sourcesFrom(store, true), { scope: 'coach-private' });
    backup.roster.students[0].photo = PHOTO;
    backup.cards[a.id] = { photos: [{ id: 'p1', dataUrl: PHOTO }], shownPhotoId: 'p1' };
    backup.coachStores = { studentInbox: { notices: [], dismissed: [], shares: [], decided: [] }, photoReviews: [{ id: 'r1', cardId: a.id, photo: PHOTO }], cardSyncSent: [] };
    const parsed = parseRosterBackup(JSON.stringify(backup));
    assert.ok(parsed.ok);
    const shared = sharedRosterBackup(parsed.backup);
    assert.equal(shared.roster.students[0].noPhotos, 'family');
    assert.ok(!JSON.stringify(shared).includes(PHOTO));
  });

  it('importing a backup never clears a flag, and a family flag outranks a coach flag', () => {
    const store = new MemoryStorage();
    const a = studentCard('Ana Lima');
    setNoPhotos(a.id, true, 'family');
    const file = buildRosterBackup(sourcesFrom(store, false), { scope: 'shared' });
    resetRoster();
    const here = studentCard('Ana Lima');
    setNoPhotos(here.id, true, 'coach');
    const local = sourcesFrom(new MemoryStorage(), false);
    const { next } = mergeRosterBackup(local, file);
    const row = next.roster.students.find((s) => s.name === 'Ana Lima');
    assert.equal(row?.noPhotos, 'family');
    assert.equal(row?.photo, '');
    // A file without the flag leaves this device's flag alone.
    const plain = buildRosterBackup(emptySources(), { scope: 'shared' });
    plain.roster.students = [{ ...file.roster.students[0], noPhotos: undefined, photo: PHOTO }];
    const again = mergeRosterBackup(next, plain).next.roster.students.find((s) => s.name === 'Ana Lima');
    assert.equal(again?.noPhotos, 'family');
    assert.equal(again?.photo, '');
  });

  it('the flag follows the student onto a new competitor card, without a photo', () => {
    const a = studentCard();
    setNoPhotos(a.id, true, 'family');
    const store = new MemoryStorage();
    const made = addToCompetitorRoster(a.id, store);
    assert.ok(made.ok && made.created);
    const comp = getRoster().students.find((s) => s.id === (made as { competitorId: string }).competitorId) as Student;
    assert.equal(comp.noPhotos, 'family');
    assert.equal(comp.photo, '');
  });
});

describe('student Don\'t allow photos', () => {
  it('sets without a gate, makes a packet, and the coach import applies it as family', async () => {
    const store = new MemoryStorage();
    const card = studentCard();
    linkRosterCard(card.id, 'stu-ana-1');
    const result = await setStudentNoPhotos(store, true, { studentId: 'stu-ana-1', now: Date.UTC(2026, 10, 4) });
    assert.ok(result.ok && result.packet);
    assert.equal(readStudentNoPhotos(store).on, true);
    const file = studentPhotoFlagFile(result.packet);
    const packet = parseStudentPhotoFlag(file.json);
    assert.ok(packet);
    assert.equal(applyStudentPhotoFlag(packet), 1);
    const row = getRoster().students.find((s) => s.id === card.id) as Student;
    assert.equal(row.noPhotos, 'family');
    // The coach still cannot clear it.
    assert.equal(setNoPhotos(card.id, false, 'coach').ok, false);
  });

  it('with Parent approvals on, the parent PIN is required and the flag is set by parent', async () => {
    const store = new MemoryStorage();
    assert.ok((await enableParentGate(store, '2468')).ok);
    const refused = await setStudentNoPhotos(store, true, { studentId: 'stu-1', pin: '' });
    assert.equal(refused.ok, false);
    assert.equal(readStudentNoPhotos(store).on, false);
    const ok = await setStudentNoPhotos(store, true, { studentId: 'stu-1', pin: '2468' });
    assert.ok(ok.ok && ok.flag.setBy === 'parent');
  });

  it('rejects malformed packets', () => {
    assert.equal(parseStudentPhotoFlag('{"kind":"x"}'), null);
    assert.equal(parseStudentPhotoFlag('not json'), null);
  });
});

describe('card look (gym setting)', () => {
  it('defaults to Coach Clipboard, Dark and persists each of the four looks', () => {
    const store = new MemoryStorage();
    assert.deepEqual(readCardLook(store), DEFAULT_CARD_LOOK);
    assert.equal(CARD_LOOKS.length, 4);
    for (const look of CARD_LOOKS) {
      writeCardLook(look, store);
      assert.deepEqual(readCardLook(store), look);
      assert.deepEqual(parseCardLookCode(cardLookCode(look)), look);
    }
  });

  it('ignores junk and unknown codes', () => {
    const store = new MemoryStorage();
    store.setItem(CARD_LOOK_KEY, '{"style":"neon","skin":"plaid"}');
    assert.deepEqual(readCardLook(store), DEFAULT_CARD_LOOK);
    assert.equal(parseCardLookCode('neon-plaid'), null);
  });

  it('the student follows the newest accepted coach update that carried a look', () => {
    assert.deepEqual(studentCardLook([]), DEFAULT_CARD_LOOK);
    const look = studentCardLook([
      { cardLook: 'fighter-light', issuedOn: '2026-10-01' },
      { cardLook: 'clipboard-light', date: '2026-11-01' },
      { issuedOn: '2026-11-03' },
    ]);
    assert.deepEqual(look, { style: 'clipboard', skin: 'light' });
  });

  it('the look rides in the roster backup cardSettings and restores', () => {
    const store = new MemoryStorage();
    writeCardLook({ style: 'fighter', skin: 'light' }, store);
    const backup = buildRosterBackup(sourcesFrom(store, true), { scope: 'coach-private' });
    assert.deepEqual(backup.cardSettings?.cardLook, { style: 'fighter', skin: 'light' });
    const { next } = mergeRosterBackup(emptySources(), JSON.parse(serializeRosterBackup(backup)));
    const fresh = new MemoryStorage();
    fresh.setItem('matboard.rosterCard.v1', JSON.stringify(next.cardFile));
    assert.deepEqual(readCardLook(fresh), { style: 'fighter', skin: 'light' });
  });

  it('a card save keeps the look and other settings in the card file', () => {
    const store = new MemoryStorage();
    writeCardLook({ style: 'fighter', skin: 'dark' }, store);
    const card = studentCard();
    updateRosterCard(card.id, (row) => ({ ...row, benchmarkChecks: { a: true } }), store);
    assert.deepEqual(readCardLook(store), { style: 'fighter', skin: 'dark' });
  });

  it('reads the legacy look key from the first card build', () => {
    const store = new MemoryStorage();
    store.setItem(CARD_LOOK_KEY, JSON.stringify({ style: 'fighter', skin: 'light' }));
    assert.deepEqual(readCardLook(store), { style: 'fighter', skin: 'light' });
  });
});

describe('private coach notes', () => {
  it('only reach the coach-private roster backup: never the CSV, the shared copy, the competitor draft, or the belt sync payload', () => {
    const store = new MemoryStorage();
    const card = studentCard();
    writePrivateCoachNotes(card.id, 'SECRET-PRIVATE-NOTE', store);
    updateRosterCard(card.id, (row) => ({ ...row, benchmarkChecks: { a: true } }), store);
    const record = readRosterCard(card.id, store);
    const csv = serializeRosterCsv(getRoster().students);
    assert.ok(!csv.includes('SECRET-PRIVATE-NOTE'));
    assert.ok(!JSON.stringify(competitorDraftFromStudentCard(card, record)).includes('SECRET'));
    assert.ok(!JSON.stringify(beltProgressFromCard(record, [{ id: 'a', name: 'Guard' }])).includes('SECRET'));
    assert.ok(!JSON.stringify(record).includes('SECRET'));
    const shared = buildRosterBackup(sourcesFrom(store, true), { scope: 'shared' });
    assert.ok(!serializeRosterBackup(shared).includes('SECRET'));
    const backup = buildRosterBackup(sourcesFrom(store, true), { scope: 'coach-private' });
    assert.equal(backup.privateNotes?.[card.id], 'SECRET-PRIVATE-NOTE');
    const { next } = mergeRosterBackup(emptySources(), JSON.parse(serializeRosterBackup(backup)));
    const fresh = new MemoryStorage();
    fresh.setItem(ROSTER_CARD_PRIVATE_KEY, JSON.stringify(next.privateNotes));
    assert.equal(readPrivateCoachNotes(next.roster.students[0].id, fresh), 'SECRET-PRIVATE-NOTE');
  });
});

describe('belt benchmarks sent to the student', () => {
  it('coach checks become ready, the rest working; ids and names come from the checkpoints', () => {
    const out = beltProgressFromCard({ benchmarkChecks: { a: true, b: false } }, [
      { id: 'a', name: 'Closed guard' },
      { id: 'b', name: 'Mount escape' },
      { id: 'c', name: 'Armbar' },
    ]);
    assert.deepEqual(
      out.map((row) => [row.targetId, row.coachStatus]),
      [['a', 'ready'], ['b', 'working'], ['c', 'working']],
    );
  });
});

describe('Add to Competitor Roster', () => {
  it('makes one new linked card; checking again reuses it; unchecking keeps it; remove needs confirm', () => {
    const store = new MemoryStorage();
    const card = studentCard();
    linkRosterCard(card.id, 'stu-ana-2');
    updateRosterCard(card.id, (row) => ({ ...row, trainingStyle: 'nogi' }), store);
    const first = addToCompetitorRoster(card.id, store);
    assert.ok(first.ok && first.created);
    const compId = (first as { competitorId: string }).competitorId;
    const comp = getRoster().students.find((s) => s.id === compId) as Student;
    assert.notEqual(comp.rosterList, 'student');
    assert.equal(comp.linkedStudentId, 'stu-ana-2');
    assert.equal(comp.division, 'No-Gi');
    const again = addToCompetitorRoster(card.id, store);
    assert.ok(again.ok && !again.created && again.competitorId === compId);
    turnOffCompetitorToggle(card.id, store);
    assert.ok(getRoster().students.some((s) => s.id === compId), 'unchecking never deletes');
    assert.equal(removeLinkedCompetitorCard(card.id, false, store), false);
    assert.ok(getRoster().students.some((s) => s.id === compId));
    assert.equal(removeLinkedCompetitorCard(card.id, true, store), true);
    assert.ok(!getRoster().students.some((s) => s.id === compId));
    assert.ok(getRoster().students.some((s) => s.id === card.id), 'the student card stays');
  });

  it('refuses for a competitor card', () => {
    const comp = addStudent({ name: 'Comp Only', belt: 'white', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '', photo: '' });
    assert.ok(comp);
    assert.equal(addToCompetitorRoster(comp.id, new MemoryStorage()).ok, false);
  });

  it('fills only blank fields when the switch reuses a linked competitor card', () => {
    const store = new MemoryStorage();
    const card = studentCard();
    updateStudent(card.id, { division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', photo: '' });
    const made = addToCompetitorRoster(card.id, store);
    assert.ok(made.ok && made.created);
    const compId = (made as { competitorId: string }).competitorId;
    const keptPhoto = 'data:image/png;base64,BBBB';
    updateStudent(compId, { gym: 'Kept gym', photo: keptPhoto, note: 'KEEP-NOTE', stripes: 0 });
    updateRosterCard(card.id, (row) => ({ ...row, trainingStyle: 'gi' }), store);
    setGameNotes(compId, 'a', 'KEEP-GAME');
    setReadyFlag(compId, 'medical', true);
    updateStudent(card.id, {
      division: 'Adult Blue',
      gym: 'Ellijay',
      lastPromotion: '2026-06-01',
      lastPromotionDetail: 'Blue belt',
      photo: PHOTO,
      stripes: 2,
    });
    const again = addToCompetitorRoster(card.id, store);
    assert.ok(again.ok && !again.created);
    const next = getRoster().students.find((row) => row.id === compId) as Student;
    assert.equal(next.gym, 'Kept gym');
    assert.equal(next.photo, keptPhoto);
    assert.equal(next.stripes, 0);
    assert.equal(next.note, 'KEEP-NOTE');
    assert.equal(next.division, 'Gi');
    assert.equal(next.lastPromotion, '2026-06-01');
    assert.equal(next.lastPromotionDetail, 'Blue belt');
    assert.equal(competitorGamePlan(compId).a.notes, 'KEEP-GAME');
    assert.equal(competitorReady(compId).flags.medical, true);
    assert.equal(getRoster().competitionPlans[compId], undefined);
  });

  it('same person link fills blanks and leaves competitor-only notes alone', () => {
    const store = new MemoryStorage();
    const card = studentCard('Paige');
    linkRosterCard(card.id, 'stu-paige');
    updateStudent(card.id, {
      division: 'Adult',
      gym: 'Ellijay',
      lastPromotion: '2026-01-02',
      lastPromotionDetail: 'stripe',
      photo: PHOTO,
      stripes: 2,
    });
    updateRosterCard(card.id, (row) => ({ ...row, trainingStyle: '' }), store);
    const comp = addStudent({ name: 'Paige', belt: 'Black', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: 'KEEP', photo: '' });
    assert.ok(comp);
    setGameNotes(comp.id, 'home', 'KEEP-HOME');
    const linked = linkCompetitorToRosterStudent(comp.id, card.id);
    assert.equal(linked.ok, true);
    const next = getRoster().students.find((row) => row.id === comp.id) as Student;
    assert.equal(next.belt, 'Black');
    assert.equal(next.division, 'Adult');
    assert.equal(next.gym, 'Ellijay');
    assert.equal(next.lastPromotion, '2026-01-02');
    assert.equal(next.lastPromotionDetail, 'stripe');
    assert.equal(next.photo, PHOTO);
    assert.equal(next.stripes, 2);
    assert.equal(next.note, 'KEEP');
    assert.equal(competitorGamePlan(comp.id).home.notes, 'KEEP-HOME');
    const other = 'data:image/webp;base64,CCCC';
    updateStudent(comp.id, { photo: other });
    updateStudent(card.id, { photo: PHOTO, gym: 'New gym' });
    const filled = fillBlankCompetitorFromLinkedStudent(comp.id, store);
    assert.equal(filled?.photo, other);
    assert.equal(filled?.gym, 'Ellijay');
    assert.equal(followedCompetitorPhoto(filled as Student, getRoster().students.find((row) => row.id === card.id)), PHOTO);
  });

  it('does not copy a photo when No photos is set, and a patch never includes notes', () => {
    const card = studentCard();
    setNoPhotos(card.id, true, 'coach');
    const patch = blankCompetitorPatch(
      { name: '', belt: '', stripes: undefined, division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', photo: '', noPhotos: undefined },
      getRoster().students.find((row) => row.id === card.id) as Student,
      { trainingStyle: 'nogi' },
    );
    assert.equal(patch?.name, 'Ana Lima');
    assert.equal(patch?.division, 'No-Gi');
    assert.equal(patch?.photo, undefined);
    assert.equal((patch as { note?: string } | null)?.note, undefined);
    assert.equal(followedCompetitorPhoto({ photo: PHOTO, noPhotos: undefined }, { photo: PHOTO, noPhotos: 'coach' }), '');
  });
});
