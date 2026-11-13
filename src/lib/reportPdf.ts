/**
 * Designed Student Edition PDFs.
 * Light paper, navy header, Helvetica. The self-assessment shape is a static
 * D8 diamond (front and back, eight faces) drawn as vector paths, not a picture.
 */

import { assessmentAverage, conditioningItemLines, mindsetGoalLines, type AssessmentScores, type AssessmentState } from './studentAssessment.ts';
import { shapeAxesFromLegacy, type ShapeAxisReading } from './shapeAxes.ts';
import { diamondFaces, diamondShade, quadrantTriangle, triangleCentroid, type DiamondSide } from './staticDiamond.ts';
import { advantageLogo } from './advantageLogo.ts';
import { drawPdf, type PdfDraw, type PdfImageAsset, type Rgb } from './simplePdf.ts';
import {
  progressReportBlocks,
  reportIdentity,
  type ReportBlock,
  type ReportExtras,
  type ReportIdentity,
} from './studentReport.ts';
import type { StudentProgressReport } from './progress/types.ts';
import { wornBeltPreview } from './studentRank.ts';

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 48;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
/** The progress-report belt spans the text column. The on-screen degree bar does not. */
export const REPORT_CONTENT_WIDTH = CONTENT_W;
export const REPORT_BELT_HEIGHT = 26;
/** Short cloth after the rank bar. The on-screen black-belt bar stays at 57%. */
const CLOTH_TIP = 18;
/** Red rank bar on a black belt. The black tip sits past it. */
const BLACK_RED_BAR = 42;
/** Five wide coral bars. The color changes four times along the belt. */
const CORAL_BARS = 5;
const HEADER = 64;
const CONTENT_TOP = 86;
const FOOTER = 42;
const NAVY: Rgb = [0.047, 0.137, 0.267];
const INK: Rgb = [0.114, 0.114, 0.122];
const MUTED: Rgb = [0.431, 0.431, 0.451];
const GOLD: Rgb = [0.831, 0.627, 0.09];
const WHITE: Rgb = [1, 1, 1];
const PAPER: Rgb = [1, 1, 1];
const SOFT: Rgb = [0.961, 0.961, 0.969];
const TRACK: Rgb = [0.91, 0.91, 0.929];
const RULE: Rgb = [0.89, 0.9, 0.93];
const PREVIOUS: Rgb = [0.557, 0.557, 0.576];

/** Images in the navy header. Omit a slot to leave it off the page. */
export type ReportHeaderArt = {
  selfie?: PdfImageAsset | null;
  gymLogo?: PdfImageAsset | null;
};

type PageState = { pages: PdfDraw[][]; draws: PdfDraw[]; top: number };

function measure(text: string, size: number, bold: boolean): number {
  return text.length * size * (bold ? 0.56 : 0.5);
}

