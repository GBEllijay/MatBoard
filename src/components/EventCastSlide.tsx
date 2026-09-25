import { useEffect, useState } from 'react';
import { normalizeQrLinks, qrLinkCaption, type EventsCastMode } from '../lib/eventSlides';
import { qrDataUrl } from '../lib/qr';

export type EventCastItem = {
  id: string;
  label: string;
  qrLinks?: readonly string[];
};

type Props = {
  item: EventCastItem;
  src?: string;
  mode: EventsCastMode;
  logoUrl?: string | null;
};

/**
 * One Events TV page. The photo fills the slide. QR codes for that photo’s
 * links sit beside it (under it when the gym logo is on), matching Pro Shop.
 */
export function EventCastSlide({ item, src, mode, logoUrl }: Props) {
  const links = normalizeQrLinks(item.qrLinks);
  const showQr = mode !== 'images' && links.length > 0;
  const showLogo = mode === 'images-qr-logo' && Boolean(logoUrl);
  const linksKey = JSON.stringify(links);
  const [qrByHref, setQrByHref] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!showQr) {
      setQrByHref((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    const hrefs = JSON.parse(linksKey) as string[];
    let cancelled = false;
    void Promise.all(
      hrefs.map(async (href) => {
        try {
          return [href, await qrDataUrl(href)] as const;
        } catch {
          return [href, ''] as const;
        }
      }),
    ).then((pairs) => {
      if (!cancelled) setQrByHref(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [showQr, linksKey]);

  const name = item.label.trim() || 'Event';
  const codes = showQr ? links.filter((href) => qrByHref[href]) : [];

  return (
    <div
      className={`shop-cast shop-cast--${mode} event-cast${codes.length >= 3 ? ' event-cast--many' : ''}${
        showLogo ? ' shop-cast--has-logo' : ''
      }`}
      data-qr-count={codes.length}
      aria-label={`Events, ${name}`}
    >
      {showLogo && logoUrl ? <img className="shop-cast__logo" src={logoUrl} alt="Gym logo" /> : null}
      <div className="shop-cast__grid">
        <article className="shop-cast__card">
          <div className="shop-cast__layout">
            {src ? (
              <img className="shop-cast__photo event-cast__photo" src={src} alt="" />
            ) : (
              <div className="shop-cast__photo shop-cast__photo--empty" />
            )}
            <div className="shop-cast__meta">
              <p className="shop-cast__name">{name}</p>
              {codes.length ? (
                <div className="event-cast__codes">
                  {codes.map((href) => {
                    const caption = qrLinkCaption(href);
                    return (
                      <figure key={href} className="event-cast__code">
                        <img className="shop-cast__qr" src={qrByHref[href]} alt={`QR code for ${caption || name}`} />
                        {caption ? <figcaption className="event-cast__caption">{caption}</figcaption> : null}
                      </figure>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
