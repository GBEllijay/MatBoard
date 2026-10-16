import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  competitionOf,
  countdownLabel,
  daysUntil,
  emptyCompetition,
  formatWeightDelta,
  resolvedGoal,
  toTargetColumn,
  weightCountdown,
  weightToTarget,
} from './progress/competition.ts';
import { exportProgressCsv, exportProgressPacket, mergeStudentProgress, parseProgressPacket } from './progress/format.ts';
import { addTournament, addWeighIn, setGoalWeight, setWeighDate } from './studentCompetition.ts';
import { blankStudentReport } from './studentEdition.ts';

/**
 * Controls the Weight page still exposes after the chart redesign.
 * The visible weigh-in table has only Date, Weight, and Pounds or Kilograms to Target.
 */
export const WEIGHT_CHART_CONTROLS = [
  'Competition weigh-in date',
  'Save weigh-in date',
  'Goal weight',
  'Save goal weight',
  'Pounds',
  'Kilograms',
  'Date',
  'Weight',
  'Pounds to Target',
  'Weigh-in date',
  'Weigh-in weight',
  'Weigh-in note',
  'Add weigh-in',
  'Remove weigh-in',
  'Target division weight',
  'Save target',
] as const;

test('countdown, goal, and pounds or kilograms to target follow the saved unit', () => {
  const today = '2026-10-16';
  assert.equal(daysUntil(today, today), 0);
  assert.equal(daysUntil('2026-10-20', today), 4);
  assert.equal(daysUntil('2026-10-15', today), -1);
  assert.equal(daysUntil('nope', today), null);
  assert.equal(countdownLabel(0), 'Today');
  assert.equal(countdownLabel(1), '1 day');
  assert.equal(countdownLabel(12), '12 days');
  assert.equal(countdownLabel(-1), '1 day ago');
  assert.equal(countdownLabel(-3), '3 days ago');
  assert.equal(toTargetColumn('lb'), 'Pounds to Target');
  assert.equal(toTargetColumn('kg'), 'Kilograms to Target');

  let report = blankStudentReport(1);
  assert.equal(weightCountdown(competitionOf(report), today), null);
  assert.equal(resolvedGoal(competitionOf(report), today), null);

  report = addTournament(
    report,
    {
      name: 'Spring Open',
      date: '2026-11-02',
      location: 'Atlanta',
      division: 'Adult Blue Middle',
      deadline: '',
      link: '',
      status: 'entered',
      targetWeight: '170',
      targetUnit: 'lb',
    },
    2,
  );
  const fromMeet = weightCountdown(competitionOf(report), today);
  assert.equal(fromMeet?.source, 'tournament');
  assert.equal(fromMeet?.date, '2026-11-02');
  assert.equal(fromMeet?.days, 17);
  assert.equal(fromMeet?.tournamentName, 'Spring Open');
  assert.equal(resolvedGoal(competitionOf(report), today)?.source, 'tournament');
  assert.equal(weightToTarget(174.2, 'lb', 170, 'lb', 'lb'), 4.2);
  assert.equal(formatWeightDelta(4.2, 'lb'), '4.2 lb');
  assert.equal(weightToTarget(165, 'lb', 170, 'lb', 'lb'), -5);
  assert.equal(formatWeightDelta(-5, 'lb'), '-5 lb');
  assert.equal(weightToTarget(170, 'lb', 77.1, 'kg', 'kg'), 0);

  report = setWeighDate(report, '2026-10-18', 3);
  const saved = weightCountdown(competitionOf(report), today);
  assert.equal(saved?.source, 'saved');
  assert.equal(saved?.days, 2);
  report = setGoalWeight(report, '77.1', 'kg', 4);
  const goal = resolvedGoal(competitionOf(report), today);
  assert.equal(goal?.source, 'goal');
  assert.equal(goal?.unit, 'kg');
  assert.equal(weightToTarget(174.2, 'lb', 77.1, 'kg', 'lb'), 4.2);

  report = setGoalWeight(report, '', 'lb', 5);
  assert.equal(competitionOf(report).goalWeight, null);
  assert.equal(resolvedGoal(competitionOf(report), today)?.source, 'tournament');
  report = setWeighDate(report, '', 6);
  assert.equal(competitionOf(report).weighDate, '');
  assert.equal(weightCountdown(competitionOf(report), today)?.source, 'tournament');
  assert.throws(() => setWeighDate(report, '2026-02-31', 7), /YYYY-MM-DD/);
  assert.throws(() => setGoalWeight(report, '0', 'lb', 8), /above 0/);
});

