import type { ReactNode } from 'react';
import { OWNER_LINE_NOTE, PROMOTION_NOTE, PROPOSED_LINE, PROPOSED_SOURCES } from './model';
import '../../student-edition.css';
import '../../pages/student/arena.css';
import '../../pages/student/profile.css';
import '../../components/rosterCard/coachClipboard.css';
import './ownerLineage.css';

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="student student-frame student--arena student--profile owner-line">
      <p className="owner-line__banner" role="note">
        {OWNER_LINE_NOTE}
      </p>
      <header className="arena-hero profile-hero">
        <div className="profile-hero__copy">
          <p className="owner-line__kicker">Student profile</p>
          <h1>{title}</h1>
        </div>
      </header>
      <div className="owner-line__sheet">{children}</div>
    </main>
  );
}

function AwardNote() {
  return (
    <p className="owner-line__award" data-testid="promotion-note">
      {PROMOTION_NOTE}
    </p>
  );
}

/** Names only, in the profile card. Relationship sentences stay off this face. */
export function CompactLineageCard() {
  return (
    <Shell title="My profile">
      <section className="clipboard profile-face__card" aria-label="You">
        <div className="clipboard__sheet profile-face__sheet">
          <p className="profile-face__name">You</p>
          <p className="profile-face__belt-text">Black belt</p>
          <AwardNote />
        </div>
      </section>
      <section className="profile-card owner-line__card" aria-label="Teaching lineage" data-testid="lineage-compact">
        <h2>Teaching lineage</h2>
        <p className="owner-line__label">Proposed line</p>
        <ol className="owner-line__names">
          {PROPOSED_LINE.map((step) => (
            <li key={step.name} data-you={step.name === 'You' ? 'true' : undefined}>
              {step.name}
            </li>
          ))}
        </ol>
      </section>
    </Shell>
  );
}

/** Same names, with the relationship written on each step. */
export function ExpandedLineageLine() {
  return (
    <Shell title="Teaching lineage">
      <section className="profile-card owner-line__card" aria-label="Proposed lineage" data-testid="lineage-expanded">
        <h2>Proposed line</h2>
        <ol className="owner-line__spine">
          {PROPOSED_LINE.map((step) => (
            <li key={step.name} data-you={step.name === 'You' ? 'true' : undefined}>
              <strong>{step.name}</strong>
              {step.linkBelow ? <span>{step.linkBelow}</span> : null}
              {step.detail ? <small>{step.detail}</small> : null}
            </li>
          ))}
        </ol>
        <AwardNote />
        <ul className="owner-line__sources">
          {PROPOSED_SOURCES.map((url) => (
            <li key={url}>
              <a href={url}>{url}</a>
            </li>
          ))}
        </ul>
      </section>
    </Shell>
  );
}
