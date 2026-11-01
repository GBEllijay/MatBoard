import { usePolishedSkinsUnlocked } from '../hooks/usePolishedSkins';
import { useTrainingSkin } from '../hooks/useStores';
import type { PolishedTimerSlug } from '../lib/polishedSkins';
import { setTrainingSkin, timerPickerSkins, visibleTrainingSkin, type TrainingSkin } from '../lib/trainingSkin';
import { EXISTING_SKIN_THUMBS, polishedThumb } from '../skins/thumbs';
import { SkinPicker, type SkinPickerOption } from './SkinPicker';

/**
 * Round timer Skin popup: Classic, Advantage, then the polished skins when this browser has
 * Media Edition or above, where this Skins button replaces the Classic / Advantage toggle.
 * Without it there is no popup at all (no lock tiles); the toggle stays as before. Remembered on this device.
 */
export function TimerSkinPicker({ buttonClassName }: { buttonClassName?: string }) {
  const skin = useTrainingSkin();
  const open = usePolishedSkinsUnlocked();
  // Without Media the Classic / Advantage toggle stays exactly as before and there is no popup.
  if (!open) return null;
  const options: SkinPickerOption[] = timerPickerSkins(open).map((s) => ({
    id: s.id,
    label: s.label,
    thumb: s.polished
      ? polishedThumb(s.id as PolishedTimerSlug, 'timer')
      : EXISTING_SKIN_THUMBS[s.id as keyof typeof EXISTING_SKIN_THUMBS],
  }));
  return (
    <SkinPicker
      label="Timer skins"
      value={visibleTrainingSkin(skin, open)}
      options={options}
      buttonClassName={buttonClassName}
      onChoose={(id) => setTrainingSkin(id as TrainingSkin)}
    />
  );
}
