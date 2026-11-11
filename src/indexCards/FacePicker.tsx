/**
 * Pick one of the eight D8 faces. There is no "Other": a move on the D8 always has a face.
 */
import { INDEX_FACE_IDS, type IndexFaceId } from '../lib/indexCards.ts';
import { GLOSSARY_FACE_LABELS } from '../lib/glossary.ts';

export function FacePicker({
  value,
  onChange,
  label = 'D8 face',
  prompt = false,
}: {
  value: IndexFaceId | null;
  onChange: (faceId: IndexFaceId) => void;
  label?: string;
  /** Draws attention when the move is not in the glossary and the student has to say where it goes. */
  prompt?: boolean;
}) {
  return (
    <fieldset className="gl-faces" data-testid="face-picker" data-prompt={prompt ? 'true' : 'false'}>
      <legend className="d8sf-kicker">{label}</legend>
      <div className="gl-face-chips" role="group" aria-label={label}>
        {INDEX_FACE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="gl-face-chip"
            data-face-pick={id}
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            {GLOSSARY_FACE_LABELS[id]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
