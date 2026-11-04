import { cloneElement, isValidElement, useEffect, useRef, type ReactNode } from 'react';
import { useHoldPress } from '../hooks/useHoldPress';
import { usePolishedSkinModule } from '../hooks/usePolishedSkins';
import { dispatchMatch, type ScoreKind, type Side } from '../lib/matchStore';
import type { PolishedSkinSlug } from '../lib/polishedSkins';
import { beltChipKey, canonicalBelt } from '../lib/rosterStore';
import { metalBoardState, metalFaceParts, metalRoundLabel, sideChipLabel } from '../skins/polished/heavyMetal';
import { fitNamesIn } from '../skins/polished/fitNames';
import { isPosterSkin, posterFitLineFloor } from '../skins/polished/posterSkins';

export type PolishedRow = {
  side: Side;
  name: ReactNode;
  gym: ReactNode;
  rank: string;
  points: number;
  advantages: number;
  disadvantages: number;
};

const LABELS: Record<ScoreKind, { short: string; lab: string; cls: string }> = {
  points: { short: 'Points', lab: 'POINTS', cls: 'pts' },
  advantages: { short: 'Adv', lab: 'ADVANTAGES', cls: 'adv' },
  disadvantages: { short: 'Pen', lab: 'PENALTIES', cls: 'pen' },
};

/** Same control as ScoreBox: tap adds one, hold subtracts one. Same accessible name. */
function PolishedTile({ side, kind, value }: { side: Side; kind: ScoreKind; value: number }) {
  const handlers = useHoldPress(
    () => dispatchMatch({ type: 'bump', side, kind, delta: 1 }),
    () => dispatchMatch({ type: 'bump', side, kind, delta: -1 }),
  );
  const l = LABELS[kind];
  return (
    <button
      type="button"
      className={`tile ${l.cls} sk-btn`}
      aria-label={`${l.short} ${value}. Tap to add, hold to subtract.`}
      {...handlers}
    >
      <span className="lab">{l.lab}</span>
      <span className="num">
        <span className={Math.abs(value) >= 10 ? 'digit digit--pair' : 'digit'}>{value}</span>
      </span>
    </button>
  );
}

/** Metal Mania for the words, Anton for every numeral, so "Round 1" never reads as I. */
function MetalFace({ children }: { children: ReactNode }) {
  return <>{paintMetal(children)}</>;
}

function paintMetal(node: ReactNode): ReactNode {
  if (typeof node === 'string' || typeof node === 'number') {
    return metalFaceParts(metalRoundLabel(String(node))).map((part, index) =>
      part.kind === 'num' ? (
        <span key={index} className="n">
          {part.value}
        </span>
      ) : (
        <span key={index} className="metal-face">
          {part.value}
        </span>
      ),
    );
  }
  if (Array.isArray(node)) return node.map((child, index) => <span key={index}>{paintMetal(child)}</span>);
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return cloneElement(node, undefined, paintMetal(node.props.children));
  }
  return node;
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

/** A numeral inside a decorative heading. Anton paints .n so 1 does not read as I. */
function splitNums(node: ReactNode, on: boolean): ReactNode {
  if (!on) return node;
  if (typeof node === 'string' || typeof node === 'number') {
    const parts = String(node).split(/(\d+)/);
    if (parts.length === 1) return node;
    return parts.map((part, index) =>
      /^\d+$/.test(part) ? (
        <span key={index} className="n">
          {part}
        </span>
      ) : (
        part
      ),
    );
  }
  if (Array.isArray(node)) return node.map((child, index) => <span key={index}>{splitNums(child, true)}</span>);
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return cloneElement(node, undefined, splitNums(node.props.children, true));
  }
  return node;
}

function Belt({ rank, metal, poster }: { rank: string; metal: boolean; poster: boolean }) {
  const label = rank.trim();
  if (!label) return null;
  const canonical = canonicalBelt(label) || label;
  const key = beltChipKey(canonical).replace(/[^a-z]+/g, '-');
  const first = key.split('-')[0] || 'custom';
  const upper = canonical.toUpperCase();
  const text = metal
    ? !/\bBELT\b/.test(upper) ? `${upper} BELT` : upper
    : poster && !upper.includes('BELT')
      ? `${upper} BELT`
      : upper;
  return (
    <span className={`belt ${first} belt--${key}`}>
      <i />
      {text}
    </span>
  );
}

