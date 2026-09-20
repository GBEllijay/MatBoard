import { useSyncExternalStore } from 'react';
import { getAudioPrefs, subscribeAudioPrefs, type AudioPrefs } from '../lib/audio';
import { getMatch, subscribeMatch, type MatchState } from '../lib/matchStore';
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
