import { useState } from 'react';
import {
  MEDIA_CONDUCT_AGREE,
  MEDIA_CONDUCT_POINTS,
  MEDIA_CONDUCT_TITLE,
  acceptMediaConduct,
  mediaConductAccepted,
} from '../lib/mediaConduct';
import { proPlusCloudUnlocked } from '../lib/proPlusCloud';

/** Click-to-agree before Plus Cloud hosting is used. Hidden once the gym has agreed. */
export function PlusCloudConduct() {
  const unlocked = proPlusCloudUnlocked();
  const [accepted, setAccepted] = useState(() =>
    mediaConductAccepted(typeof localStorage === 'undefined' ? null : localStorage),
  );
  if (!unlocked || accepted) return null;
  return (
    <section aria-label={MEDIA_CONDUCT_TITLE}>
      <h2>{MEDIA_CONDUCT_TITLE}</h2>
      <ul>
        {MEDIA_CONDUCT_POINTS.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <button
        type="button"
        className="btn"
        onClick={() => {
          acceptMediaConduct(localStorage);
          setAccepted(true);
        }}
      >
        {MEDIA_CONDUCT_AGREE}
      </button>
    </section>
  );
}
