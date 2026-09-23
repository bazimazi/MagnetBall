# Magnet Ball

A physics puzzle about polarity. You do not steer the probe. You change what the room does to it.

Opposite poles attract. Like poles repel. A tap flips the probe. Momentum stays.

## Play

```bash
npm install
npm run dev
```

Open the local URL. Tap anywhere, or the polarity control, to flip. `R` restarts. `Esc` pauses.

The first three wings are hand-authored. Later wings are visible and still dark: the simulation already understands moving fields, shields, rails, inversion panes, lasers, and a laboratory bench, so those rooms can be added as data.

## Scripts

- `npm test` replays a proven solution for every room and checks the physics.
- `npm run solve` searches for those solutions again after a physics or layout change.
- `npm run build` typechecks and builds.

## Layout

- `src/physics` — fixed-step deterministic simulation
- `src/game` — levels, objectives, save, codex
- `src/render` — chamber, fields, probe
- `src/audio` — synthesized magnetic feedback
- `src/ui` — institute shell
- `tests/solutions.ts` — input timings, not shipped as hints

Levels are plain data: plates, orbs, rails, shields, panes, and goals. A future editor can emit the same documents.
