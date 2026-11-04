/**
 * Gym-level roster card look: STYLE (Coach Clipboard / Fighter Card) and SKIN
 * (Dark / Light). Shown on the Student Roster, which is already a coach tier.
 * Saved with the gym settings on this device; students follow it on the next send.
 */
import { useEffect, useState } from 'react';
import { CARD_SKINS, CARD_STYLES, readCardLook, subscribeCardLook, writeCardLook, type CardLook } from '../../lib/cardLook';

export function CardLookSetting() {
  const [look, setLook] = useState<CardLook>(() => readCardLook());
  useEffect(() => subscribeCardLook(() => setLook(readCardLook())), []);
  const choose = (next: CardLook) => setLook(writeCardLook(next));
  return (
    <details className="roster__cardlook">
      <summary>Card look · {CARD_STYLES.find((row) => row.id === look.style)?.label} · {CARD_SKINS.find((row) => row.id === look.skin)?.label}</summary>
      <fieldset>
        <legend>Card style</legend>
        {CARD_STYLES.map((row) => (
          <label key={row.id}>
            <input type="radio" name="card-style" checked={look.style === row.id} onChange={() => choose({ ...look, style: row.id })} />
            {row.label}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Card skin</legend>
        {CARD_SKINS.map((row) => (
          <label key={row.id}>
            <input type="radio" name="card-skin" checked={look.skin === row.id} onChange={() => choose({ ...look, skin: row.id })} />
            {row.label}
          </label>
        ))}
      </fieldset>
      <p className="roster-edit__hint">Same fields in every look. Your students&apos; cards follow this after your next send.</p>
    </details>
  );
}
