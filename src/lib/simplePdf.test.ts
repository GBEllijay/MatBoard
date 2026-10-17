import assert from 'node:assert/strict';
import test from 'node:test';
import { pdfToText, textToPdf, wrapPdfLine } from './simplePdf.ts';

test('a text PDF starts with the PDF header and keeps the words', () => {
  const wrapped = wrapPdfLine('Armbar from closed guard', 12);
  assert.ok(wrapped.length > 1);
  const pdf = textToPdf(['Progress report', 'Stripe 1: 2024-06-01', '']);
  const text = pdfToText(pdf);
  assert.match(text, /^%PDF-1.4/);
  assert.match(text, /Progress report/);
  assert.match(text, /Stripe 1: 2024-06-01/);
  assert.match(text, /%%EOF/);
});
