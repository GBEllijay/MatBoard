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
 * One Events TV page. A vertical photo stays in the center. QR codes sit to
 * its right. With the gym logo on, the mark sits to the left of the photo.
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
        showLogo ? ' event-cast--logo' : ''
      }${codes.length ? ' event-cast--qr' : ''}`}
      data-qr-count={codes.length}
      aria-label={`Events, ${name}`}
    >
      <div className="shop-cast__grid">
        <article className="shop-cast__card">
          <div className="event-cast__stage">
            {showLogo && logoUrl ? (
              <img className="event-cast__mark" src={logoUrl} alt="Gym logo" />
            ) : null}
            <div className="event-cast__photo-wrap">
              {src ? (
                <img className="shop-cast__photo event-cast__photo" src={src} alt="" />
              ) : (
                <div className="shop-cast__photo shop-cast__photo--empty" />
              )}
              {codes.length ? null : <p className="shop-cast__name event-cast__caption-name">{name}</p>}
            </div>
            {codes.length ? (
              <div className="event-cast__side">
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
                <p className="shop-cast__name">{name}</p>
              </div>
            ) : null}
          </div>
        </article>
      </div>
    </div>
  );
}
