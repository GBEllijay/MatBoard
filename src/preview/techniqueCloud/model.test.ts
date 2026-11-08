import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { JournalEntry, WorkingNode } from '../../lib/progress/types.ts';
import { addMemoryClip, copyFromReport, emptyCloud, previewCopyFromText, sampleCloud, techniquesForCard } from './model.ts';

function node(id: string, title: string): WorkingNode {
  return { id, title, notes: 'Keep this note', kind: 'technique', fundamentalId: '', createdAt: 1, updatedAt: 1 };
}

function card(id: string, techniqueId: string, title: string): JournalEntry {
  return {
    id,
    date: '2026-02-02',
    gameTag: '',
    body: `Class: Gi\n${title}`,
    techniqueRefs: [{ id: techniqueId, name: title }],
    amendments: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

test('a preview copy reads techniques without changing the report or marking them learned', () => {
  const report = {
    working: { nodes: [node('hip.bump', 'Hip bump')], edges: [] },
    journal: [card('card-1', 'hip.bump', 'Hip bump')],
    clips: [
      {
        id: 'clip-1',
        url: 'https://example.test/clip',
        description: 'Class clip',
        note: '',
        createdAt: 1,
        updatedAt: 1,
        techniqueAnchor: { kind: 'working' as const, id: 'hip.bump', name: 'Hip bump' },
        journalEntryId: 'card-1',
      },
    ],
  };
  const before = JSON.stringify(report);
  const copy = copyFromReport(report);
  assert.equal(JSON.stringify(report), before);
  assert.equal(copy.source, 'preview-copy');
  assert.equal(copy.techniques[0]?.notes, 'Keep this note');
  assert.equal(copy.techniques[0]?.classOrigin, '2026-02-02 · Gi');
  assert.equal(copy.techniques[0]?.videos[0]?.title, 'Class clip');
  assert.deepEqual(techniquesForCard(copy, 'card-1').map((item) => item.id), ['hip.bump']);
  assert.equal(JSON.stringify(copy).includes('learned'), false);
  assert.equal(emptyCloud().techniques.length, 0);
  assert.equal(sampleCloud().note.includes('Sample only'), true);
  assert.equal(previewCopyFromText(null).note, 'No student file on this phone.');
  assert.equal(previewCopyFromText('{').note, 'This preview left the student file unread.');
});

test('memory clips stay in the list that was passed in', () => {
  const first = addMemoryClip([], 'film', 'Filmed move');
  assert.equal(first[0]?.source, 'film');
  const next = addMemoryClip(first, 'gallery', 'Gallery pick');
  assert.equal(first.length, 1);
  assert.equal(next.length, 2);
});

test('the preview pages do not write a student file', () => {
  const cloud = readFileSync(new URL('./TechniqueCloudPreview.tsx', import.meta.url), 'utf8');
  const library = readFileSync(new URL('./VideoLibraryPreview.tsx', import.meta.url), 'utf8');
  for (const source of [cloud, library]) {
    assert.equal(source.includes('setItem'), false);
    assert.equal(source.includes('removeItem'), false);
    assert.equal(source.includes('saveStudentReport'), false);
  }
  assert.match(cloud, /getItem/);
});
