import {
  COACH_PREVIEW_LABEL,
  COACH_PREVIEW_NOTE,
  COMING_SOON_ADS,
  PRO_CONSOLE_PREVIEW_LABEL,
  PRO_CONSOLE_PREVIEW_NOTE,
  type SoonProduct,
} from '../lib/comingSoonAds';

type ExtraAction = {
  label: string;
  onClick: () => void;
};

type Props = {
  product: SoonProduct;
};

type ActionsProps = {
  product: SoonProduct;
  onDismiss: () => void;
  extraAction?: ExtraAction;
};

export function ComingSoonAd({ product }: Props) {
  const ad = COMING_SOON_ADS[product];

  return (
    <div className={`soon-ad soon-ad--${product}`}>
      <p className="soon-ad__kicker">{ad.kicker}</p>
      {product === 'coach' ? <CoachPreview /> : <ProConsolePreview />}
      {ad.lead ? <p className="soon-ad__lead">{ad.lead}</p> : null}
      <ul className="soon-ad__features">
        {ad.features.map((feature) => (
          <li key={feature.title} className="soon-ad__feature">
            <strong>{feature.title}</strong>
            <span>{feature.body}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CoachPreview() {
  return (
    <figure className="soon-ad__preview">
      <img
        src="/coach-preview.png"
        alt="Advantage Coach home with Daily Lesson Plan, Daily Training Videos, Technique Tree, Mock Tournament, and Competitor Roster"
        width={1080}
        height={2340}
      />
      <figcaption>
        <strong>{COACH_PREVIEW_LABEL}</strong>
        <span>{COACH_PREVIEW_NOTE}</span>
      </figcaption>
    </figure>
  );
}

function ProConsolePreview() {
  return (
    <figure className="soon-ad__preview">
      <img
        src="/pro-console-preview.png"
        alt="Advantage Pro console home with Media Console, Competitor Management System, Instructor Collaboration and Cloud Access, and In-House Tournament Management Suite"
        width={816}
        height={1384}
      />
      <figcaption>
        <strong>{PRO_CONSOLE_PREVIEW_LABEL}</strong>
        <span>{PRO_CONSOLE_PREVIEW_NOTE}</span>
      </figcaption>
    </figure>
  );
}

export function ComingSoonAdActions({ product, onDismiss, extraAction }: ActionsProps) {
  const ad = COMING_SOON_ADS[product];

  return (
    <div className="soon-ad__actions">
      <button type="button" className="btn soon-ad__dismiss" onClick={onDismiss}>
        {ad.dismiss}
      </button>
      {extraAction ? (
        <button type="button" className="btn btn--ghost" onClick={extraAction.onClick}>
          {extraAction.label}
        </button>
      ) : null}
    </div>
  );
}
