/**
 * Private hologram body scan on the character sheet. Off by default; the switch is saved per device.
 * Zones come from journal injury marks and injuries added on this list (lib/bodyScan).
 * Nothing here goes into the coach file, card share, or exports. Adding from the list
 * does not create a journal card.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { StudentProgressReport } from '../../lib/progress/types';
import {
  BODY_FRAME,
  BODY_ZONES,
  COLOR_MEANINGS,
  INJURY_SOURCES,
  INJURY_SOURCE_LABEL,
  INJURY_STATUSES,
  STATUS_LABEL,
  addInjury,
  bodyScan,
  journalEntryHref,
  readBodyScanOn,
  saveBodyScanOn,
  reportZoneMarks,
  setReportInjuryStatus,
  trendLine,
  zoneLabel,
  type InjurySource,
  type InjuryStatus,
  zonePoint,
  bodyOutlinePath,
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

const RINGS = Array.from({ length: 43 }, (_, i) => 18 + i * 9);
const VERTS = [-48, -36, -24, -12, 0, 12, 24, 36, 48];

/** Anatomy contour lines from the Hologram V2 mockup, on the type-2 frame. */
function Anatomy({ side }: { side: 'front' | 'back' }) {
  const c = 100;
  return side === 'front' ? (
    <g className="bs-anat">
      <path d={`M${c - 30} 92 Q${c - 16} 112 ${c - 2} 104 M${c + 30} 92 Q${c + 16} 112 ${c + 2} 104`} />
      <path d={`M${c - 14} 118 H${c + 14} M${c - 15} 134 H${c + 15} M${c - 15} 150 H${c + 15} M${c} 106 V176`} />
      <path d={`M${c - 29} 176 Q${c} 208 ${c + 29} 176`} />
      <path d={`M${c - 40} 82 Q${c - 46} 100 ${c - 44} 116 M${c + 40} 82 Q${c + 46} 100 ${c + 44} 116`} />
      <path d={`M${c - 31} 220 Q${c - 27} 260 ${c - 22} 296 M${c + 31} 220 Q${c + 27} 260 ${c + 22} 296`} />
      <ellipse cx={c - 22} cy="304" rx="7" ry="8" />
      <ellipse cx={c + 22} cy="304" rx="7" ry="8" />
      <path d={`M${c - 14} 64 L${c} 74 L${c + 14} 64`} />
    </g>
  ) : (
    <g className="bs-anat">
      <path d={`M${c} 60 V206`} strokeDasharray="2 5" />
      <path d={`M${c - 12} 86 Q${c - 28} 96 ${c - 24} 124 Q${c - 16} 120 ${c - 8} 104 M${c + 12} 86 Q${c + 28} 96 ${c + 24} 124 Q${c + 16} 120 ${c + 8} 104`} />
      <path d={`M${c - 32} 130 Q${c - 20} 160 ${c - 6} 168 M${c + 32} 130 Q${c + 20} 160 ${c + 6} 168`} />
      <path d={`M${c - 38} 204 Q${c - 18} 236 ${c} 214 Q${c + 18} 236 ${c + 38} 204`} />
      <path d={`M${c - 26} 240 V292 M${c + 26} 240 V292 M${c - 24} 320 Q${c - 30} 340 ${c - 20} 356 M${c + 24} 320 Q${c + 30} 340 ${c + 20} 356`} />
    </g>
  );
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
  const id = `bs${side}`;
  const shape = (
    <>
      <ellipse cx="100" cy="34" rx="16" ry="21" />
      <path d={bodyOutlinePath()} />
    </>
  );
  return (
    <svg className="bs-figure" viewBox="-30 -14 260 460" role="group" aria-label={side === 'front' ? 'Front' : 'Back'} data-testid={`body-figure-${side}`} data-frame={`${BODY_FRAME.shoulder}/${BODY_FRAME.hip}`}>
      <defs>
        <linearGradient id={`${id}-vol`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#2fd0ff" stopOpacity=".42" /><stop offset=".3" stopColor="#0a4fbf" stopOpacity=".18" /><stop offset=".55" stopColor="#062a6a" stopOpacity=".12" /><stop offset="1" stopColor="#2fd0ff" stopOpacity=".38" /></linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#bff6ff" stopOpacity=".18" /><stop offset=".5" stopColor="#bff6ff" stopOpacity="0" /><stop offset="1" stopColor="#3d8bff" stopOpacity=".15" /></linearGradient>
        <linearGradient id={`${id}-cone`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#5fd8ff" stopOpacity=".45" /><stop offset=".6" stopColor="#3d8bff" stopOpacity=".06" /><stop offset="1" stopColor="#3d8bff" stopOpacity="0" /></linearGradient>
        <filter id={`${id}-bloom`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <filter id={`${id}-zb`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="9" /></filter>
        <filter id={`${id}-zb2`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3.5" /></filter>
        <clipPath id={`${id}-clip`}>{shape}</clipPath>
      </defs>
      <g className="bs-stagefx" aria-hidden="true">
        <polygon points="54,410 146,410 210,-30 -10,-30" fill={`url(#${id}-cone)`} opacity=".55" />
        <ellipse className="bs-ring bs-ring--spin" cx="100" cy="410" rx="96" ry="16" strokeDasharray="4 3" />
        <ellipse className="bs-ring" cx="100" cy="410" rx="70" ry="11" />
        <ellipse className="bs-ring bs-ring--spin" cx="100" cy="410" rx="118" ry="20" strokeDasharray="1 7" />
        <ellipse cx="100" cy="410" rx="62" ry="9" fill="#5fd8ff" opacity=".35" filter={`url(#${id}-zb)`} />
        <path className="bs-orbit" d="M-20 200 A120 26 0 0 0 220 200" />
        <path className="bs-orbit bs-orbit--blue" d="M-4 90 A104 20 0 0 1 204 90" />
      </g>
      <g className="bs-fig" aria-hidden="true">
        <g fill={`url(#${id}-vol)`} stroke="none">{shape}</g>
        <g clipPath={`url(#${id}-clip)`} className="bs-mesh">
          {RINGS.map((y) => <ellipse key={y} cx="100" cy={y} rx="70" ry={(3 + Math.abs(y - 200) / 60).toFixed(1)} />)}
          {VERTS.map((dx) => <path key={dx} d={`M${100 + dx} 0 Q${100 + dx * 1.25} 200 ${100 + dx} 400`} />)}
        </g>
        <g clipPath={`url(#${id}-clip)`}><rect x="20" y="0" width="160" height="400" fill={`url(#${id}-rim)`} /></g>
        <Anatomy side={side} />
        <g className="bs-ghost bs-ghost--r" transform="translate(-1.6 0)">{shape}</g>
        <g className="bs-ghost bs-ghost--c" transform="translate(1.6 0)">{shape}</g>
        <g className="bs-edge" filter={`url(#${id}-bloom)`}>{shape}</g>
      </g>
      <g className="bs-sweep" aria-hidden="true"><path d="M10 210 H190" filter={`url(#${id}-bloom)`} /></g>
      {BODY_ZONES.filter((z) => z.side === side).map((z) => {
        const p = zonePoint(z.id);
        const hit = byZone.get(z.id);
        return (
          <g key={z.id} className={`bs-zone${hit ? ' bs-zone--flagged' : ''}${selected === z.id ? ' bs-zone--selected' : ''}`} data-testid="body-zone" data-zone={z.id} data-status={hit?.status ?? ''}>
            {hit ? (
              <>
                <ellipse cx={p.x} cy={p.y} rx="24" ry="26" fill={hit.color} opacity=".35" filter={`url(#${id}-zb)`} />
                <ellipse cx={p.x} cy={p.y} rx="13" ry="14" fill={hit.color} opacity=".55" filter={`url(#${id}-zb2)`} />
                <ellipse className="bs-pulse" cx={p.x} cy={p.y} rx="19" ry="20" fill="none" stroke={hit.color} strokeWidth="1" opacity=".8" />
                <circle className="bs-core" cx={p.x} cy={p.y} r="2.6" fill="#fff" />
                <circle
                  className="bs-hit"
                  cx={p.x}
                  cy={p.y}
                  r="24"
                  role="button"
                  tabIndex={0}
                  aria-label={`${zoneLabel(z.id)}, ${STATUS_LABEL[hit.status]}`}
                  onClick={() => onPick(z.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(z.id); } }}
                />
              </>
            ) : (
              <circle className="bs-dot" cx={p.x} cy={p.y} r="6" />
            )}
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
    const items = [...ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex="0"]')].filter((el) => !('disabled' in el && (el as HTMLButtonElement).disabled));
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
  const marks = reportZoneMarks(report, zone);
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
              <li key={mark.entryId} className="bs-peek__row" data-testid="body-peek-row" data-entry={mark.entryId} data-source={mark.fromJournal ? 'journal' : 'list'}>
                <p className="bs-peek__when"><b>{mark.date}</b>{mark.area ? ` · ${mark.area}` : ''}{mark.source ? ` · ${INJURY_SOURCE_LABEL[mark.source]}` : ''}</p>
                {mark.note ? <p className="bs-small">{mark.note}</p> : null}
                <div className="bs-chips" role="group" aria-label="Status">
                  {INJURY_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`bs-chip bs-chip--${s}`}
                      aria-pressed={current === s}
                      onClick={() => commit(setReportInjuryStatus(report, mark.entryId, s, today))}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
                {mark.markedOn ? <p className="bs-small">Updated {mark.markedOn}</p> : null}
                {mark.fromJournal ? <Link className="ink-btn bs-btn" to={to(journalEntryHref(mark.entryId))} data-testid="open-journal-entry">Open journal entry</Link> : <p className="bs-small">Added from the injury list. No journal card.</p>}
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

function AddInjurySheet({ report, commit, onClose }: { report: StudentProgressReport; commit: (next: StudentProgressReport) => void; onClose: () => void }) {
  const today = todayIso();
  const [date, setDate] = useState(today);
  const [area, setArea] = useState('');
  const [zone, setZone] = useState('');
  const [note, setNote] = useState('');
  const [source, setSource] = useState<InjurySource>('outside');
  const [status, setStatus] = useState<InjuryStatus>('hurt');
  const [error, setError] = useState('');
  const save = () => {
    try {
      commit(addInjury(report, { date, area, note, zone: zone || undefined, status, source }));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    }
  };
  return (
    <Sheet title="Add injury" testId="injury-add" onClose={onClose}>
      <p className="bs-small">Add an injury even if it did not happen in class. This does not create a journal card.</p>
      <div className="bs-form">
        <label className="ink">
          <span className="ink__label">What was injured</span>
          <input className="ink__input" aria-label="Injury area" value={area} maxLength={80} autoFocus onChange={(e) => setArea(e.target.value)} />
        </label>
        <label className="ink">
          <span className="ink__label">Body zone (optional)</span>
          <select className="ink__input" aria-label="Body zone" value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">Pick a zone</option>
            {BODY_ZONES.map((z) => (
              <option key={z.id} value={z.id}>{z.label}</option>
            ))}
          </select>
        </label>
        <label className="ink">
          <span className="ink__label">Date</span>
          <input className="ink__input" type="date" aria-label="Injury date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="bs-chips" role="group" aria-label="How it happened">
          {INJURY_SOURCES.map((s) => (
            <button key={s} type="button" className="bs-chip" aria-pressed={source === s} onClick={() => setSource(s)}>
              {INJURY_SOURCE_LABEL[s]}
            </button>
          ))}
        </div>
        <label className="ink">
          <span className="ink__label">Note (optional)</span>
          <input className="ink__input" aria-label="Injury note" value={note} maxLength={320} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="bs-chips" role="group" aria-label="Injury status">
          {INJURY_STATUSES.map((s) => (
            <button key={s} type="button" className={`bs-chip bs-chip--${s}`} aria-pressed={status === s} onClick={() => setStatus(s)}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        {error ? <p className="bs-small" data-testid="injury-add-error" role="alert">{error}</p> : null}
        <div className="bs-actions">
          <button type="button" className="ink-btn bs-btn" data-testid="injury-add-save" onClick={save}>Save injury</button>
        </div>
      </div>
    </Sheet>
  );
}

function AddInjuryButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="ink-btn bs-btn" data-testid="injury-add-open" onClick={onClick}>
      Add injury
    </button>
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
  const [add, setAdd] = useState(false);
  const shown = on || forceOpen;
  const toggle = (next: boolean) => {
    const s = store();
    if (s) saveBodyScanOn(s, next);
    setOn(next);
  };
  if (!shown) {
    return (
      <section className="bs bs--off" id="body-scan" aria-label="Body scan" data-testid="body-scan" data-on="false">
        <div className="bs__hd">
          <BodyScanSwitch on={false} onChange={toggle} />
          <AddInjuryButton onClick={() => setAdd(true)} />
        </div>
        {add ? <AddInjurySheet report={report} commit={commit} onClose={() => setAdd(false)} /> : null}
      </section>
    );
  }
  const today = todayIso();
  const extras = report.injuries ?? [];
  const scan = bodyScan(report.journal, today, extras);
  const status = bodyStatus(report.journal, today, extras);
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
      <div className="bs-actions">
        <AddInjuryButton onClick={() => setAdd(true)} />
        {flagged.length ? (
          <button type="button" className="ink-btn bs-btn bs-status-open" aria-haspopup="dialog" aria-expanded={list} data-testid="injury-status-open" onClick={() => setList(true)}>
            {`Injury status (${flagged.length})`}
          </button>
        ) : (
          <p className="bs-small" data-testid="body-scan-clear">No injury marks in the last few weeks.</p>
        )}
      </div>
      {add ? <AddInjurySheet report={report} commit={commit} onClose={() => setAdd(false)} /> : null}
      {list ? (
        <Sheet title="Injury status" testId="injury-status" onClose={() => setList(false)}>
          <AddInjuryButton onClick={() => { setList(false); setAdd(true); }} />
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
