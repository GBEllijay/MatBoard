import {
  KIDS_SCOREBOARDS_NAME,
  KIDS_SKINS,
  setKidsEnabled,
  setKidsSkin,
  type KidsScoreboardPrefs,
} from '../lib/kidsScoreboard';

/** On/off plus the six locked backgrounds. The bracket page and the match controller share this device preference. */
export function KidsScoreboardSwitcher({ prefs }: { prefs: KidsScoreboardPrefs }) {
  return (
    <div className="kids-switch">
      <button
        type="button"
        className={`chip${prefs.enabled ? ' chip--gold' : ''}`}
        aria-pressed={prefs.enabled}
        onClick={() => setKidsEnabled(!prefs.enabled)}
      >
        {KIDS_SCOREBOARDS_NAME}
      </button>
      {prefs.enabled ? (
        <div className="kids-switch__skins" role="radiogroup" aria-label={`${KIDS_SCOREBOARDS_NAME} background`}>
          {KIDS_SKINS.map((skin) => (
            <button
              key={skin.id}
              type="button"
              role="radio"
              aria-checked={prefs.skin === skin.id}
              className={`chip${prefs.skin === skin.id ? ' chip--gold' : ''}`}
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
