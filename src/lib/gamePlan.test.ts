import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  emptyGamePlan,
  gamePlanMentionIndex,
  gamePlanStatusLabel,
  mentionsForNode,
  mergeImportedGameNotes,
  normalizeGamePlan,
  suggestTechniqueTargets,
  withGameLink,
} from './gamePlan.ts';
import {
  addCompetitorWeighIn,
  addGameLink,
  addStudent,
  competitorGamePlan,
  dropSiblingCompetitor,
  getRoster,
  importStudentCompetition,
  migrateSharedGamePlan,
  normalizeRoster,
  removeGameLink,
  removeStudent,
  resetRoster,
  rosterSavePayload,
  rosterSiblings,
  setGameAudit,
  setGameLinkFlag,
  setGameNotes,
  updateStudent,
} from './rosterStore.ts';
import { blankStudentReport } from './studentEdition.ts';
import { setCompetitionGame } from './studentCompetition.ts';
import { activeTree, addChild, emptyTree, setRoot, updateNode, type TechniqueTreeArchive } from './techniqueTreeStore.ts';

function sampleArchive(): TechniqueTreeArchive {
  let doc = setRoot(emptyTree('Half guard'), 'Half guard', '');
  const entry = addChild(doc, doc.root!.id, 'branch');
  doc = updateNode(entry.doc, entry.id!, { title: 'Berimbolo entry' });
  const retention = addChild(doc, doc.root!.id, 'defense');
  doc = updateNode(retention.doc, retention.id!, { title: 'Half-guard retention' });
  return { version: 2, activeId: doc.id, trees: [doc] };
}

describe('game plan notes do not require a technique link', () => {
  it('saves a custom note with no node, and a link does not replace that note', () => {
    resetRoster();
    const added = addStudent({ name: 'Alex Rivera', belt: 'Blue', division: 'Adult Blue', gym: '', lastPromotion: '', note: '' });
    assert.ok(added);
    setGameNotes(added.id, 'a', 'Pass to the left and settle.');
    let plan = competitorGamePlan(added.id);
    assert.equal(plan.a.notes, 'Pass to the left and settle.');
    assert.equal(plan.a.links.length, 0);
    assert.equal(plan.a.audit, '');

    const archive = sampleArchive();
    const nodeId = archive.trees[0].root!.children[0].id;
    addGameLink(added.id, 'a', { treeId: archive.trees[0].id, nodeId });
    plan = competitorGamePlan(added.id);
    assert.equal(plan.a.notes, 'Pass to the left and settle.');
    assert.equal(plan.a.links.length, 1);
    assert.equal(plan.a.links[0].flag, '');

    setGameNotes(added.id, 'home', 'Film study. Fight-week sodium.');
    plan = competitorGamePlan(added.id);
    assert.equal(plan.home.notes, 'Film study. Fight-week sodium.');
    assert.equal(plan.home.links.length, 0);
    assert.equal(plan.home.audit, '');
    resetRoster();
  });

  it('keeps the plan when the roster card is edited and drops it when the competitor is removed', () => {
    resetRoster();
    const added = addStudent({ name: 'Sam', belt: 'Purple', division: '', gym: '', lastPromotion: '', note: '' });
    assert.ok(added);
    setGameNotes(added.id, 'b', 'Knee cut when the pass stalls.');
    setGameAudit(added.id, 'b', 'underdeveloped');
    const edited = updateStudent(added.id, { note: 'Left knee', division: 'Adult Purple' });
    assert.equal(edited?.division, 'Adult Purple');
    assert.equal(edited?.note, 'Left knee');
    assert.equal(competitorGamePlan(added.id).b.notes, 'Knee cut when the pass stalls.');
    assert.equal(competitorGamePlan(added.id).b.audit, 'underdeveloped');
    setGameAudit(added.id, 'b', 'underdeveloped');
    assert.equal(competitorGamePlan(added.id).b.audit, '');
    removeStudent(added.id);
    assert.equal(competitorGamePlan(added.id).b.notes, '');
    resetRoster();
  });
});

