import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ACCOUNT_PATH, ACCOUNT_SIGN_IN_FROM_HOME, LOGIN_EVENT, readLoginHint } from '../lib/emailLogin';
import { returningUserPrompt } from '../lib/returningUser';

/**
 * Small line on /products. Signed out: "Returning user? Sign in here" (back to this page after).
 * Signed in: "Signed in as <masked email>. Account".
 */
export function ReturningUserPrompt() {
  const [hint, setHint] = useState(() => readLoginHint());
  useEffect(() => {
    const update = () => setHint(readLoginHint());
    window.addEventListener(LOGIN_EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(LOGIN_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  const prompt = returningUserPrompt(hint);
  return (
    <p className="home__hint" data-testid="returning-user">
      {prompt.lead}{' '}
      <Link className="home__text-btn" to={prompt.signedIn ? ACCOUNT_PATH : ACCOUNT_SIGN_IN_FROM_HOME}>
        {prompt.link}
      </Link>
    </p>
  );
}
