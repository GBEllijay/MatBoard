import { useSearchParams } from 'react-router-dom';
import { linkedBracketMatchId } from '../lib/bracketBout';
import { masterCarlosOnScoreboard } from '../lib/carlosCelebration';
import { isBasicCoach } from '../lib/productNames';
import {
  coachLinkedWhiteBoard,
  isCoachWhiteBoardSearch,
  isPlainWhiteScoreboard,
  visibleScoreboardSkin,
  withMatchOrigin,
  type ScoreboardSkinId,
} from '../lib/scoreboardSkin';
import { useCoachUnlocked } from './useCoachUnlocked';
import { useProUnlocked } from './useProUnlocked';
import { useSuiteOrigin } from './useSuiteOrigin';
import { useMatchState } from './useStores';

/**
 * Scoreboard and controller origin.
 * Pro suite (`from=suite`) keeps skins and Master Carlos.
 * Basic Coach linked bouts paint the Advantage White board.
 * Coach Unlimited keeps the linked-bout skin and does not show Carlos.
 */
export function useMatchBoard() {
  const [searchParams] = useSearchParams();
  const suite = useSuiteOrigin();
  const linkedId = linkedBracketMatchId(useMatchState().bracketMatchId);
  const basicCoach = isBasicCoach(useProUnlocked(), useCoachUnlocked());
  const whiteBoard = coachLinkedWhiteBoard(
    suite.fromSuite,
    Boolean(linkedId),
    basicCoach,
    isCoachWhiteBoardSearch(searchParams),
  );
  const plainWhite = isPlainWhiteScoreboard(suite.fromSuite, Boolean(linkedId), whiteBoard);
  const showCarlos = masterCarlosOnScoreboard(suite.fromSuite);

  const originPath = (path: string) =>
    withMatchOrigin(path, { fromSuite: suite.fromSuite, whiteBoard });

  const skinFor = (skin: ScoreboardSkinId) =>
    visibleScoreboardSkin(skin, suite.fromSuite, Boolean(linkedId), whiteBoard);

  return { suite, linkedId, plainWhite, showCarlos, whiteBoard, originPath, skinFor };
}
