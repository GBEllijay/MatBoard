import { useSearchParams } from 'react-router-dom';
import { COACH_UNLIMITED_PATH, SUITE_FROM, UNLIMITED_FROM, WHITE_BOARD_FROM, withHubFrom, withSuiteFrom } from '../lib/productNames';
import { WHITE_BRACKETS_PATH } from '../lib/bracketRosterStore';

/** Suite hub visits keep the mat theme and return to `/suite`. White visits stay on `/white`. */
export function useSuiteOrigin() {
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from');
  const fromSuite = from === SUITE_FROM;
  const fromUnlimited = from === UNLIMITED_FROM;
  const fromWhite = from === WHITE_BOARD_FROM;
  return {
    fromSuite,
    fromUnlimited,
    fromWhite,
    homePath: fromSuite ? '/suite' : fromUnlimited ? COACH_UNLIMITED_PATH : '/white',
    withFrom(path: string) {
      if (fromWhite) {
        if (path === '/tournament' || path.startsWith('/tournament?')) return WHITE_BRACKETS_PATH;
        return withHubFrom(path, WHITE_BOARD_FROM);
      }
      if (fromUnlimited && !fromSuite) return withHubFrom(path, UNLIMITED_FROM);
      return withSuiteFrom(path, fromSuite);
    },
  };
}
