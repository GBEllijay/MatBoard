import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { afterFailedUnlock, redeemAccessCode } from '../lib/codeRedeemClient';
import { MEDIA_EDITION_CTA_LABEL } from '../lib/mediaEdition';
import { COACH_UNLIMITED_PATH, PRO_PLUS_CLOUD_PATH } from '../lib/productNames';
import { alphaRequestMailto } from '../lib/siteFooter';
import '../pages/buyTiers.css';

export type AlphaCodeTier = 'white' | 'student' | 'media' | 'instructor' | 'pro' | 'pro-cloud';

/** Where a successful code for this tier opens. Kinds and grants stay on the server. */
export const ALPHA_CODE_DESTINATION: Record<AlphaCodeTier, string> = {
  white: '/white',
  student: '/student',
  media: '/media',
  instructor: COACH_UNLIMITED_PATH,
  pro: '/pro',
  'pro-cloud': PRO_PLUS_CLOUD_PATH,
};

export async function redeemAlphaCode(input: {
  tier: AlphaCodeTier;
  code: string;
  email?: string;
  navigate: (path: string) => void;
  /** White only: a typed promo that is not an unlock code continues to checkout. */
  onPromoCheckout?: (typed: string) => Promise<void>;
}): Promise<{ status: 'empty' } | { status: 'unlocked' } | { status: 'checkout' } | { status: 'error'; error: string }> {
  const typed = input.code.trim();
  if (!typed) return { status: 'empty' };
  const result = await redeemAccessCode(typed, (input.email ?? '').trim());
  if (result.ok) {
    input.navigate(ALPHA_CODE_DESTINATION[input.tier]);
    return { status: 'unlocked' };
  }
  if (input.onPromoCheckout) {
    const next = afterFailedUnlock(typed, result.error);
    if (next.action === 'checkout') {
      await input.onPromoCheckout(typed);
      return { status: 'checkout' };
    }
    return { status: 'error', error: next.error };
  }
  return { status: 'error', error: result.error };
}

/**
 * Request-an-alpha-code button plus the code box, same on every product page.
 * Redeem goes through redeemAccessCode. A bad code shows that call's error.
 */
export function AlphaCodeEntry({
  tier,
  showEmail = false,
  email = '',
  onEmailChange,
  code,
  onCodeChange,
  codeId,
  codeName = 'code',
  codeLabel = 'Alpha code',
  onPromoCheckout,
}: {
  tier: AlphaCodeTier;
  showEmail?: boolean;
  email?: string;
  onEmailChange?: (value: string) => void;
  code?: string;
  onCodeChange?: (value: string) => void;
  codeId?: string;
  codeName?: string;
  codeLabel?: string;
  onPromoCheckout?: (typed: string) => Promise<void>;
}) {
  const navigate = useNavigate();
  const [localCode, setLocalCode] = useState('');
  const [localEmail, setLocalEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typedCode = code ?? localCode;
  const typedEmail = showEmail ? email : localEmail;
  const setCode = onCodeChange ?? setLocalCode;
  const setEmail = onEmailChange ?? setLocalEmail;
  const fieldId = codeId ?? `alpha-code-${tier}`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    const result = await redeemAlphaCode({
      tier,
      code: typedCode,
      email: showEmail ? typedEmail : '',
      navigate,
      onPromoCheckout,
    });
    if (result.status === 'error') setError(result.error);
    if (result.status === 'unlocked') setCode('');
    setBusy(false);
  }

  return (
    <div className="alpha-code" data-alpha-tier={tier}>
      <a className="btn btn--white" href={alphaRequestMailto()}>
        {MEDIA_EDITION_CTA_LABEL}
      </a>
      <form className="alpha-code__form" id={`alpha-code-form-${tier}`} onSubmit={(event) => void onSubmit(event)}>
        <label className="buy__code" htmlFor={fieldId}>
          {codeLabel}
          <input
            id={fieldId}
            name={codeName}
            value={typedCode}
            onChange={(event) => {
              setCode(event.target.value);
              if (error) setError(null);
            }}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="done"
            aria-label={codeLabel}
            placeholder="Optional"
          />
        </label>
        {showEmail ? (
          <label className="buy__field" htmlFor={`${fieldId}-email`}>
            Email
            <input
              id={`${fieldId}-email`}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              value={typedEmail}
              onChange={(event) => setEmail(event.target.value)}
              aria-label="Email"
              placeholder="Optional"
            />
          </label>
        ) : null}
        {showEmail ? <p className="buy__hint">Optional. Sent with the code, and filled in if you restore a purchase.</p> : null}
        {error ? (
          <p className="buy__status buy__status--bad" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn btn--white" type="submit" disabled={busy}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}
