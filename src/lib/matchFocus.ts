import type { Side } from './matchStore';

/** Scoreboard labels that open Controller and focus a matching field. */
export const DISPLAY_FOCUS_IDS = {
  'blue-name': 'match-field-blue-name',
  'blue-gym': 'match-field-blue-gym',
  'white-name': 'match-field-white-name',
  'white-gym': 'match-field-white-gym',
  round: 'match-field-round',
  division: 'match-field-division',
} as const;

export type DisplayFocus = keyof typeof DISPLAY_FOCUS_IDS;

export function competitorFocus(side: Side, field: 'name' | 'gym'): DisplayFocus {
  return `${side}-${field}`;
}

export function parseDisplayFocus(value: string | null): DisplayFocus | null {
  if (!value) return null;
  return Object.hasOwn(DISPLAY_FOCUS_IDS, value) ? (value as DisplayFocus) : null;
}

export function displayFocusId(focus: DisplayFocus): string {
  return DISPLAY_FOCUS_IDS[focus];
}

export function controllerFocusPath(focus?: DisplayFocus): string {
  return focus ? `/match/control?focus=${focus}` : '/match/control';
}
