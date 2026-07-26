# Decisions

Choices made while building that the spec did not settle, and the reasoning
behind them. Supporting doc to [SPEC.md](../SPEC.md).

## M1

### Card ids must be regenerated on duplicate and import-as-copy

The spec says a card `id` is stable and never regenerated on edit, because
seen-card tracking depends on it. That is right, but it leaves a gap: duplicating
a deck, or importing a deck as a copy after an id collision, produces two decks
whose cards share ids.

`Session.seenCardIds` is a flat list of card ids across a multi-deck pool. If a
session includes both the original and the copy, marking a card seen in one
silently marks it seen in the other, and the round quietly skips cards it should
have drawn.

Duplicating is not editing, so minting fresh card ids on copy does not violate
the stability rule. Storage additionally keys seen-tracking as `deckId/cardId`
so the invariant holds even if a malformed deck arrives by import. The public
`Session.seenCardIds: string[]` shape from the spec is unchanged; the strings
are composite keys.

### Storage is normalised, not a JSON blob per deck

Decks could be stored as one JSON document per row. They are stored as `decks`
plus `cards` instead, because the deck browser needs card counts for every deck
at once, search needs to match card text, and M4 needs per-card reordering. All
three are one query against a normalised schema and a full table scan plus parse
against blobs.

The JSON shape in the spec remains the interchange format for import and export.
It is not the storage format.

### Bundled decks live in the same tables as custom decks

A `source` column marks a deck as `bundled` or `custom`. Bundled decks are not
special-cased anywhere downstream: counts, search, deck selection and sessions
treat them identically. The only difference is that bundled decks are read-only
until M4 offers duplicate-to-edit, and that seeding re-applies them when their
`updatedAt` moves forward in an app update.

This keeps the "nothing the user creates can be lost" rule simple to honour.
Re-seeding only ever touches rows marked `bundled`, so a custom deck cannot be
overwritten by an update.

### iPad is not supported

`supportsTablet` is false. The game is a phone held against a forehead, and
per-screen orientation locking on iPad requires `requireFullScreen`, which is an
extra constraint to carry for a form factor nobody will use this way. The app
runs on iPad in iPhone compatibility mode.

### No validation library

The deck validator is hand-written rather than using zod or similar. The rules
are a short list of shape and range checks, they need to produce import error
messages aimed at a person rather than a developer, and the validator runs
against untrusted input from QR codes and files in M5. A dependency-free
validator keeps the import path auditable and the dependency tree small.

### Anton for card text

The spec asks for a heavy condensed grotesque for card text and a separate
neutral face for UI. Card text uses Anton, which is free under the SIL Open Font
License, genuinely condensed, and available as a single heavy weight — which is
all the card needs. UI uses the system font, which costs nothing to load and
inherits Dynamic Type support for the accessibility pass in M6.

Both are referenced through design tokens, so swapping either is a one-line
change.
