import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useHalfOffArrival } from '../hooks/useHalfOffArrival';
import { useMediaUnlocked } from '../hooks/useMediaUnlocked';
import { useProPlusCloudUnlocked } from '../hooks/useProPlusCloud';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useStudentEditionUnlocked } from '../hooks/useStudentEditionUnlocked';
import { useWhiteUnlocked } from '../hooks/useWhiteUnlocked';
import {
  LADDER_LIST_LABEL,
  LADDER_NAME,
  PURCHASE_CREDIT_NOTE,
  highestEdition,
  ladderBuyPrice,
  planEditionLadder,
  readKnownPurchaseEmail,
  type LadderId,
  type LadderPlanRung,
} from '../lib/editionLadder';
import { purchasePromptsHidden, readCurrentSeat, seatChromeHidden, subscribeSeatSession } from '../lib/instructorSeats';
import { requestUpgradeQuote, type UpgradeQuoteResult } from '../lib/upgradeQuoteClient';
import { BeltRail } from './BeltRail';

const RAIL: Record<LadderId, { kind: 'white' | 'blue' | 'purple' | 'brown' | 'black'; bar?: 'red' | 'striped' }> = {
  white: { kind: 'white' },
  student: { kind: 'blue' },
  media: { kind: 'purple' },
  instructor: { kind: 'brown' },
  pro: { kind: 'black', bar: 'red' },
  'pro-cloud': { kind: 'black', bar: 'striped' },
};

function useSeat() {
  return useSyncExternalStore(subscribeSeatSession, readCurrentSeat, readCurrentSeat);
}

function useEditionUnlocks(): Record<LadderId, boolean> {
  return {
    white: useWhiteUnlocked(),
    student: useStudentEditionUnlocked(),
    media: useMediaUnlocked(),
    instructor: useCoachUnlocked(),
    pro: useProUnlocked(),
    'pro-cloud': useProPlusCloudUnlocked(),
  };
}

/**
 * One belt progression bar. The current edition is highlighted.
 * Unlocked editions open. Higher locked editions link to their buy page.
 * Credited prices come from /api/upgrade-quote. Pro Plus Cloud stays Coming soon.
 */
export function EditionLadder({ page, email }: { page: LadderId; email?: string | null }) {
  const unlocks = useEditionUnlocks();
  const seated = purchasePromptsHidden(useSeat());
  const halfOff = useHalfOffArrival();
  const known = email === undefined ? readKnownPurchaseEmail() : email;
  const plan = planEditionLadder({ page, unlocked: unlocks, seated, email: known });
  const buyKey = plan.rungs
    .filter((rung) => rung.quoteTier)
    .map((rung) => rung.quoteTier)
    .join(',');
  const [quotes, setQuotes] = useState<Record<string, UpgradeQuoteResult>>({});

  useEffect(() => {
    const targets = plan.rungs.filter((rung) => rung.role === 'buy' && rung.quoteTier);
    if (!known || targets.length === 0) {
      setQuotes((current) => (Object.keys(current).length === 0 ? current : {}));
      return;
    }
    let cancel = false;
    void Promise.all(
      targets.map(async (rung) => {
        const quote = await requestUpgradeQuote({ tier: rung.quoteTier!, email: known, halfOff });
        return [rung.id, quote] as const;
      }),
    ).then((rows) => {
      if (!cancel) setQuotes(Object.fromEntries(rows));
    });
    return () => {
      cancel = true;
    };
    // buyKey tracks which quote tiers this page still needs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [known, halfOff, buyKey]);

  if (!plan.show) return null;
  const note = plan.rungs.some((rung) => {
    if (rung.role !== 'buy') return false;
    return ladderBuyPrice(LADDER_LIST_LABEL[rung.id as Exclude<LadderId, 'white'>], quotes[rung.id] ?? null, Boolean(known)).note;
  });

  return (
    <section className="edition-ladder" aria-label="Edition progression" data-testid="edition-ladder" data-ladder-page={page}>
      <ol className="edition-ladder__rows">
        {plan.rungs.map((rung) => (
          <LadderRung key={rung.id} rung={rung} quote={quotes[rung.id] ?? null} asked={Boolean(known)} />
        ))}
      </ol>
      {note ? <p className="edition-ladder__note">{PURCHASE_CREDIT_NOTE}</p> : null}
    </section>
  );
}

function LadderRung({
  rung,
  quote,
  asked,
}: {
  rung: LadderPlanRung;
  quote: UpgradeQuoteResult | null;
  asked: boolean;
}) {
  const rail = RAIL[rung.id];
  const name = LADDER_NAME[rung.id];
  const meta =
    rung.role === 'active'
      ? 'Current'
      : rung.role === 'open'
        ? 'Open'
        : rung.role === 'soon'
          ? `This product is in alpha · ${LADDER_LIST_LABEL['pro-cloud']}`
          : ladderBuyPrice(LADDER_LIST_LABEL[rung.id as Exclude<LadderId, 'white'>], quote, asked).price;
  const className = `edition-ladder__rung edition-ladder__rung--${rung.role} edition-ladder__rung--${rung.id}`;
  const body = (
    <>
      <BeltRail kind={rail.kind} bar={rail.bar} />
      <span className="edition-ladder__name">{name}</span>
      <span className="edition-ladder__meta">{meta}</span>
    </>
  );
  if (rung.role === 'active' || !rung.href) {
    return (
      <li className={className} aria-current="page" data-rung={rung.id} data-role="active">
        {body}
      </li>
    );
  }
  const label =
    rung.role === 'open' ? `Open ${name}` : rung.role === 'soon' ? `${name}, in alpha` : `${name}, ${meta}`;
  return (
    <li data-rung={rung.id} data-role={rung.role}>
      <Link className={className} to={rung.href} aria-label={label}>
        {body}
      </Link>
    </li>
  );
}

/** Signed-in control for a license owner. Seats and Pro Plus Cloud do not get buy prompts. */
export function SignedInUpgradeBar() {
  const seat = useSeat();
  const { pathname } = useLocation();
  const unlocks = useEditionUnlocks();
  const [open, setOpen] = useState(false);
  const page = highestEdition(unlocks);
  if (seatChromeHidden(pathname) || purchasePromptsHidden(seat) || !page || page === 'pro-cloud') return null;
  return (
    <div className="seat-session-dock">
      <div className="seat-session">
        <button
          type="button"
          className="btn btn--blue seat-session__out"
          aria-expanded={open}
          aria-controls="edition-ladder-panel"
          onClick={() => setOpen((value) => !value)}
        >
          Upgrade
        </button>
      </div>
      {open ? (
        <div id="edition-ladder-panel" className="edition-ladder-panel">
          <EditionLadder page={page} />
        </div>
      ) : null}
    </div>
  );
}