describe('normalizeGamePlan', () => {
  it('drops blank plans, junk links, and a home audit', () => {
    assert.equal(normalizeGamePlan({ a: { notes: '   ', links: [] } }), null);
    const plan = normalizeGamePlan({
      a: {
        notes: '  Bread and butter  ',
        audit: 'balanced',
        links: [
          { treeId: 'tree-1', nodeId: 'node-1', flag: 'strong' },
          { treeId: 'tree-1', nodeId: 'node-1', flag: 'needs-work' },
          { treeId: '', nodeId: 'node-2' },
          { treeId: 'tree-2', nodeId: 'node-2', flag: 'maybe' },
        ],
      },
      home: { notes: 'Drill', audit: 'overdeveloped', links: [] },
    });
    assert.ok(plan);
    assert.equal(plan.a.notes, 'Bread and butter');
    assert.equal(plan.a.audit, 'balanced');
    assert.deepEqual(
      plan.a.links.map((link) => `${link.treeId}:${link.nodeId}:${link.flag}`),
      ['tree-1:node-1:strong', 'tree-2:node-2:'],
    );
    assert.equal(plan.home.notes, 'Drill');
    assert.equal(plan.home.audit, '');
  });

  it('keeps a saved plan on the roster and ignores an unknown competitor', () => {
    const next = normalizeRoster({
      students: [{ id: 'sam', name: 'Sam', belt: 'Blue' }],
      gamePlans: {
        sam: { c: { notes: 'Surprise armbar', audit: 'overdeveloped', links: [] } },
        gone: { a: { notes: 'Missing card', links: [] } },
      },
      ready: { sam: { note: 'forms' } },
    });
    assert.equal(next.gamePlans.sam.c.notes, 'Surprise armbar');
    assert.equal(next.gamePlans.gone, undefined);
    assert.equal(next.ready.sam?.note, 'forms');
    assert.equal(gamePlanStatusLabel(next.gamePlans.sam), 'C Game');
    assert.equal(gamePlanStatusLabel(emptyGamePlan()), 'No game plan yet');
    const siblings = rosterSiblings({
      version: 1,
      students: [],
      gamePlans: {},
      ready: { sam: { note: 'forms' } },
      extraMap: { keep: true },
    });
    const payload = rosterSavePayload(next, siblings);
    assert.equal(next.ready.sam?.note, 'forms');
    assert.equal((payload.ready as { sam: { note: string } }).sam.note, 'forms');
    assert.equal((payload.extraMap as { keep: boolean }).keep, true);
    assert.equal(next.gamePlans.sam.c.notes, 'Surprise armbar');
    assert.deepEqual(dropSiblingCompetitor({ ready: { sam: { note: 'forms' } } }, 'sam').ready, {});
  });
});

describe('technique links stay optional and bidirectional', () => {
  it('suggests steps without requiring one, and only indexes a saved link', () => {
    const archive = sampleArchive();
    const tree = activeTree(archive);
    const blank = suggestTechniqueTargets(archive, '', []);
    assert.ok(blank.length >= 2);
    assert.equal(blank[0].treeId, tree.id);

    const guided = suggestTechniqueTargets(archive, 'Work the berimbolo entry this week', []);
    assert.equal(guided[0].title, 'Berimbolo entry');

    const linked = withGameLink(emptyGamePlan(), 'a', { treeId: tree.id, nodeId: guided[0].nodeId });
    const after = suggestTechniqueTargets(archive, 'berimbolo', linked.a.links);
    assert.equal(
      after.some((target) => target.nodeId === guided[0].nodeId),
      false,
    );

    resetRoster();
    const added = addStudent({ name: 'Jordan Lee', belt: 'Brown', division: '', gym: '', lastPromotion: '', note: '' });
    assert.ok(added);
    const nodeId = tree.root!.children.find((child) => child.title === 'Half-guard retention')!.id;
    addGameLink(added.id, 'home', { treeId: tree.id, nodeId });
    setGameLinkFlag(added.id, 'home', tree.id, nodeId, 'needs-work');
    addGameLink(added.id, 'a', { treeId: tree.id, nodeId });
    setGameLinkFlag(added.id, 'a', tree.id, nodeId, 'strong');
    const index = gamePlanMentionIndex(
      [{ id: added.id, name: added.name }],
      { [added.id]: competitorGamePlan(added.id) },
    );
    const mentions = mentionsForNode(index, tree.id, nodeId);
    assert.deepEqual(
      mentions.map((mention) => `${mention.section}:${mention.flag}`),
      ['a:strong', 'home:needs-work'],
    );
    assert.equal(mentionsForNode(index, tree.id, 'missing').length, 0);
    setGameLinkFlag(added.id, 'a', tree.id, nodeId, 'strong');
    assert.equal(competitorGamePlan(added.id).a.links[0].flag, '');
    removeGameLink(added.id, 'a', tree.id, nodeId);
    assert.equal(competitorGamePlan(added.id).a.links.length, 0);
    assert.equal(competitorGamePlan(added.id).home.links.length, 1);
    resetRoster();
  });
});

