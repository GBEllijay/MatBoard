import { useMemo, useState } from 'react';
import { PlayExitMark } from '../../components/PlayExitMark';
import {
  AXES,
  CAGE_NOTE,
  CALCULATION_PROPOSAL,
  OCTAGON_CENTER,
  OPEN_DECISIONS,
  PREVIEW_BANNER,
  SAMPLE_GUARD_NAME,
  SELF_ASSESSMENT_SCALE,
  SHAPE_NOTE,
  SVG_SIZE,
  TECHNIQUE_RATING_WORDS,
  cardsFor,
  chartLabel,
  closedRatingPoints,
  detailCopy,
  formatPoint,
  latestCard,
  pointOnAxis,
  ratingDots,
  ratingSegments,
  ringPoints,
  scoreText,
  seedPreview,
  setLatestRating,
  setManualScore,
  setTechniqueCategories,
  shapeValues,
  type AxisId,
  type PreviewMode,
  type PreviewModel,
  type Rating,
  type SkillAxisId,
} from './model';
import './assessmentRadar.css';

const RATINGS: readonly Rating[] = [1, 2, 3, 4, 5];
const SKILL_AXES = AXES.filter((axis) => !axis.manualOnly);

export function AssessmentRadarPreviewPage() {
  const [model, setModel] = useState(seedPreview);
  const [mode, setMode] = useState<PreviewMode>('manual');
  const [selected, setSelected] = useState<AxisId>('guard');
  const values = useMemo(() => shapeValues(model, mode), [model, mode]);
  const detail = useMemo(() => detailCopy(model, selected, mode), [model, selected, mode]);
  const selectedAxis = AXES.find((axis) => axis.id === selected) ?? AXES[0];

  return (
    <main className="oct-preview">
      <PlayExitMark to="/products" />
      <p className="oct-banner" role="note">
        {PREVIEW_BANNER}
      </p>
      <div className="oct-shell">
        <div className="oct-layout">
          <div className="oct-read">
            <p className="oct-kicker">Advantage</p>
            <h1>Eight-area shape</h1>
            <p className="oct-lead">Draft preview. The live check-in stays seven areas.</p>
            <div className="oct-modes" role="group" aria-label="Chart mode">
              <ModeButton
                pressed={mode === 'manual'}
                label="Manual check-in"
                onClick={() => setMode('manual')}
              />
              <ModeButton
                pressed={mode === 'techniques'}
                label="From techniques"
                onClick={() => setMode('techniques')}
              />
            </div>
            <p className="oct-note">{mode === 'manual' ? 'Showing the manual check-in.' : 'Showing the technique summary.'}</p>
          </div>

          <section className="oct-stage" aria-label="Shape">
            <h2>Shape</h2>
            <div className="oct-figure">
              {AXES.map((axis) => {
                const text = scoreText(model, mode, axis.id);
                const on = selected === axis.id;
                return (
                  <button
                    key={axis.id}
                    type="button"
                    className="oct-label"
                    data-area={axis.id}
                    aria-pressed={on}
                    aria-controls="oct-detail"
                    aria-label={`${axis.label} axis, ${text}${on ? ', selected' : ''}`}
                    onClick={() => setSelected(axis.id)}
                  >
                    <span className="oct-label__name">{axis.label}</span>
                    <span className={/^\d/.test(text) ? 'oct-label__score' : 'oct-label__words'}>{text}</span>
                    {on ? <span className="oct-label__state">Selected</span> : null}
                  </button>
                );
              })}
              <div className="oct-chart">
                <Chart values={values} selected={selected} label={chartLabel(model, mode)} />
              </div>
            </div>
          </section>
          <div className="oct-copy">
            <p className="oct-note">{SHAPE_NOTE}</p>
            <p className="oct-note">{CAGE_NOTE}</p>
            <ul className="oct-legend" aria-label="Area scores">
              {AXES.map((axis) => {
                const text = scoreText(model, mode, axis.id);
                const on = selected === axis.id;
                return (
                  <li key={axis.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-controls="oct-detail"
                      aria-label={`${axis.label} in the score list, ${text}${on ? ', selected' : ''}`}
                      onClick={() => setSelected(axis.id)}
                    >
                      <span className="oct-legend__name">
                        {axis.label}
                        {on ? <span className="oct-legend__state"> Selected</span> : null}
                      </span>
                      <span className="oct-legend__score">{text}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <section className="oct-detail" id="oct-detail" aria-label={`${selectedAxis.label} explanation`} tabIndex={-1}>
            <h2>{selectedAxis.label}</h2>
            <p className="oct-scoreline">{detail.scoreLine}</p>
            <p>{detail.meaning}</p>
            <p className="oct-how">{detail.how}</p>
            {detail.techniques.length ? (
              <ul className="oct-tech-list" aria-label={`${selectedAxis.label} techniques`}>
                {detail.techniques.map((row) => (
                  <li key={row.id}>
                    <strong className={row.name === SAMPLE_GUARD_NAME ? 'oct-sample' : undefined}>{row.name}</strong>
                    <p>{row.line}</p>
                    {row.name === SAMPLE_GUARD_NAME ? (
                      <p>Sample for this preview, not a saved student record.</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>

        <div className="oct-editors">
          <ManualEditor model={model} onScore={(axisId, rating) => setModel((current) => setManualScore(current, axisId, rating))} />
          <TechniqueEditor
            model={model}
            onRating={(id, rating) => setModel((current) => setLatestRating(current, id, rating))}
            onCategories={(id, categories) => setModel((current) => setTechniqueCategories(current, id, categories))}
          />
          <section className="oct-block" aria-label="Calculation proposal">
            <h2>How a category score is proposed</h2>
            <p className="oct-note">{SELF_ASSESSMENT_SCALE}</p>
            <ul className="oct-proposal">
              {CALCULATION_PROPOSAL.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
          <section className="oct-block" aria-label="Still to decide">
            <h2>Still to decide before this is live</h2>
            <ul className="oct-proposal">
              {OPEN_DECISIONS.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="oct-actions">
              <button
                type="button"
                className="oct-text-btn"
                onClick={() => {
                  setModel(seedPreview());
                  setMode('manual');
                  setSelected('guard');
                }}
              >
                Reset sample
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function ModeButton({ pressed, label, onClick }: { pressed: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className="oct-mode" aria-pressed={pressed} aria-label={label} onClick={onClick}>
      {label}
      {pressed ? <span className="oct-mode__state">Showing</span> : null}
    </button>
  );
}

function Chart({ values, selected, label }: { values: (number | null)[]; selected: AxisId; label: string }) {
  const closed = closedRatingPoints(values);
  const segments = ratingSegments(values);
  const dots = ratingDots(values);
  const selectedIndex = AXES.findIndex((axis) => axis.id === selected);
  return (
    <svg className="oct-svg" viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} role="img" aria-label={label}>
      <polygon className="oct-grid oct-grid--outer" points={ringPoints(5)} />
      <polygon className="oct-grid" points={ringPoints(3)} />
      {AXES.map((axis, index) => {
        const end = pointOnAxis(index, 5);
        return (
          <line
            key={axis.id}
            className="oct-grid"
            x1={OCTAGON_CENTER}
            y1={OCTAGON_CENTER}
            x2={end.x}
            y2={end.y}
          />
        );
      })}
      {closed ? <polygon className="oct-shape--closed" points={closed.map((point) => formatPoint(point)).join(' ')} /> : null}
      {segments.map((segment, index) => (
        <g key={index}>
          <polyline className="oct-shape" points={segment.map((point) => formatPoint(point)).join(' ')} />
          <polyline className="oct-shape-line" points={segment.map((point) => formatPoint(point)).join(' ')} />
        </g>
      ))}
      {dots.map((dot) => (
        <circle
          key={dot.index}
          className={dot.index === selectedIndex ? 'oct-dot oct-dot--on' : 'oct-dot'}
          cx={dot.x}
          cy={dot.y}
          r={dot.index === selectedIndex ? 5.5 : 4.2}
        />
      ))}
    </svg>
  );
}

function ManualEditor({
  model,
  onScore,
}: {
  model: PreviewModel;
  onScore: (axisId: AxisId, rating: Rating | null) => void;
}) {
  return (
    <section className="oct-block" aria-label="Manual check-in scores">
      <h2>Manual check-in</h2>
      <p>These are the overall scores. Editing them does not change technique ratings, and technique edits do not change these scores.</p>
      {AXES.map((axis) => {
        const current = model.manual[axis.id] ?? null;
        return (
          <div key={axis.id} className="oct-tech">
            <h3>{axis.label}</h3>
            <div className="oct-rates" role="group" aria-label={`Manual ${axis.label} rating`}>
              {RATINGS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="oct-rate"
                  aria-pressed={current === value}
                  aria-label={`Manual ${axis.label} rating ${value}`}
                  onClick={() => onScore(axis.id, value)}
                >
                  {value}
                </button>
              ))}
              <button
                type="button"
                className="oct-rate"
                aria-pressed={current == null}
                aria-label={`Manual ${axis.label} no score`}
                onClick={() => onScore(axis.id, null)}
              >
                No score
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function TechniqueEditor({
  model,
  onRating,
  onCategories,
}: {
  model: PreviewModel;
  onRating: (id: string, rating: Rating | null) => void;
  onCategories: (id: string, categories: SkillAxisId[]) => void;
}) {
  return (
    <section className="oct-block" aria-label="Sample technique index">
      <h2>Sample index</h2>
      <p>Every row is a sample. None of these are saved student records. A position or a movement can be tagged to a category. Conditioning and Mindset are not tags.</p>
      <p>One technique is one record. Extra journal cards for the same name are not extra votes. A second tag adds the same latest rating to that category only.</p>
      {model.techniques.map((row) => {
        const cards = cardsFor(model, row.id);
        const latest = latestCard(cards);
        const earlier = cards.filter((cardRow) => cardRow.id !== latest?.id);
        return (
          <article key={row.id} className="oct-tech" aria-label={row.name}>
            <h3>{row.name}</h3>
            <p className="oct-tech__note">
              {row.kind === 'position' ? 'Position' : 'Movement'}
              {latest ? `. Latest ${latest.rating} (${TECHNIQUE_RATING_WORDS[latest.rating]}).` : '. Not rated.'}
              {row.name === SAMPLE_GUARD_NAME ? ' Sample for this preview, not a saved student record.' : ''}
            </p>
            {earlier.length ? (
              <p className="oct-tech__note">
                Earlier card {earlier.map((cardRow) => cardRow.rating).join(', ')} is not counted. The latest rating is the vote.
              </p>
            ) : null}
            <div className="oct-chips" role="group" aria-label={`${row.name} categories`}>
              {SKILL_AXES.map((axis) => {
                const on = row.categories.includes(axis.id as SkillAxisId);
                return (
                  <button
                    key={axis.id}
                    type="button"
                    className="oct-chip"
                    aria-pressed={on}
                    aria-label={`${row.name} category ${axis.label}`}
                    onClick={() => {
                      const next = on
                        ? row.categories.filter((id) => id !== axis.id)
                        : [...row.categories, axis.id as SkillAxisId];
                      onCategories(row.id, next);
                    }}
                  >
                    {axis.label}
                  </button>
                );
              })}
            </div>
            <div className="oct-rates" role="group" aria-label={`${row.name} rating`}>
              {RATINGS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="oct-rate"
                  aria-pressed={latest?.rating === value}
                  aria-label={`${row.name} rating ${value}`}
                  onClick={() => onRating(row.id, value)}
                >
                  {value}
                </button>
              ))}
              <button
                type="button"
                className="oct-rate"
                aria-pressed={latest == null}
                aria-label={`${row.name} not rated`}
                onClick={() => onRating(row.id, null)}
              >
                Not rated
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
