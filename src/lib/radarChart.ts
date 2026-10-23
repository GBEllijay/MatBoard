/**
 * Shared radar geometry for self-assessment and opponent overlay.
 * The self-assessment label and the top spoke stay fixed so the chart
 * refactor does not move the shape.
 */

import { ASSESSMENT_AREAS, type AssessmentScores } from './studentAssessment.ts';

export const RADAR_CENTER = 160;
export const RADAR_RADIUS = 108;

export function radarPoint(index: number, value: number, radius = RADAR_RADIUS): { x: number; y: number } {
  const theta = -Math.PI / 2 + (index * 2 * Math.PI) / ASSESSMENT_AREAS.length;
  const span = (value / 5) * radius;
  return { x: RADAR_CENTER + Math.cos(theta) * span, y: RADAR_CENTER + Math.sin(theta) * span };
}

export function radarPoints(values: readonly number[], radius = RADAR_RADIUS): string {
  return values
    .map((value, index) => {
      const spot = radarPoint(index, value, radius);
      return `${spot.x},${spot.y}`;
    })
    .join(' ');
}

export function selfAssessmentShapeLabel(scores: AssessmentScores | null): string {
  if (!scores) return 'Self-assessment shape. No saved ratings yet.';
  const bits = ASSESSMENT_AREAS.map((area) => `${area.label} ${scores[area.id]}`).join(', ');
  return `Self-assessment shape, ${bits}`;
}

export function radarSeriesLabel(series: readonly { name: string; scores: AssessmentScores | null }[]): string {
  const described = series.map((item) => {
    if (!item.scores) return `${item.name} has no ratings`;
    const bits = ASSESSMENT_AREAS.map((area) => `${area.label} ${item.scores?.[area.id]}`).join(', ');
    return `${item.name}: ${bits}`;
  });
  const me = series.find((item) => item.name === 'Me');
  const them = series.find((item) => item.name !== 'Me');
  if (me && them) return `Me versus ${them.name}. ${described.join('. ')}`;
  if (series.length === 1 && series[0]?.scores) {
    const only = series[0];
    const bits = ASSESSMENT_AREAS.map((area) => `${area.label} ${only.scores?.[area.id]}`).join(', ');
    return `${only.name} shape, ${bits}`;
  }
  if (!described.length) return 'No ratings yet.';
  return described.join('. ');
}
