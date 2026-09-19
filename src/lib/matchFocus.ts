import type { Side } from './matchStore';

export type CompetitorFocusField = 'name' | 'gym';
export type CompetitorFocus = `${Side}-${CompetitorFocusField}`;

export function competitorFocusPath(side: Side, field: CompetitorFocusField): string {
  return `/match/control?focus=${side}-${field}`;
}

export function competitorFocusId(side: Side, field: CompetitorFocusField): string {
  return `match-field-${side}-${field}`;
}

export function parseCompetitorFocus(value: string | null): { side: Side; field: CompetitorFocusField } | null {
  if (value === 'blue-name' || value === 'blue-gym' || value === 'white-name' || value === 'white-gym') {
    const [side, field] = value.split('-') as [Side, CompetitorFocusField];
    return { side, field };
  }
  return null;
}
