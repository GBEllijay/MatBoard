import { describe, expect, it } from 'vitest';
import { getSyncStatus } from './signedInSync';

describe('getSyncStatus snapshot', () => {
  it('returns the same object while nothing changed, so the Account page does not re-render forever', () => {
    expect(getSyncStatus()).toBe(getSyncStatus());
  });
});
