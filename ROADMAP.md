# Roadmap

Build order is defined in [SPEC.md](./SPEC.md). Each milestone ends green and
committed, with a check-in before the next one starts.

| Milestone | Scope | Status |
|---|---|---|
| M1 | Scaffold: Router, design tokens, deck schema, SQLite + migrations, five starter decks, deck browser and detail | Complete |
| M2 | The round: card drawer, timer, tap input, haptics, state flashes, countdown, recap | Not started |
| M3 | Sessions: teams, rotation, multi-round loop, win conditions, standings, resume | Not started |
| M4 | Custom decks: editor, bulk paste, duplicate, delete, reordering | Not started |
| M5 | Sharing: export, QR, file import, deep links, preview and collision handling | Not started |
| M6 | Polish: tilt mode, settings, accessibility, backgrounding, empty and error states | Not started |
| M7 | Ship: EAS config, icons and splash, screenshots, privacy manifest, TestFlight | Not started |

## Not in v1

Deliberately excluded. Listed here so the decisions stay visible rather than
being rediscovered as gaps.

- **AI deck generation** — needs a server, which breaks the fully-offline rule.
- **Second-device / companion-phone mode** — same reason.
- **Apple Watch app** — a separate target and a separate input model.
- **Localization beyond English** — deck content is language-tagged, so the data
  model is ready, but no translated UI ships in v1.
- **Community deck repository** — needs hosting and moderation.
- **Video recording of the guesser** — camera is scoped to QR import only.
- **Any monetization** — all content is free from install, no IAP.

## Deferred to a later milestone

Decisions made during M1 that need revisiting when the milestone that depends on
them arrives.

- **react-native-mmkv** is not installed yet. v4 is a Nitro module and does not
  run in Expo Go, which would force a development build for every review of
  M1–M2. It is not needed until session resume in M3. When M3 lands, either
  accept the development build (needed before shipping anyway) or use
  `expo-sqlite/kv-store`, which fills the same synchronous key-value role with
  no extra native dependency.
- **Card id regeneration on duplicate.** Card ids are stable and never
  regenerated on edit, so a duplicated deck would otherwise share ids with its
  source and corrupt seen-card tracking in a session containing both. Duplicate
  and import-as-copy must mint new card ids. See `src/decks/README.md`.
- **base64url for deep links.** The export payload is base64url-encoded, not
  standard base64, because `+` and `/` are not URL-safe in the
  `deckhead://deck?d=<payload>` link. Relevant in M5.
- **Custom deck empty state.** The browser hides the "Yours" section when there
  are no custom decks. The spec wants an empty state that invites rather than
  apologises, but the thing it should invite you to — the deck editor — does not
  exist until M4. The invitation ships with the editor it points at.
- **Accent colour and the state flash.** A user-chosen `accentColor` close to
  the correct or pass colour would stop the full-screen flash reading, which is
  the signature element. The M4 editor should warn on that, using perceptual
  colour distance. This replaces an earlier concern about accent colour clashing
  with card text, which turned out not to be possible — see
  `src/ui/contrast.ts`.
