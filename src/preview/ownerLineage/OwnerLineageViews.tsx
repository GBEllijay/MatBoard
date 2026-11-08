import { useState, type ReactNode } from 'react';
import { OWNER_LINE_NOTE, PROMOTION_NOTE, PROPOSED_LINE, PROPOSED_SOURCES } from './model';
import '../../student-edition.css';
import '../../pages/student/arena.css';
import '../../pages/student/profile.css';
import '../../components/rosterCard/coachClipboard.css';
import './ownerLineage.css';

function ProfileDetails() {
  return (
    <section className="profile-card" aria-label="Profile details" data-testid="profile-details">
      <div className="profile-row">
        <span className="ink__label">Name</span>
        <strong>You</strong>
      </div>
      <div className="profile-row">
        <span className="ink__label">Belt</span>
        <strong>Black belt</strong>
      </div>
      <div className="profile-row">
        <span className="ink__label">Award</span>
        <strong data-testid="promotion-note">{PROMOTION_NOTE}</strong>
      </div>
    </section>
  );
}

function EditForm({ onClose }: { onClose: () => void }) {
  return (
    <form className="owner-line__form" aria-label="Edit teaching lineage" data-testid="lineage-form" onSubmit={(event) => event.preventDefault()}>
      {PROPOSED_LINE.filter((step) => step.name !== 'You').map((step) => (
        <label key={step.name}>
          {step.name}
          <input type="text" defaultValue={step.name} aria-label={step.name} />
        </label>
      ))}
      <button type="button" className="ink-btn" onClick={onClose}>
        Done
      </button>
    </form>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="student student-frame student--arena student--profile owner-line">
      <p className="owner-line__banner" role="note">
        {OWNER_LINE_NOTE}
      </p>
      <header className="arena-hero profile-hero">
        <div className="profile-hero__copy">
          <h1>My profile</h1>
        </div>
      </header>
      <div className="owner-line__sheet">
        <ProfileDetails />
        {children}
      </div>
    </main>
  );
}

function LineHead({ title, editing, onEdit }: { title: string; editing: boolean; onEdit: () => void }) {
  return (
    <div className="owner-line__head">
      <h2>{title}</h2>
      {editing ? null : (
        <button type="button" className="owner-line__edit" onClick={onEdit}>
          Edit
        </button>
      )}
    </div>
  );
}

/** Read view under the profile details. Names only. Edit opens the form. */
export function CompactLineageCard() {
  const [editing, setEditing] = useState(false);
  return (
    <Shell>
      <section className="profile-card owner-line__card" aria-label="Instructor lineage" data-testid="lineage-compact">
        <LineHead title="Instructor lineage" editing={editing} onEdit={() => setEditing(true)} />
        {editing ? (
          <EditForm onClose={() => setEditing(false)} />
        ) : (
          <ol className="owner-line__names">
            {PROPOSED_LINE.map((step) => (
              <li key={step.name} data-you={step.name === 'You' ? 'true' : undefined}>
                {step.name}
              </li>
            ))}
          </ol>
        )}
      </section>
    </Shell>
  );
}

/** Same place under the profile details, with the relationship on each step. */
export function ExpandedLineageLine() {
  const [editing, setEditing] = useState(false);
  return (
    <Shell>
      <section className="profile-card owner-line__card" aria-label="Teaching lineage" data-testid="lineage-expanded">
        <LineHead title="Teaching lineage" editing={editing} onEdit={() => setEditing(true)} />
        {editing ? (
          <EditForm onClose={() => setEditing(false)} />
        ) : (
          <>
            <ol className="owner-line__spine">
              {PROPOSED_LINE.map((step) => (
                <li key={step.name} data-you={step.name === 'You' ? 'true' : undefined}>
                  <strong>{step.name}</strong>
                  {step.linkBelow ? <span>{step.linkBelow}</span> : null}
                  {step.detail ? <small>{step.detail}</small> : null}
                </li>
              ))}
            </ol>
            <ul className="owner-line__sources">
              {PROPOSED_SOURCES.map((url) => (
                <li key={url}>
                  <a href={url}>{url}</a>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </Shell>
  );
}
