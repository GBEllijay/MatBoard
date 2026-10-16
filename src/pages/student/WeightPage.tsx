import { useState } from 'react';
import type { StudentTournament, WeighIn, WeightUnit } from '../../lib/progress/types';
import {
  chartPoints,
  competitionOf,
  convertWeight,
  formatWeight,
  isUpcomingTournament,
  weightUnitLabel,
  type ChartPoint,
} from '../../lib/progress/competition';
import { addWeighIn, removeWeighIn, setTournamentTarget, setWeightUnit } from '../../lib/studentCompetition';
import { todayIso } from '../../lib/studentEdition';
import { LeatherHeader, StudentMarks, useStudentFile, useStudentPath } from './chrome';
import { Link } from 'react-router-dom';

export function WeightPage() {
  const to = useStudentPath();
  const { report, commit } = useStudentFile();
  const competition = competitionOf(report);
  const unit = competition.weightUnit;
  const today = todayIso();
  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const shown = [...competition.weighIns].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const points = chartPoints(competition.weighIns, unit);
  const target = upcomingTarget(competition.tournaments, unit, today);
  const upcoming = competition.tournaments
    .filter((tournament) => isUpcomingTournament(tournament, today))
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

  return (
    <main className="student student-frame">
      <StudentMarks />
      <LeatherHeader title="Weight" />
      <div className="student-paper">
        <div className="student-sheet">
          <section className="ink" aria-label="Weight">
            <p className="student-quiet">Weigh-ins stay on this phone. Advantage does not host them.</p>
            <UnitToggle unit={unit} group="Weight unit" onChange={(next) => commit(setWeightUnit(report, next))} />
            <WeightChart points={points} unit={unit} target={target} />
            {target != null ? (
              <p className="student-quiet">The dashed line is the next tournament target, shown in {weightUnitLabel(unit)}.</p>
            ) : null}
          </section>

          <section className="ink" aria-label="Target division weight">
            <h2 className="ink__label">Target</h2>
            {upcoming.length === 0 ? (
              <p className="student-quiet">
                Add a tournament on <Link to={to('/student/competitor')}>Competitor</Link> to set a target division weight.
              </p>
            ) : (
              <ul className="comp-list">
                {upcoming.map((tournament) => (
                  <TargetRow
                    key={tournament.id}
                    tournament={tournament}
                    onSave={(value, nextUnit) => commit(setTournamentTarget(report, tournament.id, value, nextUnit))}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="ink" aria-label="Weigh-ins">
            <h2 className="ink__label">Weigh-ins</h2>
            {shown.length === 0 ? <p className="student-quiet">No weigh-ins yet.</p> : null}
            <ul className="comp-list">
              {shown.map((row) => (
                <WeighInRow key={row.id} row={row} unit={unit} onRemove={() => commit(removeWeighIn(report, row.id))} />
              ))}
            </ul>
            <form
              className="comp-form"
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  commit(addWeighIn(report, { date, weight, unit, note }));
                  setWeight('');
                  setNote('');
                  setError('');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Could not save that weigh-in.');
                }
              }}
            >
              <p className="ink__label">Add a weigh-in</p>
              <label>
                <span className="ink__label">Date</span>
                <input type="date" aria-label="Weigh-in date" value={date} onChange={(event) => setDate(event.target.value)} required />
              </label>
              <label>
                <span className="ink__label">Weight</span>
                <input aria-label="Weigh-in weight" inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} required />
              </label>
              <label>
                <span className="ink__label">Note</span>
                <input aria-label="Weigh-in note" value={note} onChange={(event) => setNote(event.target.value)} />
              </label>
              {error ? <p role="alert">{error}</p> : null}
              <button type="submit" className="ink-btn ink-btn--save">
                Add weigh-in
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}

function TargetRow({
  tournament,
  onSave,
}: {
  tournament: StudentTournament;
  onSave: (weight: string, unit: WeightUnit) => void;
}) {
  const [weight, setWeight] = useState(tournament.targetWeight == null ? '' : String(tournament.targetWeight));
  const [unit, setUnit] = useState<WeightUnit>(tournament.targetUnit);
  const [error, setError] = useState('');
  return (
    <li className="ink">
      <strong>{tournament.name}</strong>
      <span>{tournament.date}{tournament.division ? ` · ${tournament.division}` : ''}</span>
      <form
        className="comp-form"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            onSave(weight, unit);
            setError('');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save that target.');
          }
        }}
      >
        <label>
          <span className="ink__label">Target division weight</span>
          <input
            aria-label={`Target weight for ${tournament.name}`}
            inputMode="decimal"
            value={weight}
            onChange={(event) => setWeight(event.target.value)}
          />
        </label>
        <UnitToggle unit={unit} group={`Target unit for ${tournament.name}`} onChange={setUnit} />
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" className="ink-btn ink-btn--small">
          {`Save target for ${tournament.name}`}
        </button>
      </form>
    </li>
  );
}

