import { usePolishedSkinsUnlocked } from '../hooks/usePolishedSkins';
import { useTrainingSkin } from '../hooks/useStores';
import { POLISHED_SKINS } from '../lib/polishedSkins';
import { setTrainingSkin, visibleTrainingSkin, type TrainingSkin } from '../lib/trainingSkin';
import { EXISTING_SKIN_THUMBS, polishedThumb } from '../skins/thumbs';
import { SkinPicker, type SkinPickerOption } from './SkinPicker';

/** Round timer Skin popup: Classic, Advantage, then the polished skins (locked below Media Edition). Remembered on this device. */
export function TimerSkinPicker({ buttonClassName }: { buttonClassName?: string }) {
  const skin = useTrainingSkin();
  const open = usePolishedSkinsUnlocked();
  const options: SkinPickerOption[] = [
    { id: 'classic', label: 'Classic', thumb: EXISTING_SKIN_THUMBS.classic },
    { id: 'themed', label: 'Advantage', thumb: EXISTING_SKIN_THUMBS.themed },
    ...POLISHED_SKINS.map((s) => ({ id: s.slug, label: s.label, thumb: polishedThumb(s.slug, 'timer'), locked: !open })),
  ];
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
