import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ACADEMY_NAME,
  AS_OF,
  EXAMPLE_NOTE,
  FEATURED_INSTRUCTOR_ID,
  MEDALS_ARE_NOT_WINS,
  OWNER_LINE,
  academyStudentIds,
  academySummary,
  ancestorsOf,
  beltLabel,
  earnedPromotions,
  exampleFixture,
  formatHours,
  headTrees,
  instructorSummary,
  person,
  personalMatHours,
  spanLabel,
  trainedWith,
} from './model';
import './ancestryScope.css';
import './profilePages.css';

const FIXTURE = exampleFixture();

function hoursText(personId: string): string {
  const source = personalMatHours(FIXTURE, personId);
  return source.linked ? formatHours(source.hours) : 'Not linked';
}
const STUDENT_PORTRAIT = '/preview/ancestry/student.svg';
const INSTRUCTOR_PORTRAIT = '/preview/ancestry/instructor.svg';
const ACADEMY_IMAGE = '/preview/ancestry/academy.svg';

export const PROFILE_HUB_PATH = '/preview/profiles';

function Banner({ future = false }: { future?: boolean }) {
  return (
    <p className="ancestry-banner" role="note">
      {future
        ? '2036 concept. Not a product announcement. Demonstration only. Nothing is saved, sent, or billed.'
        : `${EXAMPLE_NOTE} Full page preview. Buttons marked demonstration do not save or send anything.`}
    </p>
  );
}

function DemoButton({ label }: { label: string }) {
  const [note, setNote] = useState('Demonstration only. Nothing was saved or sent.');
  return (
    <div>
      <button type="button" className="profile-demo" onClick={() => setNote(`${label} is a demonstration. Nothing was saved or sent.`)}>
        {label}
      </button>
      <p className="ancestry-quiet">{note}</p>
    </div>
  );
}

export function ProfileHubPage() {
  return (
    <main className="student student-frame student--arena student--profile ancestry-preview profile-page">
      <Banner />
      <div className="profile-page__sheet profile-hub">
        <h1>Profile previews</h1>
        <p className="ancestry-quiet">The first three links are the current cards. The full pages and the 2036 menus are separate. None of them is the live app.</p>
        <h2>Current cards</h2>
        <Link to="/preview/ancestry-student">Student profile card</Link>
        <Link to="/preview/ancestry-instructor">Instructor profile card</Link>
        <Link to="/preview/ancestry-academy">Academy profile card</Link>
        <h2>Full pages</h2>
        <Link to="/preview/profile-student">Student full page</Link>
        <Link to="/preview/profile-instructor">Instructor full page</Link>
        <Link to="/preview/profile-academy">Academy full page</Link>
        <h2>2036 menus</h2>
        <Link to="/preview/2036-student">2036 student menu</Link>
        <Link to="/preview/2036-instructor">2036 instructor menu</Link>
        <Link to="/preview/2036-academy">2036 academy menu</Link>
      </div>
    </main>
  );
}

