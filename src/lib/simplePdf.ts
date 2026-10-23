/**
 * Small PDF writer for Student Edition reports.
 * Helvetica with WinAnsiEncoding so dashes, middle dots, and quotes
 * keep their glyphs. Drawing commands are vector operators, not a bitmap.
 */

const PAGE_W = 612;
const PAGE_H = 792;
const LINES_PER_PAGE = 46;
const LEADING = 14;

/** Windows-1252 bytes that WinAnsiEncoding does not share with Latin-1. */
const WINANSI_SPECIAL: Record<number, string> = {
  0x80: '\u20ac',
  0x82: '\u201a',
  0x83: '\u0192',
  0x84: '\u201e',
  0x85: '\u2026',
  0x86: '\u2020',
  0x87: '\u2021',
  0x88: '\u02c6',
  0x89: '\u2030',
  0x8a: '\u0160',
  0x8b: '\u2039',
  0x8c: '\u0152',
  0x8e: '\u017d',
  0x91: '\u2018',
  0x92: '\u2019',
  0x93: '\u201c',
  0x94: '\u201d',
  0x95: '\u2022',
  0x96: '\u2013',
  0x97: '\u2014',
  0x98: '\u02dc',
  0x99: '\u2122',
  0x9a: '\u0161',
  0x9b: '\u203a',
  0x9c: '\u0153',
  0x9e: '\u017e',
  0x9f: '\u0178',
};

const UNICODE_TO_WINANSI = new Map<number, number>();
for (const [byte, glyph] of Object.entries(WINANSI_SPECIAL)) {
  UNICODE_TO_WINANSI.set(glyph.codePointAt(0) ?? 0, Number(byte));
}
UNICODE_TO_WINANSI.set(0x2212, 0x2d);
UNICODE_TO_WINANSI.set(0x2011, 0x2d);
UNICODE_TO_WINANSI.set(0x00ad, 0x2d);

export type Rgb = readonly [number, number, number];

export type PdfDraw =
  | { op: 'rect'; x: number; y: number; w: number; h: number; fill?: Rgb; stroke?: Rgb; lineWidth?: number }
  | { op: 'line'; x1: number; y1: number; x2: number; y2: number; color: Rgb; lineWidth: number; dash?: boolean }
  | {
      op: 'poly';
      points: readonly { x: number; y: number }[];
      fill?: Rgb;
      stroke?: Rgb;
      lineWidth?: number;
      fillOpacity?: number;
      dash?: boolean;
      /** Round joins keep stroke corners from sticking out past a vertex. */
      lineJoin?: 'miter' | 'round';
    }
  | { op: 'text'; text: string; x: number; y: number; size: number; font: 'regular' | 'bold'; color: Rgb }
  | { op: 'image'; id: string; x: number; y: number; w: number; h: number }
  | { op: 'group'; clip?: readonly { x: number; y: number }[]; draws: readonly PdfDraw[] };

export type PdfImageAsset = {
  id: string;
  width: number;
  height: number;
  /** Uppercase hex of zlib-compressed DeviceRGB samples. */
  flateHex: string;
};

function winAnsiByte(code: number): number | null {
  if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) return code;
  if (code === 0x0a || code === 0x09 || code === 0x0d) return 0x20;
  return UNICODE_TO_WINANSI.get(code) ?? null;
}

