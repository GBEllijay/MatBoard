import {
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
      {product === 'pro' ? <ProConsolePreview /> : null}
      <p className="soon-ad__lead">{ad.lead}</p>
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

function ProConsolePreview() {
  return (
    <figure className="soon-ad__preview">
      <img
        src="/pro-console-preview.svg"
        alt="Grey placeholder of Pro menus, with Media Console listed first"
        width={640}
        height={300}
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
