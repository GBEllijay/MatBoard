import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  groupSkinPickerOptions,
  scrollSkinOptionIntoView,
  skinPickerColumnCount,
  skinPickerPopupWidth,
  skinPickerScrollMax,
  type SkinPickerSectionId,
} from '../lib/skinPickerLayout';
import './skinPicker.css';

export type SkinPickerOption = {
  id: string;
  label: string;
  thumb: string;
  /** Built-in catalog, or an uploaded skin. Omitted means Advantage skins. */
  section?: SkinPickerSectionId;
};

/**
 * Skins button that opens a thumbnail popup.
 * Shown for Advantage White (three base skins) and for Media Edition and above.
 * Callers pass only the skins this browser may use; there are no locked tiles.
 *
 * Controls in this popup:
 * - The Skins button (scoreboard display, scoreboard controller, round timer options).
 * - The dialog. Escape and a pointer outside it close it.
 * - "Advantage skins" heading, then one radio per built-in skin.
 * - "My skins" heading, only when that section has tiles or the caller shows an upload tile.
 * - Arrow keys move between radios. Enter or Space chooses the focused skin.
 */
export function SkinPicker({
  label,
  value,
  options,
  onChoose,
  buttonClassName = 'chip',
  className = '',
  showMine = false,
  mineExtra = null,
  renderTileExtra,
}: {
  /** Dialog and radiogroup name, e.g. "Scoreboard skin" or "Timer skin". */
  label: string;
  value: string;
  options: readonly SkinPickerOption[];
  onChoose: (id: string) => void;
  buttonClassName?: string;
  className?: string;
  /** Show My skins even when it has no radios yet (the upload tile). */
  showMine?: boolean;
  /** First cell of My skins. Used by the upload tile. */
  mineExtra?: ReactNode;
  /** Rename and delete for an uploaded skin. Rendered on top of that tile. */
  renderTileExtra?: (option: SkinPickerOption) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [moreBelow, setMoreBelow] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pickerId = useId();
  const current = options.find((option) => option.id === value);
  const groups = groupSkinPickerOptions(options, showMine && mineExtra != null);
  const optionKey = options.map((option) => `${option.section ?? 'advantage'}:${option.id}`).join('|');
  const focusedOpen = useRef(false);
  const placing = useRef(false);

  const place = () => {
    const root = rootRef.current;
    const picker = pickerRef.current;
    const scroll = scrollRef.current;
    if (!open || !root || !picker || !scroll || placing.current) return;
    placing.current = true;
    try {
      const anchor = root.getBoundingClientRect();
      const rootFont = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const cols = skinPickerColumnCount(window.innerWidth);
      const width = skinPickerPopupWidth(window.innerWidth, rootFont);
      let left = anchor.left;
      if (left + width > window.innerWidth - 8) left = window.innerWidth - 8 - width;
      if (left < 8) left = 8;
      const margin = 6;
      const previousTop = scroll.scrollTop;
      scroll.style.maxHeight = 'none';
      picker.style.setProperty('--skin-cols', String(cols));
      picker.style.left = `${Math.round(left)}px`;
      picker.style.width = `${Math.round(width)}px`;
      const tile = scroll.querySelector<HTMLElement>('.skin-pick__thumb');
      const measuredRow = tile ? tile.getBoundingClientRect().height + 0.45 * rootFont : 0;
      const rowHeight = measuredRow >= 72 ? measuredRow : 7 * rootFont;
      const tiles = scroll.querySelectorAll('.skin-pick__thumb').length;
      let contentHeight = scroll.scrollHeight;
      if (contentHeight < 40) {
        const rows = Math.ceil(Math.max(tiles, 1) / cols) + groups.length;
        contentHeight = rows * rowHeight;
      }
      const spaceBelow = window.innerHeight - anchor.bottom - margin;
      const spaceAbove = anchor.top - margin;
      const want = skinPickerScrollMax({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        space: Math.max(spaceBelow, spaceAbove, 168),
        rowHeight: rowHeight || 112,
        contentHeight,
      });
      const openUp = spaceBelow < want && spaceAbove > spaceBelow;
      const fitted = skinPickerScrollMax({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        space: openUp ? spaceAbove : spaceBelow,
        rowHeight: rowHeight || 112,
        contentHeight,
      });
      scroll.style.maxHeight = `${Math.max(0, Math.round(fitted))}px`;
      if (previousTop) scroll.scrollTop = previousTop;
      if (openUp) {
        picker.style.top = 'auto';
        picker.style.bottom = `${Math.round(Math.max(8, window.innerHeight - anchor.top + margin))}px`;
      } else {
        picker.style.bottom = 'auto';
        picker.style.top = `${Math.round(anchor.bottom + margin)}px`;
      }
      setMoreBelow(contentHeight - scroll.clientHeight - scroll.scrollTop > 2);
    } finally {
      placing.current = false;
    }
  };

  useLayoutEffect(() => {
    if (!open) {
      focusedOpen.current = false;
      return;
    }
    place();
    const scroll = scrollRef.current;
    if (scroll) scrollSkinOptionIntoView(scroll, value);
    if (!focusedOpen.current) {
      focusedOpen.current = true;
      const selected = scroll?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]');
      selected?.focus({ preventScroll: true });
    }
    const onResize = () => place();
    const onWindowScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target && scrollRef.current && (target === scrollRef.current || scrollRef.current.contains(target))) return;
      place();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onWindowScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onWindowScroll, true);
    };
  }, [open, value, optionKey, showMine]);

  useEffect(() => {
    if (!open) return;
    const scroll = scrollRef.current;
    const onScroll = () => {
      if (!scroll) return;
      setMoreBelow(scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop > 2);
    };
    scroll?.addEventListener('scroll', onScroll, { passive: true });
    return () => scroll?.removeEventListener('scroll', onScroll);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      const scroll = scrollRef.current;
      const picker = pickerRef.current;
      if (!scroll || !picker) return;
      const focused = document.activeElement;
      if (!focused || !picker.contains(focused)) return;
      const radios = [...scroll.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
      if (!radios.length) return;
      const cols = skinPickerColumnCount(window.innerWidth);
      const currentIndex = Math.max(0, radios.findIndex((radio) => radio === document.activeElement || radio.getAttribute('aria-checked') === 'true'));
      let next = currentIndex;
      if (event.key === 'ArrowRight') next = Math.min(radios.length - 1, currentIndex + 1);
      if (event.key === 'ArrowLeft') next = Math.max(0, currentIndex - 1);
      if (event.key === 'ArrowDown') next = Math.min(radios.length - 1, currentIndex + cols);
      if (event.key === 'ArrowUp') next = Math.max(0, currentIndex - cols);
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = radios.length - 1;
      event.preventDefault();
      const radio = radios[next];
      if (!radio) return;
      radios.forEach((item, index) => {
        item.tabIndex = index === next ? 0 : -1;
      });
      radio.focus();
      scrollSkinOptionIntoView(scroll, radio.getAttribute('data-skin-option') ?? '');
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
          <div className="skin-pick__scroll" ref={scrollRef}>
            {groups.map((group) => (
              <section key={group.id} className="skin-pick__section" data-skin-section={group.id}>
                <h2 className="skin-pick__heading" id={`${pickerId}-${group.id}`}>
                  {group.label}
                </h2>
                <div className="skin-pick__grid">
                  {group.id === 'mine' ? mineExtra : null}
                  <div className="skin-pick__radios" role="radiogroup" aria-labelledby={`${pickerId}-${group.id}`}>
                    {group.options.map((option) => {
                      const selected = option.id === value;
                      const extra = group.id === 'mine' ? renderTileExtra?.(option) : null;
                      const button = (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={option.label}
                          tabIndex={selected ? 0 : -1}
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
                          <span className="skin-pick__name">{option.label}</span>
                        </button>
                      );
                      return extra ? (
                        <div key={option.id} className="skin-pick__cell">
                          {button}
                          {extra}
                        </div>
                      ) : (
                        <span key={option.id} className="skin-pick__cell">
                          {button}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </section>
            ))}
          </div>
          {moreBelow ? <div className="skin-pick__fade" data-more="true" aria-hidden="true" /> : null}
        </div>
      ) : null}
    </div>
  );
}