export function StudentFullPage() {
  const [studentId, setStudentId] = useState('mira');
  const who = person(FIXTURE, studentId);
  const hours = personalMatHours(FIXTURE, studentId);
  const trees = headTrees(FIXTURE, studentId);
  const earned = earnedPromotions(FIXTURE, studentId);
  const partners = trainedWith(FIXTURE, studentId);
  return (
    <main className="student student-frame student--arena student--profile ancestry-preview profile-page">
      <Banner />
      <div className="profile-page__sheet">
        <p className="ancestry-kicker">Student profile · full page</p>
        <h1>Identity card</h1>
        <div className="ancestry-picks" role="group" aria-label="Example student">
          {['mira', 'theo', 'sam', 'noa'].map((id) => (
            <button key={id} type="button" aria-pressed={id === studentId} onClick={() => setStudentId(id)}>
              {person(FIXTURE, id).name}
            </button>
          ))}
        </div>
        <section className="profile-card ancestry-identity" aria-label="Identity card">
          <div className="ancestry-identity__top">
            <figure className="ancestry-photo">
              <img src={STUDENT_PORTRAIT} alt="Example student portrait" />
              <figcaption>Example student portrait</figcaption>
            </figure>
            <div>
              <strong>{who.name}</strong>
              <div className="ancestry-belt" data-belt={who.belt} />
              <p className="ancestry-quiet">{beltLabel(who.belt)} · {ACADEMY_NAME}</p>
            </div>
          </div>
        </section>
        <section className="profile-card" aria-label="Stats sheet">
          <h2>Stats sheet</h2>
          <p className="ancestry-quiet">Mat hours come from this person’s linked Student profile in the example. They are not a sum of anyone else.</p>
          <p><strong>{hours.linked ? formatHours(hours.hours) : 'Not linked'}</strong> mat hours</p>
        </section>
        <section className="profile-card" aria-label="Instructor ancestry">
          <h2>Instructor ancestry</h2>
          {trees.map((tree) => (
            <p key={tree.headId}>
              <strong>{person(FIXTURE, tree.headId).name}</strong> · {spanLabel(tree.from, tree.to)}
              <br />
              {[...tree.ids].reverse().map((id) => person(FIXTURE, id).name).join(' → ')}
            </p>
          ))}
        </section>
        <section className="profile-card" aria-label="History">
          <h2>History</h2>
          <ul className="ancestry-list">
            {earned.map((row) => (
              <li key={row.id}>{row.label} · {row.date} · issued by {person(FIXTURE, row.issuerId).name}</li>
            ))}
            {earned.length === 0 ? <li>No promotions in this example.</li> : null}
          </ul>
        </section>
        <section className="profile-card" aria-label="Connections">
          <h2>Connections</h2>
          <ul className="ancestry-list">
            {partners.map((row) => (
              <li key={row.id}>{person(FIXTURE, row.personId).name} · {spanLabel(row.from, row.to)}. {row.note}</li>
            ))}
            {partners.length === 0 ? <li>No one else in this example.</li> : null}
          </ul>
          <DemoButton label="Share this card" />
        </section>
        <Link to={PROFILE_HUB_PATH}>All profile previews</Link>
      </div>
    </main>
  );
}

export function InstructorFullPage() {
  const who = person(FIXTURE, FEATURED_INSTRUCTOR_ID);
  const chain = ancestorsOf(FIXTURE, FEATURED_INSTRUCTOR_ID).ids;
  const summary = instructorSummary(FIXTURE, FEATURED_INSTRUCTOR_ID);
  const example = instructorSummary(FIXTURE, 'ellis');
  return (
    <main className="student student-frame student--arena student--profile ancestry-preview profile-page">
      <Banner />
      <div className="profile-page__sheet">
        <p className="ancestry-kicker">Instructor profile · full page</p>
        <section className="profile-card" aria-label="Identity card">
          <h1>Identity card</h1>
          <figure className="ancestry-photo">
            <img src={INSTRUCTOR_PORTRAIT} alt="Example portrait. Not a photo of you." />
            <figcaption>Example portrait. Not a photo of you.</figcaption>
          </figure>
          <h2>{who.name}</h2>
          <p>{beltLabel(who.belt)}</p>
          <p data-testid="full-instructor-line">{OWNER_LINE}</p>
          <p className="ancestry-quiet">Professor Fabio Acosta founded his gym under Master Carlos Gracie Junior. That step is not a black belt promotion. Helio Gracie awarded Junior his black belt. Carlos Gracie Senior’s link is teaching, not a promotion.</p>
        </section>
        <section className="profile-card" aria-label="Stats sheet">
          <h2>Stats sheet</h2>
          <p>Mat hours: {summary.personalMatHours.linked ? formatHours(summary.personalMatHours.hours) : 'Not linked'}. Example, from a linked Student profile. Not a saved record.</p>
          <p>Teaching hours: {summary.teachingHours === null ? 'Not recorded' : formatHours(summary.teachingHours)}. Example, from the Instructor side.</p>
        </section>
        <section className="profile-card" aria-label="Lineage">
          <h2>Lineage</h2>
          <ol className="ancestry-spine">
            {[...chain].reverse().map((id, index, all) => {
              const below = all[index + 1];
              const edge = below ? FIXTURE.ancestry.find((row) => row.teacherId === id && row.learnerId === below) : undefined;
              return (
                <li key={id}>
                  <strong>{person(FIXTURE, id).name}</strong>
                  <span>{edge?.relation ?? 'You'}</span>
                </li>
              );
            })}
          </ol>
        </section>
        <section className="profile-card" aria-label="Student impact">
          <h2>Student impact</h2>
          <p className="ancestry-quiet">Example roster. Not your students. Not promotions you issued.</p>
          <p>{example.attachedStudentIds.length} sample students · {formatHours(example.attachedStudentMatHours.hours)} combined mat hours on their own profiles.</p>
          <ul className="ancestry-list">
            {FIXTURE.attachments.filter((row) => row.professorId === 'ellis').map((row) => (
              <li key={row.id}>{person(FIXTURE, row.studentId).name} · {beltLabel(person(FIXTURE, row.studentId).belt)} · {hoursText(row.studentId)} mat hours</li>
            ))}
          </ul>
          <DemoButton label="Record a class" />
        </section>
        <Link to={PROFILE_HUB_PATH}>All profile previews</Link>
      </div>
    </main>
  );
}

