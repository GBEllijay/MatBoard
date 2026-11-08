import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BeltHeader } from '../../components/BeltHeader';
import { EditionLadder } from '../../components/EditionLadder';
import { HomeMark } from '../../components/HomeMark';
import { CardMark } from './marks';
import { JOURNAL_DESTINATION, MEDIA_EXAMPLE, MEDIA_MENU_PREVIEW_PATH, PREVIEW_BANNER, PRO_PREVIEW_PATH, mediaPreviewCards, mediaStudentCard } from './model';
import '../instructorProfile/instructorProfile.css';
import './proHome.css';

function JournalMark() {
  return (
    <svg className="php-mark" viewBox="0 0 92 72" aria-hidden="true">
      <rect x="22" y="10" width="48" height="52" rx="6" fill="#004eba" />
      <rect x="30" y="16" width="32" height="40" rx="2" fill="#f4f1ea" />
      <path d="M36 28h20M36 36h20M36 44h12" stroke="#14161c" strokeWidth="2" />
    </svg>
  );
}

function ConsoleMark() {
  return (
    <svg className="php-mark" viewBox="0 0 92 72" aria-hidden="true">
      <rect x="14" y="12" width="64" height="40" rx="4" fill="#102033" stroke="#6ea8ff" strokeWidth="2" />
      <rect x="20" y="18" width="22" height="14" fill="#2a5cf0" />
      <rect x="46" y="18" width="26" height="14" fill="#f4f1ea" />
      <rect x="20" y="36" width="52" height="8" fill="#6ea8ff" opacity="0.45" />
      <rect x="38" y="52" width="16" height="4" fill="#6ea8ff" />
      <rect x="30" y="56" width="32" height="3" rx="1" fill="#6ea8ff" />
    </svg>
  );
}

/**
 * Visual stand-in. It does not read the device gym name, open Connect to my
 * academy, or write a membership. The example line lives in this render only.
 */
function MediaGymConnectPreview() {
  const [exampleOn, setExampleOn] = useState(false);
  return (
    <section className="ip-sheet php-connect" aria-label="Connect to a gym" data-testid="media-gym-connect">
      <header className="ip-sheet__head">
        <p className="ip-kicker">Preview · not a membership</p>
        <h2>Connect to a gym</h2>
        <p className="ip-quiet">Example only. Not connected. This preview does not join a gym, and nothing is saved.</p>
      </header>
      <div className="ip-id">
        <p>
          <span>Fictional label</span>
          <strong>{MEDIA_EXAMPLE.gym}</strong>
        </p>
        <p>
          <span>Device branding</span>
          <strong>Not read on this preview</strong>
        </p>
        <p>
          <span>Membership</span>
          <strong>Not connected</strong>
        </p>
      </div>
      <p className="ip-quiet">
        The name above is a fictional label on the identity card. The academy name Media uses on this phone is a separate device setting, and a Student Edition membership is a separate link. Neither is opened or changed here.
      </p>
      <button type="button" className="php-example" onClick={() => setExampleOn(true)}>
        {exampleOn ? 'Example Gym (preview). Not connected. Nothing was saved.' : 'Show a preview example'}
      </button>
    </section>
  );
}

/**
 * Media Edition menu concept. Live /media keeps its purple rails.
 * The identity lines are fictional constants. Nothing is written.
 */
export function MediaMenuPreviewPage() {
  const cards = mediaPreviewCards();
  const student = mediaStudentCard();
  return (
    <main className="php">
      <div className="php-shell">
        <p className="php-banner" role="note">
          {PREVIEW_BANNER} This view does not replace /media. The live Scoreboard button also clears a linked bout. This preview only opens the same address.
        </p>
        <HomeMark to={PRO_PREVIEW_PATH} />
        <p className="php-note" data-testid="preview-path">
          {MEDIA_MENU_PREVIEW_PATH}
        </p>
        <BeltHeader kind="purple" title="Advantage Media Edition" />
        <section className="ip-sheet" aria-label="Media identity card" data-testid="media-identity">
          <header className="ip-sheet__head">
            <p className="ip-kicker">Advantage · Media Edition</p>
            <h1>Media identity</h1>
            <p className="ip-quiet">Fictional example. Not saved, and not the instructor sheet.</p>
          </header>
          <div className="ip-id">
            <p>
              <span>Name</span>
              <strong>{MEDIA_EXAMPLE.name}</strong>
            </p>
            <p>
              <span>Academy</span>
              <strong>{MEDIA_EXAMPLE.gym}</strong>
            </p>
            <p>
              <span>Edition</span>
              <strong>{MEDIA_EXAMPLE.role}</strong>
            </p>
          </div>
          <p className="ip-quiet">Slideshows, the schedule, and events stay on the live Media Console. This card does not count them.</p>
        </section>
        <MediaGymConnectPreview />
        <nav className="php-cards" aria-label="Advantage Media Edition menu">
          {cards.map((card) => (
            <Link key={card.title} className="php-card" to={card.to} data-mark={card.mark}>
              <span>
                <strong>{card.title}</strong>
                <small>{card.note}</small>
              </span>
              {card.mark === 'console' ? <ConsoleMark /> : <CardMark mark={card.mark} />}
            </Link>
          ))}
        </nav>
        <nav className="php-cards" aria-label="Personal Student Edition">
          <Link className="php-card" to={student.to} data-mark="journal">
            <span>
              <strong>{student.title}</strong>
              <small>{student.note}</small>
            </span>
            <JournalMark />
          </Link>
        </nav>
        <p className="php-note">No belt rail on these cards. The purple belt stays on the header. Student Edition opens {JOURNAL_DESTINATION}.</p>
        <EditionLadder page="media" />
        <Link className="php-jump" to={PRO_PREVIEW_PATH}>
          Back to the Pro preview
        </Link>
      </div>
    </main>
  );
}
