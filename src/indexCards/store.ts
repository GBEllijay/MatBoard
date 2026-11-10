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
import { d8Catalog } from './catalog.ts';

export type OpenState = null | { kind: 'card'; id: string } | { kind: 'draft'; faceId: IndexFaceId };

let snapshot: IndexCardFile | null = null;
let openState: OpenState = null;
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

export function startDraft(faceId: IndexFaceId): void {
  openState = { kind: 'draft', faceId };
  emitOpen();
}

export function closeIndexCard(): void {
  if (!openState) return;
  openState = null;
  emitOpen();
}

export function resetIndexCardStoreForTests(): void {
  snapshot = null;
  openState = null;
  emitFile();
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
