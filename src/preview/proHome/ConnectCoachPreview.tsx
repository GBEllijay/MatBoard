import { useState } from 'react';
import { Link } from 'react-router-dom';
import { INSTRUCTOR } from '../instructorProfile/model';
import {
  COACH_CONNECT_PREVIEW_PATH,
  INSTRUCTOR_CARDS_PREVIEW_PATH,
  MEDIA_MENU_PREVIEW_PATH,
  PREVIEW_BANNER,
  PREVIEW_COACH_STUDENT_NAME,
} from './model';
import '../instructorProfile/instructorProfile.css';
import './proHome.css';

/**
 * Direct instructor and student pair. Not the gym connection.
 * Confirmation stays in this render. No invite, file, or membership is created.
 */
export function ConnectCoachPreviewPage() {
  const [side, setSide] = useState<'instructor' | 'student' | null>(null);
  const pair = `${INSTRUCTOR.name} and ${PREVIEW_COACH_STUDENT_NAME}`;
  return (
    <main className="php">
      <div className="php-shell">
        <p className="php-banner" role="note">
          {PREVIEW_BANNER} This page does not send a message, an invite, or a file.
        </p>
        <p className="php-kicker">Preview · one instructor and one student</p>
        <h1>Connect to your coach</h1>
        <p className="php-note" data-testid="preview-path">
          {COACH_CONNECT_PREVIEW_PATH}
        </p>
        <p className="php-note">This is not Connect to a gym. The academy link on the Media preview stays a separate example.</p>
        <div className="php-split">
          <section className="ip-sheet php-connect" aria-label="Instructor perspective">
            <header className="ip-sheet__head">
              <p className="ip-kicker">Instructor</p>
              <h2>{INSTRUCTOR.name}</h2>
              <p className="ip-quiet">Sees {PREVIEW_COACH_STUDENT_NAME} on an example roster line. This does not open a real roster.</p>
            </header>
            <button type="button" className="php-example" onClick={() => setSide('instructor')}>
              Preview from the instructor side
            </button>
          </section>
          <section className="ip-sheet php-connect" aria-label="Student perspective">
            <header className="ip-sheet__head">
              <p className="ip-kicker">Student</p>
              <h2>{PREVIEW_COACH_STUDENT_NAME}</h2>
              <p className="ip-quiet">Sees {INSTRUCTOR.name}. This does not open a journal or a private record.</p>
            </header>
            <button type="button" className="php-example" onClick={() => setSide('student')}>
              Preview from the student side
            </button>
          </section>
        </div>
        <p className="php-banner" role="status" data-testid="coach-connect-status">
          {side
            ? `Example only. Not connected. ${pair} confirmed the same preview pair from the ${side} side. No message, invite, or file was sent.`
            : 'Not connected. Nothing is saved.'}
        </p>
        <Link className="php-jump" to={MEDIA_MENU_PREVIEW_PATH}>
          Back to the Media preview
        </Link>
        <Link className="php-jump" to={INSTRUCTOR_CARDS_PREVIEW_PATH}>
          Back to the Instructor preview
        </Link>
      </div>
    </main>
  );
}
