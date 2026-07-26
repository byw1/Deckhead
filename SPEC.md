# Deckhead

A forehead-card party game. One player holds the phone against their forehead showing a card they can't see. Everyone else shouts clues. The holder guesses. Repeat until the timer runs out.

The category leader is Warner Bros' "Heads Up!". We are not cloning it and we are not using its name, decks, or visual style. The mechanic itself is public domain charades. We win on the things it does badly: free decks, custom decks that are actually shareable, reliable controls, and a game that has an ending.

---

## Non-negotiables

These are product decisions, not preferences. Don't design around them.

1. **Fully offline.** The core app makes zero network calls. No accounts, no sign-in, no cloud sync in v1. If a feature needs a server, it doesn't ship in v1.
2. **No analytics, no ads, no tracking SDKs.** No ATT prompt. This is a stated differentiator on the store listing.
3. **All content free.** Every bundled deck is available from install. No IAP in v1.
4. **Nothing the user creates can be lost.** Decks and sessions persist locally and survive updates. Migration paths for schema changes are mandatory, not optional.
5. **Tap is the default input, not tilt.** Tilt is an opt-in setting. The single most common complaint about the incumbent is unreliable gyro controls.

---

## Stack

- **Expo** (managed workflow) + **React Native** + **TypeScript** in strict mode
- **Expo Router** for navigation
- **expo-sensors** for accelerometer (tilt mode)
- **expo-haptics** for feedback
- **expo-keep-awake** so the screen never sleeps mid-round
- **expo-brightness** to boost during a round and restore after
- **expo-screen-orientation** for per-screen orientation locking
- **react-native-mmkv** for settings and small state, **expo-sqlite** for decks and session history
- **zustand** for game state. No Redux.
- **expo-camera** for QR scanning on deck import only
- **EAS Build** and **EAS Submit** for the iOS pipeline

Verify current versions against Expo docs before installing. Do not pin from memory.

---

## Repo structure

```
/app              Expo Router screens
/src
  /game           Pure game logic. No React, no RN imports.
  /decks          Deck schema, validation, import/export
  /storage        Persistence + migrations
  /ui             Components, design tokens
  /hooks
/assets
  /decks          Bundled starter decks as JSON
/spec             SPEC.md lives at root, supporting docs here
```

**Hard rule:** everything in `/src/game` is pure TypeScript with no React or React Native imports. Scoring, round resolution, and win-condition evaluation must be unit-testable without a renderer.

---

## Data model

### Deck

```json
{
  "schemaVersion": 1,
  "id": "dck_7f3a9c21",
  "name": "2000s Emo Bands",
  "description": "For people who owned a studded belt.",
  "author": "will",
  "language": "en",
  "accentColor": "#FF3D6E",
  "tags": ["music", "nostalgia"],
  "createdAt": "2026-07-26T18:00:00Z",
  "updatedAt": "2026-07-26T18:00:00Z",
  "cards": [
    { "id": "crd_a1b2c3d4", "text": "My Chemical Romance", "note": null }
  ]
}
```

Rules:

- `schemaVersion` is mandatory and checked on every import. Unknown future versions get rejected with a clear message, not a crash.
- Card `id` is stable and never regenerated on edit. Seen-card tracking depends on it.
- `text` soft-caps at 60 characters. Longer text is allowed but warn in the editor, because it wrecks legibility at arm's length.
- `note` is an optional clue-giver hint, shown only in the recap screen. Never on the card.
- A deck needs at least 10 cards to be playable. Fewer is allowed to exist, just not to start a round.
- `accentColor` drives the card background for that deck.

### Session

```ts
type WinCondition =
  | { kind: 'rounds'; count: number }
  | { kind: 'score'; target: number }
  | { kind: 'deckExhausted' }

type Team = {
  id: string
  name: string
  color: string
  playerNames: string[]
  nextPlayerIndex: number   // rotates who holds the phone
}

type RoundResult = {
  cardId: string
  outcome: 'correct' | 'pass'
  atMs: number              // ms elapsed into the round
}

type Round = {
  id: string
  teamId: string
  playerName: string | null
  startedAt: string
  endedAt: string | null
  results: RoundResult[]
}

type Session = {
  id: string
  deckIds: string[]
  settings: {
    roundSeconds: number            // 30 | 60 | 90 | custom 15-180
    passPenalty: number             // 0 or 1, default 0
    inputMode: 'tap' | 'tilt'
    winCondition: WinCondition
    shuffleAcrossDecks: boolean
  }
  teams: Team[]
  rounds: Round[]
  seenCardIds: string[]
  createdAt: string
  completedAt: string | null
}
```

