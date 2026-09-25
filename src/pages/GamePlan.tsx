import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { EmptyHint } from '../components/EmptyHint';
import { PlayExitMark } from '../components/PlayExitMark';
import { RankChip } from '../components/RankChip';
import { useRosterState } from '../hooks/useStores';
import {
  GAME_PLAN_A,
  GAME_PLAN_B,
  GAME_PLAN_C,
  GAME_PLAN_EMPTY,
  GAME_PLAN_HOME,
  GAME_PLAN_LABEL,
  GAME_PLAN_LEAD,
  GAME_PLAN_OPTIONAL,
  EMPTY_ROSTER_SEARCH,
  EMPTY_ROSTER_TITLE,
} from '../lib/coachCopy';
import {
  GAME_AUDITS,
  GAME_LINK_MAX,
  GAME_NOTE_MAX,
  auditLabel,
  findTechniqueTarget,
  gamePlanStatusLabel,
  listTechniqueTargets,
  sectionLabel,
  suggestTechniqueTargets,
  techniqueNodePath,
  type CompetitorGamePlan,
  type GameLayer,
  type GameLayerSection,
  type GameSection,
  type TechniqueLink,
  type TechniqueTarget,
} from '../lib/gamePlan';
import { COMPETITOR_SYSTEM_NAME } from '../lib/productNames';
import {
  addGameLink,
  competitorGamePlan,
  removeGameLink,
  searchStudents,
  setGameAudit,
  setGameLinkFlag,
  setGameNotes,
  type Student,
} from '../lib/rosterStore';
import { loadTechniqueArchive, type TechniqueTreeArchive } from '../lib/techniqueTreeStore';

const LAYERS: { section: GameLayerSection; title: string }[] = [
  { section: 'a', title: GAME_PLAN_A },
  { section: 'b', title: GAME_PLAN_B },
  { section: 'c', title: GAME_PLAN_C },
];

