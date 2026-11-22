import { PREVIEW_WHITE_BADGE_TEXT, isPreviewWhiteUnlocked } from '../lib/previewWhiteBypass';

/** Visible only on Pages preview hosts where the White gate is temporarily open. */
export function PreviewWhiteBadge() {
  if (!isPreviewWhiteUnlocked()) return null;
  return (
    <p className="preview-white-badge" role="status">
      {PREVIEW_WHITE_BADGE_TEXT}
    </p>
  );
}
