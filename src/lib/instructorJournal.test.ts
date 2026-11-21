import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { INSTRUCTOR_D12_STORAGE_KEY, saveInstructorD12Scores } from './instructorD12.ts';
import {
  INSTRUCTOR_D12_CARDS_STORAGE_KEY,
  instructorD12StarterCards,
  saveInstructorD12Cards,
  toggleD12CardNoteShare,
  toggleD12CardVideoShare,
  withD12CardNotes,
  withD12CardVideo,
} from './instructorD12Cards.ts';
import {
  INSTRUCTOR_D12_LINKS_STORAGE_KEY,
  INSTRUCTOR_D12_SAMPLE_LINKS,
  saveInstructorD12Links,
} from './instructorD12Mastery.ts';
import {
  EMPTY_INSTRUCTOR_JOURNAL,
  INSTRUCTOR_GOALS_SAMPLE,
  INSTRUCTOR_GOALS_STORAGE_KEY,
  INSTRUCTOR_JOURNAL_SAMPLE,
  INSTRUCTOR_JOURNAL_STORAGE_KEY,
  addInstructorGoal,
  addInstructorJournalEntry,
  addInstructorJournalVideo,
  buildStudentShareBundle,
  deleteInstructorGoal,
  deleteInstructorJournalEntry,
  instructorJournalMentionsForCard,
  instructorJournalMentionsForFace,
  loadInstructorGoals,
  loadInstructorJournal,
  parseTechniqueInput,
  removeInstructorJournalVideo,
  saveInstructorGoals,
  saveInstructorJournal,
  toggleInstructorGoal,
  toggleJournalFieldShare,
  toggleJournalTechniqueShare,
  toggleJournalVideoShare,
  todayLocalIso,
} from './instructorJournal.ts';

