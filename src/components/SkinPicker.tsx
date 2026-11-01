import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import './skinPicker.css';

export type SkinPickerOption = {
  id: string;
  label: string;
  thumb: string;
};

/**
 * Skins button that opens a thumbnail popup, styled like the brackets Skin picker.
 * Shown only with Media Edition or above, where it replaces the old skin toggle in the same spot.
 * Callers pass only the skins this browser may use; there are no locked tiles.
 */
export function SkinPicker({
  label,
  value,
  options,
  onChoose,
  buttonClassName = 'chip',
  className = '',
}: {
  /** Dialog and radiogroup name, e.g. "Scoreboard skin" or "Timer skin". */
  label: string;
  value: string;
  options: readonly SkinPickerOption[];
  onChoose: (id: string) => void;
  buttonClassName?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerId = useId();
  const current = options.find((option) => option.id === value);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const picker = pickerRef.current;
    if (!open || !root || !picker) return;
    const place = () => {
      const anchor = root.getBoundingClientRect();
      const width = Math.min(420, window.innerWidth - 16);
      let left = anchor.left;
      if (left + width > window.innerWidth - 8) left = window.innerWidth - 8 - width;
      if (left < 8) left = 8;
      const margin = 6;
      const height = picker.offsetHeight;
      const spaceBelow = window.innerHeight - anchor.bottom - margin;
      const spaceAbove = anchor.top - margin;
      const openUp = spaceBelow < height && spaceAbove > spaceBelow;
      picker.style.left = `${Math.round(left)}px`;
      picker.style.width = `${Math.round(width)}px`;
      picker.style.maxHeight = `${Math.round(Math.max(160, (openUp ? spaceAbove : spaceBelow) - 8))}px`;
      if (openUp) {
        picker.style.top = 'auto';
        picker.style.bottom = `${Math.round(Math.max(8, window.innerHeight - anchor.top + margin))}px`;
      } else {
        picker.style.bottom = 'auto';
        picker.style.top = `${Math.round(anchor.bottom + margin)}px`;
      }
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  return (
    <div className={`skin-pick${className ? ` ${className}` : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`${buttonClassName} skin-pick__btn`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? pickerId : undefined}
        aria-label={current ? `${label}, ${current.label}` : label}
        onClick={() => setOpen((v) => !v)}
      >
        Skins
      </button>
      {open ? (
        <div id={pickerId} ref={pickerRef} className="skin-pick__picker" role="dialog" aria-label={label}>
          <div className="skin-pick__grid" role="radiogroup" aria-label={label}>
            {options.map((option) => {
              const selected = option.id === value;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-skin-option={option.id}
                  className={`skin-pick__thumb${selected ? ' is-on' : ''}`}
                  onClick={() => {
                    onChoose(option.id);
                    setOpen(false);
                  }}
                >
                  <span className="skin-pick__img">
                    <img src={option.thumb} alt="" loading="lazy" />
                  </span>
                  <span className="skin-pick__name">
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
