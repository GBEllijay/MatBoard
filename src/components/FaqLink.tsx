import { Link } from 'react-router-dom';
import { FAQ_PATH } from '../lib/faq';

/** Sits beside Instructions. Does not change the Instructions copy. */
export function FaqLink({ to = FAQ_PATH }: { to?: string }) {
  return (
    <p className="home__soon">
      <Link className="home__text-btn" to={to}>
        FAQ
      </Link>
    </p>
  );
}
