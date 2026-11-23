import type { ReactNode } from 'react';
import type { PodiumPlaces } from '../lib/bracketPodium';

export function BracketMatEdges() {
  return (
    <>
      <div className="mat-edge mat-edge--top" aria-hidden="true" />
      <div className="mat-edge mat-edge--bottom" aria-hidden="true" />
      <div className="mat-edge mat-edge--left" aria-hidden="true" />
      <div className="mat-edge mat-edge--right" aria-hidden="true" />
    </>
  );
}

function Step({
  place,
  names,
  children,
}: {
  place: 1 | 2 | 3;
  names: string[];
  children?: ReactNode;
}) {
  const label = place === 1 ? '1st' : place === 2 ? '2nd' : '3rd';
  const rank = place === 1 ? 'Champion' : place === 2 ? '2nd place' : '3rd place';
  const filled = names.length > 0;
  return (
    <div
      className={`podium-banner__step podium-banner__step--${label} ${filled ? 'is-filled' : ''}`}
      aria-label={filled ? `${rank}: ${names.join(' and ')}` : rank}
    >
      <span className="podium-banner__place">{label}</span>
      {filled ? (
        <p className="podium-banner__names">
          {names.map((name) => (
            <span key={name}>{name}</span>
          ))}
        </p>
      ) : (
        children ?? <p className="podium-banner__names podium-banner__names--empty"> </p>
      )}
    </div>
  );
}

export function BracketPodiumBanner({
  places,
  kidsScore,
  emptyField,
}: {
  places: PodiumPlaces;
  kidsScore?: string | null;
  emptyField?: ReactNode;
}) {
  const showSecond = Boolean(places.second);
  const showThird = places.third.length > 0;
  return (
    <div
      className={`podium-banner${showSecond || showThird ? ' podium-banner--places' : ' podium-banner--champ-only'}`}
      role="group"
      aria-label="Podium"
    >
      {showSecond ? <Step place={2} names={[places.second]} /> : null}
      <Step place={1} names={places.first ? [places.first] : []}>
        {places.first ? null : emptyField}
        {places.first && kidsScore ? <strong className="kids-champ-score">{kidsScore}</strong> : null}
      </Step>
      {showThird ? <Step place={3} names={places.third} /> : null}
    </div>
  );
}
