import { useState } from 'react';
import {
  MEDIA_EXAMPLE,
  PREVIEW_OWN_DRIVE_NOTE,
  PREVIEW_DRIVE_NOTE,
  PREVIEW_INSTRUCTOR_PRICE,
  PREVIEW_INSTRUCTOR_PRICE_NOTE,
  PREVIEW_MEDIA_PLUS_PRICE,
  PREVIEW_MEDIA_PLUS_SCOPE,
  PREVIEW_PRICE_NOTE,
  PREVIEW_QUOTA_LINE,
  PREVIEW_QUOTA_WHY,
  PREVIEW_STUDENT_PRICE,
} from './model';

function ExampleButton({ idle, done }: { idle: string; done: string }) {
  const [on, setOn] = useState(false);
  return (
    <button type="button" className="php-example" onClick={() => setOn(true)}>
      {on ? done : idle}
    </button>
  );
}

/** Academy link only. Storage is a separate card. Nothing is joined or saved. */
export function AcademyLinkPreview() {
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
      <ExampleButton
        idle="Show a preview example"
        done="Example Gym (preview). Not connected. Nothing was saved."
      />
    </section>
  );
}

/** Hosted MediaPlus storage, with Google Drive left as an optional alternative. */
export function StorageChoicePreview({ place }: { place: 'media' | 'instructor' }) {
  return (
    <section className="ip-sheet php-connect" aria-label="Storage choice" data-testid={`${place}-storage`}>
      <header className="ip-sheet__head">
        <p className="ip-kicker">Preview · storage</p>
        <h2>MediaPlus Cloud</h2>
        <p className="ip-quiet">
          {PREVIEW_MEDIA_PLUS_PRICE}. Example only. Not connected. Nothing is saved or uploaded.
        </p>
      </header>
      <ul className="php-scope">
        {PREVIEW_MEDIA_PLUS_SCOPE.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="ip-quiet" data-testid="media-plus-quota">
        {PREVIEW_QUOTA_LINE} {PREVIEW_QUOTA_WHY}
      </p>
      <p className="ip-quiet">{PREVIEW_DRIVE_NOTE}</p>
      <ExampleButton
        idle="Preview the hosted storage example"
        done="Example only. Not connected. Hosted storage was not turned on."
      />
      <ExampleButton
        idle="Preview the Google Drive alternative"
        done="Example only. Not connected. No Google Drive account was opened."
      />
    </section>
  );
}

/** Instructor's own drive. Independent of MediaPlus. Nothing is connected. */
export function OwnDrivePreview() {
  return (
    <section className="ip-sheet php-connect" aria-label="Your own drive" data-testid="instructor-own-drive">
      <header className="ip-sheet__head">
        <p className="ip-kicker">Preview · not Plus</p>
        <h2>Your own drive</h2>
        <p className="ip-quiet">{PREVIEW_OWN_DRIVE_NOTE}</p>
      </header>
      <ExampleButton
        idle="Preview the own-drive example"
        done="Example only. Not connected. No drive account was opened, and nothing was saved."
      />
    </section>
  );
}

/** Recurring figures the owner set for this preview. Not a checkout. */
export function PreviewPriceDecisions({ place }: { place: 'media' | 'instructor' }) {
  return (
    <section className="ip-sheet php-connect" aria-label="Preview pricing decisions" data-testid={`${place}-prices`}>
      <header className="ip-sheet__head">
        <p className="ip-kicker">Preview · not checkout</p>
        <h2>Preview prices</h2>
        <p className="ip-quiet">{PREVIEW_PRICE_NOTE}</p>
      </header>
      <div className="ip-id">
        {place === 'media' ? (
          <p>
            <span>Student Edition</span>
            <strong>{PREVIEW_STUDENT_PRICE}</strong>
          </p>
        ) : null}
        <p>
          <span>MediaPlus Cloud</span>
          <strong>{PREVIEW_MEDIA_PLUS_PRICE}</strong>
        </p>
        {place === 'instructor' ? (
          <p>
            <span>Instructor Edition</span>
            <strong>{PREVIEW_INSTRUCTOR_PRICE}</strong>
          </p>
        ) : null}
      </div>
      {place === 'instructor' ? <p className="ip-quiet">{PREVIEW_INSTRUCTOR_PRICE_NOTE}</p> : null}
      {place === 'media' ? (
        <p className="ip-quiet">
          MediaPlus is the Cloud add-on. This preview does not add a Media base monthly fee, and it does not set an annual price.
        </p>
      ) : null}
    </section>
  );
}
