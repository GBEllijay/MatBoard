import {
  KIDS_BRACKETS_SKINS_LABEL,
  KIDS_SKINS,
  setKidsEnabled,
  setKidsSkin,
  type KidsScoreboardPrefs,
} from '../lib/kidsScoreboard';

/** On/off plus the six locked backgrounds. Lives at the bottom of Brackets. */
export function KidsScoreboardSwitcher({ prefs }: { prefs: KidsScoreboardPrefs }) {
  return (
    <div className="kids-switch kids-switch--boards">
      <button
        type="button"
        className={`chip${prefs.enabled ? ' chip--on' : ''}`}
        aria-pressed={prefs.enabled}
        onClick={() => setKidsEnabled(!prefs.enabled)}
      >
        {KIDS_BRACKETS_SKINS_LABEL}
      </button>
      {prefs.enabled ? (
        <div className="kids-switch__skins" role="radiogroup" aria-label={`${KIDS_BRACKETS_SKINS_LABEL} background`}>
          {KIDS_SKINS.map((skin) => (
            <button
              key={skin.id}
              type="button"
              role="radio"
              aria-checked={prefs.skin === skin.id}
              className={`chip${prefs.skin === skin.id ? ' chip--on' : ''}`}
              onClick={() => setKidsSkin(skin.id)}
            >
              {skin.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
