/**
 * Private hologram body scan on the character sheet. Off by default; the switch is saved per device.
 * Zones come from journal injury marks (lib/bodyScan). Nothing here goes into the coach file,
 * card share, or exports.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { StudentProgressReport } from '../../lib/progress/types';
import {
  BODY_FRAME,
  BODY_ZONES,
  COLOR_MEANINGS,
  INJURY_STATUSES,
  STATUS_LABEL,
  bodyScan,
  journalEntryHref,
  readBodyScanOn,
  saveBodyScanOn,
  setInjuryStatus,
  trendLine,
  zoneLabel,
  zoneMarks,
  zonePoint,
  type BodyZone,
  type ZoneScan,
} from '../../lib/bodyScan';
import { bodyStatus } from '../../lib/sessionQuality';
import { todayIso } from '../../lib/studentEdition';
import './bodyScan.css';

const store = () => (typeof localStorage === 'undefined' ? null : localStorage);

export function BodyScanSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="bs-switch">
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} data-testid="body-scan-switch" />
      <span>Show body scan</span>
    </label>
  );
}

/** Settings copy of the switch (My profile → training settings). */
export function BodyScanSetting() {
  const [on, setOn] = useState(() => readBodyScanOn(store()));
  return (
    <section className="profile-card bs-setting" aria-label="Body scan">
      <BodyScanSwitch on={on} onChange={(next) => { const s = store(); if (s) saveBodyScanOn(s, next); setOn(next); }} />
      <p className="bs-small">Private. Injury marks from your journal on a body outline. Never in your coach file or card.</p>
    </section>
  );
}

function figurePath(): string {
  const { shoulder, hip } = BODY_FRAME;
  const cx = 60;
  const waist = (shoulder + hip) / 2 - 2;
  return [
    `M${cx - 6} 40 L${cx + 6} 40 L${cx + 7} 48`,
    `Q${cx + shoulder - 2} 49 ${cx + shoulder} 62`,
    `L${cx + shoulder + 6} 104 L${cx + shoulder + 8} 140 L${cx + shoulder + 2} 142 L${cx + shoulder} 108 L${cx + shoulder - 3} 76`,
    `L${cx + waist} 106 L${cx + hip} 128`,
    `L${cx + hip * 0.9} 190 L${cx + hip * 0.75} 244 L${cx + 3} 244 L${cx + 2} 150 L${cx - 2} 150 L${cx - 3} 244 L${cx - hip * 0.75} 244 L${cx - hip * 0.9} 190`,
    `L${cx - hip} 128 L${cx - waist} 106 L${cx - shoulder + 3} 76`,
    `L${cx - shoulder} 108 L${cx - shoulder - 2} 142 L${cx - shoulder - 8} 140 L${cx - shoulder - 6} 104 L${cx - shoulder} 60`,
    `Q${cx - shoulder + 2} 49 ${cx - 7} 48 Z`,
  ].join(' ');
}