function upcomingTarget(tournaments: StudentTournament[], unit: WeightUnit, today: string): number | null {
  const next = tournaments
    .filter((tournament) => tournament.targetWeight != null && isUpcomingTournament(tournament, today))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next || next.targetWeight == null) return null;
  return convertWeight(next.targetWeight, next.targetUnit, unit);
}

function WeighInRow({ row, unit, onRemove }: { row: WeighIn; unit: WeightUnit; onRemove: () => void }) {
  const shown = formatWeight(convertWeight(row.weight, row.unit, unit), unit);
  const original = row.unit === unit ? '' : ` (${formatWeight(row.weight, row.unit)})`;
  return (
    <li className="ink">
      <strong>
        {row.date} · {shown}
        {original}
      </strong>
      {row.note ? <span>{row.note}</span> : null}
      <button type="button" className="ink-btn" onClick={onRemove}>
        {`Remove weigh-in ${row.date}`}
      </button>
    </li>
  );
}

function UnitToggle({
  unit,
  group,
  onChange,
}: {
  unit: WeightUnit;
  group: string;
  onChange: (unit: WeightUnit) => void;
}) {
  return (
    <div className="student-games" role="group" aria-label={group}>
      {(['lb', 'kg'] as const).map((choice) => (
        <button
          key={choice}
          type="button"
          className={unit === choice ? 'student-choice is-on' : 'student-choice'}
          aria-pressed={unit === choice}
          onClick={() => onChange(choice)}
        >
          {choice === 'lb' ? 'Pounds' : 'Kilograms'}
        </button>
      ))}
    </div>
  );
}

function WeightChart({ points, unit, target }: { points: ChartPoint[]; unit: WeightUnit; target: number | null }) {
  if (points.length === 0) return null;
  const width = 320;
  const height = 128;
  const pad = 16;
  const values = points.map((point) => point.value);
  if (target != null) values.push(target);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xAt = (index: number) => (points.length === 1 ? width / 2 : pad + (index * (width - pad * 2)) / (points.length - 1));
  const yAt = (value: number) => pad + ((max - value) * (height - pad * 2)) / span;
  const line = points.map((point, index) => `${xAt(index)},${yAt(point.value)}`).join(' ');
  const label = `Weight trend in ${weightUnitLabel(unit)}, ${points.map((point) => `${point.date} ${formatWeight(point.value, unit)}`).join(', ')}`;
  return (
    <svg className="weight-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      {target != null ? <line className="weight-chart__target" x1={pad} x2={width - pad} y1={yAt(target)} y2={yAt(target)} /> : null}
      {points.length > 1 ? <polyline points={line} /> : null}
      {points.map((point, index) => (
        <circle key={`${point.date}-${index}`} cx={xAt(index)} cy={yAt(point.value)} r="4" />
      ))}
    </svg>
  );
}
