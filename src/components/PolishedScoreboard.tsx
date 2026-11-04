import { cloneElement, isValidElement, type ReactNode } from 'react';
import { useHoldPress } from '../hooks/useHoldPress';
import { usePolishedSkinModule } from '../hooks/usePolishedSkins';
import { dispatchMatch, type ScoreKind, type Side } from '../lib/matchStore';
import type { PolishedSkinSlug } from '../lib/polishedSkins';
import { beltChipKey, canonicalBelt } from '../lib/rosterStore';
import { metalBoardState, metalFaceParts, sideChipLabel } from '../skins/polished/heavyMetal';

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
      <span className="num">{value}</span>
    </button>
  );
}

/** Metal Mania for the words, Anton for every numeral, so "Round 1" never reads as I. */
function MetalFace({ children }: { children: ReactNode }) {
  return <>{paintMetal(children)}</>;
}

function paintMetal(node: ReactNode): ReactNode {
  if (typeof node === 'string' || typeof node === 'number') {
    return metalFaceParts(String(node)).map((part, index) =>
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

function Belt({ rank, metal }: { rank: string; metal: boolean }) {
  const label = rank.trim();
  if (!label) return null;
  const canonical = canonicalBelt(label) || label;
  const key = beltChipKey(canonical).replace(/[^a-z]+/g, '-');
  const first = key.split('-')[0] || 'custom';
  const upper = canonical.toUpperCase();
  const text = metal && !/\bBELT\b/.test(upper) ? `${upper} BELT` : upper;
  return (
    <span className={`belt ${first} belt--${key}`}>
      <i />
      {text}
    </span>
  );
}

function Row({ row, cls, extra, chip }: { row: PolishedRow; cls: string; extra: string; chip: boolean }) {
  const label = row.side === 'blue' ? 'Blue' : 'White';
  return (
    <section className={`row ${cls}`} aria-label={`${label} competitor`}>
      {extra ? <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: extra }} /> : null}
      <div className="id">
        {chip ? (
          <div className="side">
            <b>{sideChipLabel(row.side)}</b>
          </div>
        ) : null}
        <div className="name">{row.name}</div>
        <div className="meta">
          <Belt rank={row.rank} metal={chip} />
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
  return (
    <div className={`skin-root skin-root--board${mod ? '' : ' skin-root--loading'}`} data-skin={slug}>
      <div className="sb">
        {mod ? <div className="skin-deco" dangerouslySetInnerHTML={{ __html: mod.SCOREBOARD_DECO ?? '' }} /> : null}
        <header className="hdr">
          <img className="logo" src="/card-logo.png" alt="Advantage" />
          {metal ? <span className="wm">Advantage</span> : null}
          {metal ? <i className="crest" aria-hidden="true" /> : null}
          <span className="mat">{metal ? <MetalFace>{mat}</MetalFace> : mat}</span>
          <span className="div">{division}</span>
        </header>
        <Row row={rows[0]} cls="c1" extra={extra[0]} chip={metal} />
        <div className="band">
          {metal ? (
            <div className="bandfx" aria-hidden="true">
              <div className="flameband" />
            </div>
          ) : null}
          <span className="state">{stateLabel}</span>
          {metal ? (
            <span className="plate">
              <span className="clock">{clock}</span>
            </span>
          ) : (
            <span className="clock">{clock}</span>
          )}
          <span className="status">{status}</span>
        </div>
        <Row row={rows[1]} cls="c2" extra={extra[1]} chip={metal} />
      </div>
    </div>
  );
}
