import { HALF_OFF_NOTE } from '../lib/halfOff';

export function HalfOffCheckoutNote({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <p className="buy__half-off" role="note">
      {HALF_OFF_NOTE}
    </p>
  );
}
