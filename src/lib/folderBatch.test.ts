import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FolderBatchError,
  SMALLER_BATCH_TIP,
  batchFailureNote,
  emptyPickNote,
  folderPickFeedback,
  folderSaveProgressLabel,
  quotaBatchNote,
  unmatchedPickNote,
} from './folderBatch.ts';
import { DEVICE_STORAGE_FULL_NOTE, StorageQuotaError } from './storageQuota.ts';

test('save progress counts files already stored', () => {
  assert.equal(folderSaveProgressLabel({ done: 0, total: 27, phase: 'shrink' }), 'Saving 1 of 27…');
  assert.equal(folderSaveProgressLabel({ done: 3, total: 27, phase: 'save' }), 'Saving 3 of 27…');
  assert.equal(folderSaveProgressLabel({ done: 3, total: 27, phase: 'shrink' }), 'Saving 3 of 27…');
  assert.equal(folderSaveProgressLabel({ done: 27, total: 27, phase: 'save' }), 'Saving 27 of 27…');
  assert.equal(folderSaveProgressLabel({ done: 0, total: 0, phase: 'shrink' }), 'Saving…');
});

test('an empty pick says nothing was saved and suggests a smaller batch', () => {
  assert.equal(emptyPickNote(), `Nothing was saved. ${SMALLER_BATCH_TIP}`);
  assert.equal(
    folderPickFeedback({
      picked: 0,
      readable: 0,
      matched: 0,
      added: 0,
      kind: 'photo',
      error: null,
    }),
    `Nothing was saved. ${SMALLER_BATCH_TIP}`,
  );
  assert.equal(
    folderPickFeedback({
      picked: 27,
      readable: 0,
      matched: 0,
      added: 0,
      kind: 'photo',
      error: null,
    }),
    `Nothing was saved. ${SMALLER_BATCH_TIP}`,
  );
});

test('a full batch of the wrong type still explains why, and a large one suggests a smaller batch', () => {
  assert.equal(
    unmatchedPickNote('photo', 1),
    'That file is not an image this folder can keep.',
  );
  assert.equal(
    folderPickFeedback({
      picked: 1,
      readable: 1,
      matched: 0,
      added: 0,
      kind: 'video',
      error: null,
    }),
    'That file cannot play here. Switch the camera to video, or pick an MP4 / WebM.',
  );
  const many = folderPickFeedback({
    picked: 27,
    readable: 27,
    matched: 0,
    added: 0,
    kind: 'photo',
    error: null,
  });
  assert.match(many ?? '', /Nothing was saved/);
  assert.match(many ?? '', /not images/);
  assert.match(many ?? '', /smaller batch/);
});

test('a finished save stays quiet, including when extra files did not belong in the folder', () => {
  assert.equal(
    folderPickFeedback({
      picked: 4,
      readable: 4,
      matched: 4,
      added: 4,
      kind: 'photo',
      error: null,
    }),
    null,
  );
  assert.equal(
    folderPickFeedback({
      picked: 5,
      readable: 5,
      matched: 4,
      added: 4,
      kind: 'photo',
      error: null,
    }),
    null,
  );
});

test('zero-byte files in an otherwise saved batch count as not saved', () => {
  assert.equal(
    folderPickFeedback({
      picked: 27,
      readable: 24,
      matched: 24,
      added: 24,
      kind: 'photo',
      error: null,
    }),
    `Saved 24 of 27. 3 could not be saved. ${SMALLER_BATCH_TIP}`,
  );
});

test('a non-quota stop reports the saved count and suggests a smaller batch', () => {
  const partial = new FolderBatchError(3, 27, new Error('out of memory'));
  assert.equal(partial.failed, 24);
  assert.equal(
    batchFailureNote(partial),
    `Saved 3 of 27. 24 could not be saved. ${SMALLER_BATCH_TIP}`,
  );
  assert.equal(
    folderPickFeedback({
      picked: 27,
      readable: 27,
      matched: 27,
      added: 0,
      kind: 'photo',
      error: new FolderBatchError(0, 27),
    }),
    `Could not save these files. Nothing was saved. ${SMALLER_BATCH_TIP}`,
  );
  const generic = folderPickFeedback({
    picked: 10,
    readable: 10,
    matched: 10,
    added: 4,
    kind: 'photo',
    error: new Error('decode failed'),
  });
  assert.equal(generic, `Saved 4 of 10. 6 could not be saved. ${SMALLER_BATCH_TIP}`);
});

test('quota keeps the storage-full wording and adds the saved count when part of the batch landed', () => {
  assert.equal(quotaBatchNote(new StorageQuotaError(0, 27)), DEVICE_STORAGE_FULL_NOTE);
  assert.equal(
    quotaBatchNote(new StorageQuotaError(1)),
    `Saved 1. ${DEVICE_STORAGE_FULL_NOTE}`,
  );
  const partial = quotaBatchNote(new StorageQuotaError(3, 27));
  assert.equal(
    partial,
    `Saved 3 of 27. 24 could not be saved. ${DEVICE_STORAGE_FULL_NOTE}`,
  );
  assert.equal(partial.includes('smaller batch'), false);
  assert.equal(partial.includes('memory'), false);
});
