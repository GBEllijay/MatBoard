/**
 * Layout for the shared scoreboard and round-timer skin picker.
 * Tiles stay one fixed size. The popup is 3 columns on a phone and 4 or 5
 * on a wide screen, and it scrolls vertically when the catalog is taller
 * than the cap. Advantage White still passes only its three base skins;
 * this module does not add or hide a skin by tier.
 */

export type SkinPickerSectionId = 'advantage' | 'mine';

export type SkinPickerLayoutOption = {
  id: string;
  section?: SkinPickerSectionId;
};

export const SKIN_PICKER_SECTION_LABEL: Record<SkinPickerSectionId, string> = {
  advantage: 'Advantage skins',
  mine: 'My skins',
};

/** Fixed tile, slightly larger than the old 3.35rem thumb. CSS mirrors these. */
export const SKIN_TILE_WIDTH_REM = 5.6;
export const SKIN_TILE_IMAGE_REM = 4.15;

const PHONE_COLUMNS_BELOW = 720;
const FIVE_COLUMNS_FROM = 1100;

/** Phone: 3. Tablet and small laptop: 4. TV, cast, and wide desktop: 5. */
export function skinPickerColumnCount(viewportWidth: number): 3 | 4 | 5 {
  if (viewportWidth >= FIVE_COLUMNS_FROM) return 5;
  if (viewportWidth >= PHONE_COLUMNS_BELOW) return 4;
  return 3;
}

/** True for a gym TV or a cast-sized window, where the popup must stay short. */
export function skinPickerIsTv(viewportWidth: number, viewportHeight: number): boolean {
  return viewportWidth >= 1200 || (viewportWidth >= 960 && viewportHeight >= 800);
}

export function skinPickerPopupWidth(viewportWidth: number, rootFontPx = 16): number {
  const cols = skinPickerColumnCount(viewportWidth);
  const tile = SKIN_TILE_WIDTH_REM * rootFontPx;
  const gap = 0.45 * rootFontPx;
  const pad = 0.65 * 2 * rootFontPx;
  const raw = cols * tile + (cols - 1) * gap + pad;
  const max = Math.max(240, viewportWidth - 16);
  return Math.round(Math.min(raw, max));
}

/**
 * Cap the scroller. When the list is taller than the cap, the height stops
 * part-way through the next row so that row peeks under the fade.
 * Phone cap is about 60% of the screen (max 460px). TV/cast stays near 440px
 * so a full catalog still leaves the next row peeking and the board visible.
 */
export function skinPickerScrollMax(input: {
  viewportWidth: number;
  viewportHeight: number;
  /** Space between the Skins button and the screen edge the popup opens into. */
  space: number;
  rowHeight: number;
  contentHeight: number;
}): number {
  const tv = skinPickerIsTv(input.viewportWidth, input.viewportHeight);
  const cap = Math.min(Math.max(0, input.space - 8), input.viewportHeight * (tv ? 0.46 : 0.6), tv ? 440 : 460);
  const available = Math.max(168, Math.round(cap));
  if (input.contentHeight <= available) return Math.max(0, Math.round(input.contentHeight));
  const row = Math.max(72, Math.round(input.rowHeight));
  const peek = Math.round(row * 0.42);
  const rows = Math.max(1, Math.floor((available - peek) / row));
  return Math.min(available, rows * row + peek);
}

export type SkinPickerGroup<T extends SkinPickerLayoutOption> = {
  id: SkinPickerSectionId;
  label: string;
  options: T[];
};

/**
 * Advantage skins first. My skins stays hidden while it has no tiles, unless
 * the caller is showing the upload tile (that lands with custom skins).
 */
export function groupSkinPickerOptions<T extends SkinPickerLayoutOption>(
  options: readonly T[],
  showMine = false,
): SkinPickerGroup<T>[] {
  const advantage = options.filter((option) => (option.section ?? 'advantage') === 'advantage');
  const mine = options.filter((option) => option.section === 'mine');
  const groups: SkinPickerGroup<T>[] = [];
  if (advantage.length) {
    groups.push({ id: 'advantage', label: SKIN_PICKER_SECTION_LABEL.advantage, options: advantage });
  }
  if (showMine || mine.length) {
    groups.push({ id: 'mine', label: SKIN_PICKER_SECTION_LABEL.mine, options: mine });
  }
  return groups;
}

/**
 * Faces for the cascaded thumbnail button.
 * Up to three skins, current one last so it paints on top.
 * The two behind it are the next skins in the list, wrapping around.
 */
export function skinStackFaces<T extends { id: string }>(options: readonly T[], value: string): T[] {
  if (options.length === 0) return [];
  const found = options.findIndex((option) => option.id === value);
  const index = found >= 0 ? found : 0;
  const count = Math.min(3, options.length);
  const faces: T[] = [];
  for (let step = count - 1; step >= 1; step -= 1) {
    const face = options[(index + step) % options.length];
    if (face) faces.push(face);
  }
  const current = options[index];
  if (current) faces.push(current);
  return faces;
}

/** The open picker scrolls the selected radio into view. Returns false when it is missing. */
export function scrollSkinOptionIntoView(root: ParentNode, selectedId: string): boolean {
  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(selectedId) : selectedId.replace(/"/g, '');
  const selected = root.querySelector<HTMLElement>(`[data-skin-option="${escaped}"]`);
  if (!selected || typeof selected.scrollIntoView !== 'function') return false;
  selected.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}
