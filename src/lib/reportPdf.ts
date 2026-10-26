/**
 * Designed Student Edition PDFs.
 * Light paper, navy header, Helvetica. The radar is vector paths from the
 * shared radar geometry, not a picture of the chart.
 */

import { ASSESSMENT_AREAS, assessmentAverage, type AssessmentState } from './studentAssessment.ts';
import { radarPoint, RADAR_CENTER } from './radarChart.ts';
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
/** A normal rank tip. Not the on-screen black-belt bar, which is 57% of the belt. */
const RANK_TIP = 56;
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

export type RadarBox = { x: number; y: number; size: number; plot: number };

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

export function chartPoint(index: number, value: number, box: RadarBox): { x: number; y: number } {
  const plot = box.plot;
  const pad = (box.size - plot) / 2;
  const scale = plot / 320;
  const spot = radarPoint(index, value);
  return {
    x: Math.round((box.x + pad + spot.x * scale) * 100) / 100,
    y: Math.round((box.y + pad + (320 - spot.y) * scale) * 100) / 100,
  };
}

export function chartCenter(box: RadarBox): { x: number; y: number } {
  const plot = box.plot;
  const pad = (box.size - plot) / 2;
  const scale = plot / 320;
  return {
    x: Math.round((box.x + pad + RADAR_CENTER * scale) * 100) / 100,
    y: Math.round((box.y + pad + (320 - RADAR_CENTER) * scale) * 100) / 100,
  };
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
 * the half-width degree bar is only for the screen. Coral is red and black,
 * red and white is split, and 9th degree is solid red.
 */
export function beltArtDraws(report: StudentProgressReport, x: number, y: number, width = CONTENT_W): PdfDraw[] {
  const preview = wornBeltPreview(report);
  const h = REPORT_BELT_HEIGHT;
  if (preview.kind === 'final') return finalBeltDraws(preview.belt, x, y, width, h);
  if (preview.belt === 'black') return blackBeltDraws(x, y, width, h);
  return stripedBeltDraws(preview, x, y, width, h);
}

function finalBeltDraws(belt: string, x: number, y: number, width: number, h: number): PdfDraw[] {
  if (belt === 'red') return [{ op: 'rect', x, y, w: width, h, fill: CORAL_RED }];
  const split = Math.round(width * 0.46);
  const left = belt === 'redWhite' ? CREAM : (ADULT_CLOTH.black ?? CORAL_RED);
  const right = CORAL_RED;
  return [
    { op: 'rect', x, y, w: split, h, fill: left },
    { op: 'rect', x: x + split, y, w: width - split, h, fill: right },
  ];
}

function blackBeltDraws(x: number, y: number, width: number, h: number): PdfDraw[] {
  const body = Math.max(1, width - RANK_TIP);
  return [
    { op: 'rect', x, y, w: body, h, fill: ADULT_CLOTH.black ?? CORAL_RED },
    { op: 'rect', x: x + body, y, w: width - body, h, fill: CORAL_RED },
  ];
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
  const barW = Math.min(width - 36, Math.max(36, slots.length * slotW + 10));
  const bodyW = width - barW;
  const draws: PdfDraw[] = [{ op: 'rect', x, y, w: width, h, fill: cloth }];
  if (preview.kind === 'kids' && preview.center !== 'solid' && preview.centerColor) {
    draws.push({ op: 'rect', x, y: y + h / 2 - 3, w: bodyW, h: 6, fill: hexRgb(preview.centerColor) });
  }
  draws.push({ op: 'rect', x: x + bodyW, y, w: barW, h, fill: hexRgb('#101012') });
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
  const h = 26;
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
  const gymLogo = art?.gymLogo ?? null;
  const y = PAGE_H - 14 - mark;
  // Rightmost first, so a single mark sits in the corner and a pair sits side by side.
  for (const image of [selfie, gymLogo]) {
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
  const kindX = selfie || gymLogo ? 62 : PAGE_W - MARGIN_X - measure(kind, 8, true);
  const kindY = selfie || gymLogo ? PAGE_H - 58 : PAGE_H - 36;
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

function ring(box: RadarBox, value: number): { x: number; y: number }[] {
  return ASSESSMENT_AREAS.map((_, index) => chartPoint(index, value, box));
}

function seriesPolygon(values: readonly number[], box: RadarBox): { x: number; y: number }[] {
  return values.map((value, index) => chartPoint(index, value, box));
}

/** Distance from the chart center to the level-5 ring. Series vertices must stay inside it. */
export function outerRingRadius(box: RadarBox): number {
  const center = chartCenter(box);
  const spot = chartPoint(0, 5, box);
  return Math.hypot(spot.x - center.x, spot.y - center.y);
}

export function radarPolygonRadii(box: RadarBox, draws: readonly PdfDraw[]): number[] {
  const center = chartCenter(box);
  const radii: number[] = [];
  const visit = (list: readonly PdfDraw[]) => {
    for (const draw of list) {
      if (draw.op === 'poly') {
        for (const point of draw.points) radii.push(Math.hypot(point.x - center.x, point.y - center.y));
      } else if (draw.op === 'group') {
        if (draw.clip) {
          for (const point of draw.clip) radii.push(Math.hypot(point.x - center.x, point.y - center.y));
        }
        visit(draw.draws);
      }
    }
  };
  visit(draws);
  return radii;
}

function drawRadar(
  draws: PdfDraw[],
  box: RadarBox,
  current: readonly number[],
  previous: readonly number[] | null,
) {
  const center = chartCenter(box);
  const outer = ring(box, 5);
  for (const value of [1, 2, 3, 4]) {
    draws.push({ op: 'poly', points: ring(box, value), stroke: RULE, lineWidth: 0.7, lineJoin: 'round' });
  }
  for (let index = 0; index < ASSESSMENT_AREAS.length; index += 1) {
    const end = chartPoint(index, 5, box);
    draws.push({ op: 'line', x1: center.x, y1: center.y, x2: end.x, y2: end.y, color: RULE, lineWidth: 0.7 });
  }
  const series: PdfDraw[] = [];
  if (previous) {
    series.push({
      op: 'poly',
      points: seriesPolygon(previous, box),
      stroke: PREVIOUS,
      lineWidth: 1.35,
      dash: true,
      lineJoin: 'round',
    });
  }
  series.push({
    op: 'poly',
    points: seriesPolygon(current, box),
    fill: NAVY,
    fillOpacity: 0.4,
    stroke: GOLD,
    lineWidth: 1.8,
    lineJoin: 'round',
  });
  // Clip the series to the outer ring so a stroke cannot draw a second outline past the grid.
  draws.push({ op: 'group', clip: outer, draws: series });
  draws.push({ op: 'poly', points: outer, stroke: NAVY, lineWidth: 1.15, lineJoin: 'round' });

  const radius = outerRingRadius(box);
  for (const value of [1, 2, 3, 4, 5]) {
    const text = String(value);
    const y = center.y + (value / 5) * radius - 8;
    draws.push({
      op: 'text',
      text,
      x: center.x - measure(text, 7, false) - 4,
      y,
      size: 7,
      font: 'regular',
      color: MUTED,
    });
  }
  ASSESSMENT_AREAS.forEach((area, index) => {
    const spot = chartPoint(index, 5.55, box);
    const width = measure(area.label, 9, false);
    let x = spot.x - width / 2;
    if (spot.x < center.x - 8) x = spot.x - width - 4;
    else if (spot.x > center.x + 8) x = spot.x + 4;
    draws.push({ op: 'text', text: area.label, x, y: spot.y - 3, size: 9, font: 'regular', color: INK });
  });
}

function drawLegend(draws: PdfDraw[], x: number, top: number, previousDate: string | null) {
  const swatch = 16;
  const row = (label: string, y: number, paint: (y: number) => void) => {
    paint(y);
    draws.push({ op: 'text', text: label, x: x + swatch + 8, y, size: 9, font: 'regular', color: INK });
  };
  row('This check-in', PAGE_H - top - 10, (y) => {
    draws.push({ op: 'rect', x, y: y + 1, w: swatch, h: 7, fill: NAVY });
    draws.push({ op: 'rect', x, y: y + 1, w: swatch, h: 7, stroke: GOLD, lineWidth: 1.2 });
  });
  if (previousDate) {
    row(`Previous ${previousDate}`, PAGE_H - top - 28, (y) => {
      draws.push({
        op: 'line',
        x1: x,
        y1: y + 4,
        x2: x + swatch,
        y2: y + 4,
        color: PREVIOUS,
        lineWidth: 1.4,
        dash: true,
      });
    });
  }
}

function drawBars(draws: PdfDraw[], scores: readonly number[], x: number, top: number, width: number) {
  const labelW = 92;
  const numW = 16;
  const gap = 10;
  const barW = width - labelW - numW - gap;
  const barH = 7;
  const rowH = 16;
  scores.forEach((score, index) => {
    const area = ASSESSMENT_AREAS[index];
    if (!area) return;
    const baseline = PAGE_H - (top + index * rowH) - 12;
    draws.push({ op: 'text', text: area.label, x, y: baseline, size: 10, font: 'regular', color: INK });
    draws.push({ op: 'rect', x: x + labelW, y: baseline + 1, w: barW, h: barH, fill: TRACK });
    draws.push({
      op: 'rect',
      x: x + labelW,
      y: baseline + 1,
      w: Math.max(2, (score / 5) * barW),
      h: barH,
      fill: NAVY,
    });
    const num = String(score);
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

export type AssessmentLayout = { pages: PdfDraw[][]; radarBox: RadarBox | null };

export function layoutAssessment(report: StudentProgressReport, assessment: AssessmentState, issuedOn: string): AssessmentLayout {
  const identity = reportIdentity(report);
  const entries = [...assessment.entries].sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
  const state = freshPage();
  drawIdentity(state, 'Self-assessment', identity, issuedOn);

  const latest = entries[0];
  const previous = entries[1] ?? null;
  let radarBox: RadarBox | null = null;
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

    // The 320-unit radar view includes empty corners. Advance only through the rings and labels.
    const plot = 304;
    const scale = plot / 320;
    const contentRadius = 108 * (5.55 / 5) * scale + 11;
    const chartHeight = Math.ceil(contentRadius * 2);
    const bleed = (plot - chartHeight) / 2;
    ensure(state, chartHeight);
    const chartTop = state.top;
    radarBox = { x: MARGIN_X, y: PAGE_H - chartTop - chartHeight - bleed, size: plot, plot };
    const current = ASSESSMENT_AREAS.map((area) => latest.scores[area.id]);
    const prior = previous ? ASSESSMENT_AREAS.map((area) => previous.scores[area.id]) : null;
    drawRadar(state.draws, radarBox, current, prior);
    drawLegend(state.draws, MARGIN_X + plot + 12, chartTop + Math.max(0, (chartHeight - 36) / 2), previous?.date ?? null);
    state.top = chartTop + chartHeight + 4;
    drawBars(state.draws, current, MARGIN_X, state.top, CONTENT_W);
    state.top += ASSESSMENT_AREAS.length * 16 + 6;
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

    const earlier = entries.slice(1);
    if (earlier.length) {
      ensure(state, 24);
      textAt(state, 'Earlier check-ins', 12, 'bold', NAVY);
      state.top += 16;
      for (const entry of earlier) {
        const bits = [
          `${entry.date} — average ${assessmentAverage(entry.scores).toFixed(1)}`,
          ASSESSMENT_AREAS.map((area) => `${area.label} ${entry.scores[area.id]}`).join(', '),
        ];
        if (entry.note.trim()) bits.push(entry.note.trim());
        for (const bit of bits) drawWrapped(state, bit, 10, 'regular', INK, 3);
        state.top += 4;
      }
    }
  }
  return { pages: finish(state, 'SELF-ASSESSMENT'), radarBox };
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
  const images = [art.gymLogo, art.selfie].filter((image): image is PdfImageAsset => Boolean(image));
  return renderReportPages(finish(state, 'PROGRESS', art), images);
}

