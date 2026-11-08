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
  FEATURED_INSTRUCTOR_ID,
  OWNER_LINE,
  earnedPromotions,
  exampleFixture,
  formatHours,
  headTrees,
  instructorSummary,
  person,
  personalMatHours,
  sharedAncestorIds,
  spanLabel,
  trainedWith,
  type CompetitionResult,
  type Fixture,
  type Person,
} from './model';
import './ancestryScope.css';

const FIXTURE = exampleFixture();
const STUDENT_PORTRAIT = '/preview/ancestry/student.svg';
const INSTRUCTOR_PORTRAIT = '/preview/ancestry/instructor.svg';
const ACADEMY_IMAGE = '/preview/ancestry/academy.svg';

function Portrait({ src, label, wide = false }: { src: string; label: string; wide?: boolean }) {
  return (
    <figure className={wide ? 'ancestry-photo ancestry-photo--wide' : 'ancestry-photo'}>
      <img src={src} alt={label} />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

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

function matHoursLabel(personId: string): string {
  const source = personalMatHours(FIXTURE, personId);
  return source.linked ? formatHours(source.hours) : 'Not linked';
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
    <section className="profile-card" aria-label="Instructor ancestry" data-testid="teaching-ancestry">
      <h2>Instructor ancestry</h2>
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
                {below ? <span>Instructor</span> : <span>This student</span>}
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
        <h1>Identity card</h1>
        <p className="ancestry-quiet">The identity zone on the Student Edition home. Same Student Edition. Not a second product.</p>
        <Picks label="Example student" ids={['mira', 'theo', 'sam', 'noa']} selected={studentId} onSelect={setStudentId} />
        <section className="profile-card ancestry-identity" aria-label="Identity">
          <div className="ancestry-identity__top">
            <Portrait src={STUDENT_PORTRAIT} label="Example student portrait" />
            <Face who={who} detail={ACADEMY_NAME} />
          </div>
          <h2>Stats sheet</h2>
          <div className="ancestry-stats">
            <div data-testid="student-own-hours">
              <span>Mat hours</span>
              <strong>{matHoursLabel(studentId)}</strong>
              <em>From this Student Edition profile</em>
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
        <h2>Identity card</h2>
        <section className="profile-card ancestry-identity" aria-label="Profile details">
          <div className="ancestry-identity__top">
            <Portrait src={STUDENT_PORTRAIT} label="Example student portrait" />
            <div>
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
            </div>
          </div>
        </section>
        <TreeList fixture={FIXTURE} studentId={studentId} />
        <Earned fixture={FIXTURE} studentId={studentId} />
      </section>
    </Shell>
  );
}

export function AncestryInstructorPreview() {
  const professorId = FEATURED_INSTRUCTOR_ID;
  const summary = instructorSummary(FIXTURE, professorId);
  const who = person(FIXTURE, professorId);
  const chain = ancestorsOf(FIXTURE, professorId).ids;
  const [open, setOpen] = useState(false);
  const mat = summary.personalMatHours;
  const example = instructorSummary(FIXTURE, 'ellis');
  const exampleStudents = example.attachedStudentMatHours;
  return (
    <Shell current="instructor">
      <BeltHeader kind="black" title="Instructor Edition" worn />
      <section aria-label="Instructor identity" data-testid="instructor-surface">
        <article className="profile-card ancestry-id" aria-label="Instructor card">
          <div className="ancestry-id__belt" data-belt={who.belt} />
          <div className="ancestry-id__body">
            <Portrait src={INSTRUCTOR_PORTRAIT} label="Example portrait. Not a photo of you." />
            <p className="ancestry-kicker">Identity card</p>
            <h1 className="ancestry-id__name">{who.name}</h1>
            <p className="ancestry-quiet">{beltLabel(who.belt)}</p>
            <p className="ancestry-line" data-testid="instructor-line">{OWNER_LINE}</p>
            <p className="ancestry-quiet">Professor Fabio Acosta founded his gym under Master Carlos Gracie Junior. That step is not a black belt promotion. Helio Gracie awarded Junior his black belt. Carlos Gracie Senior’s link is teaching, not a promotion. Junior and Senior are two people.</p>
            <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
              {open ? 'Close the full line' : 'Open the full line'}
            </button>
            {open ? (
              <ol className="ancestry-spine" data-testid="lineage-tree">
                {[...chain].reverse().map((id, index, all) => {
                  const below = all[index + 1];
                  const edge = below ? FIXTURE.ancestry.find((row) => row.teacherId === id && row.learnerId === below) : undefined;
                  return (
                    <li key={id}>
                      <strong className={id === professorId ? 'ancestry-you' : undefined}>{person(FIXTURE, id).name}</strong>
                      <span>{edge?.relation ?? (id === professorId ? 'You' : 'Link not confirmed')}</span>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </div>
        </article>
        <h2>Stats sheet</h2>
        <article className="ancestry-hour ancestry-hour--mat" data-testid="instructor-own-hours">
          <span>Mat hours</span>
          <strong>{mat.linked ? formatHours(mat.hours) : 'Not linked'}</strong>
          <p>Example only. From a linked Student Edition profile in this preview. Not a lookup of your saved record, and not a sum of students.</p>
        </article>
        <article className="ancestry-hour ancestry-hour--teach" data-testid="instructor-teaching-hours">
          <span>Teaching hours</span>
          <strong>{summary.teachingHours === null ? 'Not recorded' : formatHours(summary.teachingHours)}</strong>
          <p>Example only. From the Instructor side in this preview. Not your saved total.</p>
        </article>
        <article className="profile-card ancestry-impact" aria-label="Example student impact" data-testid="student-aggregate-hours">
          <p className="ancestry-kicker">Example roster</p>
          <h2>{example.attachedStudentIds.length} sample students</h2>
          <p className="ancestry-quiet">Not your students. Not promotions you issued. The names and counts are the preview fixture.</p>
          <p className="ancestry-impact__total">
            <strong>{formatHours(exampleStudents.hours)}</strong>
            <span>Combined mat hours on their own Student profiles. Counted once each. Not your mat hours.</span>
          </p>
          <div className="ancestry-impact__issued" data-testid="instructor-issued">
            <p><span>Example belts here</span><strong>{example.issuedHere.belts}</strong></p>
            <p><span>Example stripes here</span><strong>{example.issuedHere.stripes}</strong></p>
            <p><span>Example belts, lifetime</span><strong>{example.issuedLifetime.belts}</strong></p>
            <p><span>Example stripes, lifetime</span><strong>{example.issuedLifetime.stripes}</strong></p>
          </div>
          <p className="ancestry-quiet">The lifetime pair includes one promotion from before this example academy. It is not added into the academy pair.</p>
          <ul className="ancestry-roster" aria-label="Example students">
            {FIXTURE.attachments.filter((row) => row.professorId === 'ellis').map((row) => {
              const student = person(FIXTURE, row.studentId);
              return (
                <li key={row.id}>
                  <i data-belt={student.belt} aria-hidden="true" />
                  <div>
                    <strong>{student.name}</strong>
                    <span>{beltLabel(student.belt)} · {spanLabel(row.from, row.to)}</span>
                    <span>{matHoursLabel(row.studentId)} mat hours · their Student profile</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </article>
        <p className="ancestry-quiet">Competition totals stay on the Academy profile.</p>
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
        <article className="profile-card ancestry-academy" aria-label="Academy identity">
          <Portrait src={ACADEMY_IMAGE} label="Example academy image. Not the Advantage logo." wide />
          <div>
            <p className="ancestry-kicker">Identity card</p>
            <h1>{ACADEMY_NAME}</h1>
            <p className="ancestry-quiet">Fictional academy. Example of the Pro gym sheet as of {AS_OF}. The live sheet is not changed.</p>
          </div>
        </article>
        <section className="profile-card ancestry-sheet" aria-label="Academy counts">
          <h2>Stats sheet</h2>
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
              <span>Students' mat hours</span>
              <strong>{formatHours(summary.studentMatHours.hours)}</strong>
            </div>
            <div data-testid="professor-hours">
              <span>Professors' mat hours</span>
              <strong>{formatHours(summary.professorMatHours.hours)}</strong>
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
          <p className="ancestry-quiet">Students' hours are each linked Student profile, counted once. Professors' hours are linked Student profiles only. {summary.professorMatHours.missingIds.map((id) => person(FIXTURE, id).name).join(' and ')} {summary.professorMatHours.missingIds.length === 1 ? 'is' : 'are'} not linked, so {summary.professorMatHours.missingIds.length === 1 ? 'that profile is' : 'those profiles are'} not counted as zero.</p>
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
                  <div className="ancestry-quiet">{personalMatHours(FIXTURE, row.professorId).linked ? `${matHoursLabel(row.professorId)} mat hours from a linked Student profile` : 'Student profile not linked'}</div>
                  <div className="ancestry-quiet">{[...chain].reverse().map((id) => person(FIXTURE, id).name.replace('Professor ', '')).join(' → ')}</div>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="profile-card" aria-label="Shared ancestors">
          <h2>Instructor ancestry</h2>
          <p className="ancestry-quiet">Known lines only. A shared instructor is drawn once, so branches can meet. A separate line stays separate. This is not the employment list above.</p>
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
        <section className="profile-card ancestry-awards" aria-label="Gym team awards" data-testid="gym-awards">
          <h2>Gym/team awards</h2>
          <p className="ancestry-quiet">Places for {ACADEMY_NAME} in a team division. Not a sum of student medals, and not guessed from those medals.</p>
          <ul className="ancestry-medals">
            <li><span>1st</span><strong>{summary.teamAwards.first}</strong></li>
            <li><span>2nd</span><strong>{summary.teamAwards.second}</strong></li>
            <li><span>3rd</span><strong>{summary.teamAwards.third}</strong></li>
          </ul>
          <p className="ancestry-quiet" data-testid="award-total">{summary.teamAwards.total} awards. A 2nd or a 3rd is a place, not a win.</p>
          <ul className="ancestry-list">
            {summary.teamAwards.events.map((award) => (
              <li key={award.id}>{award.tournament} · {award.date} · {award.category} · {award.place === 1 ? '1st' : award.place === 2 ? '2nd' : '3rd'}</li>
            ))}
          </ul>
        </section>
      </section>
    </Shell>
  );
}
