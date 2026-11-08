import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ACADEMY_NAME,
  FEATURED_INSTRUCTOR_ID,
  OWNER_LINE,
  academySummary,
  beltLabel,
  exampleFixture,
  formatHours,
  instructorSummary,
  person,
  personalMatHours,
} from './model';
import { PROFILE_HUB_PATH } from './ProfilePages';
import './future2036.css';

const FIXTURE = exampleFixture();
type Place = 'student' | 'instructor' | 'academy';
type Section = 'identity' | 'lineage' | 'people' | 'record';

const PLACES: { id: Place; href: string; label: string }[] = [
  { id: 'student', href: '/preview/2036-student', label: 'Student' },
  { id: 'instructor', href: '/preview/2036-instructor', label: 'Instructor' },
  { id: 'academy', href: '/preview/2036-academy', label: 'Academy' },
];

export function Future2036Page({ place }: { place: Place }) {
  const [section, setSection] = useState<Section>('identity');
  const [note, setNote] = useState('Demonstration only. Nothing was saved or sent.');
  const student = person(FIXTURE, 'mira');
  const you = person(FIXTURE, FEATURED_INSTRUCTOR_ID);
  const youHours = personalMatHours(FIXTURE, FEATURED_INSTRUCTOR_ID);
  const miraHours = personalMatHours(FIXTURE, 'mira');
  const academy = academySummary(FIXTURE);
  const teaching = instructorSummary(FIXTURE, FEATURED_INSTRUCTOR_ID).teachingHours;
  const title = place === 'student' ? student.name : place === 'instructor' ? you.name : ACADEMY_NAME;
  const portrait = place === 'academy' ? '/preview/ancestry/academy.svg' : place === 'instructor' ? '/preview/ancestry/instructor.svg' : '/preview/ancestry/student.svg';
  return (
    <main className="y2036">
      <div className="y2036__sheet">
        <p className="y2036__banner" role="note">2036 concept. Not a product announcement. No new capability is live. Nothing is saved, sent, or billed.</p>
        <p className="y2036__year">Advantage · 2036</p>
        <nav className="y2036__switch" aria-label="2036 profiles">
          {PLACES.map((item) => (
            <Link key={item.id} to={item.href} aria-current={item.id === place ? 'page' : undefined}>{item.label}</Link>
          ))}
        </nav>
        <section className="y2036__card" aria-label={section}>
          {section === 'identity' ? (
            <>
              <img src={portrait} alt={place === 'instructor' ? 'Example portrait. Not a photo of you.' : 'Example image'} />
              <h1>{title}</h1>
              <p>{place === 'student' ? beltLabel(student.belt) : place === 'instructor' ? beltLabel(you.belt) : 'Fictional academy'}</p>
            </>
          ) : null}
          {section === 'lineage' ? (
            <>
              <h1>Lineage</h1>
              <p>{place === 'instructor' ? OWNER_LINE : place === 'student' ? 'Mira Chen → Professor Ellis Ward, and a second line to Professor Jonah Peck.' : 'Known faculty lines meet where they share an instructor. A separate line stays separate.'}</p>
              {place === 'instructor' ? <p>Fabio Acosta’s step is a gym he founded, not a black belt promotion. Senior’s step is teaching, not a promotion.</p> : null}
            </>
          ) : null}
          {section === 'people' ? (
            <>
              <h1>People</h1>
              <p>{place === 'academy' ? `${academy.uniqueStudents} unique students. ${academy.activeProfessors} active professors and ${academy.pastProfessors} past.` : place === 'instructor' ? 'Example roster only. Not your students.' : 'Trained with Coach Ren Park. That is not an instructor line.'}</p>
            </>
          ) : null}
          {section === 'record' ? (
            <>
              <h1>Record</h1>
              {place === 'academy' ? (
                <p>Individual medals stay separate from gym/team places. {academy.teamAwards.first} first and {academy.teamAwards.second} second are places for the academy. A second is not a win.</p>
              ) : (
                <p>
                  Mat hours {place === 'instructor' ? (youHours.linked ? formatHours(youHours.hours) : 'Not linked') : miraHours.linked ? formatHours(miraHours.hours) : 'Not linked'}.
                  {place === 'instructor' ? ` Teaching hours ${teaching === null ? 'Not recorded' : formatHours(teaching)} stay on the Instructor side.` : ' These are the student’s own hours.'}
                </p>
              )}
              <button type="button" onClick={() => setNote('Demonstration only. Nothing was saved or sent.')}>Save a note</button>
              <p>{note}</p>
            </>
          ) : null}
        </section>
        <Link to={PROFILE_HUB_PATH}>All profile previews</Link>
      </div>
      <nav className="y2036__nav" aria-label="2036 sections">
        {(['identity', 'lineage', 'people', 'record'] as const).map((item) => (
          <button key={item} type="button" aria-current={section === item ? 'page' : undefined} onClick={() => setSection(item)}>
            {item === 'identity' ? 'Identity' : item === 'lineage' ? 'Lineage' : item === 'people' ? 'People' : 'Record'}
          </button>
        ))}
      </nav>
    </main>
  );
}
