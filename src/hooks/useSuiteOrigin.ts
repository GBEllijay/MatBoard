import { useSearchParams } from 'react-router-dom';
import { SUITE_FROM, withSuiteFrom } from '../lib/productNames';

/** Suite hub visits keep the mat theme and return to `/suite`. White visits stay on `/white`. */
export function useSuiteOrigin() {
  const [searchParams] = useSearchParams();
  const fromSuite = searchParams.get('from') === SUITE_FROM;
  return {
    fromSuite,
    homePath: fromSuite ? '/suite' : '/white',
    withFrom(path: string) {
      return withSuiteFrom(path, fromSuite);
    },
  };
}
