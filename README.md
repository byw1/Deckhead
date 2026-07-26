# Deckhead

A forehead-card party game. One player holds the phone against their forehead
showing a card they can't see. Everyone else shouts clues. The holder guesses.
Repeat until the timer runs out.

Fully offline. No accounts, no ads, no tracking. Every deck is free from
install.

- [SPEC.md](./SPEC.md) — the product spec. The source of truth.
- [ROADMAP.md](./ROADMAP.md) — build order and what is deliberately not in v1.

## Running it

Requires Node 22+.

```sh
npm install
npm start
```

Then scan the QR code with [Expo Go](https://expo.dev/go) on a phone, or press
`i` for the iOS simulator.

## Checks

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # jest
```

## Layout

```
/app              Expo Router screens
/src
  /game           Pure game logic. No React, no React Native imports.
  /decks          Deck schema, validation, import/export
  /storage        Persistence + migrations
  /ui             Components, design tokens
  /hooks
/assets
  /decks          Bundled starter decks as JSON
/spec             Supporting docs. SPEC.md lives at the root.
```

Everything in `/src/game` is pure TypeScript, enforced by an ESLint rule rather
than by convention. Scoring, round resolution and win-condition evaluation are
unit-testable without a renderer.

## Licence

[AGPL-3.0](./LICENSE). See [NOTICE](./NOTICE) for the dual-licensing position
and [TRADEMARK.md](./TRADEMARK.md) for what the code licence does not cover —
forks must rename.
