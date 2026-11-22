import { Link } from 'react-router-dom';

/** Advantage White match names. Not the Coach or Pro Competitor Roster. */
export function WhiteRosterCard() {
  return (
    <article className="mode-card mode-card--names">
      <Link
        className="mode-card__hit"
        to="/white/roster"
        tabIndex={-1}
        aria-label="Open Match names"
      />
      <MatchNamesSheet />
      <strong>Match names</strong>
      <span className="mode-card__sub">Names and belts</span>
      <span>Save competitor names and belt ranks on this device, then pick them on the scoreboard.</span>
      <div className="mode-card__actions">
        <Link className="btn" to="/white/roster">
          Match names
        </Link>
      </div>
    </article>
  );
}

/** Decorative spreadsheet chrome. The card still opens the existing /white/roster tool. */
function MatchNamesSheet() {
  return (
    <div className="names-sheet" aria-hidden="true">
      <div className="names-sheet__chrome">
        <div className="names-sheet__tabs">
          <span className="names-sheet__tab">match-names.csv</span>
        </div>
        <div className="names-sheet__tools">
          <span className="names-sheet__tool">Upload</span>
          <span className="names-sheet__tool">Download</span>
        </div>
      </div>
      <table className="names-sheet__grid">
        <thead>
          <tr>
            <th className="names-sheet__corner" />
            <th>A</th>
            <th>B</th>
            <th>C</th>
          </tr>
        </thead>
        <tbody>
          <tr className="names-sheet__head-row">
            <th>1</th>
            <td>Name</td>
            <td>Belt</td>
            <td></td>
          </tr>
          <tr>
            <th>2</th>
            <td>Atlas</td>
            <td>Purple</td>
            <td></td>
          </tr>
          <tr>
            <th>3</th>
            <td>Romeo</td>
            <td>Blue</td>
            <td></td>
          </tr>
          <tr>
            <th>4</th>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
