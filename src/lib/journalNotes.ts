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
