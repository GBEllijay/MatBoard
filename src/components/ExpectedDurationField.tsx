import { WheelPicker } from './WheelPicker';
import { EXPECTED_MINUTE_OPTIONS, expectedMinutes } from '../lib/expectedDuration';

/**
 * Expected duration for one lesson or curriculum block.
 * Whole minutes on the shared scroll wheel. Blank shows 5, the default.
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
        onChange={(next) => onChange(String(next))}
      />
    </div>
  );
}
