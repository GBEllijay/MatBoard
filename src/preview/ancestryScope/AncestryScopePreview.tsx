import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BeltHeader } from '../../components/BeltHeader';
import '../../student-edition.css';
import '../../pages/student/arena.css';
import '../../pages/student/profile.css';
import {
  ACADEMY_NAME,
  AS_OF,
  EXAMPLE_NOTE,
  MEDALS_ARE_NOT_WINS,
  PREVIEW_SURFACES,
  academySummary,
  ancestorsOf,
  beltLabel,
  earnedPromotions,
  exampleFixture,
  headTrees,
  instructorSummary,
  person,
  sharedAncestorIds,
  spanLabel,
  trainedWith,
  type CompetitionResult,
  type Fixture,
  type Person,
} from './model';
import './ancestryScope.css';

const FIXTURE = exampleFixture();

function Shell({
  current,
  children,
}: {
  current: 'student' | 'instructor' | 'academy';
  children: ReactNode;
}) {
  return (
    <main className="student student-frame student--arena student--profile ancestry-preview">
      <p className="ancestry-banner" role="note" data-testid="example-banner">
        {EXAMPLE_NOTE}
      </p>
      <nav className="ancestry-scope" aria-label="Example scopes">
        {PREVIEW_SURFACES.filter((surface) => surface.id !== 'my-profile').map((surface) => (
          <Link
            key={surface.id}
            to={surface.route}
            aria-current={surface.id === current ? 'page' : undefined}
          >
            {surface.title}
          </Link>
        ))}
      </nav>
      <div className="ancestry-sheet">{children}</div>
    </main>
  );
}

function Face({ who, detail }: { who: Person; detail: string }) {
  return (
    <div className="ancestry-face">
      <p className="ancestry-kicker">{detail}</p>
      <strong>{who.name}</strong>
      <div className="ancestry-belt" data-belt={who.belt} aria-hidden="true" />
      <p className="ancestry-quiet">{beltLabel(who.belt)}</p>
    </div>
  );
}

function Picks({
  label,
  ids,
  selected,
  onSelect,
}: {
  label: string;
  ids: readonly string[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="ancestry-picks" role="group" aria-label={label}>
      {ids.map((id) => (
        <button key={id} type="button" aria-pressed={id === selected} onClick={() => onSelect(id)}>
          {person(FIXTURE, id).name.replace('Professor ', '')}
        </button>
      ))}
    </div>
  );
}

function TreeList({ fixture, studentId }: { fixture: Fixture; studentId: string }) {
  const trees = headTrees(fixture, studentId);
  const partners = trainedWith(fixture, studentId);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="profile-card" aria-label="Teaching ancestry" data-testid="teaching-ancestry">
      <h2>Teaching ancestry</h2>
      <p className="ancestry-quiet">One line for each head instructor. A second head instructor is another line, not a longer version of the first.</p>
      <ul className="ancestry-names">
        {trees.map((tree) => (
          <li key={tree.headId}>
            <strong>{person(fixture, tree.headId).name}</strong>
            <span className="ancestry-quiet"> {spanLabel(tree.from, tree.to)}</span>
          </li>
        ))}
      </ul>
      <div className="ancestry-actions">
        {trees.map((tree) => (
          <button key={tree.headId} type="button" aria-expanded={open === tree.headId} onClick={() => setOpen(open === tree.headId ? null : tree.headId)}>
            {open === tree.headId ? 'Close line' : `Full line · ${person(fixture, tree.headId).name.replace('Professor ', '')}`}
          </button>
        ))}
      </div>
      {trees.filter((tree) => tree.headId === open).map((tree) => (
        <ol key={tree.headId} className="ancestry-spine" data-testid="lineage-tree">
          {[...tree.ids].reverse().map((id, index) => {
            const below = [...tree.ids].reverse()[index + 1];
            return (
              <li key={id}>
                <strong className={id === studentId ? 'ancestry-you' : undefined}>{person(fixture, id).name}</strong>
                {below ? <span>Primary teacher</span> : <span>This student</span>}
              </li>
            );
          })}
        </ol>
      ))}
      <h2>Trained with</h2>
      <ul className="ancestry-list" data-testid="trained-with">
        {partners.map((row) => (
          <li key={row.id}>
            {person(fixture, row.personId).name} · {spanLabel(row.from, row.to)}. {row.note}
          </li>
        ))}
        {partners.length === 0 ? <li>No one else in this example.</li> : null}
      </ul>
    </section>
  );
}

