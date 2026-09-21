import { useSyncExternalStore } from 'react';
import { getAudioPrefs, subscribeAudioPrefs, type AudioPrefs } from '../lib/audio';
import {
  getBracketTheme,
  subscribeBracketTheme,
  type BracketTheme,
} from '../lib/bracketTheme';
import { getMatch, subscribeMatch, type MatchState } from '../lib/matchStore';
import {
  getTrainingSkin,
  subscribeTrainingSkin,
  type TrainingSkin,
} from '../lib/trainingSkin';
import {
  getSchedule,
  getScheduleAssets,
  subscribeSchedule,
  subscribeScheduleAssets,
  type ScheduleAssets,
  type ScheduleState,
} from '../lib/scheduleStore';
import { getRoster, subscribeRoster, type RosterState } from '../lib/rosterStore';
import { getTournament, subscribeTournament, type TournamentState } from '../lib/tournamentStore';
import { getTraining, subscribeTraining, type TrainingState } from '../lib/trainingStore';

export function useMatchState(): MatchState {
  return useSyncExternalStore(subscribeMatch, getMatch, getMatch);
}

export function useTrainingState(): TrainingState {
  return useSyncExternalStore(subscribeTraining, getTraining, getTraining);
}

export function useAudioPrefs(): AudioPrefs {
  return useSyncExternalStore(subscribeAudioPrefs, getAudioPrefs, getAudioPrefs);
}

export function useTournamentState(): TournamentState {
  return useSyncExternalStore(subscribeTournament, getTournament, getTournament);
}

export function useBracketTheme(): BracketTheme {
  return useSyncExternalStore(subscribeBracketTheme, getBracketTheme, getBracketTheme);
}

export function useTrainingSkin(): TrainingSkin {
  return useSyncExternalStore(subscribeTrainingSkin, getTrainingSkin, getTrainingSkin);
}

export function useScheduleState(): ScheduleState {
  return useSyncExternalStore(subscribeSchedule, getSchedule, getSchedule);
}

export function useScheduleAssets(): ScheduleAssets {
  return useSyncExternalStore(subscribeScheduleAssets, getScheduleAssets, getScheduleAssets);
}

export function useRosterState(): RosterState {
  return useSyncExternalStore(subscribeRoster, getRoster, getRoster);
}
