import { useCustomSkinSection } from '../hooks/useCustomSkinSection';
import { usePolishedSkinsUnlocked, useWhiteBaseSkins } from '../hooks/usePolishedSkins';
import { useTrainingSkin } from '../hooks/useStores';
import type { PolishedTimerSlug } from '../lib/polishedSkins';
import { setTrainingSkin, timerPickerSkins, visibleTrainingSkin, type TrainingSkin } from '../lib/trainingSkin';
import { EXISTING_SKIN_THUMBS, polishedThumb } from '../skins/thumbs';
import { SkinPicker, type SkinPickerOption } from './SkinPicker';

/**
 * Round timer Skin popup.
 * Advantage White (no higher tier): Mock-Tournament, Old School, and Quick Result.
 * Media Edition and above: Classic, Advantage, then the polished skins. This button
 * replaces the Classic / Advantage toggle. Anyone else keeps that toggle (no lock tiles).
 * Remembered on this device.
 */
export function TimerSkinPicker({
  buttonClassName,
  appearance = 'chip',
}: {
  buttonClassName?: string;
  appearance?: 'chip' | 'stack';
}) {
  const skin = useTrainingSkin();
  const open = usePolishedSkinsUnlocked();
  const whiteBase = useWhiteBaseSkins();
  const custom = useCustomSkinSection(open, (id) => setTrainingSkin(id as TrainingSkin));
  if (!open && !whiteBase) return null;
  const options: SkinPickerOption[] = [
    ...timerPickerSkins(open, whiteBase).map((s) => ({
      id: s.id,
      label: s.label,
      thumb: s.polished
        ? polishedThumb(s.id as PolishedTimerSlug, 'timer')
        : EXISTING_SKIN_THUMBS[s.id as keyof typeof EXISTING_SKIN_THUMBS],
    })),
    ...custom.options,
  ];
  return (
    <SkinPicker
      label="Timer skins"
      value={visibleTrainingSkin(skin, open, whiteBase)}
      options={options}
      buttonClassName={buttonClassName}
      appearance={appearance}
      showMine={custom.showMine}
      mineExtra={custom.mineExtra}
      renderTileExtra={custom.renderTileExtra}
      onChoose={(id) => setTrainingSkin(id as TrainingSkin)}
    />
  );
}