test('an older weigh-in file keeps its note when the goal and countdown date are absent', () => {
  let report = addWeighIn(blankStudentReport(20), { date: '2026-10-01', weight: '174.2', unit: 'lb', note: 'morning' }, 21);
  const raw = JSON.parse(exportProgressPacket(report)) as { competition: Record<string, unknown> };
  delete raw.competition.goalWeight;
  delete raw.competition.goalUnit;
  delete raw.competition.weighDate;
  const parsed = parseProgressPacket(JSON.stringify(raw));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.equal(parsed.value.competition?.weighIns[0].note, 'morning');
  assert.equal(parsed.value.competition?.weighIns[0].weight, 174.2);
  assert.equal(parsed.value.competition?.weighIns[0].unit, 'lb');
  assert.equal(parsed.value.competition?.goalWeight, null);
  assert.equal(parsed.value.competition?.weighDate, '');
  assert.deepEqual(parsed.value.competition?.games, emptyCompetition().games);

  const dated = setWeighDate(setGoalWeight(parsed.value, '160', 'lb', 22), '2026-11-01', 23);
  const roundTrip = parseProgressPacket(exportProgressPacket(dated));
  assert.equal(roundTrip.ok, true);
  if (!roundTrip.ok || roundTrip.value.kind !== 'student-progress-report') return;
  assert.equal(roundTrip.value.competition?.goalWeight, 160);
  assert.equal(roundTrip.value.competition?.goalUnit, 'lb');
  assert.equal(roundTrip.value.competition?.weighDate, '2026-11-01');
  assert.equal(roundTrip.value.competition?.weighIns[0].note, 'morning');
  const csv = exportProgressCsv(roundTrip.value);
  assert.match(csv, /Weigh-in,/);
  assert.match(csv, /morning/);
  assert.match(csv, /Weight chart,/);
  assert.match(csv, /160 lb/);
  assert.match(csv, /2026-11-01/);

  const changed = setWeighDate(setGoalWeight(structuredClone(roundTrip.value), '70', 'kg', 24), '2026-12-01', 25);
  const kept = mergeStudentProgress(roundTrip.value, changed);
  assert.equal(kept.report.competition?.goalWeight, 160);
  assert.equal(kept.report.competition?.goalUnit, 'lb');
  assert.equal(kept.report.competition?.weighDate, '2026-11-01');
  assert.match(kept.conflicts.join('\n'), /Goal weight was kept/);
  assert.match(kept.conflicts.join('\n'), /Weigh-in date was kept/);

  const open = addWeighIn(blankStudentReport(30), { date: '2026-10-02', weight: '80', unit: 'kg', note: 'evening' }, 31);
  const kilos = setGoalWeight(structuredClone(dated), '70', 'kg', 32);
  const filled = mergeStudentProgress(open, kilos);
  assert.equal(filled.report.competition?.goalWeight, 70);
  assert.equal(filled.report.competition?.goalUnit, 'kg');
  assert.equal(filled.report.competition?.weighDate, '2026-11-01');
  assert.equal(filled.report.competition?.weighIns.some((row) => row.note === 'evening'), true);
  assert.equal(filled.report.competition?.weighIns.some((row) => row.note === 'morning'), true);
});

test('the weight page keeps its controls and the table has only three columns', () => {
  const source = readFileSync(new URL('../pages/student/WeightPage.tsx', import.meta.url), 'utf8');
  for (const control of WEIGHT_CHART_CONTROLS) {
    if (control === 'Pounds to Target') continue;
    assert.match(source, new RegExp(control.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source, /toTargetColumn\(unit\)/);
  const headers = [...source.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((match) => match[1].trim());
  assert.deepEqual(headers, ['Date', 'Weight', '{toTargetColumn(unit)}']);
  assert.match(source, /aria-label="Weigh-in notes"/);
  assert.match(source, /Remove weigh-in/);
  assert.match(source, /weight-chart/);
  assert.doesNotMatch(source, /<th[^>]*>\s*Note/);
  assert.equal(formatWeightDelta(weightToTarget(170, 'lb', 160, 'lb', 'lb'), 'lb'), '10 lb');
  assert.equal(formatWeightDelta(weightToTarget(170, 'lb', 160, 'lb', 'kg'), 'kg'), '4.5 kg');
});
