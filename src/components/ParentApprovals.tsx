import { useEffect, useState } from 'react';
import { importCoachText } from '../lib/coachInbound';
import { PARENT_GATE_EVENT, receiveSyncPacket } from '../lib/coachSync';
import {
  disableParentGate,
  enableParentGate,
  PARENT_GATE_COPY,
  parentDecide,
  readParentGate,
  type HeldItem,
} from '../lib/parentGate';
import { clearStudentInboxItem, readInboxPass } from '../lib/studentInboxClient';
import { useStudentFile } from '../pages/student/chrome';

const KIND_LABELS: Record<string, string> = {
  'coach-rank-update': 'Rank update',
  'coach-competition-update': 'Competition result',
  'coach-belt-progress-update': 'Belt progress',
  'coach-assessment-update': 'Coach assessment',
  'coach-note-update': 'Coach note',
  'coach-gym-logo-update': 'Gym logo',
};

function label(item: HeldItem): string {
  return KIND_LABELS[item.kind] ?? (item.route === 'coach-file' ? 'Coach plan, notes, or clips' : 'Coach update');
}

/**
 * Parent approvals on the student device. Minimal hook: a PIN, a switch, and
 * the list of held coach updates. Card visuals are a separate design item.
 */
export function ParentApprovals() {
  const { report, commit } = useStudentFile();
  const [state, setState] = useState(() => readParentGate(localStorage));
  const [pin, setPin] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    const reload = () => setState(readParentGate(localStorage));
    window.addEventListener(PARENT_GATE_EVENT, reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener(PARENT_GATE_EVENT, reload);
      window.removeEventListener('storage', reload);
    };
  }, []);

  const handOn = (item: HeldItem) => {
    if (item.route === 'sync') {
      receiveSyncPacket(localStorage, item.text, null, { parentApproved: true });
      return;
    }
    const outcome = importCoachText(localStorage, report, item.text, { parentApproved: true });
    if (outcome.kind === 'applied' && outcome.report !== report) commit(outcome.report);
  };

  const decide = async (item: HeldItem, decision: 'approve' | 'decline') => {
    const result = await parentDecide(localStorage, item.holdId, pin, decision);
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    if (decision === 'approve') handOn(result.item);
    else {
      const pass = readInboxPass(localStorage);
      // Marks it cleared in the cloud inbox. Advantage Cloud never deletes the file.
      if (pass && result.item.updateId) void clearStudentInboxItem(pass, result.item.updateId);
    }
    setState(readParentGate(localStorage));
    setNote(decision === 'approve' ? 'Approved. It now shows for the student.' : 'Declined.');
  };

  const toggle = async () => {
    if (state.on) {
      const result = await disableParentGate(localStorage, pin);
      if (!result.ok) {
        setNote(result.error);
        return;
      }
      for (const item of result.released) handOn(item);
      setNote('Parent approvals are off.');
    } else {
      const result = await enableParentGate(localStorage, pin);
      if (!result.ok) {
        setNote(result.error);
        return;
      }
      setNote('Parent approvals are on.');
    }
    setPin('');
    setState(readParentGate(localStorage));
  };

  return (
    <details className="parent-approvals">
      <summary>
        Parent approvals{state.on && state.held.length ? ` (${state.held.length})` : ''}
      </summary>
      <p>{PARENT_GATE_COPY.lead}</p>
      <label>
        Parent PIN
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          aria-label="Parent PIN"
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
        />
      </label>
      {state.on
        ? state.held.map((item) => (
            <div key={item.holdId} className="parent-approvals__row">
              <span>{label(item)}</span>
              <button type="button" className="ink-btn" onClick={() => void decide(item, 'approve')}>
                Approve
              </button>
              <button type="button" className="ink-btn ink-btn--quiet" onClick={() => void decide(item, 'decline')}>
                Decline
              </button>
            </div>
          ))
        : null}
      <button type="button" className="ink-btn ink-btn--quiet" onClick={() => void toggle()}>
        {state.on ? 'Turn off parent approvals' : 'Turn on parent approvals'}
      </button>
      {note ? <p role="status">{note}</p> : null}
    </details>
  );
}
