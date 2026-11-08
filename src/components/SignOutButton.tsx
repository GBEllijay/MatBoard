import { SIGN_OUT_NOTE, signOutAndLeave } from '../lib/signOut';

/** One control. Existing menu labels stay as they are. */
export function SignOutButton() {
  return (
    <button
      type="button"
      className="home__text-btn"
      title={SIGN_OUT_NOTE}
      aria-label={`Sign out. ${SIGN_OUT_NOTE}`}
      onClick={() => signOutAndLeave()}
    >
      Sign out
    </button>
  );
}