describe('one shared competitor game plan', () => {
  it('a note written from the card is the note Competitor Management reads, and the other way around', () => {
    resetRoster();
    const added = addStudent({ name: 'Alex Rivera', belt: 'Blue', division: '', gym: '', lastPromotion: '', note: '' });
    assert.ok(added);
    setGameNotes(added.id, 'a', 'Management A');
    setGameNotes(added.id, 'home', 'Management home');
    assert.equal(competitorGamePlan(added.id).a.notes, 'Management A');
    setGameNotes(added.id, 'b', 'Card B');
    setGameNotes(added.id, 'a', 'Card rewrote A');
    const shared = competitorGamePlan(added.id);
    assert.equal(shared.a.notes, 'Card rewrote A');
    assert.equal(shared.b.notes, 'Card B');
    assert.equal(shared.home.notes, 'Management home');
    assert.equal(shared.c.notes, '');
    resetRoster();
  });

  it('copies imported A/B/C notes into blank coach sections and keeps both when the coach already wrote', () => {
    resetRoster();
    const added = addStudent({ name: 'Alex Rivera', belt: 'Blue', division: '', gym: '', lastPromotion: '', note: '' });
    assert.ok(added);
    setGameNotes(added.id, 'b', 'Coach pass');
    setGameNotes(added.id, 'home', 'Film study');
    addGameLink(added.id, 'a', { treeId: 'tree-1', nodeId: 'node-1' });
    let report = blankStudentReport(10);
    report = setCompetitionGame(report, 'a', { techniques: 'Armbar from mount', notes: 'Finish the grip' }, 11);
    report = setCompetitionGame(report, 'c', { techniques: '', notes: 'C note' }, 12);
    assert.equal(importStudentCompetition(added.id, JSON.stringify(report), 13), '');
    const merged = migrateSharedGamePlan(added.id);
    assert.match(merged.a.notes, /Armbar from mount/);
    assert.match(merged.a.notes, /Finish the grip/);
    assert.equal(merged.a.links.length, 1);
    assert.equal(merged.b.notes, 'Coach pass');
    assert.equal(merged.c.notes, 'C note');
    assert.equal(merged.home.notes, 'Film study');
    const imported = getRoster().competitionPlans[added.id];
    assert.equal(imported.games.a.notes, 'Finish the grip');
    assert.equal(imported.games.b.notes, '');
    const again = migrateSharedGamePlan(added.id);
    assert.equal(again.a.notes, merged.a.notes);
    assert.equal(mergeImportedGameNotes(again, imported.games), again);
    resetRoster();
  });

  it('adds a weigh-in on the competition plan without dropping tournaments or the game plan', () => {
    resetRoster();
    const added = addStudent({ name: 'Alex Rivera', belt: 'Blue', division: '', gym: '', lastPromotion: '', note: '' });
    assert.ok(added);
    setGameNotes(added.id, 'home', 'Film study');
    let report = blankStudentReport(20);
    report = setCompetitionGame(report, 'a', { techniques: 'Armbar', notes: '' }, 21);
    assert.equal(importStudentCompetition(added.id, JSON.stringify(report), 22), '');
    const addedWeigh = addCompetitorWeighIn(added.id, { date: '2026-11-01', weight: '150.2', unit: 'lb', note: 'morning' }, 23);
    assert.equal(addedWeigh.ok, true);
    if (!addedWeigh.ok) return;
    assert.equal(addedWeigh.plan.weighIns.length, 1);
    assert.equal(addedWeigh.plan.weighIns[0].weight, 150.2);
    assert.equal(addedWeigh.plan.games.a.techniques, 'Armbar');
    assert.equal(competitorGamePlan(added.id).home.notes, 'Film study');
    const round = normalizeRoster(JSON.parse(JSON.stringify(getRoster())));
    assert.equal(round.competitionPlans[added.id].weighIns[0].weight, 150.2);
    assert.equal(round.competitionPlans[added.id].weighIns[0].note, 'morning');
    assert.equal(round.gamePlans[added.id].home.notes, 'Film study');
    assert.equal(addCompetitorWeighIn(added.id, { date: 'yesterday', weight: '10', unit: 'lb' }).ok, false);
    resetRoster();
  });
});
