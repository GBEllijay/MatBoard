import { useEffect } from 'react';
import { installCardMeta, renderCardInnerHtml } from '../lib/card';
import './card.css';

/** Same card as the static /card document, for a cached app shell that still opens this route. */
export function CardPage() {
  useEffect(() => installCardMeta(), []);
  return <main className="card" dangerouslySetInnerHTML={{ __html: renderCardInnerHtml() }} />;
}
