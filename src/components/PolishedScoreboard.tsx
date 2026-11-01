import type { ReactNode } from 'react';
import { useHoldPress } from '../hooks/useHoldPress';
import { usePolishedSkinModule } from '../hooks/usePolishedSkins';
import { dispatchMatch, type ScoreKind, type Side } from '../lib/matchStore';
import type { PolishedSkinSlug } from '../lib/polishedSkins';
import { beltChipKey, canonicalBelt } from '../lib/rosterStore';

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

function Belt({ rank }: { rank: string }) {
  const label = rank.trim();
  if (!label) return null;
  const canonical = canonicalBelt(label) || label;
  const key = beltChipKey(canonical).replace(/[^a-z]+/g, '-');
  const first = key.split('-')[0] || 'custom';
  return (
    <span className={`belt ${first} belt--${key}`}>
      <i />
      {canonical.toUpperCase()}
    </span>
  );
}

function Row({ row, cls, extra }: { row: PolishedRow; cls: string; extra: string }) {
  const label = row.side === 'blue' ? 'Blue' : 'White';
  return (
    <section className={`row ${cls}`} aria-label={`${label} competitor`}>
      {extra ? <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: extra }} /> : null}
      <div className="id">
        <div className="name">{row.name}</div>
        <div className="meta">
          <Belt rank={row.rank} />
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
  return (
    <div className={`skin-root skin-root--board${mod ? '' : ' skin-root--loading'}`} data-skin={slug}>
      <div className="sb">
        {mod ? <div className="skin-deco" dangerouslySetInnerHTML={{ __html: mod.SCOREBOARD_DECO }} /> : null}
        <header className="hdr">
          <img className="logo" src="/card-logo.png" alt="Advantage" />
          <span className="mat">{mat}</span>
          <span className="div">{division}</span>
        </header>
        <Row row={rows[0]} cls="c1" extra={extra[0]} />
        <div className="band">
          <span className="state">{state}</span>
          <span className="clock">{clock}</span>
          <span className="status">{status}</span>
        </div>
        <Row row={rows[1]} cls="c2" extra={extra[1]} />
      </div>
    </div>
  );
}
