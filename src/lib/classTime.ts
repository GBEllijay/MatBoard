/**
 * Class time on a Daily Lesson Plan or Competition Class.
 * The coach picks it on the shared scroll wheel (`WheelPicker`), in 15-minute
 * steps from 12:00 AM through 11:45 PM. Hour marks are slow-scroll detents.
 *
 * The stored value stays a short display string such as "5:00 PM", the same
 * format existing plans already use. Opening the wheel does not rewrite a
 * saved time. Choosing a row writes the standard "h:mm AM/PM" label.
 * A saved off-step time ("5:10 PM") or older free text ("evening") stays on
 * the wheel as an extra row until the coach picks another time. Blank stays
 * blank; the first row is "—" so a time can be cleared.
 */
import type { WheelOption } from './timeWheel.ts';

export const CLASS_TIME_STEP_MINUTES = 15;
export const CLASS_TIME_MINUTES_PER_DAY = 24 * 60;
/** Sentinel for a cleared / unset class time. */
export const CLASS_TIME_BLANK_VALUE = -1;
/** Sentinel for saved free text that could not be parsed as a clock time. */
export const CLASS_TIME_CUSTOM_VALUE = -2;

const TWELVE_HOUR =
  /^(\d{1,2})(?::(\d{2}))?\s*([AaPp])(?:\.?[Mm]\.?)?$/;
const TWENTY_FOUR_HOUR = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

export function clampClassTimeMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return 0;
  const rounded = Math.round(minutes);
  const day = ((rounded % CLASS_TIME_MINUTES_PER_DAY) + CLASS_TIME_MINUTES_PER_DAY) % CLASS_TIME_MINUTES_PER_DAY;
  return day;
}

/** "5:00 PM", "12:00 AM", "9:05 AM". */
export function formatClassTimeLabel(minutes: number): string {
  const total = clampClassTimeMinutes(minutes);
  const hours24 = Math.floor(total / 60);
  const mins = total % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${suffix}`;
}

/**
 * Minutes from midnight, or null when the text is blank or not a clock time.
 * "5:00 PM", "5pm", and "5:00 p.m." are 12-hour. "17:00" and "09:30" are
 * 24-hour. A bare "5:00" or "5" with no AM/PM is left alone, because it
 * could be morning or evening.
 */
export function parseClassTimeMinutes(text: string): number | null {
  const raw = text.trim();
  if (!raw) return null;

  const twelve = TWELVE_HOUR.exec(raw);
  if (twelve) {
    const hours12 = Number(twelve[1]);
    const mins = twelve[2] == null ? 0 : Number(twelve[2]);
    if (hours12 < 1 || hours12 > 12 || mins > 59) return null;
    const meridiem = twelve[3].toLowerCase();
    let hours24 = hours12 % 12;
    if (meridiem === 'p') hours24 += 12;
    return hours24 * 60 + mins;
  }

  const twentyFour = TWENTY_FOUR_HOUR.exec(raw);
  if (twentyFour) {
    const hours = Number(twentyFour[1]);
    const mins = Number(twentyFour[2]);
    if (hours > 23 || mins > 59) return null;
    // "5:00" or "12:30" without AM/PM is ambiguous. Accept a 24-hour time
    // when the hour is 0 or 13–23, or when the hour was written with a
    // leading zero ("09:30").
    const hourToken = twentyFour[1];
    const unambiguous = hours === 0 || hours > 12 || hourToken.length === 2;
    if (!unambiguous) return null;
    return hours * 60 + mins;
  }

  return null;
}

function quarterHourOptions(): WheelOption[] {
  const options: WheelOption[] = [];
  for (let minutes = 0; minutes < CLASS_TIME_MINUTES_PER_DAY; minutes += CLASS_TIME_STEP_MINUTES) {
    options.push({
      value: minutes,
      label: formatClassTimeLabel(minutes),
      detent: minutes % 60 === 0,
    });
  }
  return options;
}

const QUARTER_HOUR_OPTIONS = quarterHourOptions();

export const CLASS_TIME_BLANK_OPTION: WheelOption = {
  value: CLASS_TIME_BLANK_VALUE,
  label: '—',
};

/**
 * Quarter-hour rows, a leading "—" to clear the field, plus one saved off-step
 * or unparsed time if the plan already has one.
 */
export function classTimeWheelOptions(text: string): WheelOption[] {
  const trimmed = text.trim();
  const options: WheelOption[] = [CLASS_TIME_BLANK_OPTION, ...QUARTER_HOUR_OPTIONS];
  if (!trimmed) return options;
  const parsed = parseClassTimeMinutes(trimmed);
  if (parsed == null) {
    return [CLASS_TIME_BLANK_OPTION, { value: CLASS_TIME_CUSTOM_VALUE, label: trimmed }, ...QUARTER_HOUR_OPTIONS];
  }
  if (options.some((option) => option.value === parsed)) return options;
  const saved: WheelOption = { value: parsed, label: formatClassTimeLabel(parsed), detent: false };
  return [...options, saved].sort((a, b) => a.value - b.value);
}

export function classTimeWheelValue(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return CLASS_TIME_BLANK_VALUE;
  const parsed = parseClassTimeMinutes(trimmed);
  return parsed == null ? CLASS_TIME_CUSTOM_VALUE : parsed;
}

/** Stored string written when a wheel row is chosen. */
export function classTimeFromWheel(value: number, previous = ''): string {
  if (value === CLASS_TIME_BLANK_VALUE) return '';
  if (value === CLASS_TIME_CUSTOM_VALUE) return previous.trim();
  if (!Number.isFinite(value)) return previous;
  return formatClassTimeLabel(clampClassTimeMinutes(value));
}
