import type { RankBelt } from '../../lib/progress/types';
import type { PromotionHistoryEntry } from '../../lib/studentRank';
import './promotionHistory.css';

const STRIPED: ReadonlySet<string> = new Set(['white', 'blue', 'purple', 'brown']);
const STRIPE_POSITIONS = 4;

export function promotionCountLabel(belt: RankBelt, tapeCount: number): string {
  if (belt === 'black' || belt === 'coral' || belt === 'redWhite' || belt === 'red') {
    return tapeCount === 1 ? '1 degree' : `${tapeCount} degrees`;
  }
  return tapeCount === 1 ? '1 stripe' : `${tapeCount} stripes`;
}

export function PromotionHistoryList({
  entries,
  repeats,
  dropId,
  onAskRemove,
  onConfirmRemove,
  onKeep,
}: {
  entries: readonly PromotionHistoryEntry[];
  repeats: readonly string[];
  dropId: string;
  onAskRemove: (historyId: string) => void;
  onConfirmRemove: (historyId: string) => void;
  onKeep: () => void;
}) {
  return (
    <section className="phist" aria-label="Promotion history">
      <h2>Promotion history</h2>
      {entries.length === 0 ? <p>No earlier belts yet. A belt moves here when you change it and it already has a date or a stripe.</p> : null}
      {repeats.map((name) => (
        <p key={name}>
          {name} is saved more than once. Remove drops only the entry you choose. The date is the promotion date, not when it was saved.
        </p>
      ))}
      <ul className="phist-list">
        {entries.map((row) => {
          const stripes = promotionCountLabel(row.belt, row.tapeCount);
          const striped = STRIPED.has(row.belt);
          return (
            <li key={row.id} className="rank-history">
              <span className={`phist-belt phist-belt--${row.belt}`} aria-hidden="true" />
              <div className="phist-copy">
                <span className="rank-history__label">{row.label}</span>
                <span className="rank-history__date">{row.awardedOn || 'No date'}</span>
                {striped ? (
                  <span className="phist-pips" aria-hidden="true">
                    {Array.from({ length: STRIPE_POSITIONS }, (_, index) => (
                      <i key={index} className={index < row.tapeCount ? 'phist-pip is-on' : 'phist-pip'} />
                    ))}
                  </span>
                ) : null}
                <span className="rank-history__stripes">{stripes}</span>
                {row.historyId ? (
                  dropId === row.historyId ? (
                    <div className="student-actions">
                      <button
                        type="button"
                        className="phist-remove phist-confirm"
                        aria-label={`Confirm remove ${row.label} history`}
                        onClick={() => onConfirmRemove(row.historyId)}
                      >
                        Confirm remove
                      </button>
                      <button type="button" className="phist-remove" onClick={onKeep}>
                        Keep history
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="phist-remove"
                      aria-label={`Remove ${row.label} history`}
                      onClick={() => onAskRemove(row.historyId)}
                    >
                      Remove
                    </button>
                  )
                ) : (
                  <span className="rank-history__current">Current belt</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
