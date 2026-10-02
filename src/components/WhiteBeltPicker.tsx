import { ADULT_BELTS, KIDS_BELTS } from '../lib/rosterStore';

type Props = {
  belt: string;
  onBelt: (belt: string) => void;
};

/** Adult and kids belt choices for a White match name. Rank only — no other fields. */
export function WhiteBeltPicker({ belt, onBelt }: Props) {
  return (
    <fieldset className="roster-edit__belts">
      <legend>Belt rank</legend>
      <div className="presets roster-edit__belt-row" role="radiogroup" aria-label="Adult belts">
        {ADULT_BELTS.map((choice) => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={belt === choice}
            className={`preset${belt === choice ? ' preset--on' : ''}`}
            onClick={() => onBelt(choice)}
          >
            {choice}
          </button>
        ))}
      </div>
      <div className="presets roster-edit__belt-row" role="radiogroup" aria-label="Kids belts">
        {KIDS_BELTS.map((choice) => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={belt === choice}
            className={`preset${belt === choice ? ' preset--on' : ''}`}
            onClick={() => onBelt(choice)}
          >
            {choice}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
