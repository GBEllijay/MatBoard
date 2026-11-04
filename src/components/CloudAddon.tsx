import '../pages/buyTiers.css';
import {
  CLOUD_ADDON_CHECKBOX,
  CLOUD_ADDON_LINE,
  INSTRUCTOR_CLOUD_FIT,
  INSTRUCTOR_CLOUD_LIMIT,
} from '../lib/productPrices';

/** Media, Instructor, and Pro only. Unchecked leaves the one-time checkout unchanged. */
export function CloudAddonChoice({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="buy__cloud">
      <input
        type="checkbox"
        name="advantageCloud"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{CLOUD_ADDON_CHECKBOX}</span>
    </label>
  );
}

export function CloudAddonLine() {
  return <p className="buy__cloud-line">{CLOUD_ADDON_LINE}</p>;
}

export function InstructorCloudCopy() {
  return (
    <div className="buy__cloud-copy">
      <p>{INSTRUCTOR_CLOUD_FIT}</p>
      <p>{INSTRUCTOR_CLOUD_LIMIT}</p>
    </div>
  );
}
