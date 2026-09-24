import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { isItemPlayEnabled, moveItemIds } from '../lib/playlist';
import { buyLinkForQr, slideMarksForList } from '../lib/shopSlides';

export type FolderListConfig = {
  label: string;
  labelPrefix: string;
  itemNounPlural: string;
  emptyCopy: string;
  orderHint: string;
};

const TOUCH_HOLD_MS = 430;
const MOUSE_HOLD_MS = 140;
const CANCEL_PX = 12;
const EDGE_PX = 56;

export type FolderListItem = {
  id: string;
  label: string;
  mime?: string;
  playEnabled?: boolean;
  buyUrl?: string;
  startsSlide?: boolean;
};

function isVideoMime(mime?: string): boolean {
  return Boolean(mime?.startsWith('video/'));
}

type Props = {
  folder: FolderListConfig;
  items: FolderListItem[];
  thumbById: Record<string, string>;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onRename: (id: string, label: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
  onPlayToggle?: (id: string, enabled: boolean) => Promise<void>;
  onBuyUrl?: (id: string, buyUrl: string) => Promise<void>;
  onStartsSlide?: (id: string, startsSlide: boolean) => Promise<void>;
};

type DragSession = {
  pointerId: number;
  id: string;
  startX: number;
  startY: number;
  lastY: number;
  dragging: boolean;
  fromHandle: boolean;
  draftIds: string[];
  timer: number | null;
  raf: number | null;
};

function idsOf(items: FolderListItem[]): string[] {
  return items.map((item) => item.id);
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function FolderItemList({
  folder,
  items,
  thumbById,
  selectedId,
  onSelect,
  onRename,
  onRemove,
  onReorder,
  onPlayToggle,
  onBuyUrl,
  onStartsSlide,
}: Props) {
  const [draftIds, setDraftIds] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const dragRef = useRef<DragSession | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const visibleIds = draftIds ?? idsOf(items);
  const byId = new Map(items.map((item) => [item.id, item]));
  const slideMarks = onBuyUrl
    ? slideMarksForList(visibleIds.map((id) => byId.get(id)).filter((item): item is FolderListItem => Boolean(item)))
    : null;

  useEffect(() => {
    if (!dragRef.current?.dragging) setDraftIds(null);
  }, [items]);

  useEffect(() => {
    return () => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.timer != null) window.clearTimeout(drag.timer);
      if (drag.raf != null) window.cancelAnimationFrame(drag.raf);
      dragRef.current = null;
    };
  }, []);

  const persist = (orderedIds: string[]) => {
    if (sameIds(orderedIds, idsOf(itemsRef.current))) return;
    void onReorder(orderedIds);
  };

  const stopDrag = (commit: boolean) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.timer != null) window.clearTimeout(drag.timer);
    if (drag.raf != null) window.cancelAnimationFrame(drag.raf);
    dragRef.current = null;
    setDraggingId(null);
    if (commit) persist(drag.draftIds);
    else setDraftIds(null);
  };

  const applyHover = (clientY: number) => {
    const drag = dragRef.current;
    if (!drag?.dragging) return;
    const from = drag.draftIds.indexOf(drag.id);
    if (from < 0) return;
    const prevId = drag.draftIds[from - 1];
    const nextId = drag.draftIds[from + 1];
    const prev = prevId ? rowRefs.current[prevId] : null;
    const next = nextId ? rowRefs.current[nextId] : null;
    if (prev) {
      const rect = prev.getBoundingClientRect();
      if (clientY < rect.top + rect.height * 0.42) {
        const nextIds = moveItemIds(drag.draftIds, from, from - 1);
        drag.draftIds = nextIds;
        setDraftIds(nextIds);
        return;
      }
    }
    if (next) {
      const rect = next.getBoundingClientRect();
      if (clientY > rect.top + rect.height * 0.58) {
        const nextIds = moveItemIds(drag.draftIds, from, from + 1);
        drag.draftIds = nextIds;
        setDraftIds(nextIds);
      }
    }
  };

  const autoScroll = (clientY: number) => {
    const scroller = listRef.current?.closest('.sheet__panel');
    if (!(scroller instanceof HTMLElement)) return;
    const rect = scroller.getBoundingClientRect();
    if (clientY < rect.top + EDGE_PX) scroller.scrollBy(0, -18);
    else if (clientY > rect.bottom - EDGE_PX) scroller.scrollBy(0, 18);
  };

  const tick = () => {
    const drag = dragRef.current;
    if (!drag?.dragging) return;
    autoScroll(drag.lastY);
    applyHover(drag.lastY);
    drag.raf = window.requestAnimationFrame(tick);
  };

  const beginDrag = () => {
    const drag = dragRef.current;
    if (!drag || drag.dragging) return;
    drag.dragging = true;
    setDraftIds(drag.draftIds);
    setDraggingId(drag.id);
    if (typeof navigator.vibrate === 'function') navigator.vibrate(12);
    drag.raf = window.requestAnimationFrame(tick);
  };

  const onRowPointerDown = (itemId: string, event: ReactPointerEvent<HTMLLIElement>) => {
    if (items.length < 2) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (
      target.closest(
        'input, .folder-row__move, .folder-row__remove, .folder-row__play, .folder-row__preview, .folder-row__url, .folder-row__slide',
      )
    )
      return;
    stopDrag(false);
    const originIds = idsOf(itemsRef.current);
    const session: DragSession = {
      pointerId: event.pointerId,
      id: itemId,
      startX: event.clientX,
      startY: event.clientY,
      lastY: event.clientY,
      dragging: false,
      fromHandle: Boolean((event.target as HTMLElement).closest('.folder-row__drag')),
      draftIds: originIds.slice(),
      timer: null,
      raf: null,
    };
    dragRef.current = session;
    if (event.pointerType === 'mouse') {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* capture can fail if the pointer already ended */
      }
    }
    const holdMs = event.pointerType === 'mouse' ? MOUSE_HOLD_MS : TOUCH_HOLD_MS;
    session.timer = window.setTimeout(() => {
      const current = dragRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* capture can fail if the pointer already ended */
      }
      beginDrag();
    }, holdMs);
  };

  const onRowPointerMove = (event: ReactPointerEvent<HTMLLIElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.lastY = event.clientY;
    if (drag.dragging) {
      event.preventDefault();
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const slop = drag.fromHandle ? 28 : CANCEL_PX;
    if (Math.hypot(dx, dy) <= slop) return;
    if (event.pointerType === 'mouse') {
      if (drag.timer != null) window.clearTimeout(drag.timer);
      drag.timer = null;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
      beginDrag();
      return;
    }
    if (drag.timer != null) window.clearTimeout(drag.timer);
    drag.timer = null;
    dragRef.current = null;
  };

  const onRowPointerEnd = (event: ReactPointerEvent<HTMLLIElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const shouldCommit = drag.dragging;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    stopDrag(shouldCommit);
  };

  const moveBy = (from: number, to: number) => {
    persist(moveItemIds(draftIds ?? idsOf(itemsRef.current), from, to));
  };

  if (!items.length) {
    return <p className="saver-folder__empty">{folder.emptyCopy}</p>;
  }

  return (
    <>
      <p className="folder-list__hint saver-folder__hint">{folder.orderHint}</p>
      <ul
        ref={listRef}
        className={`folder-list saver__list${draggingId ? ' folder-list--dragging saver__list--dragging' : ''}`}
        aria-label={`${folder.label} ${folder.itemNounPlural}`}
      >
        {visibleIds.map((id, index) => {
          const item = byId.get(id);
          if (!item) return null;
          const mark = slideMarks?.get(item.id);
          return (
            <FolderItemRow
              key={item.id}
              item={item}
              src={thumbById[item.id]}
              fallback={`${folder.labelPrefix} ${index + 1}`}
              index={index}
              isFirst={index === 0}
              isLast={index === visibleIds.length - 1}
              dragging={draggingId === item.id}
              selected={selectedId === item.id}
              slideMark={mark}
              onSelect={onSelect ? () => onSelect(item.id) : undefined}
              rowRef={(node) => {
                rowRefs.current[item.id] = node;
              }}
              onPointerDown={(event) => onRowPointerDown(item.id, event)}
              onPointerMove={onRowPointerMove}
              onPointerUp={onRowPointerEnd}
              onPointerCancel={onRowPointerEnd}
              onLostPointerCapture={onRowPointerEnd}
              onRename={async (label) => onRename(item.id, label)}
              onRemove={async () => onRemove(item.id)}
              onPlayToggle={onPlayToggle ? async (enabled) => onPlayToggle(item.id, enabled) : undefined}
              onBuyUrl={onBuyUrl ? async (buyUrl) => onBuyUrl(item.id, buyUrl) : undefined}
              onStartsSlide={
                onStartsSlide ? async (startsSlide) => onStartsSlide(item.id, startsSlide) : undefined
              }
              onMoveUp={() => moveBy(index, index - 1)}
              onMoveDown={() => moveBy(index, index + 1)}
            />
          );
        })}
      </ul>
    </>
  );
}

