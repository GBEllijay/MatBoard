import { useSearchParams } from 'react-router-dom';
import { SUITE_FROM, UNLIMITED_FROM, withHubFrom, withSuiteFrom } from '../lib/productNames';

/** Suite hub visits keep the mat theme and return to `/suite`. White visits stay on `/white`. */
export function useSuiteOrigin() {
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from');
  const fromSuite = from === SUITE_FROM;
  const fromUnlimited = from === UNLIMITED_FROM;
  return {
    fromSuite,
    fromUnlimited,
    homePath: fromSuite ? '/suite' : '/white',
    withFrom(path: string) {
      if (fromUnlimited && !fromSuite) return withHubFrom(path, UNLIMITED_FROM);
      return withSuiteFrom(path, fromSuite);
    },
  };
}
