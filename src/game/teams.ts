import type { Team } from './types';

/**
 * Team setup.
 *
 * "Just play" matters: plenty of groups do not want teams. That path is a
 * single team everyone belongs to, which keeps one code path for scoring while
 * still tracking a cumulative score per player.
 */

export const MIN_TEAMS = 1;
export const MAX_TEAMS = 6;

/** Distinct enough to tell apart across a dim room, and distinct from the flash colours. */
export const TEAM_COLORS = [
  '#FF3D6E',
  '#00B8D9',
  '#FFC53D',
  '#7C5CFF',
  '#36D399',
  '#FF7A45',
] as const;

export const DEFAULT_TEAM_NAMES = [
  'Reds',
  'Blues',
  'Yellows',
  'Purples',
  'Greens',
  'Oranges',
] as const;

export const JUST_PLAY_TEAM_NAME = 'Everyone';

export function makeTeam(index: number, overrides: Partial<Team> = {}): Team {
  return {
    id: `tm_${index + 1}`,
    name: DEFAULT_TEAM_NAMES[index % DEFAULT_TEAM_NAMES.length]!,
    color: TEAM_COLORS[index % TEAM_COLORS.length]!,
    playerNames: [],
    nextPlayerIndex: 0,
    ...overrides,
  };
}

export function makeTeams(count: number): Team[] {
  const clamped = Math.min(MAX_TEAMS, Math.max(MIN_TEAMS, Math.round(count)));
  return Array.from({ length: clamped }, (_, i) => makeTeam(i));
}

/**
 * The no-teams path: one team, and the players are the scoreboard.
 *
 * Names are optional even here. Without them the session still runs, it just
 * has nothing to put on a per-player table.
 */
export function makeJustPlayTeam(playerNames: string[] = []): Team {
  return makeTeam(0, {
    name: JUST_PLAY_TEAM_NAME,
    playerNames: normalisePlayerNames(playerNames),
  });
}

export function isJustPlay(teams: readonly Team[]): boolean {
  return teams.length === 1 && teams[0]?.name === JUST_PLAY_TEAM_NAME;
}

/**
 * Trims, drops blanks, and de-duplicates case-insensitively.
 *
 * Two players called "Sam" would make the per-player table meaningless, and
 * the second one is nearly always a typo rather than a real second Sam.
 */
export function normalisePlayerNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;

    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(name);
  }

  return out;
}

/** A team is ready if it has a name. Player names are optional throughout. */
export function isTeamReady(team: Team): boolean {
  return team.name.trim().length > 0;
}

export function areTeamsReady(teams: readonly Team[]): boolean {
  if (teams.length < MIN_TEAMS || teams.length > MAX_TEAMS) return false;
  if (!teams.every(isTeamReady)) return false;

  // Two teams with the same name makes the standings unreadable.
  const names = teams.map((t) => t.name.trim().toLocaleLowerCase());
  return new Set(names).size === names.length;
}
