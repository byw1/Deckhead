import { fireEvent, render, screen } from '@testing-library/react-native';
import type { DeckSummary } from '@/decks/types';
import { DeckCard } from './DeckCard';

/**
 * The spec asks for smoke tests here, not exhaustive component coverage. This
 * checks the things a person would notice: the count reads correctly, an
 * unplayable deck says so, and tapping it goes somewhere.
 */

function summary(overrides: Partial<DeckSummary> = {}): DeckSummary {
  return {
    id: 'dck_00000001',
    name: 'Films Everyone Knows',
    description: 'Everyone has at least heard of it.',
    author: 'Deckhead',
    accentColor: '#FF3D6E',
    tags: ['film'],
    source: 'bundled',
    cardCount: 50,
    updatedAt: '2026-07-26T18:00:00Z',
    ...overrides,
  };
}

describe('DeckCard', () => {
  it('shows the deck name, description and card count', () => {
    render(<DeckCard deck={summary()} onPress={jest.fn()} />);

    expect(screen.getByText('Films Everyone Knows')).toBeTruthy();
    expect(screen.getByText('Everyone has at least heard of it.')).toBeTruthy();
    expect(screen.getByText(/50 cards/)).toBeTruthy();
  });

  it('says card, not cards, for a deck of one', () => {
    render(<DeckCard deck={summary({ cardCount: 1 })} onPress={jest.fn()} />);
    expect(screen.getByText(/^1 card/)).toBeTruthy();
  });

  it('marks a deck with too few cards to play', () => {
    render(<DeckCard deck={summary({ cardCount: 4 })} onPress={jest.fn()} />);
    expect(screen.getByText(/too few to play/)).toBeTruthy();
  });

  it('does not mark a playable deck', () => {
    render(<DeckCard deck={summary({ cardCount: 10 })} onPress={jest.fn()} />);
    expect(screen.queryByText(/too few to play/)).toBeNull();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<DeckCard deck={summary()} onPress={onPress} />);

    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('labels itself for VoiceOver with the name and count', () => {
    render(<DeckCard deck={summary()} onPress={jest.fn()} />);
    expect(screen.getByLabelText('Films Everyone Knows, 50 cards')).toBeTruthy();
  });

  it('survives a deck with no description', () => {
    render(<DeckCard deck={summary({ description: '' })} onPress={jest.fn()} />);
    expect(screen.getByText('Films Everyone Knows')).toBeTruthy();
  });

  it('takes the first character of an emoji name without splitting it', () => {
    // [...name][0] rather than name[0], which would slice a surrogate pair and
    // render a replacement character.
    render(<DeckCard deck={summary({ name: '🎬 Films' })} onPress={jest.fn()} />);
    expect(screen.getByText('🎬')).toBeTruthy();
  });
});
