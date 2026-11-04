import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlphaAccessNote } from '../components/AlphaAccessNote';
import { AlphaCodeEntry } from '../components/AlphaCodeEntry';
import { CloudAddonChoice, CloudAddonLine, InstructorCloudCopy } from '../components/CloudAddon';
import { HalfOffCheckoutNote } from '../components/HalfOffCheckoutNote';
import { HomeMark } from '../components/HomeMark';
import { SiteFooter } from '../components/SiteFooter';
import { HigherTierList, TierBeltIcon, TierRestoreCard } from '../components/TierBuyParts';
import { useHalfOffArrival } from '../hooks/useHalfOffArrival';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useStudentEditionUnlocked } from '../hooks/useStudentEditionUnlocked';
import { useWhiteUnlocked } from '../hooks/useWhiteUnlocked';
import { withCheckoutNonce } from '../lib/codeRedeemClient';
import { buyCheckoutBody } from '../lib/halfOff';
import { COACH_UNLIMITED_PATH, INSTRUCTOR_DRIVE_REQUIREMENT, PRODUCTS_PATH } from '../lib/productNames';
import { ALPHA_PRODUCT_STATUS, STUDENT_STORAGE_LINE } from '../lib/productPrices';
import { studentEditionEntitled } from '../lib/studentEdition';
import { PRO_INCLUDES_ALL, tierEntry } from '../lib/tierBuyPages';
import { WHITE_CHECKOUT_API } from '../lib/whitePurchase';

export type EditionBuyTier = 'student' | 'instructor' | 'pro';

/**
 * Public buy page for Student, Instructor and Pro, built from the White /buy
 * template. Student keeps today's checkout rule (the button shows only when the
 * Student door is entitled, exactly like the Student card on /buy). Instructor
 * and Pro have no checkout here: the alpha line and the alpha-code email.
 */
export function BuyEditionPage({ tier }: { tier: EditionBuyTier }) {
  const entry = tierEntry(tier);
  const halfOff = useHalfOffArrival();
  const pro = useProUnlocked();
  const coach = useCoachUnlocked();
  const white = useWhiteUnlocked();
  const student = useStudentEditionUnlocked();
  const studentOpen = tier === 'student' && studentEditionEntitled({ pro, coach, white, student });
  const [studentPending, setStudentPending] = useState(false);
  const [studentError, setStudentError] = useState<string | null>(null);
  const [includeCloud, setIncludeCloud] = useState(false);
  const sellTier = tier === 'instructor' || tier === 'pro';
  const owned = tier === 'student' ? student : tier === 'instructor' ? coach : pro;

  useEffect(() => {
    const previous = document.title;
    document.title = `Buy ${entry.name}`;
    return () => {
      document.title = previous;
    };
  }, [entry.name]);

  // Same request as the Student card's checkout on /buy.
  async function onStudentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (studentPending || (!studentOpen && !sellTier)) return;
    setStudentError(null);
    setStudentPending(true);
    try {
      const response = await fetch(WHITE_CHECKOUT_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          await withCheckoutNonce(
            buyCheckoutBody({
              product: tier === 'instructor' ? 'coach' : tier === 'pro' ? 'pro' : 'student',
              halfOffActive: halfOff,
              cloud: sellTier && includeCloud,
            }),
          ),
        ),
      });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) {
        setStudentError(body.error || 'Checkout could not start.');
        setStudentPending(false);
        return;
      }
      window.location.assign(body.url);
    } catch {
      setStudentError('Checkout could not start. Check your connection and try again.');
      setStudentPending(false);
    }
  }

  return (
    <main className={`home home--buy home--tier home--tier-${tier}`} data-tier-page={tier}>
      <div className="home__inner">
        <HomeMark to="/" />
        <article className="buy">
          <header className={`buy__card buy__card--belt buy__card--tier buy__card--tier-${entry.belt}`}>
            <TierBeltIcon belt={entry.belt} big />
            <p className="buy__kicker">{tier === 'student' ? 'Alpha' : ALPHA_PRODUCT_STATUS}</p>
            <h2>{entry.name}</h2>
            <p className="buy__lead">{entry.lead}</p>
            {tier === 'instructor' ? <p>{INSTRUCTOR_DRIVE_REQUIREMENT}</p> : null}
            {tier === 'pro' ? <p className="buy__includes-all">{PRO_INCLUDES_ALL}</p> : null}
            <p className="buy__price">
              {entry.price} <span>{entry.priceDetail}</span>
            </p>
            {tier === 'student' ? <p className="buy__storage">{STUDENT_STORAGE_LINE}</p> : null}
            {tier === 'instructor' ? <InstructorCloudCopy /> : null}
            {sellTier ? <CloudAddonLine /> : null}
            {studentOpen || sellTier ? null : <p>Not for sale on this page.</p>}
          </header>

          <section className="buy__card buy__checkout" aria-label={studentOpen ? 'Checkout' : 'Alpha access'}>
            {studentError ? (
              <p className="buy__status buy__status--bad" role="alert">
                {studentError}
              </p>
            ) : null}
            <AlphaCodeEntry tier={tier === 'instructor' ? 'instructor' : tier} />
            {studentOpen || sellTier ? (
              <form onSubmit={(event) => void onStudentSubmit(event)}>
                <HalfOffCheckoutNote active={halfOff} />
                {sellTier ? <CloudAddonChoice checked={includeCloud} onChange={setIncludeCloud} /> : null}
                <button className="btn btn--white" type="submit" disabled={studentPending}>
                  {studentPending
                    ? 'Opening checkout…'
                    : `Continue to checkout — ${entry.price}`}
                </button>
              </form>
            ) : null}
            {entry.alpha ? <AlphaAccessNote note={entry.alpha.note} display={entry.alpha.display} /> : null}
            {tier === 'instructor' && (coach || pro) ? (
              // Owner 2026-11-01: Instructor's open link goes to Coach Unlimited. Label stays Instructor.
              <Link className="btn btn--ghost" to={COACH_UNLIMITED_PATH} data-instructor-open>
                Open {entry.name}
              </Link>
            ) : null}
            {tier === 'student' ? (
              <Link className="btn btn--ghost" to="/student?student=1">
                Try the demo
              </Link>
            ) : null}
            <p>
              <Link to="/terms">Terms of Service</Link>
              {' · '}
              <Link to="/privacy">Privacy Policy</Link>
              {' · '}
              <Link to={PRODUCTS_PATH}>All editions</Link>
            </p>
          </section>

          <section className="buy__card">
            <div className="buy__block">
              <h3>Included</h3>
              <ul>
                <li>{entry.includes}</li>
              </ul>
            </div>
            <div className="buy__block">
              <h3>Features</h3>
              <ul className="buy__features">
                {entry.features.map((feature) => (
                  <li key={feature.title}>
                    <strong>{feature.title}</strong>
                    {feature.body ? ` — ${feature.body}` : null}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {owned ? null : <TierRestoreCard label="Restore purchase" />}

          <HigherTierList from={tier} />
        </article>
        <SiteFooter />
      </div>
    </main>
  );
}

export function BuyStudentEditionPage() {
  return <BuyEditionPage tier="student" />;
}

export function BuyInstructorEditionPage() {
  return <BuyEditionPage tier="instructor" />;
}

export function BuyProEditionPage() {
  return <BuyEditionPage tier="pro" />;
}
