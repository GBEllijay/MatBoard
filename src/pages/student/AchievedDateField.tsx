import { useEffect, useRef, useState } from 'react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Mobile date pickers emit an empty value while an existing date is edited,
 * then the committed day. A controlled input also gets a same-turn snap back
 * to the previous value. Either one was stored and the real day never landed
 * until the next visit. Ignore those transients. Commit a complete day
 * immediately, and commit again on blur, which is when the picker publishes.
 */
const SNAP_BACK_MS = 250;

export function formatAchieved(iso: string): string {
  if (!ISO_DAY.test(iso)) return '';
  const [year, month, day] = iso.split('-').map(Number);
  const name = MONTHS[month - 1];
  if (!name || !day || !year) return '';
  return `${name} ${day}, ${year}`;
}

export function AchievedDateField({
  saved,
  label,
  disabled = false,
  onCommit,
}: {
  saved: string;
  label: string;
  disabled?: boolean;
  /** Return false when the date was rejected. */
  onCommit: (value: string) => boolean;
}) {
  const [draft, setDraft] = useState(saved);
  const inputRef = useRef<HTMLInputElement>(null);
  const focused = useRef(false);
  const from = useRef(saved);
  const taken = useRef('');
  const takenAt = useRef(0);
  const savedRef = useRef(saved);
  const draftRef = useRef(draft);
  const onCommitRef = useRef(onCommit);
  savedRef.current = saved;
  draftRef.current = draft;
  onCommitRef.current = onCommit;

  useEffect(() => {
    if (!focused.current) setDraft(saved);
  }, [saved]);

  const commit = (value: string, source: 'change' | 'blur') => {
    if (disabled) return;
    if (value !== '' && !ISO_DAY.test(value)) return;
    if (source === 'change' && value === '') return;
    const now = Date.now();
    if (taken.current && taken.current !== value && value === from.current && now - takenAt.current < SNAP_BACK_MS) return;
    if (value === savedRef.current && value === draftRef.current) {
      if (source === 'change') {
        taken.current = value;
        takenAt.current = now;
      }
      return;
    }
    const previous = savedRef.current;
    setDraft(value);
    draftRef.current = value;
    const ok = onCommitRef.current(value);
    if (!ok) {
      setDraft(previous);
      draftRef.current = previous;
      return;
    }
    savedRef.current = value;
    if (source === 'change' || value !== '') {
      taken.current = value;
      takenAt.current = now;
    }
  };

  useEffect(() => {
    const input = inputRef.current;
    return () => {
      const live = input?.value ?? '';
      const recent = taken.current && Date.now() - takenAt.current < SNAP_BACK_MS ? taken.current : live;
      if (!ISO_DAY.test(recent) || recent === savedRef.current) return;
      onCommitRef.current(recent);
    };
  }, []);

  return (
    <div className={draft ? 'achieved' : 'achieved is-empty'}>
      Achieved <b>{draft ? formatAchieved(draft) : 'Add date'}</b>
      <input
        ref={inputRef}
        type="date"
        aria-label={label}
        value={draft}
        disabled={disabled}
        onFocus={() => {
          focused.current = true;
          from.current = draftRef.current;
          taken.current = '';
        }}
        onChange={(event) => commit(event.target.value, 'change')}
        onBlur={(event) => {
          focused.current = false;
          const input = event.currentTarget;
          commit(input.value, 'blur');
          window.setTimeout(() => {
            if (focused.current || input !== inputRef.current) return;
            commit(input.value, 'blur');
          }, 0);
        }}
      />
    </div>
  );
}