function Earned({ fixture, studentId }: { fixture: Fixture; studentId: string }) {
  const rows = earnedPromotions(fixture, studentId);
  return (
    <section className="profile-card" aria-label="Promotions earned">
      <h2>Promotions this student earned</h2>
      <p className="ancestry-quiet">Earned is not the same number as promotions an instructor issued.</p>
      <ul className="ancestry-list">
        {rows.map((row) => (
          <li key={row.id}>{row.label} · {row.date} · issued by {person(fixture, row.issuerId).name}</li>
        ))}
      </ul>
    </section>
  );
}

export function AncestryStudentPreview() {
  const [studentId, setStudentId] = useState('mira');
  const who = person(FIXTURE, studentId);
  return (
    <Shell current="student">
      <section aria-label="Student home identity" data-testid="student-home-surface">
        <p className="ancestry-kicker">Student Edition · home</p>
        <h1>Character sheet</h1>
        <p className="ancestry-quiet">The identity zone on the Student Edition home. Same Student Edition. Not a second product.</p>
        <Picks label="Example student" ids={['mira', 'theo', 'sam', 'noa']} selected={studentId} onSelect={setStudentId} />
        <section className="profile-card" aria-label="Identity">
          <Face who={who} detail={ACADEMY_NAME} />
          <div className="ancestry-stats">
            <div data-testid="student-own-hours">
              <span>Own mat hours</span>
              <strong>{who.ownMatHours}</strong>
            </div>
            <div>
              <span>Head instructors</span>
              <strong>{headTrees(FIXTURE, studentId).length}</strong>
            </div>
          </div>
        </section>
        <TreeList fixture={FIXTURE} studentId={studentId} />
      </section>
      <section aria-label="My profile" id="my-profile" data-testid="my-profile-surface">
        <header className="arena-hero profile-hero">
          <div className="profile-hero__copy">
            <p className="ancestry-kicker">Student Edition · My profile</p>
            <h1>My profile</h1>
          </div>
        </header>
        <p className="ancestry-quiet">The My profile page: name, belt, and gym, then the lineage card under those details.</p>
        <section className="profile-card" aria-label="Profile details">
          <div className="profile-row">
            <span className="ink__label">Name</span>
            <strong>{who.name}</strong>
          </div>
          <div className="profile-row">
            <span className="ink__label">Belt</span>
            <strong>{beltLabel(who.belt)}</strong>
          </div>
          <div className="profile-row">
            <span className="ink__label">Gym</span>
            <strong>{ACADEMY_NAME}</strong>
          </div>
        </section>
        <TreeList fixture={FIXTURE} studentId={studentId} />
        <Earned fixture={FIXTURE} studentId={studentId} />
      </section>
    </Shell>
  );
}

