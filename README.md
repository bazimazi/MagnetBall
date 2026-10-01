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

## Visuals

The institute has a procedural kinetic title sculpture, distinct chamber palettes,
machined panels, animated magnetic flux, a tapered probe trail, and a capture iris.
Room selection shows blueprints generated from the actual level geometry. All art
is drawn in Canvas or SVG, with no image downloads or additional runtime dependencies.

Reduced motion keeps decorative fields and the title sculpture still. Pausing also
freezes visual effects. The chamber texture is cached independently of camera easing.

`npm test` includes real Canvas rendering checks for every layout, entry caching,
interrupted color blends, pause, reduced motion, capture, and failure. To also save
review PNGs in PowerShell:

```powershell
$env:RENDER_ARTIFACTS = 'artifacts/visual-review'
npx vitest run tests/render.test.ts
```

## Layout

- `src/physics` — fixed-step deterministic simulation
- `src/game` — levels, objectives, save, codex
- `src/render` — chamber, fields, probe
- `src/audio` — synthesized magnetic feedback
- `src/ui` — institute shell
- `tests/solutions.ts` — input timings, not shipped as hints

Levels are plain data: plates, orbs, rails, shields, panes, and goals. A future editor can emit the same documents.
