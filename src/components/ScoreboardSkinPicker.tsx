import { useMatchBoard } from '../hooks/useMatchBoard';
import { useMatchState } from '../hooks/useStores';
import { dispatchMatch } from '../lib/matchStore';
import { parseScoreboardSkin, scoreboardPickerSkins } from '../lib/scoreboardSkin';
import { EXISTING_SKIN_THUMBS, polishedThumb } from '../skins/thumbs';
import { SkinPicker, type SkinPickerOption } from './SkinPicker';

/**
 * Scoreboard Skin popup for the Display and Controller.
 * Advantage White (no higher tier): Mock-Tournament, Old School, and Quick Result.
 * Media Edition and above: the skins this board already offered, then the polished skins.
 * Anyone else keeps the old controls (no Skins button, no lock tiles, no upsell).
 * The pick is stored with the match on this device, so Display and cast follow it.
 */
export function ScoreboardSkinPicker({ buttonClassName }: { buttonClassName?: string }) {
  const match = useMatchState();
  const board = useMatchBoard();
  if (board.kidsSkin || (!board.polishedOpen && !board.whiteBaseSkins)) return null;
  const options: SkinPickerOption[] = scoreboardPickerSkins(board.plainWhite, board.polishedOpen, board.whiteBaseSkins).map((skin) => ({
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