function FolderItemRow({
  item,
  src,
  fallback,
  index,
  isFirst,
  isLast,
  dragging,
  selected,
  slideMark,
  onSelect,
  rowRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  onRename,
  onRemove,
  onPlayToggle,
  onBuyUrl,
  onStartsSlide,
  onMoveUp,
  onMoveDown,
}: {
  item: FolderListItem;
  src?: string;
  fallback: string;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  dragging: boolean;
  selected: boolean;
  slideMark?: { slide: number; joined: boolean };
  onSelect?: () => void;
  rowRef: (node: HTMLLIElement | null) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLLIElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLLIElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLLIElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLLIElement>) => void;
  onLostPointerCapture: (event: ReactPointerEvent<HTMLLIElement>) => void;
  onRename: (label: string) => Promise<void>;
  onRemove: () => Promise<void>;
  onPlayToggle?: (enabled: boolean) => Promise<void>;
  onBuyUrl?: (buyUrl: string) => Promise<void>;
  onStartsSlide?: (startsSlide: boolean) => Promise<void>;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [buyUrl, setBuyUrl] = useState(item.buyUrl ?? '');
  const [thumbFailed, setThumbFailed] = useState(false);
  useEffect(() => {
    setLabel(item.label);
  }, [item.label]);
  useEffect(() => {
    setBuyUrl(item.buyUrl ?? '');
  }, [item.buyUrl]);
  useEffect(() => {
    setThumbFailed(false);
  }, [src]);

  const name = label.trim() || fallback;
  const playEnabled = isItemPlayEnabled(item);
  const thumb =
    src && !thumbFailed ? (
      isVideoMime(item.mime) ? (
        <video
          src={src}
          muted
          playsInline
          preload="metadata"
          draggable={false}
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            if (video.duration > 0.15 && video.currentTime < 0.05) {
              video.currentTime = Math.min(0.2, video.duration * 0.04);
            }
          }}
          onError={() => setThumbFailed(true)}
        />
      ) : (
        <img src={src} alt="" draggable={false} onError={() => setThumbFailed(true)} />
      )
    ) : null;

  return (
    <li
      ref={rowRef}
      className={`folder-row saver__row${onBuyUrl ? ' folder-row--shop' : ''}${
        dragging ? ' folder-row--dragging saver__row--dragging' : ''
      }${selected ? ' folder-row--selected' : ''}${playEnabled || !onPlayToggle ? '' : ' folder-row--off'}`}
      style={{ touchAction: dragging ? 'none' : 'pan-y' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest('input')) return;
        event.preventDefault();
      }}
    >
      <button
        type="button"
        className="folder-row__drag saver__drag"
        aria-label={`Hold, then drag to move ${name}`}
        aria-describedby={`folder-item-order-${item.id}`}
        tabIndex={-1}
        onClick={(event) => event.preventDefault()}
      >
        <span className="saver__grip" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      </button>
      {onPlayToggle ? (
        <button
          type="button"
          className={`folder-row__preview${playEnabled ? ' folder-row__preview--on' : ' folder-row__preview--off'}`}
          aria-pressed={playEnabled}
          aria-label={
            playEnabled ? `Exclude ${name} from playback` : `Include ${name} in playback`
          }
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => void onPlayToggle(!playEnabled)}
        >
          <span className="saver__thumb" aria-hidden="true">
            {thumb}
          </span>
          <span className="folder-row__preview-check" aria-hidden="true" />
          <span className="folder-row__preview-state" aria-hidden="true">
            {playEnabled ? 'On' : 'Off'}
          </span>
        </button>
      ) : (
        <span className="saver__thumb" aria-hidden="true">
          {thumb}
        </span>
      )}
      <input
        className="folder-row__name"
        value={label}
        placeholder={fallback}
        aria-label={`Label for ${fallback}`}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => {
          if (label !== item.label) void onRename(label);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {onBuyUrl ? (
        <label className="folder-row__url">
          Buy link
          <input
            value={buyUrl}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="gym.example/product"
            aria-label={`Buy link for ${name}`}
            onChange={(event) => setBuyUrl(event.target.value)}
            onBlur={() => {
              const next = buyLinkForQr(buyUrl);
              setBuyUrl(next);
              if (next !== (item.buyUrl ?? '')) void onBuyUrl(next);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
            }}
          />
        </label>
      ) : null}
      {onStartsSlide && slideMark ? (
        <div className="folder-row__slide">
          <span className="folder-row__slide-label">Slide {slideMark.slide}</span>
          <div className="folder-row__slide-choices" role="group" aria-label={`Cast page for ${name}`}>
            <button
              type="button"
              aria-pressed={!slideMark.joined}
              onClick={() => {
                if (!slideMark.joined) return;
                void onStartsSlide(true);
              }}
            >
              New slide
            </button>
            <button
              type="button"
              aria-pressed={slideMark.joined}
              disabled={isFirst}
              onClick={() => {
                if (slideMark.joined || isFirst) return;
                void onStartsSlide(false);
              }}
            >
              Same slide
            </button>
          </div>
        </div>
      ) : null}
      <div className={`folder-row__actions saver__row-actions${onSelect ? ' folder-row__actions--select' : ''}`}>
        {onSelect ? (
          <button
            type="button"
            className={`folder-row__play preset${selected ? ' preset--on' : ''}`}
            aria-pressed={selected}
            aria-label={selected ? `${name} selected` : `Play ${name}`}
            onClick={onSelect}
          >
            {selected ? 'On' : 'Play'}
          </button>
        ) : null}
        <button
          type="button"
          className="folder-row__move saver__move"
          aria-label={`Move ${name} up`}
          disabled={isFirst}
          onClick={onMoveUp}
        >
          <span aria-hidden="true">↑</span>
          <span>Up</span>
        </button>
        <button
          type="button"
          className="folder-row__move saver__move"
          aria-label={`Move ${name} down`}
          disabled={isLast}
          onClick={onMoveDown}
        >
          <span aria-hidden="true">↓</span>
          <span>Down</span>
        </button>
        <button
          type="button"
          className="btn btn--ghost folder-row__remove saver__remove"
          onClick={() => void onRemove()}
        >
          Remove
        </button>
      </div>
      <span id={`folder-item-order-${item.id}`} className="sr-only">
        Position {index + 1}
      </span>
    </li>
  );
}
