import { useEffect, useState } from 'react';
import { qrDataUrl } from '../lib/qr';
import { buyLinkForQr, type ShopCastMode } from '../lib/shopSlides';

export type ShopCastCard = {
  id: string;
  label: string;
  buyUrl?: string;
};

type Props = {
  items: readonly ShopCastCard[];
  srcById: Record<string, string>;
  mode: ShopCastMode;
  logoUrl?: string | null;
};

/**
 * One Pro Shop TV page. Every card on the page can show its own QR.
 * The QR stays to the right of that card's photo on phone and TV.
 * Logo mode pins the gym mark on the left of the same row.
 */
export function ShopCastSlide({ items, srcById, mode, logoUrl }: Props) {
  const showQr = mode !== 'images';
  const showLogo = mode === 'images-qr-logo' && Boolean(logoUrl);
  const signature = items.map((item) => `${item.id}:${buyLinkForQr(item.buyUrl)}`).join('|');
  const [qrById, setQrById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!showQr) {
      setQrById((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    let cancelled = false;
    const cards = items.map((item) => ({ id: item.id, href: buyLinkForQr(item.buyUrl) }));
    void Promise.all(
      cards.map(async (card) => {
        if (!card.href) return [card.id, ''] as const;
        try {
          return [card.id, await qrDataUrl(card.href)] as const;
        } catch {
          return [card.id, ''] as const;
        }
      }),
    ).then((pairs) => {
      if (!cancelled) setQrById(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [showQr, signature, items]);

  const qrCount = showQr ? items.filter((item) => qrById[item.id]).length : 0;

  return (
    <div
      className={`shop-cast shop-cast--${mode}${items.length >= 4 ? ' shop-cast--many' : ''}${
        showLogo ? ' shop-cast--has-logo' : ''
      }`}
      data-shop-count={items.length}
      data-qr-count={qrCount}
      aria-label={`Pro Shop, ${items.length} ${items.length === 1 ? 'card' : 'cards'}`}
    >
      {showLogo && logoUrl ? (
        <img className="shop-cast__logo" src={logoUrl} alt="Gym logo" />
      ) : null}
      <div className="shop-cast__grid">
        {items.map((item) => {
          const src = srcById[item.id];
          const qr = qrById[item.id];
          const name = item.label.trim() || 'Pro Shop';
          return (
            <article key={item.id} className="shop-cast__card">
              <div className="shop-cast__layout">
                {src ? (
                  <img className="shop-cast__photo" src={src} alt="" />
                ) : (
                  <div className="shop-cast__photo shop-cast__photo--empty" />
                )}
                <div className="shop-cast__meta">
                  <p className="shop-cast__name">{name}</p>
                  {showQr && qr ? (
                    <img className="shop-cast__qr" src={qr} alt={`QR code for ${name}`} />
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
