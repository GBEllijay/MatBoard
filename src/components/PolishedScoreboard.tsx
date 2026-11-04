import { cloneElement, isValidElement, useEffect, useRef, type ReactNode } from 'react';
import { useHoldPress } from '../hooks/useHoldPress';
import { usePolishedSkinModule } from '../hooks/usePolishedSkins';
import { dispatchMatch, type ScoreKind, type Side } from '../lib/matchStore';
import type { PolishedSkinSlug } from '../lib/polishedSkins';
import { beltChipKey, canonicalBelt } from '../lib/rosterStore';
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
      <span className="num">{value}</span>
    </button>
  );
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

function Belt({ rank, poster }: { rank: string; poster: boolean }) {
  const label = rank.trim();
  if (!label) return null;
  const canonical = canonicalBelt(label) || label;
  const key = beltChipKey(canonical).replace(/[^a-z]+/g, '-');
  const first = key.split('-')[0] || 'custom';
  const upper = canonical.toUpperCase();
  const text = poster && !upper.includes('BELT') ? `${upper} BELT` : upper;
  return (
    <span className={`belt ${first} belt--${key}`}>
      <i />
      {text}
    </span>
  );
}

function Row({ row, cls, extra, poster }: { row: PolishedRow; cls: string; extra: string; poster: boolean }) {
  const label = row.side === 'blue' ? 'Blue' : 'White';
  return (
    <section className={`row ${cls}`} aria-label={`${label} competitor`}>
      {extra ? <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: extra }} /> : null}
      <div className="id">
        {poster ? (
          <div className="side">
            <b>{label.toUpperCase()}</b>
          </div>
        ) : null}
        <div className="name">{row.name}</div>
        <div className="meta">
          <Belt rank={row.rank} poster={poster} />
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
          {poster ? (
            <div className="lead">
              <img className="logo" src="/card-logo.png" alt="Advantage" />
              <span className="wm">
                Advantage
                {spec?.wordmarkExtra ? <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: spec.wordmarkExtra }} /> : null}
              </span>
              <span className="mat">{round}</span>
            </div>
          ) : (
            <img className="logo" src="/card-logo.png" alt="Advantage" />
          )}
          {poster ? (
            spec?.headerCrest ? (
              <span className="crest" dangerouslySetInnerHTML={{ __html: spec.headerCrest }} />
            ) : (
              <i className="crest" aria-hidden="true" />
            )
          ) : null}
          {poster ? null : <span className="mat">{mat}</span>}
          <span className="div">{divisionLine}</span>
        </header>
        <Row row={rows[0]} cls="c1" extra={extra[0]} poster={poster} />
        <div className={`band${poster && state === 'FINAL' ? ' is-final' : ''}`}>
          {poster && spec?.bandDeco ? <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: spec.bandDeco }} /> : null}
          <span className="state">{state}</span>
          {poster ? (
            <span className="plate">
              <span className="clock">{clock}</span>
            </span>
          ) : (
            <span className="clock">{clock}</span>
          )}
          <span className="status">{status}</span>
        </div>
        <Row row={rows[1]} cls="c2" extra={extra[1]} poster={poster} />
      </div>
    </div>
  );
}
