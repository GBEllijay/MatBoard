import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  ABUSE_EMAIL,
  MEDIA_CONDUCT_POINTS,
  acceptMediaConduct,
  mediaConductAccepted,
  reportPhotoHref,
} from './mediaConduct.ts';

test('Plus Cloud stays off until the gym agrees, and a report mail goes to Advantage', () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  };
  assert.equal(mediaConductAccepted(storage), false);
  acceptMediaConduct(storage);
  assert.equal(mediaConductAccepted(storage), true);
  assert.equal(MEDIA_CONDUCT_POINTS.length, 5);
  assert.match(MEDIA_CONDUCT_POINTS.join(' '), /parent or guardian consent/);
  assert.equal(ABUSE_EMAIL, 'advantageappllc@gmail.com');
  assert.match(reportPhotoHref('photo-1'), /^mailto:advantageappllc@gmail.com/);
  const terms = readFileSync(new URL('../../docs/legal/plus-cloud-terms-DRAFT.md', import.meta.url), 'utf8');
  assert.match(terms, /FOR ATTORNEY REVIEW/);
  assert.match(terms, /indemnif/i);
  assert.match(terms, /60 days/);
  assert.match(terms, /NCMEC/);
  assert.doesNotMatch(terms, /90 days/);
});