export function AncestryInstructorPreview() {
  const [professorId, setProfessorId] = useState('ellis');
  const summary = instructorSummary(FIXTURE, professorId);
  const who = person(FIXTURE, professorId);
  const chain = ancestorsOf(FIXTURE, professorId).ids;
  const [open, setOpen] = useState(false);
  return (
    <Shell current="instructor">
      <BeltHeader kind="brown" title="Instructor Edition" />
      <section aria-label="Instructor identity" data-testid="instructor-surface">
        <p className="ancestry-kicker">Instructor Edition</p>
        <h1>Instructor profile</h1>
        <p className="ancestry-quiet">Own line, students attached to this instructor, and promotions this instructor issued. Competition totals stay on the Pro academy page.</p>
        <Picks label="Example instructor" ids={['ellis', 'adele', 'jonah', 'lila']} selected={professorId} onSelect={setProfessorId} />
        <section className="profile-card" aria-label="Instructor card">
          <Face who={who} detail={`${summary.status === 'active' ? 'Active' : 'Past'} at ${ACADEMY_NAME}`} />
          <div className="ancestry-stats" data-testid="instructor-own-hours">
            <div>
              <span>Own mat hours</span>
              <strong>{summary.ownMatHours}</strong>
            </div>
            <div>
              <span>Own teaching hours</span>
              <strong>{summary.ownTeachingHours}</strong>
            </div>
            <div data-testid="student-aggregate-hours">
              <span>Students' own mat hours</span>
              <strong>{summary.attachedStudentMatHours}</strong>
            </div>
            <div>
              <span>Attached students</span>
              <strong>{summary.attachedStudentIds.length}</strong>
            </div>
          </div>
          <p className="ancestry-quiet">Own hours are this instructor's. The student hours are the attached students' own mat time, added once per student on this card.</p>
        </section>
        <section className="profile-card" aria-label="Promotions issued" data-testid="instructor-issued">
          <h2>Promotions personally issued</h2>
          <div className="ancestry-stats">
            <div>
              <span>Belts at this academy</span>
              <strong>{summary.issuedHere.belts}</strong>
            </div>
            <div>
              <span>Stripes at this academy</span>
              <strong>{summary.issuedHere.stripes}</strong>
            </div>
            <div>
              <span>Belts in this instructor's life</span>
              <strong>{summary.issuedLifetime.belts}</strong>
            </div>
            <div>
              <span>Stripes in this instructor's life</span>
              <strong>{summary.issuedLifetime.stripes}</strong>
            </div>
          </div>
          <p className="ancestry-quiet">Lifetime includes a promotion issued before this academy. It is not added into the academy pair.</p>
        </section>
        <section className="profile-card" aria-label="Own teaching line">
          <h2>Teaching ancestry</h2>
          <p className="ancestry-quiet">{chain.map((id) => person(FIXTURE, id).name).reverse().join(' → ')}</p>
          <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {open ? 'Close the full line' : 'Open the full line'}
          </button>
          {open ? (
            <ol className="ancestry-spine" data-testid="lineage-tree">
              {[...chain].reverse().map((id) => (
                <li key={id}>
                  <strong className={id === professorId ? 'ancestry-you' : undefined}>{person(FIXTURE, id).name}</strong>
                  <span>{id === professorId ? 'This instructor' : 'Primary teacher'}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
        <section className="profile-card" aria-label="Attached students">
          <h2>Attached students</h2>
          <ul className="ancestry-list">
            {FIXTURE.attachments.filter((row) => row.professorId === professorId).map((row) => {
              const student = person(FIXTURE, row.studentId);
              return (
                <li key={row.id}>
                  <strong>{student.name}</strong> · {beltLabel(student.belt)} · {spanLabel(row.from, row.to)} · {student.ownMatHours} own mat hours
                </li>
              );
            })}
          </ul>
        </section>
      </section>
    </Shell>
  );
}

function LineNode({ id, edgeLabel, shared }: { id: string; edgeLabel?: string; shared: ReadonlySet<string> }) {
  const kids = FIXTURE.ancestry.filter((edge) => edge.teacherId === id);
  return (
    <li data-shared={shared.has(id) ? 'true' : 'false'} data-person={id}>
      {edgeLabel ? <span className="ancestry-tag">{edgeLabel}</span> : null}
      <strong>{person(FIXTURE, id).name}</strong>
      {kids.length ? (
        <ul>
          {kids.map((edge) => (
            <LineNode key={edge.learnerId} id={edge.learnerId} edgeLabel={spanLabel(edge.from, edge.to)} shared={shared} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ResultLine({ fixture, result }: { fixture: Fixture; result: CompetitionResult }) {
  const wins = result.matches.filter((match) => match.result === 'win').length;
  const losses = result.matches.filter((match) => match.result === 'loss').length;
  const medal = result.medal ? `${result.medal} medal` : 'No medal';
  const points = result.rankingPoints === null ? 'Points not published' : `${result.rankingPoints} ranking points`;
  return (
    <li className="ancestry-result">
      <strong>{person(fixture, result.studentId).name}</strong>
      <span>{result.tournament} · {result.date}</span>
      <span className="ancestry-tag">{result.classKind === 'open' ? 'Open class' : result.division} · {medal}</span>
      <span className="ancestry-quiet">{result.matches.length === 0 ? 'No fights recorded' : `${wins} win${wins === 1 ? '' : 's'}, ${losses} loss${losses === 1 ? '' : 'es'}`} · {points}</span>
    </li>
  );
}

export function AncestryAcademyPreview() {
  const summary = academySummary(FIXTURE, AS_OF);
  const competition = summary.competition;
  const shared = new Set(sharedAncestorIds(FIXTURE));
  const roots = FIXTURE.ancestry.map((edge) => edge.teacherId).filter((id, index, all) => all.indexOf(id) === index && !FIXTURE.ancestry.some((edge) => edge.learnerId === id));
  const [graphOpen, setGraphOpen] = useState(false);
  const [drill, setDrill] = useState<'competitor' | 'tournament'>('competitor');
  return (
    <Shell current="academy">
      <BeltHeader kind="black" title="Pro" worn />
      <section aria-label="Academy identity" data-testid="academy-surface">
        <p className="ancestry-kicker">Pro · gym character sheet</p>
        <h1>{ACADEMY_NAME}</h1>
        <p className="ancestry-quiet">Example of the academy scope on the Pro gym sheet. The live sheet is not changed. Counts are this example as of {AS_OF}.</p>
        <section className="profile-card" aria-label="Academy counts">
          <div className="ancestry-stats">
            <div data-testid="academy-active">
              <span>Active professors</span>
              <strong>{summary.activeProfessors}</strong>
            </div>
            <div data-testid="academy-past">
              <span>Past professors</span>
              <strong>{summary.pastProfessors}</strong>
            </div>
            <div>
              <span>Unique professors</span>
              <strong>{summary.uniqueProfessors}</strong>
            </div>
            <div data-testid="academy-students">
              <span>Unique students</span>
              <strong>{summary.uniqueStudents}</strong>
            </div>
          </div>
          <p className="ancestry-quiet">Adding each professor's student list would say {summary.naiveStudentSum}. Mira Chen is on two lists, so the academy counts {summary.uniqueStudents} students.</p>
          <div className="ancestry-stats">
            <div>
              <span>Students' own mat hours</span>
              <strong>{summary.studentMatHours}</strong>
            </div>
            <div>
              <span>Professors' own mat hours</span>
              <strong>{summary.professorOwnMatHours}</strong>
            </div>
            <div>
              <span>Belts issued here</span>
              <strong>{summary.promotionsHere.belts}</strong>
            </div>
            <div>
              <span>Stripes issued here</span>
              <strong>{summary.promotionsHere.stripes}</strong>
            </div>
          </div>
          <p className="ancestry-quiet">{summary.promotionsOutside} belt was issued by one of these professors before this academy. It is not in the pair above. Belts and stripes stay separate. There is no average rank.</p>
        </section>
        <section className="profile-card" aria-label="Professors">
          <h2>Black belt professors</h2>
          <p className="ancestry-quiet">Past and present affiliations. The line under each name is who taught them, not the years they worked here.</p>
          <ul className="ancestry-list">
            {FIXTURE.affiliations.map((row) => {
              const chain = ancestorsOf(FIXTURE, row.professorId).ids;
              const ongoing = row.to === null || row.to >= AS_OF;
              return (
                <li key={row.professorId}>
                  <strong>{person(FIXTURE, row.professorId).name}</strong>
                  <div className="ancestry-quiet">{ongoing ? 'Present' : 'Past'} · affiliated {spanLabel(row.from, row.to)}</div>
                  <div className="ancestry-quiet">{[...chain].reverse().map((id) => person(FIXTURE, id).name.replace('Professor ', '')).join(' → ')}</div>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="profile-card" aria-label="Shared ancestors">
          <h2>Shared ancestors</h2>
          <p className="ancestry-quiet">Who taught these professors. Branches that share a teacher meet on one name. A separate teacher stays a separate branch. This is not the employment list above.</p>
          <button type="button" aria-expanded={graphOpen} onClick={() => setGraphOpen((value) => !value)}>
            {graphOpen ? 'Close the drawing' : 'Open the drawing'}
          </button>
          {graphOpen ? (
            <ul className="ancestry-branch" data-testid="academy-graph" aria-label="Teaching lines meeting and splitting">
              {roots.map((id) => (
                <LineNode key={id} id={id} shared={shared} />
              ))}
            </ul>
          ) : null}
        </section>
        <section className="profile-card" aria-label="Competition summary" data-testid="academy-competition">
          <h2>Competition</h2>
          <p className="ancestry-quiet" data-testid="academy-scope">{competition.scopeLabel}</p>
          <ul className="ancestry-medals" data-testid="academy-medals">
            <li data-medal="gold"><span>Gold</span><strong>{competition.medals.gold}</strong></li>
            <li data-medal="silver"><span>Silver</span><strong>{competition.medals.silver}</strong></li>
            <li data-medal="bronze"><span>Bronze</span><strong>{competition.medals.bronze}</strong></li>
          </ul>
          <p className="ancestry-quiet" data-testid="academy-wins">
            Match record in this same set: {competition.matches.wins} wins, {competition.matches.losses} loss. {MEDALS_ARE_NOT_WINS}
          </p>
          <p className="ancestry-quiet" data-testid="academy-points">
            Organization ranking points: {competition.rankingPoints}. Points were not published on {competition.pointsOmitted} of these results.
          </p>
          <p className="ancestry-quiet">City Open silver is one loss in a two-person bracket. Harbor Invitational gold has no fights. Open class is its own result.</p>
          <div className="ancestry-drill" role="group" aria-label="Competition breakdown">
            <button type="button" aria-pressed={drill === 'competitor'} onClick={() => setDrill('competitor')}>By competitor</button>
            <button type="button" aria-pressed={drill === 'tournament'} onClick={() => setDrill('tournament')}>By tournament</button>
          </div>
          {drill === 'competitor' ? (
            <ul className="ancestry-list" data-testid="by-competitor">
              {competition.byCompetitor.map((row) => (
                <li key={row.studentId}>
                  <strong>{row.name}</strong>
                  <span className="ancestry-quiet"> Gold {row.medals.gold}, silver {row.medals.silver}, bronze {row.medals.bronze}. Matches {row.matches.wins}–{row.matches.losses}. Points {row.rankingPoints}.</span>
                  <ul className="ancestry-list">
                    {row.results.map((result) => <ResultLine key={result.id} fixture={FIXTURE} result={result} />)}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="ancestry-list" data-testid="by-tournament">
              {competition.byTournament.map((row) => (
                <li key={row.tournament}>
                  <strong>{row.tournament}</strong>
                  <ul className="ancestry-list">
                    {row.results.map((result) => <ResultLine key={result.id} fixture={FIXTURE} result={result} />)}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          <h2>Left out of the academy total</h2>
          <ul className="ancestry-list" data-testid="result-outside">
            {competition.outside.map((result) => (
              <li key={result.id}>
                {person(FIXTURE, result.studentId).name} · {result.tournament} · {result.medal} · {result.date}. After this attachment ended. Personal result, not an academy medal.
              </li>
            ))}
          </ul>
        </section>
      </section>
    </Shell>
  );
}
