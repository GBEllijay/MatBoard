import { dispatchMatch } from '../lib/matchStore';
import {
  SELECTABLE_SCOREBOARD_SKINS,
  type ScoreboardSkinId,
} from '../lib/scoreboardSkin';

/** Mock-Tournament, Old School, and Quick Result. The choice is stored with the match so Display follows. */
export function ScoreboardSkinSwitcher({ skin }: { skin: ScoreboardSkinId }) {
  return (
    <div className="kids-switch" role="radiogroup" aria-label="Scoreboard skin">
      {SELECTABLE_SCOREBOARD_SKINS.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={skin === option.id}
          className={`chip${skin === option.id ? ' chip--gold' : ''}`}
          onClick={() => dispatchMatch({ type: 'setSkin', value: option.id })}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
