import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPdfText, pdfPageCount, pdfPlainText, pdfToText, textToPdf, wrapPdfLine } from './simplePdf.ts';

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

test('dashes and other non-Latin-1 marks do not become question marks', () => {
  const source = 'Met — kept\n179.4 lb · On track\nA – B\n“quote”\nWait…\n• one\nWhat?';
  assert.equal(pdfPlainText(source).includes('?'), true);
  assert.equal(pdfPlainText('— – “ ” • …').includes('?'), false);
  const pdf = textToPdf(source.split('\n'));
  const text = extractPdfText(pdf);
  const raw = pdfToText(pdf);
  assert.match(text, /Met -- kept/);
  assert.match(text, /179\.4 lb · On track/);
  assert.match(text, /A - B/);
  assert.match(text, /"quote"/);
  assert.match(text, /Wait\.\.\./);
  assert.match(text, /\* one/);
  assert.match(text, /What\?/);
  assert.equal(raw.includes('\\226'), false);
  assert.equal(raw.includes('\\227'), false);
  assert.equal(raw.includes('\\223'), false);
  const fromDashes = text.replaceAll('What?', '');
  assert.equal(fromDashes.includes('?'), false);
});

test('a long report keeps the last line on a later page', () => {
  const lines = Array.from({ length: 120 }, (_, index) => `Fundamentals row ${index}`);
  const pdf = textToPdf(lines);
  const text = extractPdfText(pdf);
  assert.match(text, /Fundamentals row 0/);
  assert.match(text, /Fundamentals row 119/);
  assert.ok(pdfPageCount(pdf) >= 3);
});
