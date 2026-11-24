import { useCustomSkinSection } from '../hooks/useCustomSkinSection';
import { usePolishedSkinsUnlocked, useWhiteBaseSkins } from '../hooks/usePolishedSkins';
import { useWhiteUnlocked } from '../hooks/useWhiteUnlocked';
import { whiteProductFeaturesOpen } from '../lib/whiteSkinTier';
import { useSuiteOrigin } from '../hooks/useSuiteOrigin';
import { useTrainingSkin } from '../hooks/useStores';
import type { PolishedTimerSlug } from '../lib/polishedSkins';
import { setTrainingSkin, timerPickerSkins, visibleTrainingSkin, type TrainingSkin } from '../lib/trainingSkin';
import { EXISTING_SKIN_THUMBS, polishedThumb } from '../skins/thumbs';
import { SkinPicker, type SkinPickerOption } from './SkinPicker';

/**
 * Round timer Skin popup.
 * Advantage BJJ Scoreboard: the White timer skins plus the polished families.
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
  const whiteProductOpen = whiteProductFeaturesOpen(useSuiteOrigin().fromWhite, whiteBase, useWhiteUnlocked());
  const skinsOpen = open || whiteProductOpen;
  const custom = useCustomSkinSection(skinsOpen, (id) => setTrainingSkin(id as TrainingSkin));
  if (!skinsOpen) return null;
  const options: SkinPickerOption[] = [
    ...timerPickerSkins(open, whiteBase, whiteProductOpen).map((s) => ({
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
      value={visibleTrainingSkin(skin, open, whiteBase, whiteProductOpen)}
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
