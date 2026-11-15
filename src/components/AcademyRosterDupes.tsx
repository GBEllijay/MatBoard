import { useEffect, useState } from 'react';
import { mergeGymRosterDuplicates, type GymRosterState } from '../lib/gymRosterClient';
import {
  findRosterDuplicates,
  mergeDuplicateRosterCardsOnDevice,
  type DupableStudent,
  type RosterDupeGroup,
} from '../lib/rosterDuplicates';
import { rosterRankLabel } from '../lib/studentOwnedRank';
import { getRoster, subscribeRoster } from '../lib/rosterStore';

function label(row: DupableStudent): string {
  const belt = rosterRankLabel(row) || 'No belt';
  const stripes = row.rankUnset ? '' : row.stripes ? ` · ${row.stripes} stripes` : '';
  const linked = row.linkedStudentId ? ' · linked' : '';
  return `${row.name} · ${belt}${stripes}${linked}`;
}

function GroupRow({
  group,
  busy,
  onMerge,
}: {
  group: RosterDupeGroup;
  busy: boolean;
  onMerge: (keepId: string, dropId: string) => void;
}) {
  const [keepId, setKeepId] = useState(group.cards[0]?.id ?? '');
  const others = group.cards.filter((row) => row.id !== keepId);
  const why = group.reason === 'linked-student' ? 'Same student account' : 'Same name';
  return (
    <li>
      <p>
        <strong>{why}</strong>
        {': '}
        {group.cards.map((row) => row.name).join(', ')}
      </p>
      <label>
        Keep
        <select aria-label={`Keep which card for ${why}`} value={keepId} onChange={(event) => setKeepId(event.target.value)}>
          {group.cards.map((row) => (
            <option key={row.id} value={row.id}>
              {label(row)}
            </option>
          ))}
        </select>
      </label>
      {others.map((row) => (
        <button
          key={row.id}
          type="button"
          className="btn"
          disabled={busy || !keepId}
          onClick={() => onMerge(keepId, row.id)}
        >
          {`Merge ${row.name} into the selected card`}
        </button>
      ))}
    </li>
  );
}

/** Owner-only: likely duplicate student cards on this phone and on the academy roster. */
export function AcademyRosterDupes({ cloud, onRefreshCloud }: { cloud: GymRosterState | null; onRefreshCloud: () => Promise<void> }) {
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => subscribeRoster(() => setTick((value) => value + 1)), []);
  if (!cloud?.role.isOwner) return null;

  const local = findRosterDuplicates(getRoster().students);
  const academy = findRosterDuplicates(cloud.master?.roster.students ?? []);

  if (!local.length && !academy.length) return null;

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    try {
      setStatus(await work());
    } catch (error) {
      setStatus(error instanceof Error && error.message ? error.message : 'That merge did not finish.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="roster__dupes" data-roster-dupes="">
      <h3>Possible duplicate cards</h3>
      <p>These look like the same student. Keep one card; the other is archived. Only you can do this. The belt stays whatever the student last sent — you are not choosing a belt.</p>
      {local.length ? (
        <>
          <h4>On this phone</h4>
          <ul aria-label="Duplicate cards on this phone">
            {local.map((group) => (
              <GroupRow
                key={`local-${group.key}`}
                group={group}
                busy={busy}
                onMerge={(keepId, dropId) =>
                  void run(async () => {
                    const result = mergeDuplicateRosterCardsOnDevice(keepId, dropId);
                    if (!result.ok) return 'Those cards are not on this phone.';
                    return `Merged into ${result.kept.name}'s card. The other card is archived.`;
                  })
                }
              />
            ))}
          </ul>
        </>
      ) : null}
      {academy.length ? (
        <>
          <h4>On the academy roster</h4>
          <ul aria-label="Duplicate cards on the academy roster">
            {academy.map((group) => (
              <GroupRow
                key={`academy-${group.key}`}
                group={group}
                busy={busy}
                onMerge={(keepId, dropId) =>
                  void run(async () => {
                    const remote = await mergeGymRosterDuplicates(keepId, dropId);
                    if (!remote.ok) return remote.error;
                    if (getRoster().students.some((row) => row.id === keepId) && getRoster().students.some((row) => row.id === dropId)) {
                      mergeDuplicateRosterCardsOnDevice(keepId, dropId);
                    }
                    await onRefreshCloud();
                    return `Merged into ${remote.data.name}'s academy card. The other card is archived.`;
                  })
                }
              />
            ))}
          </ul>
        </>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
    </div>
  );
}
