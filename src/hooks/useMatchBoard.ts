import { useSearchParams } from 'react-router-dom';
import { linkedBracketMatchId } from '../lib/bracketBout';
import { grandmasterOnScoreboard } from '../lib/grandmasterCelebration';
import { kidsSkinFromSearch, withKidsSkin } from '../lib/kidsScoreboard';
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
import { usePolishedSkinsUnlocked, useWhiteBaseSkins } from './usePolishedSkins';
import { useProUnlocked } from './useProUnlocked';
import { useSuiteOrigin } from './useSuiteOrigin';
import { useMatchState } from './useStores';

/**
 * Scoreboard and controller origin.
 * Pro suite (`from=suite`) keeps skins and the grandmaster cheer.
 * Basic Coach linked bouts paint the Advantage White board.
 * Coach Unlimited keeps the linked-bout skin and does not show the grandmaster cheer.
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
  const showGrandmaster = grandmasterOnScoreboard(suite.fromSuite);
  const kidsSkin = kidsSkinFromSearch(searchParams);
  /** Media Edition and above: the polished skins paint and can be picked. */
  const polishedOpen = usePolishedSkinsUnlocked();
  /** Advantage White and no tier above it: the three base skins, on this bout too. */
  const whiteBaseSkins = useWhiteBaseSkins();

  const originPath = (path: string) =>
    withKidsSkin(
      withMatchOrigin(path, { fromSuite: suite.fromSuite, fromUnlimited: suite.fromUnlimited, whiteBoard }),
      kidsSkin,
    );

  const skinFor = (skin: ScoreboardSkinId) =>
    visibleScoreboardSkin(skin, suite.fromSuite, Boolean(linkedId), whiteBoard, polishedOpen, whiteBaseSkins);

  return { suite, linkedId, plainWhite, showGrandmaster, whiteBoard, kidsSkin, polishedOpen, whiteBaseSkins, originPath, skinFor };
}
