/**
 * Founders band for the academy Identity card.
 * Hidden when no founders are entered. Style variants are for the preview picker;
 * the live card uses nameplate badges.
 */
import { formatFoundedDate, parseFounders, type FoundersStyle } from '../lib/academyIdentity.ts';

export function AcademyFounders({
  founders,
  foundedOn = '',
  style = 'nameplates',
}: {
  founders: string;
  foundedOn?: string;
  style?: FoundersStyle;
}) {
  const chips = parseFounders(founders);
  if (!chips.length) return null;
  const founded = foundedOn ? formatFoundedDate(foundedOn) : null;
  return (
    <section className={`acad-founders acad-founders--${style}`} data-testid="academy-founders" data-founders-style={style} aria-label="Founders">
      {style === 'plaque' ? <FoundersPlaque chips={chips} founded={founded} /> : null}
      {style === 'crest' ? <FoundersCrest chips={chips} founded={founded} /> : null}
      {style === 'nameplates' ? <FoundersNameplates chips={chips} founded={founded} /> : null}
    </section>
  );
}

type Chip = { name: string; initials: string };
type Founded = { year: string; estLabel: string } | null;

function FoundersNameplates({ chips, founded }: { chips: Chip[]; founded: Founded }) {
  return (
    <>
      <div className="acad-founders__head">
        <p className="acad-founders__kicker">Founders</p>
        {founded ? <span className="acad-founders__seal">{founded.estLabel}</span> : null}
      </div>
      <ul className="acad-founders__chips">
        {chips.map((chip) => (
          <li key={chip.name} className="acad-founders__chip">
            <span className="acad-founders__mono" aria-hidden="true">
              {chip.initials}
            </span>
            <span className="acad-founders__name">{chip.name}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function FoundersPlaque({ chips, founded }: { chips: Chip[]; founded: Founded }) {
  return (
    <div className="acad-plaque">
      <p className="acad-founders__kicker">Founders</p>
      <div className="acad-plaque__rule" aria-hidden="true">
        <span />
        <i />
        <span />
      </div>
      <p className="acad-plaque__names">{chips.map((chip) => chip.name).join('  ·  ')}</p>
      {founded ? <p className="acad-plaque__est">{founded.estLabel}</p> : null}
    </div>
  );
}

function FoundersCrest({ chips, founded }: { chips: Chip[]; founded: Founded }) {
  return (
    <div className="acad-crest-strip">
      <p className="acad-founders__kicker">Founders</p>
      <div className="acad-crest-strip__bar">
        <span className="acad-crest-strip__tip" aria-hidden="true" />
        <ul className="acad-crest-strip__chips">
          {chips.map((chip) => (
            <li key={chip.name}>
              <span className="acad-founders__mono" aria-hidden="true">
                {chip.initials}
              </span>
              <span className="acad-founders__name">{chip.name}</span>
            </li>
          ))}
        </ul>
        {founded ? <span className="acad-crest-strip__year">{founded.year}</span> : null}
        <span className="acad-crest-strip__tip" aria-hidden="true" />
      </div>
    </div>
  );
}
