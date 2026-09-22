import { useEffect } from 'react';
import { installKeepFocusedFieldVisible } from '../lib/keepFieldVisible';

/** App-wide: scroll the focused text field into the visible area above the keyboard. */
export function useKeepFocusedFieldVisible(): void {
  useEffect(() => installKeepFocusedFieldVisible(), []);
}
