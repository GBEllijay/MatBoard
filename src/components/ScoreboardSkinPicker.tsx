import { useMatchBoard } from '../hooks/useMatchBoard';
import { useMatchState } from '../hooks/useStores';
import { dispatchMatch } from '../lib/matchStore';
import {
  POLISHED_SCOREBOARD_SKINS,
  pickerBaseScoreboardSkins,
  parseScoreboardSkin,
} from '../lib/scoreboardSkin';
import { EXISTING_SKIN_THUMBS, polishedThumb } from '../skins/thumbs';
import { SkinPicker, type SkinPickerOption } from './SkinPicker';

/**
 * Scoreboard Skin popup for the Display and Controller.
 * Lists the skins this board already offered, then the polished skins (locked below Media Edition).
 * The pick is stored with the match on this device, so Display and cast follow it.
 */
export function ScoreboardSkinPicker({ buttonClassName }: { buttonClassName?: string }) {
  const match = useMatchState();
  const board = useMatchBoard();
  if (board.kidsSkin) return null;
  const options: SkinPickerOption[] = [
    ...pickerBaseScoreboardSkins(board.plainWhite).map((skin) => ({
      id: skin.id,
      label: skin.label,
      thumb: EXISTING_SKIN_THUMBS[skin.id as keyof typeof EXISTING_SKIN_THUMBS],
    })),
    ...POLISHED_SCOREBOARD_SKINS.map((skin) => ({
      id: skin.id,
      label: skin.label,
      thumb: polishedThumb(skin.slug, 'scoreboard'),
      locked: !board.polishedOpen,
    })),
  ];
  return (
    <SkinPicker
      label="Scoreboard skins"
      value={board.skinFor(match.skin)}
      options={options}
      buttonClassName={buttonClassName}
      onChoose={(id) => dispatchMatch({ type: 'setSkin', value: parseScoreboardSkin(id) })}
    />
  );
}
