import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRODUCTS_PATH } from '../lib/productNames';
import { acceptSignedSeatOnce, forgetSeatAccept, seatWelcomeLine, type SeatAcceptResult } from '../lib/seatClient';

export const SEAT_INVITE_CHECKING = 'Checking your invite…';

/**
 * An instructor seat invite link (/instructors?invite=…): checking, then
 * You're in (gym + seat, Continue) or the reason it did not open (Try again).
 */
export function SeatInviteAccept({ token }: { token: string }) {
  const navigate = useNavigate();
  const [result, setResult] = useState<SeatAcceptResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setResult(null);
    void acceptSignedSeatOnce(token).then((next) => {
      if (live) setResult(next);
    });
    return () => {
      live = false;
    };
  }, [token, attempt]);

  const retry = () => {
    forgetSeatAccept(token);
    setAttempt((n) => n + 1);
  };

  return (
    <main className="home home--pro">
      <div className="home__inner">
        <section className="review-inbox" aria-label="Instructor invite">
          <p className="plan-card__kicker">Instructor invite</p>
          {!result ? (
            <>
              <h1>{SEAT_INVITE_CHECKING}</h1>
              <p role="status">One moment. Keep this page open.</p>
            </>
          ) : result.ok ? (
            <>
              <h1>
                <span aria-hidden="true">✓ </span>You're in
              </h1>
              <p role="status">{seatWelcomeLine(result)}</p>
              {result.email && result.email !== 'instructor' ? <p>Seat: {result.email}</p> : null}
              <button type="button" className="btn" autoFocus onClick={() => navigate(PRODUCTS_PATH, { replace: true })}>
                Continue
              </button>
            </>
          ) : (
            <>
              <h1>This invite didn't open</h1>
              <p role="alert">{result.message}</p>
              <div className="invite-actions">
                <button type="button" className="btn" onClick={retry}>
                  Try again
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => navigate(PRODUCTS_PATH, { replace: true })}>
                  Go to Advantage
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
