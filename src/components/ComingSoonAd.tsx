import {
  ALPHA_TRIAL_NOTE,
  COACH_LAUNCH_PRICE_NOTE,
  COACH_PREVIEW_LABEL,
  COACH_PREVIEW_NOTE,
  COMING_SOON_ADS,
  PRO_CONSOLE_PREVIEW_LABEL,
  PRO_CONSOLE_PREVIEW_NOTE,
  PRO_LAUNCH_PRICE_NOTE,
  type SoonProduct,
} from '../lib/comingSoonAds';
import { SITE_FEEDBACK_EMAIL } from '../lib/siteFooter';

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
      <p className="soon-ad__includes">{ad.includes}</p>
      <ul className="soon-ad__features">
        {ad.features.map((feature) => (
          <li key={feature.title} className="soon-ad__feature">
            <strong>{feature.title}</strong>
            <span>{feature.body}</span>
          </li>
        ))}
      </ul>
      {ad.aside ? <p className="soon-ad__aside">{ad.aside}</p> : null}
      <p className="soon-ad__price">{product === 'coach' ? COACH_LAUNCH_PRICE_NOTE : PRO_LAUNCH_PRICE_NOTE}</p>
      <AlphaTrialNote />
    </div>
  );
}

function AlphaTrialNote() {
  const [before, after] = ALPHA_TRIAL_NOTE.split(SITE_FEEDBACK_EMAIL);

  return (
    <p className="soon-ad__trial">
      {before}
      <a href={`mailto:${SITE_FEEDBACK_EMAIL}`}>{SITE_FEEDBACK_EMAIL}</a>
      {after}
    </p>
  );
}

function CoachPreview() {
  return (
    <figure className="soon-ad__preview">
      <img
        src="/coach-preview.png"
        alt="Advantage Coach home with Daily Lesson Plan, Daily Training Videos, Technique Tree, Student Roster, and Mock Tournament"
        width={840}
        height={2042}
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
        alt="Advantage Pro home with Advantage Pro on the black belt, then Media Console, Advantage Coach Unlimited, Instructor Invitation and Access Management, and Tournament Management Pro"
        width={840}
        height={1660}
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
