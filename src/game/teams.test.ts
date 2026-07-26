import {
  areTeamsReady,
  isJustPlay,
  makeJustPlayTeam,
  makeTeam,
  makeTeams,
  MAX_TEAMS,
  MIN_TEAMS,
  normalisePlayerNames,
  TEAM_COLORS,
} from './teams';

describe('making teams', () => {
  it('gives each team a distinct name and colour', () => {
    const teams = makeTeams(6);
    expect(new Set(teams.map((t) => t.name)).size).toBe(6);
    expect(new Set(teams.map((t) => t.color)).size).toBe(6);
    expect(new Set(teams.map((t) => t.id)).size).toBe(6);
  });

  it('clamps to the supported range', () => {
    expect(makeTeams(0)).toHaveLength(MIN_TEAMS);
    expect(makeTeams(-3)).toHaveLength(MIN_TEAMS);
    expect(makeTeams(99)).toHaveLength(MAX_TEAMS);
  });

  it('starts every team at no players and the first slot', () => {
    for (const team of makeTeams(3)) {
      expect(team.playerNames).toEqual([]);
      expect(team.nextPlayerIndex).toBe(0);
    }
  });

  it('has a colour for every supported team count', () => {
    expect(TEAM_COLORS.length).toBeGreaterThanOrEqual(MAX_TEAMS);
  });

  it('accepts overrides', () => {
    expect(makeTeam(0, { name: 'The Winners' }).name).toBe('The Winners');
  });
});

describe('just play mode', () => {
  it('is a single team everyone is on', () => {
    const team = makeJustPlayTeam(['Sam', 'Alex']);
    expect(team.name).toBe('Everyone');
    expect(team.playerNames).toEqual(['Sam', 'Alex']);
    expect(isJustPlay([team])).toBe(true);
  });

  it('works with no player names at all', () => {
    expect(makeJustPlayTeam().playerNames).toEqual([]);
  });

  it('is distinguishable from ordinary teams', () => {
    expect(isJustPlay(makeTeams(2))).toBe(false);
    expect(isJustPlay(makeTeams(1))).toBe(false);
  });
});

describe('player names', () => {
  it('trims and drops blanks', () => {
    expect(normalisePlayerNames([' Sam ', '', '   ', 'Alex'])).toEqual(['Sam', 'Alex']);
  });

  /** Two players called Sam would make the per-player table meaningless. */
  it('de-duplicates case insensitively, keeping the first spelling', () => {
    expect(normalisePlayerNames(['Sam', 'sam', 'SAM', 'Alex'])).toEqual(['Sam', 'Alex']);
  });

  it('keeps genuinely different names', () => {
    expect(normalisePlayerNames(['Sam', 'Samantha'])).toEqual(['Sam', 'Samantha']);
  });

  it('preserves order', () => {
    expect(normalisePlayerNames(['Jo', 'Alex', 'Sam'])).toEqual(['Jo', 'Alex', 'Sam']);
  });

  it('handles an empty list', () => {
    expect(normalisePlayerNames([])).toEqual([]);
  });
});

describe('readiness', () => {
  it('accepts a normal set of teams', () => {
    expect(areTeamsReady(makeTeams(3))).toBe(true);
  });

  it('accepts a single team', () => {
    expect(areTeamsReady(makeTeams(1))).toBe(true);
    expect(areTeamsReady([makeJustPlayTeam()])).toBe(true);
  });

  it('rejects no teams or too many', () => {
    expect(areTeamsReady([])).toBe(false);
    expect(areTeamsReady(Array.from({ length: 7 }, (_, i) => makeTeam(i)))).toBe(false);
  });

  it('rejects a team with a blank name', () => {
    const teams = makeTeams(2);
    teams[0] = { ...teams[0]!, name: '   ' };
    expect(areTeamsReady(teams)).toBe(false);
  });

  /** Duplicate names make the standings table unreadable. */
  it('rejects two teams sharing a name, ignoring case and spacing', () => {
    const teams = makeTeams(2);
    teams[1] = { ...teams[1]!, name: ' reds ' };
    expect(areTeamsReady(teams)).toBe(false);
  });
});