function Row({ row, cls, extra, metal, poster }: { row: PolishedRow; cls: string; extra: string; metal: boolean; poster: boolean }) {
  const label = row.side === 'blue' ? 'Blue' : 'White';
  return (
    <section className={`row ${cls}`} aria-label={`${label} competitor`}>
      {extra ? <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: extra }} /> : null}
      <div className="id">
        {metal || poster ? (
          <div className="side">
            <b>{metal ? sideChipLabel(row.side) : label.toUpperCase()}</b>
          </div>
        ) : null}
        <div className="name">{row.name}</div>
        <div className="meta">
          <Belt rank={row.rank} metal={metal} poster={poster} />
          <span className="gym">{row.gym}</span>
        </div>
      </div>
      <PolishedTile side={row.side} kind="points" value={row.points} />
      <PolishedTile side={row.side} kind="advantages" value={row.advantages} />
      <PolishedTile side={row.side} kind="disadvantages" value={row.disadvantages} />
    </section>
  );
}

/**
 * Match scoreboard painted in a polished skin (Media Edition and above).
 * Every control of the default board is here: score tiles, clock, status,
 * and the name, gym, round, and division links to the Controller.
 */
export function PolishedScoreboard({
  slug,
  mat,
  division,
  state,
  clock,
  status,
  rows,
}: {
  slug: PolishedSkinSlug;
  mat: ReactNode;
  division: ReactNode;
  state: ReactNode;
  clock: ReactNode;
  status: ReactNode;
  rows: readonly [PolishedRow, PolishedRow];
}) {
  const mod = usePolishedSkinModule(slug);
  const extra = mod?.ROW_EXTRA ?? ['', ''];
  const metal = slug === 'heavy-metal';
  const stateLabel = metal && typeof state === 'string' ? metalBoardState(state) : state;
  const poster = isPosterSkin(slug);
  const spec = mod?.POSTER;
  const rootRef = useRef<HTMLDivElement>(null);
  const nameKey = rows.map((row) => textOf(row.name)).join('\n');
  useEffect(() => {
    if (!poster || !mod) return;
    const root = rootRef.current;
    if (!root) return;
    const floor = posterFitLineFloor(slug);
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fitNamesIn(root, floor));
    };
    run();
    const obs = new ResizeObserver(run);
    obs.observe(root);
    const fonts = document.fonts;
    void fonts?.ready.then(run);
    return () => {
      cancelAnimationFrame(frame);
      obs.disconnect();
    };
  }, [poster, mod, slug, nameKey]);
  const round = poster && spec?.splitNums ? splitNums(mat, true) : mat;
  const divisionLine = poster && spec?.splitNums ? splitNums(division, true) : division;
  return (
    <div
      ref={rootRef}
      className={`skin-root skin-root--board${poster ? ' skin-root--poster' : ''}${mod ? '' : ' skin-root--loading'}`}
      data-skin={slug}
    >
      <div className="sb">
        {mod ? <div className="skin-deco" dangerouslySetInnerHTML={{ __html: mod.SCOREBOARD_DECO ?? '' }} /> : null}
        <header className="hdr">
          {metal || poster ? (
            <div className="lead">
              <img className="logo" src="/card-logo.png" alt="Advantage" />
              <span className="wm">
                Advantage
                {poster && spec?.wordmarkExtra ? <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: spec.wordmarkExtra }} /> : null}
              </span>
            </div>
          ) : (
            <img className="logo" src="/card-logo.png" alt="Advantage" />
          )}
          {metal ? <i className="crest" aria-hidden="true" /> : null}
          {poster ? (
            spec?.headerCrest ? (
              <span className="crest" dangerouslySetInnerHTML={{ __html: spec.headerCrest }} />
            ) : (
              <i className="crest" aria-hidden="true" />
            )
          ) : null}
          {metal ? (
            <div className="trail">
              <span className="mat">
                <MetalFace>{mat}</MetalFace>
              </span>
              <span className="div">{division}</span>
            </div>
          ) : poster ? (
            <div className="trail">
              <span className="mat">{round}</span>
              <span className="div">{divisionLine}</span>
            </div>
          ) : (
            <>
              <span className="mat">{mat}</span>
              <span className="div">{divisionLine}</span>
            </>
          )}
        </header>
        <Row row={rows[0]} cls="c1" extra={extra[0]} metal={metal} poster={poster} />
        <div className={`band${(metal || poster) && stateLabel === 'FINAL' ? ' is-final' : ''}`}>
          {metal ? (
            <div className="bandfx" aria-hidden="true">
              <div className="flameband" />
            </div>
          ) : null}
          {poster && spec?.bandDeco ? <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: spec.bandDeco }} /> : null}
          <span className="state">{stateLabel}</span>
          {metal || poster ? (
            <span className="plate">
              <span className="clock">{clock}</span>
            </span>
          ) : (
            <span className="clock">{clock}</span>
          )}
          <span className="status">{status}</span>
        </div>
        <Row row={rows[1]} cls="c2" extra={extra[1]} metal={metal} poster={poster} />
      </div>
    </div>
  );
}