export function GamePlanPage() {
  const roster = useRosterState();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [archive] = useState<TechniqueTreeArchive>(() => loadTechniqueArchive());
  const selectedId = searchParams.get('id') ?? '';
  const selected = roster.students.find((row) => row.id === selectedId) ?? null;
  const exitPath = selected ? '/game-plan' : '/competitors';
  const competitors = useMemo(
    () => (query.trim() ? searchStudents(roster.students, query) : roster.students),
    [query, roster.students],
  );

  return (
    <main className="roster plan">
      <PlayExitMark
        to={exitPath}
        onExit={() => {
          navigate(exitPath);
        }}
      />
      <header className="roster__bar">
        <div className="roster__brand">
          <p className="roster__eyebrow">{COMPETITOR_SYSTEM_NAME}</p>
          <h1>{selected ? selected.name : GAME_PLAN_LABEL}</h1>
        </div>
        {selected ? <RankChip belt={selected.belt} /> : null}
      </header>

      {selected ? (
        <PlanEditor key={selected.id} student={selected} archive={archive} />
      ) : (
        <>
          <p className="roster__lead">{GAME_PLAN_LEAD}</p>
          {roster.students.length ? (
            <label className="roster__search">
              Find
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, belt, or division"
                aria-label="Find competitor"
                autoComplete="off"
              />
            </label>
          ) : null}
          {competitors.length ? (
            <ul className="roster__list">
              {competitors.map((competitor) => (
                <li key={competitor.id}>
                  <CompetitorPick
                    competitor={competitor}
                    plan={competitorGamePlan(competitor.id, roster)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyHint
              title={roster.students.length ? 'No match' : EMPTY_ROSTER_TITLE}
              body={roster.students.length ? EMPTY_ROSTER_SEARCH : GAME_PLAN_EMPTY}
              action={
                roster.students.length ? undefined : (
                  <Link className="btn" to="/roster?from=competitors">
                    Competitor Roster
                  </Link>
                )
              }
            />
          )}
        </>
      )}
    </main>
  );
}

function CompetitorPick({ competitor, plan }: { competitor: Student; plan: CompetitorGamePlan }) {
  const label = gamePlanStatusLabel(plan);
  const started = label !== 'No game plan yet';
  return (
    <Link
      className={`roster-card plan-pick${started ? ' plan-pick--on' : ''}`}
      to={`/game-plan?id=${encodeURIComponent(competitor.id)}`}
    >
      <header className="roster-card__head">
        <h2>{competitor.name}</h2>
        <RankChip belt={competitor.belt} />
      </header>
      {competitor.division ? <p className="roster-card__meta">{competitor.division}</p> : null}
      <p className={`plan-pick__status${started ? ' plan-pick__status--on' : ''}`}>{label}</p>
    </Link>
  );
}

function PlanEditor({ student, archive }: { student: Student; archive: TechniqueTreeArchive }) {
  const roster = useRosterState();
  const plan = competitorGamePlan(student.id, roster);

  return (
    <div className="plan-editor">
      <p className="roster__lead">{GAME_PLAN_LEAD}</p>
      {student.division ? <p className="plan-division">{student.division}</p> : null}
      {LAYERS.map((layer) => (
        <LayerCard
          key={layer.section}
          studentId={student.id}
          section={layer.section}
          title={layer.title}
          layer={plan[layer.section]}
          archive={archive}
          showAudit
        />
      ))}
      <LayerCard
        studentId={student.id}
        section="home"
        title={GAME_PLAN_HOME}
        layer={plan.home}
        archive={archive}
        showAudit={false}
      />
      <div className="plan-back">
        <Link className="btn btn--ghost" to="/game-plan">
          All competitors
        </Link>
      </div>
    </div>
  );
}

function LayerCard({
  studentId,
  section,
  title,
  layer,
  archive,
  showAudit,
}: {
  studentId: string;
  section: GameSection;
  title: string;
  layer: GameLayer;
  archive: TechniqueTreeArchive;
  showAudit: boolean;
}) {
  const [notes, setNotes] = useState(layer.notes);
  const [showAll, setShowAll] = useState(false);
  const suggestions = suggestTechniqueTargets(archive, notes, layer.links);
  const allSteps = listTechniqueTargets(archive);
  const atCap = layer.links.length >= GAME_LINK_MAX;

  return (
    <section className="plan-layer" aria-label={sectionLabel(section)}>
      <h2>{title}</h2>
      <textarea
        value={notes}
        rows={3}
        maxLength={GAME_NOTE_MAX}
        aria-label={title}
        onChange={(event) => {
          const next = event.target.value.slice(0, GAME_NOTE_MAX);
          setNotes(next);
          setGameNotes(studentId, section, next);
        }}
      />
      {showAudit && section !== 'home' ? (
        <div className="plan-audit" role="group" aria-label={`${sectionLabel(section)} development`}>
          {GAME_AUDITS.map((audit) => (
            <button
              key={audit}
              type="button"
              className={layer.audit === audit ? 'preset preset--on' : 'preset'}
              aria-pressed={layer.audit === audit}
              onClick={() => setGameAudit(studentId, section, audit)}
            >
              {auditLabel(audit)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="plan-links">
        <p>{GAME_PLAN_OPTIONAL}</p>
        {layer.links.length ? (
          <ul>
            {layer.links.map((link) => (
              <LinkRow
                key={`${link.treeId}:${link.nodeId}`}
                studentId={studentId}
                section={section}
                link={link}
                archive={archive}
              />
            ))}
          </ul>
        ) : null}
        {suggestions.length ? (
          <div className="plan-suggest">
            <p>Suggested steps</p>
            <div className="plan-suggest__row">
              {suggestions.map((target) => (
                <SuggestChip
                  key={`${target.treeId}:${target.nodeId}`}
                  target={target}
                  disabled={atCap}
                  onAdd={() => addGameLink(studentId, section, target)}
                />
              ))}
            </div>
          </div>
        ) : allSteps.length ? (
          <p className="plan-links__empty">Linked steps are listed above. A note can stay on its own.</p>
        ) : (
          <p className="plan-links__empty">
            No Technique Tree steps yet. Notes still save.{' '}
            <Link to="/technique-tree">Open Technique Tree</Link>
          </p>
        )}
        {allSteps.length > suggestions.length ? (
          <button type="button" className="btn btn--ghost" aria-expanded={showAll} onClick={() => setShowAll((open) => !open)}>
            {showAll ? 'Hide steps' : 'See all steps'}
          </button>
        ) : null}
        {showAll ? (
          <ul className="plan-catalog">
            {allSteps.map((target) => {
              const linked = layer.links.some((link) => link.treeId === target.treeId && link.nodeId === target.nodeId);
              return (
                <li key={`${target.treeId}:${target.nodeId}`}>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={linked || atCap}
                    onClick={() => addGameLink(studentId, section, target)}
                  >
                    {linked ? 'Linked' : 'Add'}
                  </button>
                  <span>
                    <strong>{target.title}</strong>
                    <small>{target.treeName}</small>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
        {atCap ? <p className="plan-links__empty">Eight links is the limit on this layer.</p> : null}
      </div>
    </section>
  );
}

function SuggestChip({
  target,
  disabled,
  onAdd,
}: {
  target: TechniqueTarget;
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <button type="button" className="plan-chip" disabled={disabled} onClick={onAdd}>
      {target.title}
    </button>
  );
}

function LinkRow({
  studentId,
  section,
  link,
  archive,
}: {
  studentId: string;
  section: GameSection;
  link: TechniqueLink;
  archive: TechniqueTreeArchive;
}) {
  const target = findTechniqueTarget(archive, link.treeId, link.nodeId);
  const title = target?.title || 'Step no longer on this phone';
  return (
    <li className="plan-link">
      <div className="plan-link__name">
        <Link to={techniqueNodePath(link.treeId, link.nodeId)}>{title}</Link>
        {target ? <small>{target.treeName}</small> : null}
      </div>
      <div className="plan-flags" role="group" aria-label={`${title} mark`}>
        <button
          type="button"
          className={link.flag === 'strong' ? 'preset preset--on' : 'preset'}
          aria-pressed={link.flag === 'strong'}
          onClick={() => setGameLinkFlag(studentId, section, link.treeId, link.nodeId, 'strong')}
        >
          Strong
        </button>
        <button
          type="button"
          className={link.flag === 'needs-work' ? 'preset preset--on' : 'preset'}
          aria-pressed={link.flag === 'needs-work'}
          onClick={() => setGameLinkFlag(studentId, section, link.treeId, link.nodeId, 'needs-work')}
        >
          Needs work
        </button>
      </div>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => removeGameLink(studentId, section, link.treeId, link.nodeId)}
      >
        Remove link
      </button>
    </li>
  );
}
