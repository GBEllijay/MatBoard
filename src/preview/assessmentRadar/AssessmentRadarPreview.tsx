import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PlayExitMark } from '../../components/PlayExitMark';
import { Chart, type ChartVariant } from './OctagonChart';
import {
  AXES,
  CAGE_FICTION_NOTE,
  CAGE_NOTE,
  CALCULATION_PROPOSAL,
  COACH_EXAMPLE_SCORES,
  OPPONENT_EXAMPLE_SCORES,
  PAGE_LEAD,
  PAGE_TITLE,
  PREVIEW_BANNER,
  PERSONAL_BENCHMARK_EXAMPLES,
  SAMPLE_GUARD_NAME,
  SELF_ASSESSMENT_SCALE,
  SUGGESTED_DISCLAIMER,
  SUGGESTED_HEADING,
  SUGGESTED_REQUIREMENTS,
  SHAPE_NOTE,
  SHEET_AXIS_IDS,
  SHEET_EXAMPLE_SCORES,
  cageScores,
  cageValueList,
  categoryDestination,
  isCageView,
  TECHNIQUE_RATING_WORDS,
  cardsFor,
  chartLabel,
  detailCopy,
  latestCard,
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

export type { ChartVariant };

const RATINGS: readonly Rating[] = [1, 2, 3, 4, 5];
const SKILL_AXES = AXES.filter((axis) => !axis.manualOnly);

const CAGE_VARIANTS: readonly ChartVariant[] = ['center', 'coach', 'opponent', 'comparison'];

export function AssessmentRadarPreviewPage() {
  const [params, setParams] = useSearchParams();
  const variantParam = params.get('variant');
  const variant: ChartVariant = CAGE_VARIANTS.includes(variantParam as ChartVariant) || variantParam === 'current' ? (variantParam as ChartVariant) : 'sheet';
  const areaParam = params.get('area');
  const initialArea = AXES.some((axis) => axis.id === areaParam) ? (areaParam as AxisId) : 'guard-control';
  const [model, setModel] = useState(seedPreview);
  const [mode, setMode] = useState<PreviewMode>('manual');
  const [selected, setSelected] = useState<AxisId>(initialArea);
  const chooseVariant = (next: ChartVariant) => {
    const query = new URLSearchParams(params);
    if (next === 'sheet') query.delete('variant');
    else query.set('variant', next);
    setParams(query, { replace: true });
  };
  const chooseArea = (id: AxisId) => {
    setSelected(id);
    const query = new URLSearchParams(params);
    query.set('area', id);
    setParams(query, { replace: true });
  };
  const backToRadar = () => {
    const query = new URLSearchParams(params);
    query.delete('area');
    setParams(query, { replace: true });
    document.getElementById('assessment-radar')?.scrollIntoView({ block: 'start' });
    document.getElementById('assessment-radar')?.focus();
  };
  const cage = isCageView(variant);
  const displayIds = variant === 'current' ? AXES.map((axis) => axis.id) : SHEET_AXIS_IDS;
  const values = useMemo(() => {
    if (variant === 'center' || variant === 'coach' || variant === 'opponent') return cageValueList(cageScores(variant));
    if (variant === 'comparison') return cageValueList(COACH_EXAMPLE_SCORES);
    const scored = shapeValues(model, mode);
    return displayIds.map((id) => scored[AXES.findIndex((axis) => axis.id === id)] ?? null);
  }, [model, mode, variant, displayIds]);
  const detail = useMemo(() => detailCopy(model, selected, mode), [model, selected, mode]);
  const destination = useMemo(() => categoryDestination(model, selected), [model, selected]);
  const selectedAxis = AXES.find((axis) => axis.id === selected) ?? AXES[0];
  useEffect(() => {
    if (!areaParam) return;
    document.getElementById('area-first-example')?.scrollIntoView({ block: 'start' });
  }, [areaParam, model, mode]);

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
            <h1>{PAGE_TITLE}</h1>
            <p className="oct-lead">{PAGE_LEAD}</p>
            <div className="oct-variants" role="group" aria-label="Chart comparison">
              <button
                type="button"
                className="oct-mode"
                aria-pressed={variant === 'current'}
                aria-label="Current chart"
                onClick={() => chooseVariant('current')}
              >
                Current chart
                {variant === 'current' ? <span className="oct-mode__state">Showing</span> : null}
              </button>
              <button
                type="button"
                className="oct-mode"
                aria-pressed={variant === 'center'}
                aria-label="Center mark"
                onClick={() => chooseVariant('center')}
              >
                Center mark
                {variant === 'center' ? <span className="oct-mode__state">Showing</span> : null}
              </button>
              <button
                type="button"
                className="oct-mode"
                aria-pressed={variant === 'sheet'}
                aria-label="Sheet radar"
                onClick={() => chooseVariant('sheet')}
              >
                Sheet radar
                {variant === 'sheet' ? <span className="oct-mode__state">Showing</span> : null}
              </button>
            </div>
            <div className="oct-variants" role="group" aria-label="Cage views">
              <button type="button" className="oct-mode" aria-pressed={variant === 'coach'} aria-label="Coach radar" onClick={() => chooseVariant('coach')}>
                Coach
                {variant === 'coach' ? <span className="oct-mode__state">Showing</span> : null}
              </button>
              <button type="button" className="oct-mode" aria-pressed={variant === 'opponent'} aria-label="Opponent radar" onClick={() => chooseVariant('opponent')}>
                Opponent
                {variant === 'opponent' ? <span className="oct-mode__state">Showing</span> : null}
              </button>
              <button type="button" className="oct-mode" aria-pressed={variant === 'comparison'} aria-label="Coach and opponent comparison" onClick={() => chooseVariant('comparison')}>
                Both
                {variant === 'comparison' ? <span className="oct-mode__state">Showing</span> : null}
              </button>
            </div>
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

          <section id="assessment-radar" className={stageClass(variant)} aria-label="Assessment radar" tabIndex={-1}>
            {cage ? (
              <div className="oct-cage-bar">
                <span className="oct-cage-notch" aria-hidden="true" />
                <h2>Attribute radar</h2>
                <p>{cageHeader(variant)}</p>
              </div>
            ) : variant === 'sheet' ? (
              <div className="oct-sheet-bar">
                <h2>Attribute radar</h2>
                <p>Self-assessment · 1–5 scale · Illustrative</p>
              </div>
            ) : (
              <h2>Shape</h2>
            )}
            <div className={figureClass(variant)}>
              {displayIds.map((id) => {
                const axis = AXES.find((item) => item.id === id) ?? AXES[0];
                const bits = axisBits(variant, axis.id, model, mode);
                const on = selected === axis.id;
                return (
                  <button
                    key={axis.id}
                    type="button"
                    className="oct-label"
                    data-area={axis.id}
                    aria-pressed={on}
                    aria-controls="oct-detail"
                    aria-label={`${bits.aria}${on ? ', selected' : ''}`}
                    onClick={() => chooseArea(axis.id)}
                  >
                    <span className="oct-label__name">{axis.label}</span>
                    {bits.lines.map((line) => (
                      <span key={line.text} className={line.className}>{line.text}</span>
                    ))}
                    {on ? <span className="oct-label__state">Selected</span> : null}
                  </button>
                );
              })}
              <div className="oct-chart">
                <Chart values={values} selected={selected} label={cage ? cageChartLabel(variant) : chartLabel(model, mode)} variant={variant} />
                {cage ? <div className="oct-mark" aria-hidden="true" /> : null}
              </div>
            </div>
            {variant === 'sheet' ? (
              <div className="oct-sheet-key">
                <p>
                  <span className="oct-sheet-swatch" aria-hidden="true" />
                  Example self-assessment (fictional) · 1 = Developing · 3 = Consistent · 5 = Strong
                </p>
                <p>Student&apos;s own illustrative rating — not an official grade, rank, or promotion assessment.</p>
              </div>
            ) : null}
            {cage ? <CageLegend variant={variant} /> : null}
          </section>
          <div className="oct-copy">
            {cage ? <p className="oct-note">{CAGE_FICTION_NOTE}</p> : (
              <>
                <p className="oct-note">{SHAPE_NOTE}</p>
                <p className="oct-note">{CAGE_NOTE}</p>
              </>
            )}
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
                      onClick={() => chooseArea(axis.id)}
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
            {cage ? <p className="oct-how">{cageExplain(variant, selected)}</p> : null}
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
          <section className="oct-detail" id="area-panel" aria-label={`${selectedAxis.label} fundamentals`} tabIndex={-1}>
            <h2>{selectedAxis.label}</h2>
            <button type="button" className="oct-text-btn" aria-label="Back to assessment radar" onClick={backToRadar}>
              Back to assessment radar
            </button>
            <p className="oct-how">{destination.note}</p>
            {destination.items.length ? (
              <div className="oct-groups">
                {(['sample', 'fundamentals', 'benchmark'] as const).map((source) => {
                  const rows = destination.items.filter((item) => item.source === source);
                  const heading = source === 'sample' ? 'Example techniques' : source === 'fundamentals' ? 'Fundamentals' : 'Suggested requirements';
                  return (
                    <section key={source} aria-label={`${selectedAxis.label} ${heading}`}>
                      <h3>{heading}</h3>
                      {rows.length ? (
                        <ol className="oct-tech-list">
                          {rows.map((item) => {
                            const first = destination.items[0]?.id === item.id;
                            return (
                              <li key={item.id} id={first ? 'area-first-example' : undefined}>
                                <strong className={item.name === SAMPLE_GUARD_NAME ? 'oct-sample' : undefined}>{item.name}</strong>
                                <p>{item.detail}</p>
                              </li>
                            );
                          })}
                        </ol>
                      ) : (
                        <p id={destination.items.length === 0 ? undefined : source === 'sample' && destination.items[0]?.source !== 'sample' ? undefined : undefined}>
                          None.
                        </p>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : (
              <p id="area-first-example">The fundamentals sheet has no {selectedAxis.label} category.</p>
            )}
          </section>
        </div>

        <div className="oct-editors">
          <ManualEditor model={model} onScore={(axisId, rating) => setModel((current) => setManualScore(current, axisId, rating))} />
          <TechniqueEditor
            model={model}
            onRating={(id, rating) => setModel((current) => setLatestRating(current, id, rating))}
            onCategories={(id, categories) => setModel((current) => setTechniqueCategories(current, id, categories))}
          />
          <section className="oct-block" aria-label={SUGGESTED_HEADING}>
            <h2>{SUGGESTED_HEADING}</h2>
            <p className="oct-note">{SUGGESTED_DISCLAIMER}</p>
            {(['white', 'blue', 'purple', 'brown', 'black'] as const).map((belt) => {
              const rows = SUGGESTED_REQUIREMENTS.filter((row) => row.belt === belt);
              return (
                <div key={belt}>
                  <h3>{belt[0].toUpperCase() + belt.slice(1)}</h3>
                  {rows.length ? (
                    <ul className="oct-proposal">
                      {rows.map((row) => (
                        <li key={row.id}>{row.name}. {row.note}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="oct-note">Fill in your own goals. This default list adds none.</p>
                  )}
                </div>
              );
            })}
            <p className="oct-note">Personal examples, not automatic scores: {PERSONAL_BENCHMARK_EXAMPLES.map((row) => `${row.name} (${row.area})`).join('; ')}.</p>
            <p className="oct-note">A later profile may tie conditioning to goal weights. That is not built on this page.</p>
          </section>
          <section className="oct-block" aria-label="Calculation proposal">
            <h2>How the summary is figured</h2>
            <p className="oct-note">{SELF_ASSESSMENT_SCALE}</p>
            <ul className="oct-proposal">
              {CALCULATION_PROPOSAL.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
          <div className="oct-actions">
            <button
              type="button"
              className="oct-text-btn"
              onClick={() => {
                setModel(seedPreview());
                setMode('manual');
                setSelected('guard-control');
                const query = new URLSearchParams(params);
                query.delete('area');
                setParams(query, { replace: true });
              }}
            >
              Reset sample
            </button>
          </div>
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

function shownScore(text: string, variant: ChartVariant): string {
  return variant !== 'current' && /^\d/.test(text) ? `${text} / 5` : text;
}

function stageClass(variant: ChartVariant): string {
  if (variant === 'current') return 'oct-stage';
  if (variant === 'sheet') return 'oct-stage oct-stage--sheet';
  return `oct-stage oct-stage--cage oct-stage--${variant}`;
}

function figureClass(variant: ChartVariant): string {
  if (variant === 'current') return 'oct-figure';
  if (variant === 'sheet') return 'oct-figure oct-figure--placed oct-figure--sheet';
  return 'oct-figure oct-figure--placed oct-figure--cage';
}

function cageHeader(variant: ChartVariant): string {
  if (variant === 'coach') return 'Coach example · Fictional';
  if (variant === 'opponent') return 'Opponent example · Fictional';
  if (variant === 'comparison') return 'Coach and opponent · Fictional';
  return 'Self-assessment · 1–5 scale · Illustrative';
}

function cageChartLabel(variant: ChartVariant): string {
  if (variant === 'comparison') return 'Fictional coach and opponent cages. Blue is Coach. Amber is Opponent. All eight areas are rated in each example. Nothing is saved.';
  if (variant === 'coach') return 'Fictional coach cage. All eight areas are rated. Nothing is saved.';
  if (variant === 'opponent') return 'Fictional opponent cage. All eight areas are rated. Nothing is saved.';
  const sheet = SHEET_EXAMPLE_SCORES;
  return `Fictional closed cage for the approved eight areas. Guard/Control ${sheet['guard-control']}, Passing ${sheet.passing}, Sweeps ${sheet.sweeps}, Takedowns ${sheet.takedowns}, Escapes/Defense ${sheet['escapes-defense']}, Submissions ${sheet.submissions}, Conditioning ${sheet.conditioning}, Mindset ${sheet.mindset}. Nothing is saved.`;
}

function axisBits(
  variant: ChartVariant,
  axisId: AxisId,
  model: PreviewModel,
  mode: PreviewMode,
): { aria: string; lines: { className: string; text: string }[] } {
  const axis = AXES.find((item) => item.id === axisId) ?? AXES[0];
  if (variant === 'comparison') {
    return {
      aria: `${axis.label} axis, Coach ${COACH_EXAMPLE_SCORES[axisId]} / 5, Opponent ${OPPONENT_EXAMPLE_SCORES[axisId]} / 5`,
      lines: [
        { className: 'oct-label__score', text: `Coach ${COACH_EXAMPLE_SCORES[axisId]}/5` },
        { className: 'oct-label__score oct-label__opponent', text: `Opponent ${OPPONENT_EXAMPLE_SCORES[axisId]}/5` },
      ],
    };
  }
  if (variant === 'center' || variant === 'coach' || variant === 'opponent') {
    const scores = cageScores(variant);
    const who = variant === 'coach' ? 'Coach' : variant === 'opponent' ? 'Opponent' : 'Fictional cage';
    return {
      aria: `${axis.label} axis, ${who} ${scores[axisId]} / 5`,
      lines: [{ className: variant === 'opponent' ? 'oct-label__score oct-label__opponent' : 'oct-label__score', text: `${scores[axisId]} / 5` }],
    };
  }
  const text = shownScore(scoreText(model, mode, axisId), variant);
  return {
    aria: `${axis.label} axis, ${text}`,
    lines: [{ className: /^\d/.test(text) ? 'oct-label__score' : 'oct-label__words', text }],
  };
}

function cageExplain(variant: ChartVariant, axisId: AxisId): string {
  if (variant === 'comparison') {
    return `Coach example ${COACH_EXAMPLE_SCORES[axisId]} / 5. Opponent example ${OPPONENT_EXAMPLE_SCORES[axisId]} / 5. Both are fictional. The check-in below is separate and is not saved.`;
  }
  const scores = cageScores(variant === 'coach' || variant === 'opponent' ? variant : 'center');
  const who = variant === 'coach' ? 'Coach example' : variant === 'opponent' ? 'Opponent example' : 'Stat-sheet example';
  return `${who} ${scores[axisId]} / 5. This number is fictional. It does not replace the check-in, and a missing check-in score is not a zero.`;
}

function CageLegend({ variant }: { variant: ChartVariant }) {
  if (variant === 'comparison') {
    return (
      <div className="oct-cage-key">
        <p><span className="oct-cage-swatch oct-cage-swatch--coach" aria-hidden="true" /> Coach</p>
        <p><span className="oct-cage-swatch oct-cage-swatch--opponent" aria-hidden="true" /> Opponent</p>
        <p className="oct-cage-key__note">Both are fictional, on the same eight areas. Nothing is saved or sent.</p>
      </div>
    );
  }
  if (variant === 'coach' || variant === 'opponent') {
    const name = variant === 'coach' ? 'Coach' : 'Opponent';
    return (
      <div className="oct-cage-key">
        <p>
          <span className={variant === 'coach' ? 'oct-cage-swatch oct-cage-swatch--coach' : 'oct-cage-swatch oct-cage-swatch--opponent'} aria-hidden="true" />
          {name} example (fictional)
        </p>
        <p className="oct-cage-key__note">Not a saved assessment, and not sent to anyone.</p>
      </div>
    );
  }
  return (
    <div className="oct-cage-key">
      <p>
        <span className="oct-cage-swatch oct-cage-swatch--coach" aria-hidden="true" />
        Example self-assessment (fictional) · 1 = Developing · 3 = Consistent · 5 = Strong
      </p>
      <p className="oct-cage-key__note">Student’s own illustrative rating — not an official grade, rank, or promotion assessment.</p>
    </div>
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