/** PDF literal-string contents. Bytes outside ASCII are octal escapes. Unmapped characters are omitted, never replaced with "?". */
export function escapePdfText(value: string): string {
  let out = '';
  for (const char of value) {
    const byte = winAnsiByte(char.codePointAt(0) ?? 0);
    if (byte == null) continue;
    if (byte === 0x5c) out += '\\\\';
    else if (byte === 0x28) out += '\\(';
    else if (byte === 0x29) out += '\\)';
    else if (byte < 0x20 || byte > 0x7e) out += `\\${byte.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(byte);
  }
  return out;
}

export function formatPdfNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (!Number.isFinite(rounded)) return '0';
  const text = String(Object.is(rounded, -0) ? 0 : rounded);
  return text;
}

function rgb(color: Rgb): string {
  return `${formatPdfNumber(color[0])} ${formatPdfNumber(color[1])} ${formatPdfNumber(color[2])}`;
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

function fontObject(base: string): string {
  return `<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`;
}

function streamObject(stream: string): string {
  const length = new TextEncoder().encode(stream).length;
  return `<< /Length ${length} >>\nstream\n${stream}\nendstream`;
}

function assemble(objects: string[]): Uint8Array {
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let index = 0; index < objects.length; index += 1) {
    const body = objects[index];
    if (!body) continue;
    offsets[index + 1] = new TextEncoder().encode(pdf).length;
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xrefAt = new TextEncoder().encode(pdf).length;
  const count = objects.length + 1;
  pdf += `xref\n0 ${count}\n`;
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index < count; index += 1) {
    pdf += `${String(offsets[index] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

/**
 * Returns a PDF document. The bytes start with `%PDF` and contain the text.
 * Every input line is placed on some page.
 */
export function textToPdf(lines: readonly string[]): Uint8Array {
  const pages = paginatePdfLines(lines);
  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const fontId = 3;
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = fontObject('Helvetica');
  pages.forEach((pageLines, index) => {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    pageObjectIds.push(pageId);
    const stream = pageStream(pageLines);
    objects[pageId - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
    objects[contentId - 1] = streamObject(stream);
  });
  objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
  return assemble(objects);
}

function pathOf(points: readonly { x: number; y: number }[]): string {
  return points
    .map((point, index) => `${formatPdfNumber(point.x)} ${formatPdfNumber(point.y)} ${index === 0 ? 'm' : 'l'}`)
    .join('\n');
}

function compileDraws(draws: readonly PdfDraw[]): string {
  const parts: string[] = [];
  for (const draw of draws) {
    if (draw.op === 'rect') {
      parts.push('q');
      if (draw.fill) parts.push(`${rgb(draw.fill)} rg`);
      if (draw.stroke) parts.push(`${rgb(draw.stroke)} RG`, `${formatPdfNumber(draw.lineWidth ?? 1)} w`);
      parts.push(`${formatPdfNumber(draw.x)} ${formatPdfNumber(draw.y)} ${formatPdfNumber(draw.w)} ${formatPdfNumber(draw.h)} re`);
      parts.push(draw.fill && draw.stroke ? 'B' : draw.fill ? 'f' : 'S', 'Q');
    } else if (draw.op === 'line') {
      parts.push(
        'q',
        `${rgb(draw.color)} RG`,
        `${formatPdfNumber(draw.lineWidth)} w`,
        ...(draw.dash ? ['[3 2] 0 d'] : []),
        `${formatPdfNumber(draw.x1)} ${formatPdfNumber(draw.y1)} m`,
        `${formatPdfNumber(draw.x2)} ${formatPdfNumber(draw.y2)} l`,
        'S',
        'Q',
      );
    } else if (draw.op === 'poly') {
      if (draw.points.length < 2) continue;
      const path = pathOf(draw.points);
      if (draw.fill) {
        parts.push('q');
        if (draw.fillOpacity != null && draw.fillOpacity < 0.99) parts.push(draw.fillOpacity <= 0.25 ? '/gs18 gs' : '/gs40 gs');
        parts.push(`${rgb(draw.fill)} rg`, path, 'h', 'f', 'Q');
      }
      if (draw.stroke) {
        parts.push('q', `${rgb(draw.stroke)} RG`, `${formatPdfNumber(draw.lineWidth ?? 1)} w`);
        if (draw.lineJoin === 'round') parts.push('1 j', '1 J');
        if (draw.dash) parts.push('[3 2] 0 d');
        parts.push(path, 'h', 'S', 'Q');
      }
    } else if (draw.op === 'image') {
      parts.push(
        'q',
        `${formatPdfNumber(draw.w)} 0 0 ${formatPdfNumber(draw.h)} ${formatPdfNumber(draw.x)} ${formatPdfNumber(draw.y)} cm`,
        `/${draw.id} Do`,
        'Q',
      );
    } else if (draw.op === 'group') {
      parts.push('q');
      if (draw.clip && draw.clip.length >= 3) parts.push(pathOf(draw.clip), 'h', 'W', 'n');
      parts.push(compileDraws(draw.draws));
      parts.push('Q');
    } else if (draw.op === 'text') {
      const font = draw.font === 'bold' ? '/F2' : '/F1';
      parts.push(
        'BT',
        `${font} ${formatPdfNumber(draw.size)} Tf`,
        `${rgb(draw.color)} rg`,
        `1 0 0 1 ${formatPdfNumber(draw.x)} ${formatPdfNumber(draw.y)} Tm`,
        `(${escapePdfText(draw.text)}) Tj`,
        'ET',
      );
    }
  }
  return parts.join('\n');
}

function imageObject(image: PdfImageAsset): string {
  const hex = image.flateHex.replace(/\s+/g, '');
  const wrapped = hex.match(/.{1,80}/g)?.join('\n') ?? hex;
  const stream = `${wrapped}\n>\n`;
  return `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /FlateDecode] /Length ${stream.length} >>\nstream\n${stream}endstream`;
}

/** Vector pages. Coordinates are PDF user space, origin at the bottom left. */
export function drawPdf(pages: readonly (readonly PdfDraw[])[], images: readonly PdfImageAsset[] = []): Uint8Array {
  const sheets = pages.length ? pages : [[]];
  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = fontObject('Helvetica');
  objects[3] = fontObject('Helvetica-Bold');
  objects[4] = '<< /Type /ExtGState /ca 0.18 /CA 1 >>';
  objects[5] = '<< /Type /ExtGState /ca 0.4 /CA 1 >>';
  let nextId = 7;
  const imageIds = new Map<string, number>();
  for (const image of images) {
    imageIds.set(image.id, nextId);
    objects[nextId - 1] = imageObject(image);
    nextId += 1;
  }
  const xobject = images.length
    ? ` /XObject << ${images.map((image) => `/${image.id} ${imageIds.get(image.id)} 0 R`).join(' ')} >>`
    : '';
  sheets.forEach((draws) => {
    const pageId = nextId;
    const contentId = pageId + 1;
    nextId += 2;
    pageObjectIds.push(pageId);
    const stream = compileDraws(draws);
    objects[pageId - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /ExtGState << /gs18 5 0 R /gs40 6 0 R >>${xobject} >> >>`;
    objects[contentId - 1] = streamObject(stream);
  });
  objects[1] = `<< /Type /Pages /Count ${sheets.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
  return assemble(objects);
}

export function pdfToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function unicodeFromWinAnsi(bytes: number[]): string {
  let out = '';
  for (const byte of bytes) {
    if (byte === 0x0a) {
      out += '\n';
      continue;
    }
    const special = WINANSI_SPECIAL[byte];
    if (special) {
      out += special;
      continue;
    }
    if ((byte >= 0x20 && byte <= 0x7e) || (byte >= 0xa0 && byte <= 0xff)) out += String.fromCharCode(byte);
  }
  return out;
}

function readLiteral(source: string, open: number): { text: string; end: number } | null {
  const bytes: number[] = [];
  let index = open + 1;
  while (index < source.length) {
    const char = source[index] ?? '';
    if (char === ')') return { text: unicodeFromWinAnsi(bytes), end: index };
    if (char === '\\') {
      const next = source[index + 1] ?? '';
      if (next >= '0' && next <= '7') {
        let octal = next;
        let cursor = index + 2;
        for (let extra = 0; extra < 2 && cursor < source.length; extra += 1, cursor += 1) {
          const digit = source[cursor] ?? '';
          if (digit < '0' || digit > '7') break;
          octal += digit;
        }
        bytes.push(Number.parseInt(octal, 8));
        index = cursor;
        continue;
      }
      if (next === 'n') bytes.push(0x0a);
      else if (next === 'r') bytes.push(0x0d);
      else if (next === 't') bytes.push(0x09);
      else if (next === '(' || next === ')' || next === '\\') bytes.push(next.charCodeAt(0));
      else if (next) bytes.push(next.charCodeAt(0));
      index += 2;
      continue;
    }
    bytes.push(char.charCodeAt(0));
    index += 1;
  }
  return null;
}

/** Text painted by Tj operators, with WinAnsi bytes restored to Unicode. */
export function extractPdfText(bytes: Uint8Array): string {
  const source = pdfToText(bytes);
  const lines: string[] = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '(') continue;
    const literal = readLiteral(source, index);
    if (!literal) continue;
    const after = source.slice(literal.end + 1, literal.end + 8);
    if (/^\s*Tj/.test(after)) lines.push(literal.text);
    index = literal.end;
  }
  return lines.join('\n');
}

export function pdfPageCount(bytes: Uint8Array): number {
  return pdfToText(bytes).match(/\/Type \/Page\b/g)?.length ?? 0;
}

/** A copy in a plain ArrayBuffer, which Blob accepts. */
export function pdfBlob(bytes: Uint8Array): Blob {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: 'application/pdf' });
}
