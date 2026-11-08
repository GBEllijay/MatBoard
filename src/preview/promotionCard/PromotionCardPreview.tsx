import { useState } from 'react';
import '../../components/skinPicker.css';
import { EXAMPLE_BLUE_PHOTO, EXAMPLE_WHITE_PHOTOS } from './photos';
import './promotionCard.css';

export const PROMOTION_CARD_PREVIEW_PATH = '/preview/promotion-card';

type ExampleCard = {
  id: string;
  belt: 'white' | 'blue' | 'purple' | 'black';
  label: string;
  awardedOn: string;
  tapeCount: number;
  degrees: boolean;
  current: boolean;
  photos: readonly string[];
};

const EXAMPLE_CARDS: readonly ExampleCard[] = [
  { id: 'white', belt: 'white', label: 'White', awardedOn: '2014-02-03', tapeCount: 4, degrees: false, current: false, photos: EXAMPLE_WHITE_PHOTOS },
  { id: 'blue', belt: 'blue', label: 'Blue', awardedOn: '2015-03-26', tapeCount: 2, degrees: false, current: false, photos: [EXAMPLE_BLUE_PHOTO] },
  { id: 'purple', belt: 'purple', label: 'Purple', awardedOn: '', tapeCount: 0, degrees: false, current: false, photos: [] },
  { id: 'black', belt: 'black', label: 'Black', awardedOn: '', tapeCount: 0, degrees: true, current: true, photos: [] },
];

function places(photos: readonly string[]): { src: string; place: 'front' | 'mid' | 'back' }[] {
  return photos.slice(0, 3).map((src, index) => ({
    src,
    place: index === 0 ? 'front' : index === 1 ? 'mid' : 'back',
  }));
}

export function PromotionCardPreview() {
  const [cards, setCards] = useState(EXAMPLE_CARDS);
  return (
    <main className="pcard-page">
      <div className="pcard-shell">
        <p className="pcard-banner" role="note">
          Synthetic example. Not a saved promotion photo. My rank is unchanged.
        </p>
        <p className="pcard-kicker">Design preview</p>
        <h1>Promotion card</h1>
        <p className="pcard-note">{PROMOTION_CARD_PREVIEW_PATH}</p>
        <p className="pcard-note">
          The example photo fills the card, softened so the date and stripes stay readable. The left mark is the skins stack. A belt with no photo stays the plain card. This preview does not write a journal.
        </p>
        <div className="pcard-list">
          {cards.map((card) => {
            const faces = places(card.photos);
            const count = card.degrees
              ? card.tapeCount === 1
                ? '1 degree'
                : `${card.tapeCount} degrees`
              : card.tapeCount === 1
                ? '1 stripe'
                : `${card.tapeCount} stripes`;
            return (
              <article key={card.id} className={faces.length ? 'pcard' : 'pcard pcard--empty'} data-photo={faces.length ? 'yes' : 'no'}>
                {faces[0] ? <img className="pcard__bg" alt="" src={faces[0].src} /> : null}
                <div className="pcard__shade" />
                <div className="pcard__row">
                  {faces.length ? (
                    <button type="button" className="skin-stack" aria-label={`Example ${card.label} photos, ${faces.length} ${faces.length === 1 ? 'photo' : 'photos'}`}>
                      <span className="skin-stack__fan" aria-hidden="true">
                        {faces.map((face) => (
                          <img key={face.place} className={`skin-stack__card skin-stack__card--${face.place}`} src={face.src} alt="" />
                        ))}
                      </span>
                      <span className="skin-stack__label">Photos</span>
                    </button>
                  ) : (
                    <span className="skin-stack">
                      <span className="skin-stack__fan" aria-hidden="true">
                        <span className="skin-stack__card skin-stack__card--front pcard-stack__empty" />
                      </span>
                      <span className="skin-stack__label">No photo</span>
                    </span>
                  )}
                  <div className="pcard-copy">
                    <span className={`pcard-belt pcard-belt--${card.belt}`} aria-hidden="true" />
                    <strong>{card.label}</strong>
                    <span>{card.awardedOn || 'No date'}</span>
                    {card.degrees ? null : (
                      <span className="pcard-pips" aria-hidden="true">
                        {Array.from({ length: 4 }, (_, index) => (
                          <i key={index} className={index < card.tapeCount ? 'pcard-pip is-on' : 'pcard-pip'} />
                        ))}
                      </span>
                    )}
                    <small>{count}</small>
                    {card.current ? (
                      <span>Current belt</span>
                    ) : (
                      <button
                        type="button"
                        className="pcard-remove"
                        aria-label={`Remove ${card.label} history`}
                        onClick={() => setCards((current) => current.filter((row) => row.id !== card.id))}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