export function wrapReportText(value: string, size: number, bold: boolean, maxWidth: number): string[] {
  const words = value.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = '';
  const place = (word: string) => {
    const next = current ? `${current} ${word}` : word;
    if (!current || measure(next, size, bold) <= maxWidth) current = next;
    else {
      lines.push(current);
      current = word;
    }
  };
  for (const word of words) {
    if (measure(word, size, bold) <= maxWidth) {
      place(word);
      continue;
    }
    if (current) {
      lines.push(current);
      current = '';
    }
    let chunk = '';
    for (const char of word) {
      const next = chunk + char;
      if (chunk && measure(next, size, bold) > maxWidth) {
        lines.push(chunk);
        chunk = char;
      } else chunk = next;
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines;
}

function metaLine(identity: ReportIdentity, issuedOn: string): string {
  return `Gym: ${identity.gym}  ·  Started: ${identity.started}  ·  ${identity.belt}  ·  ${issuedOn}`;
}

function freshPage(): PageState {
  return { pages: [], draws: [], top: CONTENT_TOP };
}

function breakPage(state: PageState) {
  state.pages.push(state.draws);
  state.draws = [];
  state.top = CONTENT_TOP;
}

function ensure(state: PageState, height: number) {
  if (state.top > CONTENT_TOP && state.top + height > PAGE_H - FOOTER) breakPage(state);
}

function textAt(state: PageState, text: string, size: number, font: 'regular' | 'bold', color: Rgb, x = MARGIN_X) {
  state.draws.push({
    op: 'text',
    text,
    x,
    y: PAGE_H - state.top - size,
    size,
    font,
    color,
  });
}

function drawWrapped(state: PageState, value: string, size: number, font: 'regular' | 'bold', color: Rgb, gap: number, x = MARGIN_X, width = CONTENT_W) {
  const lines = wrapReportText(value, size, font === 'bold', width);
  for (const line of lines) {
    ensure(state, size + gap);
    textAt(state, line, size, font, color, x);
    state.top += size + gap;
  }
}

const ADULT_CLOTH: Record<string, Rgb> = {
  white: [0.945, 0.933, 0.898],
  blue: [0.114, 0.306, 0.847],
  purple: [0.478, 0.243, 0.784],
  brown: [0.482, 0.29, 0.165],
  black: [0.137, 0.137, 0.149],
  coral: [0.827, 0.086, 0.106],
  redWhite: [0.957, 0.945, 0.918],
  red: [0.827, 0.086, 0.106],
};

function hexRgb(hex: string): Rgb {
  const raw = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return [0.14, 0.14, 0.15];
  const value = Number.parseInt(raw, 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

const CREAM: Rgb = [0.957, 0.945, 0.918];
const CORAL_RED: Rgb = [0.827, 0.086, 0.106];
const EMPTY_TAPE: Rgb = [0.25, 0.25, 0.27];

/**
 * Vector belt for the progress PDF and the print preview.
 * Every belt is the full text width. Black-belt degrees are not drawn as stripes:
 * the half-width degree bar is only for the screen. A black belt is black cloth,
 * a red bar, and a black tip. Coral repeats red with black or white. 9th degree
 * is solid red. Coral uses five wide bars. A weave and a stitch sit on every belt.
 */
export function beltArtDraws(report: StudentProgressReport, x: number, y: number, width = CONTENT_W): PdfDraw[] {
  const preview = wornBeltPreview(report);
  const h = REPORT_BELT_HEIGHT;
  if (preview.kind === 'final') return withFabric(finalBeltDraws(preview.belt, x, y, width, h), x, y, width, h);
  if (preview.belt === 'black') return withFabric(blackBeltDraws(x, y, width, h), x, y, width, h);
  return stripedBeltDraws(preview, x, y, width, h);
}

function withFabric(draws: PdfDraw[], x: number, y: number, width: number, h: number): PdfDraw[] {
  return [...draws, ...fabricDraws(x, y, width, h)];
}

function finalBeltDraws(belt: string, x: number, y: number, width: number, h: number): PdfDraw[] {
  if (belt === 'red') return [{ op: 'rect', x, y, w: width, h, fill: CORAL_RED }];
  const pair: readonly [Rgb, Rgb] = belt === 'redWhite' ? [CREAM, CORAL_RED] : [ADULT_CLOTH.black ?? CORAL_RED, CORAL_RED];
  return repeatingBars(pair, x, y, width, h);
}

function repeatingBars(colors: readonly [Rgb, Rgb], x: number, y: number, width: number, h: number): PdfDraw[] {
  const draws: PdfDraw[] = [];
  for (let index = 0; index < CORAL_BARS; index += 1) {
    const start = Math.round((width * index) / CORAL_BARS);
    const end = index === CORAL_BARS - 1 ? width : Math.round((width * (index + 1)) / CORAL_BARS);
    draws.push({ op: 'rect', x: x + start, y, w: end - start, h, fill: colors[index % 2] ?? CORAL_RED });
  }
  return draws;
}

function blackBeltDraws(x: number, y: number, width: number, h: number): PdfDraw[] {
  const tip = Math.min(CLOTH_TIP, Math.max(8, width * 0.08));
  const bar = Math.min(BLACK_RED_BAR, Math.max(16, width - tip - 36));
  const body = Math.max(1, width - bar - tip);
  const cloth = ADULT_CLOTH.black ?? CORAL_RED;
  return [
    { op: 'rect', x, y, w: body, h, fill: cloth },
    { op: 'rect', x: x + body, y, w: bar, h, fill: CORAL_RED },
    { op: 'rect', x: x + body + bar, y, w: width - body - bar, h, fill: cloth },
  ];
}

/** Horizontal cotton ribs and a dashed stitch, the same idea as the on-screen weave. */
function fabricDraws(x: number, y: number, width: number, h: number): PdfDraw[] {
  const draws: PdfDraw[] = [];
  for (let row = 1; row < h - 1; row += 3) {
    draws.push(shadeRect(x, y + row, width, 1, [1, 1, 1], 0.4));
    if (row + 2 < h) draws.push(shadeRect(x, y + row + 1, width, 1, [0, 0, 0], 0.18));
  }
  const stitch: Rgb = [0.36, 0.33, 0.29];
  for (const frac of [0.12, 0.2, 0.8, 0.88]) {
    const sy = y + h * frac;
    draws.push({
      op: 'line',
      x1: x + 3,
      y1: sy,
      x2: x + width - 3,
      y2: sy,
      color: stitch,
      lineWidth: 0.45,
      dash: true,
    });
  }
  return draws;
}

function shadeRect(x: number, y: number, w: number, h: number, fill: Rgb, fillOpacity: number): PdfDraw {
  return {
    op: 'poly',
    points: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    fill,
    fillOpacity,
  };
}

function stripedBeltDraws(
  preview: ReturnType<typeof wornBeltPreview>,
  x: number,
  y: number,
  width: number,
  h: number,
): PdfDraw[] {
  const slots = preview.slots;
  const cloth = preview.base ? hexRgb(preview.base) : (ADULT_CLOTH[preview.belt] ?? ADULT_CLOTH.black!);
  const slotW = slots.length > 6 ? 7 : 10;
  const tip = Math.min(CLOTH_TIP, Math.max(8, width * 0.08));
  const barW = Math.min(width - tip - 36, Math.max(36, slots.length * slotW + 10));
  const bodyW = Math.max(1, width - barW - tip);
  const draws: PdfDraw[] = [{ op: 'rect', x, y, w: bodyW, h, fill: cloth }];
  if (preview.kind === 'kids' && preview.center !== 'solid' && preview.centerColor) {
    draws.push({ op: 'rect', x, y: y + h / 2 - 3, w: bodyW, h: 6, fill: hexRgb(preview.centerColor) });
  }
  draws.push({ op: 'rect', x: x + bodyW, y, w: barW, h, fill: hexRgb('#101012') });
  draws.push({ op: 'rect', x: x + bodyW + barW, y, w: width - bodyW - barW, h, fill: cloth });
  draws.push(...fabricDraws(x, y, width, h));
  slots.forEach((slot, index) => {
    const fill = !slot.on ? EMPTY_TAPE : slot.color ? hexRgb(slot.color) : CREAM;
    draws.push({
      op: 'rect',
      x: x + bodyW + 6 + index * slotW,
      y: y + 5,
      w: Math.max(2, slotW - 3),
      h: h - 10,
      fill,
    });
  });
  return draws;
}

function drawWornBelt(state: PageState, report: StudentProgressReport) {
  const h = REPORT_BELT_HEIGHT;
  ensure(state, h + 12);
  const y = PAGE_H - state.top - h;
  state.draws.push(...beltArtDraws(report, MARGIN_X, y));
  state.top += h + 12;
}

function drawIdentity(state: PageState, title: string, identity: ReportIdentity, issuedOn: string) {
  drawWrapped(state, title, 22, 'bold', NAVY, 4);
  drawWrapped(state, `Student: ${identity.name}`, 16, 'bold', INK, 4);
  drawWrapped(state, metaLine(identity, issuedOn), 10, 'regular', MUTED, 4);
  state.top += 8;
}

function circlePoints(cx: number, cy: number, radius: number): { x: number; y: number }[] {
  const count = 32;
  const points: { x: number; y: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    points.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    });
  }
  return points;
}

function chrome(pageNumber: number, pageCount: number, kind: string, art?: ReportHeaderArt): PdfDraw[] {
  const logo = 40;
  const draws: PdfDraw[] = [
    { op: 'rect', x: 0, y: 0, w: PAGE_W, h: PAGE_H, fill: PAPER },
    { op: 'rect', x: 0, y: PAGE_H - HEADER, w: PAGE_W, h: HEADER, fill: NAVY },
    { op: 'rect', x: 0, y: PAGE_H - HEADER - 3, w: PAGE_W, h: 3, fill: GOLD },
    { op: 'image', id: advantageLogo.id, x: 14, y: PAGE_H - 12 - logo, w: logo, h: logo },
  ];
  const mark = 36;
  let right = PAGE_W - 16;
  const selfie = art?.selfie ?? null;
  const y = PAGE_H - 14 - mark;
  // Rightmost first. Progress reports no longer draw a gym logo in this header.
  for (const image of [selfie]) {
    if (!image) continue;
    right -= mark;
    const x = right;
    draws.push({
      op: 'group',
      clip: circlePoints(x + mark / 2, y + mark / 2, mark / 2),
      draws: [{ op: 'image', id: image.id, x, y, w: mark, h: mark }],
    });
    right -= 8;
  }
  const kindX = selfie ? 62 : PAGE_W - MARGIN_X - measure(kind, 8, true);
  const kindY = selfie ? PAGE_H - 58 : PAGE_H - 36;
  draws.push(
    { op: 'text', text: 'ADVANTAGE', x: 62, y: PAGE_H - 30, size: 13, font: 'bold', color: WHITE },
    { op: 'text', text: 'STUDENT EDITION', x: 62, y: PAGE_H - 46, size: 8, font: 'regular', color: [0.78, 0.84, 0.9] },
    { op: 'text', text: kind, x: kindX, y: kindY, size: 8, font: 'bold', color: GOLD },
    {
      op: 'text',
      text: `Hand this page to an instructor.  ·  Page ${pageNumber} of ${pageCount}`,
      x: MARGIN_X,
      y: 22,
      size: 8,
      font: 'regular',
      color: MUTED,
    },
  );
  return draws;
}

function finish(state: PageState, kind: string, art?: ReportHeaderArt): PdfDraw[][] {
  if (state.draws.length || !state.pages.length) state.pages.push(state.draws);
  const count = state.pages.length;
  return state.pages.map((body, index) => [...chrome(index + 1, count, kind, art), ...body]);
}

function drawBlocks(state: PageState, blocks: readonly ReportBlock[]) {
  for (const block of blocks) {
    ensure(state, 36);
    textAt(state, block.title, 12, 'bold', NAVY);
    state.top += 18;
    let continued = false;
    const lines = block.lines.length ? block.lines : [''];
    for (const raw of lines) {
      const indent = raw.startsWith('  ');
      const text = indent ? raw.trimStart() : raw;
      const size = 10;
      const wrapped = wrapReportText(text, size, false, CONTENT_W - (indent ? 14 : 0));
      for (const line of wrapped) {
        if (state.top + 14 > PAGE_H - FOOTER) {
          breakPage(state);
          continued = true;
        }
        if (continued) {
          textAt(state, `${block.title} continued`, 9, 'bold', MUTED);
          state.top += 16;
          continued = false;
        }
        textAt(state, line, size, 'regular', INK, MARGIN_X + (indent ? 14 : 0));
        state.top += 14;
      }
    }
    state.top += 8;
    state.draws.push({
      op: 'line',
      x1: MARGIN_X,
      y1: PAGE_H - state.top,
      x2: PAGE_W - MARGIN_X,
      y2: PAGE_H - state.top,
      color: RULE,
      lineWidth: 0.6,
    });
    state.top += 12;
  }
}

/** Center and size of one printed diamond, in PDF points (y grows upward). */
export type DiamondBox = { cx: number; cy: number; r: number };
export type DiamondBoxes = { front: DiamondBox; back: DiamondBox };

const DIAMOND_R = 62;
/** Room beside a diamond for the longest face name at 9pt. */
const DIAMOND_LABEL_ROOM = 84;
const DIAMOND_HALF_W = DIAMOND_R / 2 + 8 + DIAMOND_LABEL_ROOM;
const DIAMOND_CAPTION = 16;
export const DIAMOND_BLOCK_HEIGHT = DIAMOND_CAPTION + DIAMOND_R * 2 + 10;

/** Solid blend of white paper and a color. The PDF writer has only two opacity levels. */
function mixPaper(color: Rgb, amount: number): Rgb {
  const mix = (channel: number) => Math.round((1 - amount + channel * amount) * 1000) / 1000;
  return [mix(color[0]), mix(color[1]), mix(color[2])];
}

function pdfPoint(point: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(point.x * 100) / 100, y: Math.round((PAGE_H - point.y) * 100) / 100 };
}

/** Static D8: front and back of the diamond, eight faces shaded by this check-in. */
function drawDiamonds(draws: PdfDraw[], top: number, scores: Partial<AssessmentScores>): DiamondBoxes {
  const cy = top + DIAMOND_CAPTION + DIAMOND_R;
  const centers: Record<DiamondSide, number> = {
    front: MARGIN_X + DIAMOND_HALF_W,
    back: MARGIN_X + CONTENT_W - DIAMOND_HALF_W,
  };
  const faces = diamondFaces(scores);
  for (const side of ['front', 'back'] as const) {
    const cx = centers[side];
    const center = { x: cx, y: cy };
    const caption = side === 'front' ? 'Front' : 'Back (turned over)';
    draws.push({
      op: 'text',
      text: caption,
      x: cx - measure(caption, 9, true) / 2,
      y: PAGE_H - top - 10,
      size: 9,
      font: 'bold',
      color: NAVY,
    });
    for (const face of faces.filter((item) => item.side === side)) {
      const tri = quadrantTriangle(center, DIAMOND_R, face.quadrant).map(pdfPoint);
      const shade = diamondShade(face.axis.value);
      draws.push(
        shade == null
          ? { op: 'poly', points: tri, fill: TRACK, stroke: NAVY, lineWidth: 0.9, lineJoin: 'round' }
          : { op: 'poly', points: tri, fill: mixPaper(NAVY, shade), stroke: NAVY, lineWidth: 0.9, lineJoin: 'round' },
      );
      const mid = pdfPoint(triangleCentroid(quadrantTriangle(center, DIAMOND_R, face.quadrant)));
      const value = face.axis.value == null ? '-' : String(face.axis.value);
      draws.push({
        op: 'text',
        text: value,
        x: mid.x - measure(value, 12, true) / 2,
        y: mid.y - 4,
        size: 12,
        font: 'bold',
        color: shade != null && shade > 0.5 ? WHITE : NAVY,
      });
      const right = face.quadrant.endsWith('right');
      const upper = face.quadrant.startsWith('top');
      const labelX = right ? cx + DIAMOND_R / 2 + 8 : cx - DIAMOND_R / 2 - 8 - measure(face.axis.label, 9, false);
      const labelY = upper ? cy - DIAMOND_R / 2 - 6 : cy + DIAMOND_R / 2 + 12;
      draws.push({ op: 'text', text: face.axis.label, x: labelX, y: PAGE_H - labelY, size: 9, font: 'regular', color: INK });
    }
  }
  return {
    front: { cx: centers.front, cy: PAGE_H - cy, r: DIAMOND_R },
    back: { cx: centers.back, cy: PAGE_H - cy, r: DIAMOND_R },
  };
}

function drawLegend(draws: PdfDraw[], x: number, top: number, previousDate: string | null) {
  const swatch = 16;
  const baseline = PAGE_H - top - 10;
  let cursor = x;
  draws.push({ op: 'rect', x: cursor, y: baseline + 1, w: swatch, h: 7, fill: NAVY });
  cursor += swatch + 6;
  const now = 'This check-in';
  draws.push({ op: 'text', text: now, x: cursor, y: baseline, size: 9, font: 'regular', color: INK });
  cursor += measure(now, 9, false) + 18;
  if (previousDate) {
    draws.push({ op: 'line', x1: cursor + 4, y1: baseline - 1, x2: cursor + 4, y2: baseline + 9, color: PREVIOUS, lineWidth: 1.4 });
    cursor += 14;
    const prior = `Previous ${previousDate}`;
    draws.push({ op: 'text', text: prior, x: cursor, y: baseline, size: 9, font: 'regular', color: INK });
    cursor += measure(prior, 9, false) + 18;
  }
  const key = 'Darker face = higher score. - = not rated.';
  draws.push({ op: 'text', text: key, x: cursor, y: baseline, size: 9, font: 'regular', color: MUTED });
}

function drawBars(
  draws: PdfDraw[],
  readings: readonly ShapeAxisReading[],
  previous: readonly ShapeAxisReading[] | null,
  x: number,
  top: number,
  width: number,
) {
  const labelW = 92;
  const numW = 16;
  const gap = 10;
  const barW = width - labelW - numW - gap;
  const barH = 7;
  const rowH = 16;
  readings.forEach((reading, index) => {
    const baseline = PAGE_H - (top + index * rowH) - 12;
    draws.push({ op: 'text', text: reading.label, x, y: baseline, size: 10, font: 'regular', color: INK });
    draws.push({ op: 'rect', x: x + labelW, y: baseline + 1, w: barW, h: barH, fill: TRACK });
    if (reading.value != null) {
      draws.push({
        op: 'rect',
        x: x + labelW,
        y: baseline + 1,
        w: Math.max(2, (reading.value / 5) * barW),
        h: barH,
        fill: NAVY,
      });
    }
    const prior = previous?.[index]?.value;
    if (prior != null) {
      const tick = x + labelW + (prior / 5) * barW;
      draws.push({ op: 'line', x1: tick, y1: baseline - 1, x2: tick, y2: baseline + barH + 3, color: PREVIOUS, lineWidth: 1.4 });
    }
    const num = reading.value == null ? '-' : String(reading.value);
    draws.push({
      op: 'text',
      text: num,
      x: x + labelW + barW + gap + (numW - measure(num, 10, true)),
      y: baseline,
      size: 10,
      font: 'bold',
      color: NAVY,
    });
  });
}

export type AssessmentLayout = { pages: PdfDraw[][]; diamond: DiamondBoxes | null };

export function layoutAssessment(report: StudentProgressReport, assessment: AssessmentState, issuedOn: string): AssessmentLayout {
  const identity = reportIdentity(report);
  const entries = [...assessment.entries].sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
  const state = freshPage();
  drawIdentity(state, 'Self-assessment', identity, issuedOn);

  const latest = entries[0];
  const previous = entries[1] ?? null;
  let diamond: DiamondBoxes | null = null;
  if (!latest) {
    drawWrapped(state, 'No self-assessment saved on this phone.', 11, 'regular', INK, 4);
  } else {
    const average = assessmentAverage(latest.scores).toFixed(1);
    state.top += 2;
    ensure(state, 26);
    textAt(state, latest.date, 11, 'bold', NAVY);
    const averageWidth = measure(average, 22, true);
    state.draws.push({
      op: 'text',
      text: average,
      x: PAGE_W - MARGIN_X - averageWidth - 22,
      y: PAGE_H - state.top - 16,
      size: 22,
      font: 'bold',
      color: NAVY,
    });
    state.draws.push({
      op: 'text',
      text: '/ 5',
      x: PAGE_W - MARGIN_X - 18,
      y: PAGE_H - state.top - 12,
      size: 10,
      font: 'regular',
      color: MUTED,
    });
    state.top += 24;

    ensure(state, DIAMOND_BLOCK_HEIGHT + 22);
    const chartTop = state.top;
    diamond = drawDiamonds(state.draws, chartTop, latest.scores);
    state.top = chartTop + DIAMOND_BLOCK_HEIGHT;
    drawLegend(state.draws, MARGIN_X, state.top, previous?.date ?? null);
    state.top += 20;
    const current = shapeAxesFromLegacy(latest.scores);
    const prior = previous ? shapeAxesFromLegacy(previous.scores) : null;
    drawBars(state.draws, current, prior, MARGIN_X, state.top, CONTENT_W);
    state.top += current.length * 16 + 6;
    const note = latest.note.trim() || 'No note on this check-in.';
    const noteLines = wrapReportText(note, 10, false, CONTENT_W - 20);
    const cardH = 20 + noteLines.length * 13;
    ensure(state, cardH);
    const cardTop = state.top;
    state.draws.push({
      op: 'rect',
      x: MARGIN_X,
      y: PAGE_H - cardTop - cardH,
      w: CONTENT_W,
      h: cardH,
      fill: SOFT,
    });
    state.top += 6;
    drawWrapped(state, 'Notes', 9, 'bold', NAVY, 2, MARGIN_X + 10, CONTENT_W - 20);
    drawWrapped(state, note, 10, 'regular', INK, 3, MARGIN_X + 10, CONTENT_W - 20);
    state.top = cardTop + cardH + 8;
    for (const line of conditioningItemLines(latest.conditioningItems)) drawWrapped(state, line, 10, 'regular', INK, 3);
    for (const line of mindsetGoalLines(latest.mindsetGoals)) drawWrapped(state, line, 10, 'regular', INK, 3);

    const earlier = entries.slice(1);
    if (earlier.length) {
      ensure(state, 24);
      textAt(state, 'Earlier check-ins', 12, 'bold', NAVY);
      state.top += 16;
      for (const entry of earlier) {
        const bits = [
          `${entry.date} — average ${assessmentAverage(entry.scores).toFixed(1)}`,
          shapeAxesFromLegacy(entry.scores)
            .map((axis) => `${axis.label} ${axis.value ?? 'not rated'}`)
            .join(', '),
        ];
        const conditioning = conditioningItemLines(entry.conditioningItems);
        if (conditioning.length) bits.push(conditioning.join(', '));
        const goals = mindsetGoalLines(entry.mindsetGoals);
        if (goals.length) bits.push(goals.join(', '));
        if (entry.note.trim()) bits.push(entry.note.trim());
        for (const bit of bits) drawWrapped(state, bit, 10, 'regular', INK, 3);
        state.top += 4;
      }
    }
  }
  return { pages: finish(state, 'SELF-ASSESSMENT'), diamond };
}

export function renderReportPages(pages: readonly PdfDraw[][], images: readonly PdfImageAsset[] = []): Uint8Array {
  return drawPdf(pages, [advantageLogo, ...images]);
}

export function assessmentReportPdf(report: StudentProgressReport, assessment: AssessmentState, issuedOn: string): Uint8Array {
  return renderReportPages(layoutAssessment(report, assessment, issuedOn).pages);
}

export function progressReportPdf(
  report: StudentProgressReport,
  assessment: AssessmentState,
  extra: ReportExtras = {},
  issuedOn = '',
  art: ReportHeaderArt = {},
): Uint8Array {
  const identity = reportIdentity(report);
  const state = freshPage();
  drawIdentity(state, 'Progress report', identity, issuedOn);
  drawWornBelt(state, report);
  drawBlocks(state, progressReportBlocks(report, assessment, extra));
  const images = [art.selfie].filter((image): image is PdfImageAsset => Boolean(image));
  return renderReportPages(finish(state, 'PROGRESS', art), images);
}

