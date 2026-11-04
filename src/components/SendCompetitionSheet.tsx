import { useState } from 'react';
import { Sheet } from './Sheet';
import { buildCoachCompetitionUpdate } from '../lib/coachCompetitionUpdate';
import { coachGymLogoFits } from '../lib/coachGymFit';
import { readGymLogo } from '../lib/gymLogo';
import { readGymName } from '../lib/gymName';
import { deliverRankUpdate } from '../lib/studentInboxClient';
import type { CoachGymBrand, MatchMethod, MatchResult } from '../lib/progress/types';

export type CompetitionSendDraft = {
  tournamentName: string;
  date: string;
  location: string;
  division: string;
  weightClass: string;
  opponent: string;
  result: MatchResult;
  method: MatchMethod;
  note: string;
  /** Scoreboard round. Empty when this send did not come from a bout. */
  round?: string;
};

function downloadText(name: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function gymBrand(): CoachGymBrand | undefined {
  const name = readGymName().trim();
  const logo = readGymLogo();
  if (!name && !logo) return undefined;
  const gym: CoachGymBrand = { name: name || 'Gym' };
  if (logo && coachGymLogoFits(logo)) gym.logo = logo;
  return gym;
}

export function SendCompetitionSheet({
  open,
  studentId,
  initial,
  onClose,
}: {
  open: boolean;
  studentId: string;
  initial: CompetitionSendDraft;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const patch = (partial: Partial<CompetitionSendDraft>) => setDraft((current) => ({ ...current, ...partial }));

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setStatus('');
    try {
      const built = buildCoachCompetitionUpdate({
        studentId,
        tournamentName: draft.tournamentName,
        date: draft.date,
        location: draft.location,
        division: draft.division,
        weightClass: draft.weightClass,
        matches: [
          {
            opponent: draft.opponent,
            result: draft.result,
            method: draft.method,
            note: draft.note,
            round: draft.round,
          },
        ],
        gym: gymBrand(),
      });
      if (!built.ok) {
        setStatus(built.error);
        return;
      }
      const delivery = await deliverRankUpdate(built.packet);
      if (delivery.mode === 'file') {
        downloadText(delivery.name, delivery.json);
        setStatus(delivery.reason);
        return;
      }
      setStatus('Sent to the student inbox.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} title="Send to student" onClose={onClose} portal>
      <p>
        Nothing is sent until you tap Send to student. Check-in, readiness, roster notes, and photos stay on this
        card. When Advantage Cloud is connected, this goes to the student’s inbox. Otherwise Send saves a file.
      </p>
      <label>
        Tournament
        <input aria-label="Tournament name" value={draft.tournamentName} onChange={(event) => patch({ tournamentName: event.target.value })} />
      </label>
      <label>
        Date
        <input aria-label="Tournament date" type="date" value={draft.date} onChange={(event) => patch({ date: event.target.value })} />
      </label>
      <label>
        Location
        <input aria-label="Tournament location" value={draft.location} onChange={(event) => patch({ location: event.target.value })} />
      </label>
      {draft.round ? <p>Round: {draft.round}</p> : null}
      <label>
        Division
        <input aria-label="Competition division" value={draft.division} onChange={(event) => patch({ division: event.target.value })} />
      </label>
      <label>
        Weight class
        <input aria-label="Weight class" value={draft.weightClass} onChange={(event) => patch({ weightClass: event.target.value })} />
      </label>
      <label>
        Opponent
        <input aria-label="Opponent" value={draft.opponent} onChange={(event) => patch({ opponent: event.target.value })} />
      </label>
      <label>
        Result
        <select aria-label="Match result" value={draft.result} onChange={(event) => patch({ result: event.target.value as MatchResult })}>
          <option value="win">Win</option>
          <option value="loss">Loss</option>
          <option value="draw">Draw</option>
        </select>
      </label>
      <label>
        Method
        <select aria-label="Match method" value={draft.method} onChange={(event) => patch({ method: event.target.value as MatchMethod })}>
          <option value="">Not set</option>
          <option value="points">Points</option>
          <option value="sub">Submission</option>
          <option value="advantage">Advantage</option>
          <option value="dq">DQ</option>
        </select>
      </label>
      <label>
        Match note
        <textarea aria-label="Match note" rows={2} value={draft.note} onChange={(event) => patch({ note: event.target.value })} />
      </label>
      {status ? <p role="status">{status}</p> : null}
      <div className="roster-card__actions">
        <button type="button" className="btn" disabled={busy} onClick={() => void send()}>
          Send to student
        </button>
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Not now
        </button>
      </div>
    </Sheet>
  );
}
