import { createPool, emptyDrawerState, poolCardKey, type PoolCard } from './cardDrawer';
import {
  createRound,
  elapsedMs,
  end,
  isTimeUp,
  pause,
  remainingMs,
  resolveCard,
  resume,
  start,
  tick,
  type RoundState,
} from './round';

const SIXTY = 60_000;

function pool(count = 50): PoolCard[] {
  return createPool(
    [
      {
        id: 'dck_test',
        accentColor: '#FF3D6E',
        cards: Array.from({ length: count }, (_, i) => ({
          id: `crd_${i}`,
          text: `Card ${i}`,
          note: null,
        })),
      },
    ],
    { seed: 1 },
  );
}

function started(cards = pool(), at = 0, duration = SIXTY): RoundState {
  return start(createRound(duration, emptyDrawerState), cards, at);
}

describe('round lifecycle', () => {
  it('begins in intro with no card showing', () => {
    const round = createRound(SIXTY, emptyDrawerState);
    expect(round.phase).toBe('intro');
    expect(round.card).toBeNull();
  });

  it('deals a card on start', () => {
    const round = started();
    expect(round.phase).toBe('running');
    expect(round.card).not.toBeNull();
  });

  it('ignores a second start', () => {
    const cards = pool();
    const round = started(cards);
    expect(start(round, cards, 5_000)).toBe(round);
  });

  it('ends immediately when there are no cards at all', () => {
    expect(started([]).phase).toBe('ended');
  });
});

describe('the clock', () => {
  it('counts elapsed time from the start', () => {
    const round = started(pool(), 1_000);
    expect(elapsedMs(round, 1_000)).toBe(0);
    expect(elapsedMs(round, 11_000)).toBe(10_000);
    expect(remainingMs(round, 11_000)).toBe(50_000);
  });

  it('never reports more than the round length', () => {
    const round = started();
    expect(elapsedMs(round, 999_999)).toBe(SIXTY);
    expect(remainingMs(round, 999_999)).toBe(0);
  });

  it('does not run backwards if the clock jumps back', () => {
    const round = started(pool(), 10_000);
    expect(elapsedMs(round, 5_000)).toBe(0);
  });

  it('reports time up at exactly the duration', () => {
    const round = started();
    expect(isTimeUp(round, SIXTY - 1)).toBe(false);
    expect(isTimeUp(round, SIXTY)).toBe(true);
  });

  it('ends the round on a tick past the duration', () => {
    const round = started();
    expect(tick(round, 30_000).phase).toBe('running');
    expect(tick(round, SIXTY).phase).toBe('ended');
  });

  it('does not tick a paused round to ended', () => {
    const paused = pause(started(), 10_000);
    expect(tick(paused, 999_999).phase).toBe('paused');
  });
});

describe('pausing for a phone call', () => {
  /**
   * The spec calls this out: an incoming call backgrounds the app, and the
   * timer must not keep running while the player cannot see the screen.
   */
  it('banks elapsed time and stops the clock', () => {
    const round = pause(started(), 20_000);
    expect(round.phase).toBe('paused');
    expect(elapsedMs(round, 999_999)).toBe(20_000);
  });

  it('does not lose time across a pause and resume', () => {
    let round = started();
    round = pause(round, 20_000);
    round = resume(round, 100_000);

    expect(elapsedMs(round, 100_000)).toBe(20_000);
    expect(remainingMs(round, 110_000)).toBe(30_000);
  });

  it('survives several pauses', () => {
    let round = started();
    round = pause(round, 10_000);
    round = resume(round, 50_000);
    round = pause(round, 60_000);
    round = resume(round, 200_000);

    expect(elapsedMs(round, 200_000)).toBe(20_000);
  });

  it('ends rather than resuming when the round was already out of time', () => {
    let round = started();
    round = pause(round, SIXTY + 5_000);
    expect(resume(round, 999_999).phase).toBe('ended');
  });

  it('ignores a pause when not running and a resume when not paused', () => {
    const round = started();
    expect(pause(pause(round, 10_000), 20_000).bankedMs).toBe(10_000);
    expect(resume(round, 10_000)).toBe(round);
  });

  it('lets cards resolve after resuming', () => {
    const cards = pool();
    let round = started(cards);
    round = pause(round, 10_000);
    round = resume(round, 100_000);
    round = resolveCard(round, cards, 'correct', 105_000);

    expect(round.results).toHaveLength(1);
    expect(round.results[0]?.atMs).toBe(15_000);
  });
});

describe('resolving cards', () => {
  it('records the outcome and the time it happened', () => {
    const cards = pool();
    const round = resolveCard(started(cards), cards, 'correct', 4_200);

    expect(round.results).toEqual([
      { cardId: poolCardKey(cards[0]!), outcome: 'correct', atMs: 4_200 },
    ]);
  });

  it('deals the next card', () => {
    const cards = pool();
    const first = started(cards);
    const second = resolveCard(first, cards, 'correct', 1_000);

    expect(second.card).not.toBeNull();
    expect(poolCardKey(second.card!)).not.toBe(poolCardKey(first.card!));
  });

  it('records passes as well as correct answers', () => {
    const cards = pool();
    let round = started(cards);
    round = resolveCard(round, cards, 'correct', 1_000);
    round = resolveCard(round, cards, 'pass', 2_000);
    round = resolveCard(round, cards, 'correct', 3_000);

    expect(round.results.map((r) => r.outcome)).toEqual(['correct', 'pass', 'correct']);
  });

  it('never shows the same card twice in a round', () => {
    const cards = pool(30);
    let round = started(cards);

    for (let i = 0; i < 25; i += 1) {
      round = resolveCard(round, cards, 'correct', i * 100);
    }

    expect(new Set(round.results.map((r) => r.cardId)).size).toBe(round.results.length);
  });

  /**
   * The player saw the card and answered, so it counts. Discarding it would
   * lose a point somebody earned.
   */
  it('counts a card answered exactly as time runs out', () => {
    const cards = pool();
    const round = resolveCard(started(cards), cards, 'correct', SIXTY);

    expect(round.results).toHaveLength(1);
    expect(round.phase).toBe('ended');
  });

  it('ignores taps after the round has ended', () => {
    const cards = pool();
    const ended = end(started(cards), 10_000);
    expect(resolveCard(ended, cards, 'correct', 11_000)).toBe(ended);
  });

  it('ignores taps while paused, so a background tap cannot score', () => {
    const cards = pool();
    const paused = pause(started(cards), 10_000);
    expect(resolveCard(paused, cards, 'correct', 11_000)).toBe(paused);
  });

  it('ends when the pool recycles and flags it for the recap', () => {
    const cards = pool(3);
    let round = started(cards);
    round = resolveCard(round, cards, 'correct', 1_000);
    round = resolveCard(round, cards, 'correct', 2_000);
    round = resolveCard(round, cards, 'correct', 3_000);

    expect(round.reshuffled).toBe(true);
    expect(round.results).toHaveLength(3);
  });
});

describe('ending', () => {
  it('clears the card so nothing is left on screen', () => {
    expect(end(started(), 10_000).card).toBeNull();
  });

  it('freezes the elapsed time', () => {
    const round = end(started(), 25_000);
    expect(elapsedMs(round, 999_999)).toBe(25_000);
  });

  it('is idempotent', () => {
    const round = end(started(), 10_000);
    expect(end(round, 20_000)).toBe(round);
  });

  it('keeps results already recorded', () => {
    const cards = pool();
    let round = started(cards);
    round = resolveCard(round, cards, 'correct', 1_000);
    round = end(round, 5_000);

    expect(round.results).toHaveLength(1);
  });
});
