import { useMatchBoard } from '../hooks/useMatchBoard';
import { useMatchState } from '../hooks/useStores';
import { dispatchMatch } from '../lib/matchStore';
import { parseScoreboardSkin, scoreboardPickerSkins } from '../lib/scoreboardSkin';
import { EXISTING_SKIN_THUMBS, polishedThumb } from '../skins/thumbs';
import { SkinPicker, type SkinPickerOption } from './SkinPicker';

/**
 * Scoreboard Skin popup for the Display and Controller.
 * Media Edition and above only: lists the skins this board already offered (Mock Tournament,
 * plus Old School and Quick Result on suite boards), then the polished skins. Without Media it
 * renders nothing and the board keeps its old controls (no lock tiles, no upsell).
 * The pick is stored with the match on this device, so Display and cast follow it.
 */
export function ScoreboardSkinPicker({ buttonClassName }: { buttonClassName?: string }) {
  const match = useMatchState();
  const board = useMatchBoard();
  // Without Media the board keeps its old controls exactly (no Skins button anywhere).
  if (board.kidsSkin || !board.polishedOpen) return null;
  const options: SkinPickerOption[] = scoreboardPickerSkins(board.plainWhite, board.polishedOpen).map((skin) => ({
    id: skin.id,
    label: skin.label,
    thumb: skin.slug
      ? polishedThumb(skin.slug, 'scoreboard')
      : EXISTING_SKIN_THUMBS[skin.id as keyof typeof EXISTING_SKIN_THUMBS],
  }));
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
