/**
 * Debounced glossary matches for whatever field is being typed.
 * Suggestions stay hidden until the word has at least three characters and the debounce has elapsed.
 * A space ends the word, so the list does not linger after the keyboard moves on.
 */

import { useEffect, useMemo, useState } from 'react';
import { GLOSSARY_DEBOUNCE_MS, activeGlossaryQuery, type ActiveGlossary, type ExtraName, type GlossaryMatchOptions } from '../lib/glossaryMatch.ts';

export function useGlossarySuggest(
  value: string,
  caret: number,
  blockedIds: readonly string[] = [],
  blockedNames: readonly string[] = [],
  extra: readonly ExtraName[] = [],
): ActiveGlossary | null {
  const blockedKey = `${blockedIds.join('\n')}\n::\n${blockedNames.join('\n')}\n::\n${extra.map((row) => `${row.faceId}:${row.name}`).join('\n')}`;
  const options = useMemo<GlossaryMatchOptions>(
    () => ({ blockedIds, blockedNames, extra }),
    // The joined key is the value of those lists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blockedKey],
  );
  const [pending, setPending] = useState<{ value: string; caret: number } | null>(null);

  useEffect(() => {
    if (!activeGlossaryQuery(value, caret, options)) {
      setPending(null);
      return;
    }
    const handle = window.setTimeout(() => setPending({ value, caret }), GLOSSARY_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [value, caret, options]);

  return useMemo(() => {
    if (!pending || pending.value !== value || pending.caret !== caret) return null;
    return activeGlossaryQuery(value, caret, options);
  }, [pending, value, caret, options]);
}
