/**
 * Journal card notes. Older cards stored drill notes and "stop doing" notes
 * in one Notes block. A line that starts with "Stop doing:" splits them.
 * Anything else stays in drill notes, so an old card is never dropped.
 */

const STOP_LINE = /^stop doing:\s*(.*)$/i;

export function splitJournalNotes(block: string): { notes: string; stopDoing: string } {
  const lines = block.replace(/\r\n/g, '\n').split('\n');
  const at = lines.findIndex((row) => STOP_LINE.test(row));
  if (at < 0) return { notes: block.trim(), stopDoing: '' };
  const inline = lines[at].replace(/^stop doing:\s*/i, '').trim();
  const after = lines.slice(at + 1).join('\n').trim();
  const stopDoing = [inline, after].filter(Boolean).join('\n').trim();
  return { notes: lines.slice(0, at).join('\n').trim(), stopDoing };
}

/** Write drill notes, then a Stop doing section only when that field has text. */
export function joinJournalNotes(notes: string, stopDoing: string): string {
  const drill = notes.trim();
  const stop = stopDoing.trim();
  if (!stop) return drill;
  return drill ? `${drill}\nStop doing:\n${stop}` : `Stop doing:\n${stop}`;
}

/**
 * "How it went" is the one reflection field. Older cards kept a separate "Stop doing" note;
 * it is read as part of How it went (How it went first, then the old stop-doing text).
 * Nothing is rewritten until the student saves the card.
 */
export const HOW_IT_WENT_PREFIX = 'How it went:';
/** Continuation lines for a multi-line How it went. Older readers keep the first line. */
export const HOW_IT_WENT_MORE = 'How it went, more:';

/** Body lines for a How it went note. Multi-line text keeps its lines. Empty text writes nothing. */
export function encodeHowItWentLines(text: string): string[] {
  const rows = text.replace(/\r\n?/g, '\n').split('\n').map((row) => row.trim());
  while (rows.length && !rows[0]) rows.shift();
  while (rows.length && !rows[rows.length - 1]) rows.pop();
  if (!rows.length) return [];
  return [`${HOW_IT_WENT_PREFIX} ${rows[0]}`.trimEnd(), ...rows.slice(1).map((row) => `${HOW_IT_WENT_MORE} ${row}`.trimEnd())];
}

/** How it went as written on the card (no older stop-doing text), lines kept. */
export function readHowItWentLines(lines: readonly string[]): string {
  const at = lines.findIndex((row) => row.startsWith(HOW_IT_WENT_PREFIX));
  if (at < 0) return '';
  const out = [lines[at].slice(HOW_IT_WENT_PREFIX.length).trim()];
  for (let index = at + 1; index < lines.length && lines[index].startsWith(HOW_IT_WENT_MORE); index += 1) {
    out.push(lines[index].slice(HOW_IT_WENT_MORE.length).trim());
  }
  return out.join('\n').trim();
}

/** How it went followed by an older card's stop-doing text, so the old note is never hidden. */
export function foldStopDoing(howItWent: string, stopDoing: string): string {
  return [howItWent.trim(), stopDoing.trim()].filter(Boolean).join('\n');
}
