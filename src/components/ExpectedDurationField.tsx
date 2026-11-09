import { WheelPicker } from './WheelPicker';
import { EXPECTED_MINUTE_OPTIONS, expectedMinutes, formatExpectedDuration } from '../lib/expectedDuration';

/**
 * Expected duration for one lesson or curriculum block.
 * 15-second steps on the shared scroll wheel, 0:30 through 60:00, labeled m:ss.
 * Blank shows 5:00, the default, and stays blank until the wheel moves.
 */
export function ExpectedDurationField({
  id,
  value,
  readOnly,
  onChange,
}: {
  id: string;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  const minutes = expectedMinutes(value);
  return (
    <div className="notes__time" id={id}>
      <span className="notes__time-label">Expected Duration</span>
      <WheelPicker
        label="Expected Duration"
        value={minutes}
        options={EXPECTED_MINUTE_OPTIONS}
        disabled={readOnly}
        onChange={(next) => onChange(formatExpectedDuration(next))}
      />
    </div>
  );
}
