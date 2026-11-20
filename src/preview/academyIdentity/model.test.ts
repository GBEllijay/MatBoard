import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DEFAULT_FOUNDERS_STYLE, DEFAULT_LINEAGE_STYLE, collapsedAncestorIndices, parseLineage, searchMasters } from '../../lib/academyIdentity.ts';
import {
  ACADEMY_IDENTITY_PATH,
  FOUNDERS_STYLE_OPTIONS,
  LINEAGE_STYLE_OPTIONS,
  PREVIEW_ACADEMY,
  PREVIEW_FOUNDERS,
  PREVIEW_LONG_LINEAGE,
  PREVIEW_LONG_TEACHERS,
  PREVIEW_SHORT_LINEAGE,
  previewLineageText,
} from './model.ts';

const PREVIEW_FILES = [
  new URL('./model.ts', import.meta.url),
  new URL('./AcademyIdentityPreview.tsx', import.meta.url),
  new URL('../../components/AcademyBeltChain.tsx', import.meta.url),
  new URL('../../components/AcademyFounders.tsx', import.meta.url),
  new URL('../../components/AcademyLineageEditor.tsx', import.meta.url),
];

test('the public preview route and sample academy stay fictional and franchise-clean', () => {
  assert.equal(ACADEMY_IDENTITY_PATH, '/preview/academy-identity');
  assert.equal(PREVIEW_ACADEMY, 'Valley Ridge Jiu-Jitsu');
  assert.equal(PREVIEW_FOUNDERS, 'Marcus Reid, Elena Vance');
  assert.match(PREVIEW_SHORT_LINEAGE, /Daniel Souza/);
  assert.equal(/gracie\s*barra/i.test(PREVIEW_ACADEMY + PREVIEW_FOUNDERS + PREVIEW_SHORT_LINEAGE + PREVIEW_LONG_LINEAGE), false);
  for (const file of PREVIEW_FILES) {
    const source = readFileSync(file, 'utf8');
    assert.equal(/gracie\s*barra/i.test(source), false, String(file));
    assert.equal(/bjjheroes\.com|gracieuniversity|family tree/i.test(source), false, String(file));
  }
});

test('the long example collapses to +14 more, and Hell still finds Helio Gracie', () => {
  assert.equal(PREVIEW_LONG_TEACHERS.length, 17);
  assert.equal(collapsedAncestorIndices(parseLineage(PREVIEW_LONG_LINEAGE).length, false).hidden, 14);
  assert.equal(searchMasters('Hell')[0]?.name, 'Helio Gracie');
  assert.equal(previewLineageText('off'), PREVIEW_SHORT_LINEAGE);
  assert.equal(previewLineageText('edit').includes('Daniel Souza'), true);
});

test('belt chain and editor source never use a shield or laurel crest', () => {
  for (const file of PREVIEW_FILES) {
    const source = readFileSync(file, 'utf8');
    assert.equal(/crestSVG|crest-wrap|laurel|viewBox=\"0 0 72 80\"/i.test(source), false, String(file));
  }
});

test('preview style options keep all six looks, and default to Crest strip plus Heritage ribbon', () => {
  assert.deepEqual(
    FOUNDERS_STYLE_OPTIONS.map((option) => option.id),
    ['nameplates', 'plaque', 'crest'],
  );
  assert.deepEqual(
    LINEAGE_STYLE_OPTIONS.map((option) => option.id),
    ['rail', 'cards', 'ribbon'],
  );
  assert.equal(FOUNDERS_STYLE_OPTIONS.find((option) => option.id === 'crest')?.label, 'Crest strip');
  assert.equal(LINEAGE_STYLE_OPTIONS.find((option) => option.id === 'ribbon')?.label, 'Heritage ribbon');
  assert.equal(DEFAULT_FOUNDERS_STYLE, 'crest');
  assert.equal(DEFAULT_LINEAGE_STYLE, 'ribbon');
});
