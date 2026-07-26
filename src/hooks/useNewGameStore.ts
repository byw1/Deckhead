import { create } from 'zustand';
import { makeJustPlayTeam, makeTeams, normalisePlayerNames } from '@/game/teams';
import { defaultSettings, type SessionSettings, type Team, type WinCondition } from '@/game/types';

/**
 * Draft state for the three-step new game flow.
 *
 * Held apart from the live session so backing out of setup leaves nothing
 * behind, and so a game in progress is never half-overwritten by someone
 * poking at the setup screens.
 */

export type TeamMode = 'teams' | 'justPlay';

export type NewGameStore = {
  deckIds: string[];
  mode: TeamMode;
  teams: Team[];
  /** Just-play players. Kept separate so switching modes does not lose either. */
  soloPlayers: string[];
  settings: SessionSettings;

  toggleDeck(deckId: string): void;
  setMode(mode: TeamMode): void;
  setTeamCount(count: number): void;
  renameTeam(teamId: string, name: string): void;
  setTeamPlayers(teamId: string, players: string[]): void;
  setSoloPlayers(players: string[]): void;
  setRoundSeconds(seconds: number): void;
  setPassPenalty(penalty: number): void;
  setWinCondition(condition: WinCondition): void;
  setShuffleAcrossDecks(shuffle: boolean): void;

  /** The teams a session would actually be created with. */
  resolvedTeams(): Team[];
  reset(): void;
};

const initial = {
  deckIds: [] as string[],
  mode: 'justPlay' as TeamMode,
  teams: makeTeams(2),
  soloPlayers: [] as string[],
  settings: defaultSettings,
};

export const useNewGameStore = create<NewGameStore>((set, get) => ({
  ...initial,

  toggleDeck(deckId) {
    set((s) => ({
      deckIds: s.deckIds.includes(deckId)
        ? s.deckIds.filter((id) => id !== deckId)
        : [...s.deckIds, deckId],
    }));
  },

  setMode(mode) {
    set({ mode });
  },

  setTeamCount(count) {
    set((s) => {
      const next = makeTeams(count);
      // Keep names and players already typed for teams that still exist.
      return {
        teams: next.map((team, i) => {
          const existing = s.teams[i];
          return existing ? { ...team, name: existing.name, playerNames: existing.playerNames } : team;
        }),
      };
    });
  },

  renameTeam(teamId, name) {
    set((s) => ({
      teams: s.teams.map((team) => (team.id === teamId ? { ...team, name } : team)),
    }));
  },

  setTeamPlayers(teamId, players) {
    set((s) => ({
      teams: s.teams.map((team) =>
        team.id === teamId ? { ...team, playerNames: normalisePlayerNames(players) } : team,
      ),
    }));
  },

  setSoloPlayers(players) {
    set({ soloPlayers: normalisePlayerNames(players) });
  },

  setRoundSeconds(roundSeconds) {
    set((s) => ({ settings: { ...s.settings, roundSeconds } }));
  },

  setPassPenalty(passPenalty) {
    set((s) => ({ settings: { ...s.settings, passPenalty } }));
  },

  setWinCondition(winCondition) {
    set((s) => ({ settings: { ...s.settings, winCondition } }));
  },

  setShuffleAcrossDecks(shuffleAcrossDecks) {
    set((s) => ({ settings: { ...s.settings, shuffleAcrossDecks } }));
  },

  resolvedTeams() {
    const { mode, teams, soloPlayers } = get();
    return mode === 'justPlay' ? [makeJustPlayTeam(soloPlayers)] : teams;
  },

  reset() {
    set({ ...initial, teams: makeTeams(2) });
  },
}));
