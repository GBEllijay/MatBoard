/**
 * Record for Review opened on its own, from the button under Student Roster.
 * The clip reference lives here. The bytes stay in the same replay clip store
 * the lesson-plan block uses. Nothing in this file reads or writes a lesson plan.
 */

import { cleanReplay, createReplay, replayForDrive, type ReplayBlock } from './replayAnalysis.ts';

export const STANDALONE_REVIEW_KEY = 'matboard.recordForReview.standalone.v1';

type StoreGet = { getItem: (key: string) => string | null };
type StoreSet = { setItem: (key: string, value: string) => void };

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadStandaloneReview(storage: StoreGet | null = browserStorage()): ReplayBlock {
  try {
    const raw = storage?.getItem(STANDALONE_REVIEW_KEY);
    if (!raw) return createReplay();
    return cleanReplay(JSON.parse(raw))?.replay ?? createReplay();
  } catch {
    return createReplay();
  }
}

export function saveStandaloneReview(replay: ReplayBlock, storage: StoreSet | null = browserStorage()): void {
  try {
    storage?.setItem(STANDALONE_REVIEW_KEY, JSON.stringify(replayForDrive(replay)));
  } catch {
    /* the clip bytes are already in the replay store; the reference can be saved later */
  }
}
