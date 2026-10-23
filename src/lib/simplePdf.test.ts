import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPdfText, pdfPageCount, pdfToText, textToPdf, wrapPdfLine } from './simplePdf.ts';

test('a text PDF starts with the PDF header and keeps the words', () => {
  const wrapped = wrapPdfLine('Armbar from closed guard', 12);
  assert.ok(wrapped.length > 1);
  const pdf = textToPdf(['Progress report', 'Stripe 1: 2024-06-01', '']);
  const text = pdfToText(pdf);
  assert.match(text, /^%PDF-1.4/);
  assert.match(text, /Progress report/);
  assert.match(text, /Stripe 1: 2024-06-01/);
  assert.match(text, /%%EOF/);
  assert.match(text, /WinAnsiEncoding/);
});

test('dashes and middle dots stay glyphs instead of question marks', () => {
  const pdf = textToPdf(['Met — kept', '179.4 lb · On track', 'A – B', '“quote”']);
  const text = extractPdfText(pdf);
  assert.match(text, /Met — kept/);
  assert.match(text, /179\.4 lb · On track/);
  assert.match(text, /A – B/);
  assert.match(text, /“quote”/);
  assert.equal(text.includes('?'), false);
  assert.equal(pdfToText(pdf).includes('?'), false);
});

test('a long report keeps the last line on a later page', () => {
  const lines = Array.from({ length: 120 }, (_, index) => `Fundamentals row ${index}`);
  const pdf = textToPdf(lines);
  const text = extractPdfText(pdf);
  assert.match(text, /Fundamentals row 0/);
  assert.match(text, /Fundamentals row 119/);
  assert.ok(pdfPageCount(pdf) >= 3);
});
