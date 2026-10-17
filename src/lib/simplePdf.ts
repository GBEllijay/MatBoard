/**
 * Small text PDF for Student Edition reports.
 * No extra library. Helvetica, one column, more pages when the text is long.
 */

const PAGE_W = 612;
const PAGE_H = 792;
const LINES_PER_PAGE = 46;
const LEADING = 14;

export function escapePdfText(value: string): string {
  return value
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

export function wrapPdfLine(value: string, width = 88): string[] {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return [''];
  const lines: string[] = [];
  let rest = text;
  while (rest.length > width) {
    let cut = rest.lastIndexOf(' ', width);
    if (cut < 24) cut = width;
    lines.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  lines.push(rest);
  return lines;
}

export function paginatePdfLines(lines: readonly string[], perPage = LINES_PER_PAGE): string[][] {
  const flat = lines.flatMap((line) => wrapPdfLine(line));
  if (!flat.length) return [['']];
  const pages: string[][] = [];
  for (let index = 0; index < flat.length; index += perPage) {
    pages.push(flat.slice(index, index + perPage));
  }
  return pages;
}

function pageStream(lines: readonly string[]): string {
  const body = lines
    .map((line, index) => `${index === 0 ? '' : 'T*\n'}(${escapePdfText(line)}) Tj`)
    .join('\n');
  return `BT\n/F1 11 Tf\n54 750 Td\n${LEADING} TL\n${body}\nET`;
}

/**
 * Returns a PDF document. The bytes start with `%PDF` and contain the text.
 */
export function textToPdf(lines: readonly string[]): Uint8Array {
  const pages = paginatePdfLines(lines);
  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const fontId = 3;
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((pageLines, index) => {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    pageObjectIds.push(pageId);
    const stream = pageStream(pageLines);
    objects[pageId - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
    objects[contentId - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let index = 0; index < objects.length; index += 1) {
    const body = objects[index];
    if (!body) continue;
    offsets[index + 1] = pdf.length;
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xrefAt = pdf.length;
  const count = objects.length + 1;
  pdf += `xref\n0 ${count}\n`;
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index < count; index += 1) {
    pdf += `${String(offsets[index] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export function pdfToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** A copy in a plain ArrayBuffer, which Blob accepts. */
export function pdfBlob(bytes: Uint8Array): Blob {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: 'application/pdf' });
}
