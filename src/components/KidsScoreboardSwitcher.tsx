import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  KIDS_BRACKETS_SKINS_LABEL,
  KIDS_SKINS,
  kidsSkinLabel,
  kidsWallpaperPath,
  setKidsEnabled,
  setKidsMascot,
  setKidsSkin,
  type KidsScoreboardPrefs,
  type KidsSkinId,
} from '../lib/kidsScoreboard';

/** Toolbar Skin control. One button opens thumbnails. The pinned footer bar is gone. */
export function KidsScoreboardSwitcher({
  prefs,
  suppressed,
}: {
  prefs: KidsScoreboardPrefs;
  /** Fullscreen, a bottom sheet, or match scoring. The picker stays closed. */
  suppressed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerId = useId();
  const showing = open && !suppressed;

  useLayoutEffect(() => {
    const root = rootRef.current;
    const picker = pickerRef.current;
    if (!showing || !root || !picker) return;
    const anchor = root.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 16);
    let left = anchor.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - 8 - width;
    if (left < 8) left = 8;
    picker.style.position = 'fixed';
    picker.style.top = `${Math.round(anchor.bottom + 6)}px`;
    picker.style.left = `${Math.round(left)}px`;
    picker.style.width = `${Math.round(width)}px`;
    picker.style.right = 'auto';
  }, [showing]);

  useEffect(() => {
    if (suppressed) setOpen(false);
  }, [suppressed]);

  useEffect(() => {
    if (!showing) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [showing]);

  const choose = (skin: KidsSkinId) => {
    setKidsSkin(skin);
    setKidsEnabled(true);
    setOpen(false);
  };

  return (
    <div className="kids-skin" ref={rootRef}>
      <button
        type="button"
        className={`btn kids-skin__btn${prefs.enabled ? ' kids-skin__btn--on' : ' btn--ghost'}`}
        aria-expanded={showing}
        aria-haspopup="dialog"
        aria-controls={pickerId}
        aria-pressed={prefs.enabled}
        disabled={suppressed}
        aria-label={prefs.enabled ? `Skin, ${kidsSkinLabel(prefs.skin)}` : 'Skin'}
        onClick={() => setOpen((value) => !value)}
      >
        Skin
      </button>
      {showing ? (
        <div
          id={pickerId}
          ref={pickerRef}
          className="kids-skin__picker"
          role="dialog"
          aria-label={KIDS_BRACKETS_SKINS_LABEL}
        >
          <div className="kids-skin__grid" role="radiogroup" aria-label={`${KIDS_BRACKETS_SKINS_LABEL} background`}>
            {KIDS_SKINS.map((skin) => {
              const selected = prefs.enabled && prefs.skin === skin.id;
              return (
                <button
                  key={skin.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`kids-skin__thumb${selected ? ' is-on' : ''}`}
                  onClick={() => choose(skin.id)}
                >
                  <img src={kidsWallpaperPath(skin.id)} alt="" />
                  <span>{skin.label}</span>
                </button>
              );
            })}
          </div>
          <div className="kids-skin__row">
            <button
              type="button"
              className={`kids-skin__choice${!prefs.enabled ? ' is-on' : ''}`}
              aria-pressed={!prefs.enabled}
              onClick={() => {
                setKidsEnabled(false);
                setOpen(false);
              }}
            >
              Off
            </button>
            <button
              type="button"
              className={`kids-skin__choice${prefs.mascot ? ' is-on' : ''}`}
              aria-pressed={prefs.mascot}
              onClick={() => setKidsMascot(!prefs.mascot)}
            >
              Carlos
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