**Score is always derived from `rounds`, never stored.** A recap edit changes a `RoundResult` and the standings recompute. There is no separate score field to drift out of sync.

**No repeats:** `seenCardIds` grows across the whole session. The card drawer only recycles once the combined deck pool is exhausted, and when it does, it resets `seenCardIds` and surfaces a small "deck reshuffled" note in the recap.

---

## Game flow

```
Home
 └─ New game
     ├─ Pick decks            (multi-select, shows card counts)
     ├─ Teams                 (1-6 teams, optional player names, or "just play" solo-team mode)
     ├─ Settings              (round length, win condition, pass penalty, input mode)
     └─ Start
          ↓
     Round intro              ("Sam, phone on your forehead" → 3-2-1 countdown)
          ↓
     Round                    (full-bleed card, timer, tap/tilt to resolve)
          ↓
     Recap                    (every card, correct/pass, tappable to override)
          ↓
     Standings                (cumulative, all teams)
          ↓
     Next round ──────────────┘   or   Final standings → Rematch / Home
```

**"Just play" mode matters.** A lot of groups don't want teams. Offer a single-team path that skips team setup entirely and still tracks cumulative score per player across rounds.

---

## Screens

| Screen | Orientation | Notes |
|---|---|---|
| Home | Portrait | Resume in-progress session if one exists |
| Decks | Portrait | Bundled + custom, search, card counts |
| Deck detail | Portrait | Card list, edit, duplicate, share, delete |
| Deck editor | Portrait | Add/edit/reorder/bulk-paste cards |
| Import deck | Portrait | QR scan, file, or paste JSON |
| New game (3 steps) | Portrait | Decks → teams → settings |
| Round intro | Landscape | Who's up, countdown |
| Round | Landscape | The card screen |
| Recap | Landscape | Editable results |
| Standings | Portrait | Cumulative, per team and per player |
| Settings | Portrait | Input mode, haptics, sound, brightness, reset |

---

## Input and feedback

**Tap mode (default).** Top half of the screen = correct. Bottom half = pass. Full-screen hit areas, no small buttons. The holder can't see the screen, so the targets have to be enormous and positionally obvious.

**Tilt mode (opt-in).** Tilt down = correct, tilt up = pass. Requires a deliberate threshold plus a return-to-neutral before the next card can resolve. Debounce hard. A single excited jerk of the phone must not register.

**Haptics carry the signal, not sound.**
- Correct: two short crisp pulses
- Pass: one long dull pulse
- 10 seconds remaining: three light ticks
- Time up: sustained heavy pattern

Sound is **off by default**. When the phone dings for "correct," the guesser knows they got it before anyone speaks, and it leaks information across the room. Make this a setting with a one-line explanation of why it's off.

**During a round:** keep-awake on, brightness pushed toward max, orientation locked landscape, notifications don't matter but incoming calls will interrupt so handle app backgrounding by pausing the timer and offering resume.

---

## Deck sharing

This is the feature the whole product hangs on. The incumbent technically has custom decks and almost nobody uses them because sharing is painful.

- **Export:** deck JSON → gzip → base64. Share sheet with a `.deckhead` file attachment.
- **QR:** if the compressed payload fits comfortably in a QR code (roughly under 1.5KB, so most decks under ~150 cards), render a full-screen QR. Otherwise fall back to the file and say so plainly.
- **Deep link:** `deckhead://deck?d=<base64>` and a universal-link equivalent once a domain exists.
- **Import:** QR scan, file open, or paste. Always show a preview with deck name and card count and require a confirm tap. Never import silently.
- **Collisions:** importing a deck whose `id` already exists prompts to replace or save as a copy. Never overwrite without asking.