export function BodyFigure({
  side,
  zones,
  selected,
  onPick,
}: {
  side: 'front' | 'back';
  zones: readonly ZoneScan[];
  selected: string;
  onPick: (zone: BodyZone) => void;
}) {
  const byZone = new Map(zones.map((z) => [z.zone, z]));
  return (
    <svg className="bs-figure" viewBox="0 0 120 260" role="group" aria-label={side === 'front' ? 'Front' : 'Back'} data-testid={`body-figure-${side}`} data-frame={`${BODY_FRAME.shoulder}/${BODY_FRAME.hip}`}>
      <ellipse className="bs-floor" cx="60" cy="250" rx="44" ry="7" />
      <circle className="bs-body" cx="60" cy="24" r="14" />
      <path className="bs-body" d={figurePath()} />
      <line className="bs-scanline" x1="10" x2="110" y1="0" y2="0" />
      {BODY_ZONES.filter((z) => z.side === side).map((z) => {
        const p = zonePoint(z.id);
        const hit = byZone.get(z.id);
        return (
          <g key={z.id} className={`bs-zone${hit ? ' bs-zone--flagged' : ''}${selected === z.id ? ' bs-zone--selected' : ''}`} data-testid="body-zone" data-zone={z.id} data-status={hit?.status ?? ''}>
            <circle cx={p.x} cy={p.y} r={hit ? 9 : 5} fill={hit ? hit.color : 'transparent'} style={hit ? { color: hit.color } : undefined} />
            {hit ? (
              <circle
                className="bs-hit"
                cx={p.x}
                cy={p.y}
                r="16"
                role="button"
                tabIndex={0}
                aria-label={`${zoneLabel(z.id)}, ${STATUS_LABEL[hit.status]}`}
                onClick={() => onPick(z.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(z.id); } }}
              />
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** Bottom sheet explaining the colors. Esc and Close dismiss; focus stays inside while open. */
function Sheet({ title, testId, onClose, children }: { title: string; testId: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    return () => prev?.focus?.();
  }, []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>('button, [href], [tabindex="0"]')];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  return (
    <div className="bs-overlay" data-testid={testId} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bs-sheet" ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="bs-peek__hd">
          <h3>{title}</h3>
          <button type="button" className="ink-btn bs-btn bs-close" onClick={onClose} aria-label="Close">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ColorHelp({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="What the colors mean" testId="color-help" onClose={onClose}>
        <ul className="bs-meanings">
        {COLOR_MEANINGS.map((m) => (
          <li key={m.id} data-testid="color-meaning" data-kind={m.id}>
            <span className="bs-swatch" style={{ background: m.color, color: m.color }} aria-hidden="true" />
            <span><b>{m.name}</b><br />{m.text}</span>
          </li>
        ))}
      </ul>
      <p className="bs-small">Untouched marks drift from red to green over about 28 days. Set Hurt, Healing or Healed by tapping a zone.</p>
    </Sheet>
  );
}

function ZonePeek({ report, commit, zone, onClose, to }: { report: StudentProgressReport; commit: (next: StudentProgressReport) => void; zone: string; onClose: () => void; to: (path: string) => string }) {
  const marks = zoneMarks(report.journal, zone);
  const today = todayIso();
  return (
    <div className="bs-peek" role="dialog" aria-label={`${zone === 'other' ? 'Other' : zoneLabel(zone)} marks`} data-testid="body-peek" data-zone={zone}>
      <div className="bs-peek__hd">
        <h3>{zone === 'other' ? 'Other' : zoneLabel(zone)}</h3>
        <button type="button" className="ink-btn bs-btn" onClick={onClose}>Close</button>
      </div>
      {marks.length ? (
        <ol className="bs-peek__list">
          {marks.map((mark) => {
            const current = mark.status ?? 'hurt';
            return (
              <li key={mark.entryId} className="bs-peek__row" data-testid="body-peek-row" data-entry={mark.entryId}>
                <p className="bs-peek__when"><b>{mark.date}</b>{mark.area ? ` · ${mark.area}` : ''}</p>
                {mark.note ? <p className="bs-small">{mark.note}</p> : null}
                <div className="bs-chips" role="group" aria-label="Status">
                  {INJURY_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`bs-chip bs-chip--${s}`}
                      aria-pressed={current === s}
                      onClick={() => commit({ ...report, journal: setInjuryStatus(report.journal, mark.entryId, s, today) })}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
                {mark.markedOn ? <p className="bs-small">Updated {mark.markedOn}</p> : null}
                <Link className="ink-btn bs-btn" to={to(journalEntryHref(mark.entryId))} data-testid="open-journal-entry">Open journal entry</Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="bs-small">No marks here.</p>
      )}
    </div>
  );
}

export function BodyScanSection({
  report,
  commit,
  to,
  focusZone = '',
  forceOpen = false,
}: {
  report: StudentProgressReport;
  commit: (next: StudentProgressReport) => void;
  to: (path: string) => string;
  /** From a journal link: highlight this zone and open its peek. */
  focusZone?: string;
  /** Show for this view only; the saved switch is untouched. */
  forceOpen?: boolean;
}) {
  const [on, setOn] = useState(() => readBodyScanOn(store()));
  const [peek, setPeek] = useState(focusZone);
  const [help, setHelp] = useState(false);
  const [list, setList] = useState(false);
  const shown = on || forceOpen;
  const toggle = (next: boolean) => {
    const s = store();
    if (s) saveBodyScanOn(s, next);
    setOn(next);
  };
  if (!shown) {
    return (
      <section className="bs bs--off" id="body-scan" aria-label="Body scan" data-testid="body-scan" data-on="false">
        <BodyScanSwitch on={false} onChange={toggle} />
      </section>
    );
  }
  const today = todayIso();
  const scan = bodyScan(report.journal, today);
  const status = bodyStatus(report.journal, today);
  const flagged = [...scan.zones, ...scan.other];
  return (
    <section className="bs" id="body-scan" aria-label="Body scan" data-testid="body-scan" data-on="true" data-temporary={!on ? 'true' : undefined}>
      <div className="bs__hd">
        <BodyScanSwitch on={on} onChange={toggle} />
        <button type="button" className="bs-help" aria-label="What the colors mean" data-testid="color-help-open" onClick={() => setHelp(true)}>?</button>
      </div>
      {!on ? <p className="bs-small">Showing for this view. Your switch stays off.</p> : null}
      {status.current?.kind === 'hiatus' ? <p className="bs-status" data-testid="body-scan-break">{status.current.text}</p> : null}
      <div className="bs-stage">
        <BodyFigure side="front" zones={scan.zones} selected={peek} onPick={setPeek} />
        <BodyFigure side="back" zones={scan.zones} selected={peek} onPick={setPeek} />
      </div>
      {flagged.length ? (
        <button type="button" className="ink-btn bs-btn bs-status-open" aria-haspopup="dialog" aria-expanded={list} data-testid="injury-status-open" onClick={() => setList(true)}>
          {`Injury status (${flagged.length})`}
        </button>
      ) : (
        <p className="bs-small" data-testid="body-scan-clear">No injury marks in the last few weeks.</p>
      )}
      {list ? (
        <Sheet title="Injury status" testId="injury-status" onClose={() => setList(false)}>
          <ul className="bs-legend" aria-label="Flagged areas" data-testid="body-zone-list">
            {flagged.map((z, i) => (
              <li key={`${z.zone}-${i}`} data-testid="body-legend-row" data-zone={z.zone || 'other'}>
                <button type="button" className="bs-legend__btn" onClick={() => { setList(false); setPeek(z.zone || 'other'); }}>
                  <span className="bs-legend__line">{z.zone ? trendLine(z) : `Other · ${z.label} · ${STATUS_LABEL[z.status]} · day ${z.day}`}</span>
                  <span className="bs-bar" aria-hidden="true"><i style={{ left: `${Math.round(z.heal * 100)}%` }} /></span>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      ) : null}
      {help ? <ColorHelp onClose={() => setHelp(false)} /> : null}
      {peek ? <ZonePeek report={report} commit={commit} zone={peek} onClose={() => setPeek('')} to={to} /> : null}
    </section>
  );
}
