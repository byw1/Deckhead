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

## M3

### Sessions are a JSON document, decks are normalised

Opposite choices for opposite access patterns. A deck is queried across — card
counts for every deck at once, search over card text, per-card reordering — so
it is normalised into tables. A session is only ever read whole and written
whole, and splitting teams, rounds and results apart would mean four joins to
reassemble a few kilobytes of JSON.

Because a session round-trips through JSON, every read is parsed and proved
rather than cast, and a round containing one malformed result rejects the whole
round. A partial recovery would silently change a score.

### Rotation is derived, not stored

Whose turn it is comes from the round count modulo the team count, not from a
stored pointer. Same reasoning as score: a stored pointer is a second source of
truth that can drift out of step with the round list. The one piece that is
stored is `nextPlayerIndex` per team, because which player within a team is up
cannot be derived from a round count alone once teams play different numbers of
rounds.

### An interrupted round is discarded, not scored

Sessions are written at round completion, never at round start. If the app dies
mid-round, that round is absent from the stored session and the team takes its
turn again from the top.

The alternative — saving continuously and resuming mid-round — means restoring a
running timer, which is both harder and worse: nobody wants to come back to a
game with eleven seconds left on a round they have lost the thread of. Because
the cards a dropped round showed were never folded into `seenCardIds`, they
return to the pool with no rollback needed.

### Standings and final standings are one screen

The difference between them is what the game asks you to do next, not what it
shows you. The table stays put and only the footer changes, so the score does
not appear to jump between two differently-laid-out screens at the moment
people care about it most.

### Just play is the default, and it is a team underneath

The team path is opt-in. Plenty of groups do not want teams, and making them
configure some before playing is the friction that gets a party app deleted.
Underneath, "just play" is a single team named Everyone, so scoring, rotation
and win conditions all have exactly one code path.

## M4

### Bundled decks are read-only, and duplicate-to-edit is the way in

A bundled deck cannot be edited or deleted. Making them editable would mean
either abandoning re-seeding — so content fixes never reach existing installs —
or letting an app update overwrite someone's changes. Neither is acceptable
against the rule that nothing the user creates can be lost.

Duplicating gives an editable copy with fresh ids, and the deck detail screen
says why in one line rather than presenting a disabled Edit button.

### Reordering is up and down, not drag

Explicit buttons rather than a drag handle. Dragging needs gesture handler and
reanimated wired into a list, is fiddly with the keyboard open, and is close to
unusable under VoiceOver. Up and down are boring, reliable, and each one is a
labelled control a screen reader can announce. Worth revisiting in M6 if
reordering long decks turns out to be common, which is doubtful — most decks
are pasted in the order people already wanted.

### Bulk paste splits on newlines only

One card per line, with an optional hint after a pipe. Commas and dashes stay
literal: "Earth, Wind & Fire" and "Spider-Man" are real card text, and treating
either as a separator would quietly mangle exactly the sort of content people
paste. The pipe is rare enough in card text to be safe and is the only way to
get notes in without a second editing pass.

Duplicates are reported rather than silently added or silently dropped — pasting
a list twice is a common accident, and the count tells you it happened.
