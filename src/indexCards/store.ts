/**
 * One in-memory copy of the index-card file, shared by every screen.
 * The host renders the card. Everyone else only asks to open a term.
 */

import { useSyncExternalStore } from 'react';
import {
  INDEX_CARDS_STORAGE_KEY,
  assembleCards,
  loadIndexCards,
  termIdFor,
  writeIndexCards,
  type IndexCardFile,
  type IndexFaceId,
  type LiveCard,
} from '../lib/indexCards.ts';
import { beginAppStudentSave, endAppStudentSave } from '../lib/studentDemo.ts';
import { loadAdditions, recordAddition, writeAdditions, type AdditionInput, type AdditionsPool } from '../lib/glossaryAdditions.ts';
import { d8Catalog } from './catalog.ts';

/** A draft with no face asks the student to pick one before it can be saved. */
export type OpenState = null | { kind: 'card'; id: string } | { kind: 'draft'; faceId: IndexFaceId | null };

let snapshot: IndexCardFile | null = null;
let additions: AdditionsPool | null = null;
const additionListeners = new Set<() => void>();
let openState: OpenState = null;
/** True while a preview page shows sample cards. Nothing is written to this phone then. */
let memoryOnly = false;
const fileListeners = new Set<() => void>();
const openListeners = new Set<() => void>();

function storage(): Storage {
  return localStorage;
}

export function catalogLines() {
  return d8Catalog();
}

export function getIndexCardFile(): IndexCardFile {
  if (!snapshot) snapshot = loadIndexCards(storage());
  return snapshot;
}

export function getOpenState(): OpenState {
  return openState;
}

function emitFile() {
  for (const listener of fileListeners) listener();
}

function emitOpen() {
  for (const listener of openListeners) listener();
}

export function commitIndexCards(file: IndexCardFile): IndexCardFile {
  if (memoryOnly) {
    snapshot = file;
    emitFile();
    return snapshot;
  }
  beginAppStudentSave();
  try {
    snapshot = writeIndexCards(storage(), file);
  } finally {
    endAppStudentSave();
  }
  emitFile();
  return snapshot;
}

export function openTerm(nameOrId: string): void {
  const id = termIdFor(catalogLines(), getIndexCardFile(), nameOrId);
  if (!id) return;
  openState = { kind: 'card', id };
  emitOpen();
}

export function getAdditions(): AdditionsPool {
  if (!additions) additions = loadAdditions(storage());
  return additions;
}

/** Notes one save in the student's additions pool. Glossary moves on their own face are skipped. */
export function noteAddition(input: AdditionInput): void {
  const next = recordAddition(getAdditions(), input);
  if (next === additions) return;
  beginAppStudentSave();
  try {
    additions = writeAdditions(storage(), next);
  } catch {
    additions = next;
  } finally {
    endAppStudentSave();
  }
  for (const listener of additionListeners) listener();
}

export function useAdditions(): AdditionsPool {
  return useSyncExternalStore(subscribeAdditions, getAdditions, getAdditions);
}

function subscribeAdditions(listener: () => void): () => void {
  additionListeners.add(listener);
  return () => additionListeners.delete(listener);
}

export function startDraft(faceId: IndexFaceId | null): void {
  openState = { kind: 'draft', faceId };
  emitOpen();
}

export function closeIndexCard(): void {
  if (!openState) return;
  openState = null;
  emitOpen();
}

/**
 * Show sample cards in memory only, for a preview page. Saves stay in memory too.
 * Call leaveIndexCardPreview when the page closes; the saved file on this phone is read again.
 */
export function enterIndexCardPreview(file: IndexCardFile): void {
  memoryOnly = true;
  snapshot = file;
  openState = null;
  emitFile();
  emitOpen();
}

export function leaveIndexCardPreview(): void {
  if (!memoryOnly) return;
  memoryOnly = false;
  snapshot = null;
  openState = null;
  emitFile();
  emitOpen();
}

export function indexCardPreviewActive(): boolean {
  return memoryOnly;
}

export function resetIndexCardStoreForTests(): void {
  memoryOnly = false;
  snapshot = null;
  additions = null;
  openState = null;
  emitFile();
  for (const listener of additionListeners) listener();
  emitOpen();
}

export function useIndexCardFile(): IndexCardFile {
  return useSyncExternalStore(subscribeFile, getIndexCardFile, getIndexCardFile);
}

export function useLiveCards(): LiveCard[] {
  const file = useIndexCardFile();
  return assembleCards(catalogLines(), file);
}

export function useOpenState(): OpenState {
  return useSyncExternalStore(subscribeOpen, getOpenState, getOpenState);
}

function subscribeFile(listener: () => void): () => void {
  fileListeners.add(listener);
  return () => fileListeners.delete(listener);
}

function subscribeOpen(listener: () => void): () => void {
  openListeners.add(listener);
  return () => openListeners.delete(listener);
}

export { INDEX_CARDS_STORAGE_KEY };
