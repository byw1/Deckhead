import actItOut from '../../assets/decks/act-it-out.json';
import animals from '../../assets/decks/animals.json';
import aroundTheHouse from '../../assets/decks/around-the-house.json';
import films from '../../assets/decks/films-everyone-knows.json';
import foodAndDrink from '../../assets/decks/food-and-drink.json';

/**
 * The decks that ship with the app.
 *
 * Imported as JSON modules so Metro bundles them — no filesystem read, no
 * asset unpacking, and they are available on the very first launch offline.
 *
 * Deck and card ids in these files are derived from a hash of the deck slug and
 * card text, so regenerating them is stable. A bundled deck's id must never
 * change: re-seeding matches on it, and a changed id would orphan the copy
 * already on a user's device.
 *
 * Typed as unknown deliberately. These pass through the same validator as an
 * imported deck, so a malformed bundled deck is caught by a test rather than
 * trusted because it happens to live in the repo.
 */
export const bundledDeckDocuments: readonly unknown[] = [
  films,
  animals,
  foodAndDrink,
  actItOut,
  aroundTheHouse,
];