Target: someone builds a deck of inside jokes and seven people have it in under thirty seconds.

---

## Design direction

The design brief is set by the physical situation: a phone held at arm's length on someone's forehead, read by a group across a dim room, often after drinks. Legibility at distance and in low light beats every other consideration. This is not negotiable, and it should drive the visual identity rather than being a constraint bolted onto a pretty design.

**The card is the whole screen.** No chrome, no container, no card-shaped card. Full-bleed deck accent color, text auto-fitted to fill the available width in a heavy condensed face. The timer is a thin bar along one edge, not a number competing with the word.

**State is communicated by full-screen color flash.** Correct and pass each take over the entire display for ~250ms. The group reads the result from across the room without looking for a small indicator. This is the signature element. Spend the boldness here and keep everything else quiet.

Starting tokens, adjust with reason:

```
ink       #14121A   app chrome base
bone      #F5F2EC   type on colored surfaces
correct   #2BD576   full-screen flash
pass      #FF7A45   full-screen flash
brand     #FF3D6E   accent, default deck color
```

Type: a heavy condensed grotesque for card text, because band names and movie titles are long and condensed buys you size. A neutral face for UI. Do not use the same face for both.

Avoid: cream backgrounds with high-contrast serifs, near-black with a single acid-green accent, and hairline-rule broadsheet layouts. Those are the current defaults and they read as templated.

Copy: plain verbs, sentence case, no exclamation marks in UI chrome. "Got it" and "Pass," not "Correct!" and "Skip!". Empty states are invitations, so the decks screen with no custom decks says what to do next rather than apologizing.

---

## Not in v1

Don't build these. Note them in a ROADMAP.md if useful.

- AI deck generation
- Second-device / companion-phone mode
- Apple Watch app
- Localization beyond English
- Community deck repository
- Video recording of the guesser
- Any monetization

---

## Build order

Each milestone should end green and committed. Do not start the next one without a check-in.

**M1 — Scaffold.** Expo + TS + Router, design tokens, deck schema and validator, SQLite storage with a migration path, five bundled starter decks, deck browser and deck detail. No gameplay yet.

**M2 — The round.** Card drawer with no-repeat tracking, timer, tap input, haptics, full-screen state flashes, round intro countdown, recap screen with editable results. Single round, no session.

**M3 — Sessions.** Teams, player rotation, multi-round loop, all three win conditions, cumulative standings, final standings, resume in-progress session.

**M4 — Custom decks.** Deck editor with bulk paste, duplicate, delete, card reordering.

**M5 — Sharing.** Export, QR generate and scan, file import, deep links, import preview and collision handling.

**M6 — Polish.** Tilt mode, settings screen, accessibility pass (Dynamic Type, VoiceOver on menus, reduced motion, contrast), backgrounding and interruption handling, empty and error states.

**M7 — Ship.** EAS config, icons and splash, store screenshots, privacy manifest declaring no data collection, TestFlight.

---

## Testing

Unit-test `/src/game` properly: score derivation, win-condition evaluation, card drawing with no-repeat, recap edits recomputing standings, session serialization round-trips. That's where the bugs will be.

Don't write exhaustive component tests. A smoke test that the round screen renders and resolves a card is enough.

---

## Licensing and repo hygiene

- **LICENSE:** AGPL-3.0. Public forks stay open.
- **NOTICE:** states that the copyright holder dual-licenses, and that the App Store build ships under a separate proprietary license. This resolves the known conflict between GPL-family terms and Apple's distribution terms.
- **TRADEMARK.md:** the name "Deckhead," the icon, and the wordmark are not covered by the code license. Forks must rename.
- **.gitignore:** app icon source, wordmark, store screenshots, and any premium deck content stay out of the public repo.
- No `Heads Up!` references anywhere in code, comments, decks, or docs.

---

## Ship config

- Bundle ID: `com.deckhead.app` (placeholder, confirm before first EAS build)
- App Store name: `Deckhead`
- Subtitle: `Charades Party Game` — the brand goes in the name field, the keywords go here
- Privacy: declare no data collection. It's true and it's a selling point.
- Orientation: portrait for menus, landscape locked for round screens
