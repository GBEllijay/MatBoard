/**
 * Shared radar geometry for self-assessment and opponent overlay.
 * One spoke per D8 face, Sweeps included, in check-in order. The top spoke stays Guard/Control.
 * A face that is not rated (an older day without Sweeps) is named "not rated", never 0.
 */

import { ASSESSMENT_FORM_AREAS, isAssessmentScore, type AssessmentScores } from './studentAssessment.ts';

const RADAR_AREAS = ASSESSMENT_FORM_AREAS;

function scoreText(scores: Partial<AssessmentScores> | null | undefined, id: (typeof RADAR_AREAS)[number]['id']): string {
  const value = scores?.[id];
  return isAssessmentScore(value) ? String(value) : 'not rated';
}

export const RADAR_CENTER = 160;
export const RADAR_RADIUS = 108;

export function radarPoint(index: number, value: number, radius = RADAR_RADIUS): { x: number; y: number } {
  const theta = -Math.PI / 2 + (index * 2 * Math.PI) / ASSESSMENT_FORM_AREAS.length;
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

export function selfAssessmentShapeLabel(scores: Partial<AssessmentScores> | null): string {
  if (!scores || !RADAR_AREAS.some((area) => isAssessmentScore(scores[area.id]))) {
    return 'Self-assessment shape. No saved ratings yet.';
  }
  const bits = RADAR_AREAS.map((area) => `${area.label} ${scoreText(scores, area.id)}`).join(', ');
  return `Self-assessment shape, ${bits}`;
}

export function radarSeriesLabel(series: readonly { name: string; scores: AssessmentScores | null }[]): string {
  const described = series.map((item) => {
    if (!item.scores) return `${item.name} has no ratings`;
    const bits = RADAR_AREAS.map((area) => `${area.label} ${scoreText(item.scores, area.id)}`).join(', ');
    return `${item.name}: ${bits}`;
  });
  const me = series.find((item) => item.name === 'Me');
  const them = series.find((item) => item.name !== 'Me');
  if (me && them) return `Me versus ${them.name}. ${described.join('. ')}`;
  if (series.length === 1 && series[0]?.scores) {
    const only = series[0];
    const bits = RADAR_AREAS.map((area) => `${area.label} ${scoreText(only.scores, area.id)}`).join(', ');
    return `${only.name} shape, ${bits}`;
  }
  if (!described.length) return 'No ratings yet.';
  return described.join('. ');
}
