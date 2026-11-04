/**
 * Presentation-only pagination for a journal card: the card's text lines are
 * word-wrapped onto ruled rows and flow onto as many binder pages as needed,
 * like a word processor. Storage stays one entry.
 */
export const JOURNAL_PAGE_ROWS = 18;
export const JOURNAL_ROW_CHARS = 38;

export type PageRow = { text: string; lead: boolean };

/** Word-wrap one field line into rows. `lead` marks the row that starts the line. */
export function wrapRows(line: string, width = JOURNAL_ROW_CHARS): PageRow[] {
  const out: PageRow[] = [];
  let row = '';
  for (const word of line.split(/\s+/).filter(Boolean)) {
    let piece = word;
    while (piece.length > width) {
      if (row) {
        out.push({ text: row, lead: !out.length });
        row = '';
      }
      out.push({ text: piece.slice(0, width), lead: !out.length });
      piece = piece.slice(width);
    }
    if (!row) row = piece;
    else if (row.length + 1 + piece.length <= width) row += ` ${piece}`;
    else {
      out.push({ text: row, lead: !out.length });
      row = piece;
    }
  }
  if (row || !out.length) out.push({ text: row, lead: !out.length });
  // Trailing space on wrapped rows so copied / read-aloud text keeps word breaks.
  return out.map((item, index) => (index < out.length - 1 ? { ...item, text: `${item.text} ` } : item));
}

/** Split lines into pages of ruled rows. Always at least one page. */
export function paginateJournal(lines: readonly string[], rows = JOURNAL_PAGE_ROWS, width = JOURNAL_ROW_CHARS): PageRow[][] {
  const pages: PageRow[][] = [[]];
  for (const line of lines) {
    for (const row of wrapRows(line, width)) {
      if (pages[pages.length - 1].length >= rows) pages.push([]);
      pages[pages.length - 1].push(row);
    }
  }
  return pages;
}

export const pageLabel = (index: number, total: number) => `Page ${index + 1} of ${total}`;
