import { useEffect } from 'react';
import { useRememberHalfOffArrival } from '../hooks/useHalfOffArrival';
import { installHalfOffMeta, renderHalfOffInnerHtml } from '../lib/halfOffPage';
import './halfOff.css';

/** Same page as the static /half-off document, for a cached app shell. */
export function HalfOffPage() {
  useRememberHalfOffArrival();
  useEffect(() => installHalfOffMeta(), []);
  return <main className="half-off" dangerouslySetInnerHTML={{ __html: renderHalfOffInnerHtml() }} />;
}
