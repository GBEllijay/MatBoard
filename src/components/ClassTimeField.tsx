import { WheelPicker } from './WheelPicker';
import {
  classTimeFromWheel,
  classTimeWheelOptions,
  classTimeWheelValue,
} from '../lib/classTime';

/**
 * Class time for one Daily Lesson Plan or Competition Class.
 * 15-minute steps on the shared scroll wheel, 12:00 AM through 11:45 PM,
 * labeled with AM/PM. Blank shows "—" and stays blank until the wheel moves.
 */
export function ClassTimeField({
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
  return (
    <div className="notes__time" id={id}>
      <span className="notes__time-label">Class time</span>
      <WheelPicker
        label="Class time"
        value={classTimeWheelValue(value)}
        options={classTimeWheelOptions(value)}
        disabled={readOnly}
        onChange={(next) => onChange(classTimeFromWheel(next, value))}
      />
    </div>
  );
}
