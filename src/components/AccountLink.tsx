import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ACCOUNT_PATH, LOGIN_EVENT, readLoginHint } from '../lib/emailLogin';

/** "Sign in" until this browser has an email sign-in, then "Account". Both open /account. */
export function AccountLink({ className = 'home__text-btn' }: { className?: string }) {
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
  return (
    <Link className={className} to={ACCOUNT_PATH} title={hint ? `Signed in as ${hint}` : 'Sign in with your email'}>
      {hint ? 'Account' : 'Sign in'}
    </Link>
  );
}