function memoryStorage(start: Record<string, string> = {}): Pick<Storage, 'getItem' | 'setItem'> & { map: Map<string, string> } {
  const map = new Map(Object.entries(start));
  return {
    map,
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

const INTRO = 'starter.public-speaking.intro-end-of-class-message';
const MAT = 'starter.preparation.mat-inspection';

test('journal and goals save under their own keys and never touch cards, links, or check-in', () => {
  const storage = memoryStorage();
  saveInstructorD12Scores({ energy: 4 }, storage, 'owner');
  saveInstructorD12Cards(instructorD12StarterCards(), storage, 'owner');
  saveInstructorD12Links([...INSTRUCTOR_D12_SAMPLE_LINKS], storage, 'owner');
  const scoresRaw = storage.map.get(INSTRUCTOR_D12_STORAGE_KEY);
  const cardsRaw = storage.map.get(INSTRUCTOR_D12_CARDS_STORAGE_KEY);
  const linksRaw = storage.map.get(INSTRUCTOR_D12_LINKS_STORAGE_KEY);

  const addedEntry = addInstructorJournalEntry([], {
    classLabel: '6:00 PM Fundamentals',
    whoInClass: 'Alex M., Jordan R.',
    reflection: 'Pacing felt tight during Mat inspection.',
    techniques: parseTechniqueInput('Scissor sweep, Hip bump sweep'),
  });
  assert.ok(!('error' in addedEntry));
  assert.equal(addedEntry.entry.date, todayLocalIso());
  saveInstructorJournal(addedEntry.entries, storage, 'owner');

  const addedGoal = addInstructorGoal([], 'Check mat corners before warm-ups', MAT);
  assert.ok(!('error' in addedGoal));
  saveInstructorGoals(addedGoal.goals, storage, 'owner');

  assert.equal(storage.map.get(INSTRUCTOR_D12_STORAGE_KEY), scoresRaw);
  assert.equal(storage.map.get(INSTRUCTOR_D12_CARDS_STORAGE_KEY), cardsRaw);
  assert.equal(storage.map.get(INSTRUCTOR_D12_LINKS_STORAGE_KEY), linksRaw);
  assert.equal(loadInstructorJournal(storage, 'owner').length, 1);
  assert.equal(loadInstructorJournal(storage, 'seat-2').length, 0);
  assert.equal(loadInstructorGoals(storage, 'owner').length, 1);
  assert.equal(loadInstructorGoals(storage, 'seat-2').length, 0);
});

test('mention matching mirrors the student journal and supports explicit D12 tags', () => {
  const cards = instructorD12StarterCards();
  const intro = cards.find((c) => c.id === INTRO)!;
  const mat = cards.find((c) => c.id === MAT)!;
  const parents = cards.find((c) => c.id === 'starter.public-speaking.communicating-with-parents-off-the-mat')!;

  const e1 = addInstructorJournalEntry([], {
    date: '2026-11-20',
    classLabel: 'Evening',
    reflection: 'Ran a quick mat inspection before class.',
  }, 10);
  assert.ok(!('error' in e1));
  const e2 = addInstructorJournalEntry(e1.entries, {
    date: '2026-11-21',
    reflection: 'Spoke for ninety seconds at the bow-in.',
    tags: [INTRO],
  }, 20);
  assert.ok(!('error' in e2));

  const g1 = addInstructorGoal([], 'Keep Mat inspection under two minutes');
  assert.ok(!('error' in g1));
  const g2 = addInstructorGoal(g1.goals, 'Trim opening speech', INTRO);
  assert.ok(!('error' in g2));

  const matHits = instructorJournalMentionsForCard(e2.entries, g2.goals, mat);
  assert.equal(matHits.entries.length, 1);
  assert.equal(matHits.entries[0]!.tagged, false);
  assert.equal(matHits.goals.length, 1);

  const introHits = instructorJournalMentionsForCard(e2.entries, g2.goals, intro);
  assert.equal(introHits.entries.length, 1);
  assert.equal(introHits.entries[0]!.tagged, true);
  assert.equal(introHits.goals.length, 1);

  const parentHits = instructorJournalMentionsForCard(e2.entries, g2.goals, parents);
  assert.equal(parentHits.entries.length, 0);
  assert.equal(parentHits.goals.length, 0);
  assert.equal(EMPTY_INSTRUCTOR_JOURNAL, 'No journal entries mention this yet.');

  const faceHits = instructorJournalMentionsForFace(e2.entries, g2.goals, 'public-speaking', cards);
  assert.equal(faceHits.entries.length, 1);
  assert.equal(faceHits.goals.length, 1);
});

test('videos, goals checklist, and private-by-default student share bundles', () => {
  let cards = instructorD12StarterCards();
  cards = withD12CardNotes(cards, INTRO, 'Stand near the center line.');
  const cardVid = withD12CardVideo(cards, INTRO, 'Card cue video', 'https://example.com/card-cue');
  assert.ok(!('error' in cardVid));
  cards = cardVid.cards;

  const added = addInstructorJournalEntry([], {
    date: '2026-11-21',
    classLabel: '6:00 PM Fundamentals',
    whoInClass: 'Alex M., Jordan R.',
    reflection: 'Private coach reflection: warm-ups ran two minutes long.',
    classNotes: 'Keep elbows tucked when framing.',
    techniques: parseTechniqueInput('Scissor sweep, Armbar'),
    tags: [INTRO],
  });
  assert.ok(!('error' in added));
  let entries = added.entries;

  const vidRes = addInstructorJournalVideo(entries, added.entry.id, 'Scissor sweep drill', 'https://example.com/sweep');
  assert.ok(!('error' in vidRes));
  entries = vidRes.entries;
  assert.deepEqual(addInstructorJournalVideo(entries, added.entry.id, 'bad', 'javascript:alert(1)'), { error: 'link' });

  // By default, everything is excluded from the student bundle.
  const privateBundle = buildStudentShareBundle(entries[0]!, cards);
  assert.equal(privateBundle.notes, '');
  assert.deepEqual(privateBundle.techniques, []);
  assert.deepEqual(privateBundle.videos, []);
  assert.ok(privateBundle.excludedPrivateCount >= 6);

  // Opt in per item: class notes, one technique, entry video, plus card notes/video.
  entries = toggleJournalFieldShare(entries, added.entry.id, 'classNotes', true);
  entries = toggleJournalTechniqueShare(entries, added.entry.id, 'Scissor sweep', true);
  entries = toggleJournalVideoShare(entries, added.entry.id, 'https://example.com/sweep', true);
  cards = toggleD12CardNoteShare(cards, INTRO, true);
  cards = toggleD12CardVideoShare(cards, INTRO, 'https://example.com/card-cue', true);

  const sharedBundle = buildStudentShareBundle(entries[0]!, cards);
  assert.equal(sharedBundle.className, '6:00 PM Fundamentals');
  assert.match(sharedBundle.notes, /Keep elbows tucked when framing/);
  assert.match(sharedBundle.notes, /Intro \/ end-of-class message: Stand near the center line/);
  assert.doesNotMatch(sharedBundle.notes, /Private coach reflection/);
  assert.deepEqual(sharedBundle.techniques, ['Scissor sweep']);
  assert.deepEqual(
    sharedBundle.videos.map((v) => v.title),
    ['Scissor sweep drill', 'Card cue video'],
  );

  entries = removeInstructorJournalVideo(entries, added.entry.id, 'https://example.com/sweep');
  assert.equal(entries[0]!.videos, undefined);
  entries = deleteInstructorJournalEntry(entries, added.entry.id);
  assert.equal(entries.length, 0);

  let goals = addInstructorGoal([], 'Review lesson plan').goals!;
  const goalId = goals[0]!.id;
  goals = toggleInstructorGoal(goals, goalId);
  assert.equal(goals[0]!.done, true);
  goals = deleteInstructorGoal(goals, goalId);
  assert.equal(goals.length, 0);
});

test('sample journal and goals use generic fictional data with no brand names', () => {
  assert.ok(INSTRUCTOR_JOURNAL_SAMPLE.length >= 2);
  assert.ok(INSTRUCTOR_GOALS_SAMPLE.length >= 2);
  const text = readFileSync('src/lib/instructorJournal.ts', 'utf8');
  assert.doesNotMatch(text, /gracie|barra/i);
});
