import { Link } from 'react-router-dom';
import { unlinkBracketBout } from '../lib/bracketBout';

export function LinkedBoutBanner({ backTo }: { backTo: string }) {
  return (
    <p className="linked-bout-banner" role="status">
      This scoreboard is still showing the last bracket bout.{' '}
      <button type="button" onClick={() => unlinkBracketBout()}>
        Show a plain match
      </button>
      {' '}
      <Link to={backTo}>Back to bracket</Link>
    </p>
  );
}
