/**
 * One-shot DQ reaction on the match scoreboard.
 * The figure is unnamed. The controller toggle and the played marker travel
 * with the match, the same way the grandmaster cheer does.
 */

import type { MatchOutcome } from './outcomes.ts';

export const DQ_DISAPPOINTED_VIDEO = '/assets/kids/dq-disappointed-walkoff.webm';
export const DQ_DISAPPOINTED_STILL = '/assets/kids/dq-disappointed.webp';
/** Walk-off is 7.75s. This fires if `ended` never arrives. */
export const DQ_DISAPPOINTED_SAFETY_MS = 12_000;
/** Still frame when motion is reduced or the browser cannot play VP9 alpha. */
export const DQ_DISAPPOINTED_STILL_MS = 2_400;

export type DqDisappointedPrefs = {
  /** Off leaves a recorded DQ on the existing splash and banner only. */
  enabled: boolean;
  /** `outcome.at` of the DQ that already started. A later DQ plays again. */
  playedAt: number | null;
};

export const DEFAULT_DQ_DISAPPOINTED: DqDisappointedPrefs = {
  enabled: false,
  playedAt: null,
};

export function parseDqDisappointed(raw: unknown): DqDisappointedPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_DQ_DISAPPOINTED };
  const row = raw as Record<string, unknown>;
  const playedAt = typeof row.playedAt === 'number' && Number.isFinite(row.playedAt) ? row.playedAt : null;
  return {
    enabled: row.enabled === true,
    playedAt,
  };
}

export function mergeDqDisappointed(
  current: DqDisappointedPrefs,
  patch: Partial<DqDisappointedPrefs>,
): DqDisappointedPrefs {
  return parseDqDisappointed({ ...current, ...patch });
}

/** Remote match state. A missing block keeps the local toggle so an older peer cannot clear it. */
export function dqDisappointedFromSync(current: DqDisappointedPrefs, incoming: unknown): DqDisappointedPrefs {
  if (incoming == null) return { ...current };
  return parseDqDisappointed(incoming);
}

export function dqDisappointedShouldPlay(input: {
  prefs: DqDisappointedPrefs;
  outcome: Pick<MatchOutcome, 'call' | 'at'> | null;
}): boolean {
  if (!input.prefs.enabled) return false;
  if (!input.outcome || input.outcome.call !== 'dq') return false;
  return input.prefs.playedAt !== input.outcome.at;
}

export function dismissDqDisappointed(prefs: DqDisappointedPrefs, at: number): DqDisappointedPrefs {
  return mergeDqDisappointed(prefs, { playedAt: at });
}

export type Vp9AlphaProbe = {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  /** `video.canPlayType('video/webm; codecs="vp9"')` is non-empty. */
  canPlayVp9: boolean;
};

/** Safari and iOS have no VP9 alpha. A positive canPlayType there still paints a white box. */
export function canPlayVp9Alpha(probe: Vp9AlphaProbe): boolean {
  const ua = probe.userAgent;
  const iOS =
    /iPad|iPhone|iPod/i.test(ua) || (probe.platform === 'MacIntel' && (probe.maxTouchPoints ?? 0) > 1);
  if (iOS) return false;
  const safari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android/i.test(ua);
  if (safari) return false;
  return probe.canPlayVp9;
}

export function dqDisappointedMedia(input: { reducedMotion: boolean; canPlayAlpha: boolean }): 'still' | 'video' {
  if (input.reducedMotion || !input.canPlayAlpha) return 'still';
  return 'video';
}

export function readDqDisappointedMedia(): 'still' | 'video' {
  let reducedMotion = false;
  try {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    reducedMotion = false;
  }
  let canPlayVp9 = false;
  try {
    const video = document.createElement('video');
    canPlayVp9 = video.canPlayType('video/webm; codecs="vp9"') !== '';
  } catch {
    canPlayVp9 = false;
  }
  return dqDisappointedMedia({
    reducedMotion,
    canPlayAlpha: canPlayVp9Alpha({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      canPlayVp9,
    }),
  });
}