export function AcademyFullPage() {
  const summary = academySummary(FIXTURE, AS_OF);
  const students = academyStudentIds(FIXTURE);
  return (
    <main className="student student-frame student--arena student--profile ancestry-preview profile-page">
      <Banner />
      <div className="profile-page__sheet">
        <p className="ancestry-kicker">Academy profile · full page</p>
        <section className="profile-card" aria-label="Identity card">
          <h1>Identity card</h1>
          <figure className="ancestry-photo ancestry-photo--wide">
            <img src={ACADEMY_IMAGE} alt="Example academy image. Not the Advantage logo." />
            <figcaption>Example academy image. Not the Advantage logo.</figcaption>
          </figure>
          <h2>{ACADEMY_NAME}</h2>
          <p className="ancestry-quiet">Fictional academy. Not a real gym.</p>
        </section>
        <section className="profile-card" aria-label="Stats sheet">
          <h2>Stats sheet</h2>
          <p>{summary.activeProfessors} active professors · {summary.pastProfessors} past · {summary.uniqueStudents} unique students.</p>
          <p>Students’ mat hours {formatHours(summary.studentMatHours.hours)}, counted once. Professors’ mat hours {formatHours(summary.professorMatHours.hours)} from linked Student profiles only.</p>
        </section>
        <section className="profile-card" aria-label="Faculty">
          <h2>Faculty</h2>
          <ul className="ancestry-list">
            {FIXTURE.affiliations.map((row) => (
              <li key={row.professorId}>
                <strong>{person(FIXTURE, row.professorId).name}</strong> · {row.to === null || row.to >= AS_OF ? 'Present' : 'Past'} · {spanLabel(row.from, row.to)}
                <div className="ancestry-quiet">{ancestorsOf(FIXTURE, row.professorId).ids.slice().reverse().map((id) => person(FIXTURE, id).name).join(' → ')}</div>
              </li>
            ))}
          </ul>
        </section>
        <section className="profile-card" aria-label="Students">
          <h2>Students</h2>
          <ul className="ancestry-list">
            {students.map((id) => (
              <li key={id}>{person(FIXTURE, id).name} · {beltLabel(person(FIXTURE, id).belt)} · {hoursText(id)} mat hours</li>
            ))}
          </ul>
        </section>
        <section className="profile-card" aria-label="Competition">
          <h2>Competition</h2>
          <p>Individual medals: {summary.competition.medals.gold} gold, {summary.competition.medals.silver} silver, {summary.competition.medals.bronze} bronze. Match record {summary.competition.matches.wins} wins, {summary.competition.matches.losses} loss. {MEDALS_ARE_NOT_WINS}</p>
        </section>
        <section className="profile-card" aria-label="Gym team awards">
          <h2>Gym/team awards</h2>
          <p>{summary.teamAwards.first} first, {summary.teamAwards.second} second, {summary.teamAwards.third} third. {summary.teamAwards.total} awards. A second or a third is a place, not a win. These are not a sum of student medals.</p>
        </section>
        <DemoButton label="Publish the roster" />
        <Link to={PROFILE_HUB_PATH}>All profile previews</Link>
      </div>
    </main>
  );
}
