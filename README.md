# Web Engines Compare

Benchmarks comparing [PlayCanvas](https://playcanvas.com), [Three.js](https://threejs.org)
and [Babylon.js](https://www.babylonjs.com) — including different versions of the same
engine, so optimizations can be measured release to release.

**Live:** https://mvaligursky.github.io/web-engines-compare/

## Tests

### Draw Call Performance (`tests/draw-calls/`)

CPU submission cost test: a dense 2D grid of tiny cubes (10K–20K in 1K steps), each cube
its own draw call, viewed by matching perspective cameras so every engine renders the
same deterministic image. Cubes are tiny in screen space and MSAA is off with pixel
ratio forced to 1, so GPU cost stays low and the numbers reflect main-thread submission
cost.

- **Unique materials** dropdown (1, 50, 100 … 1000): materials are assigned round-robin,
  so more unique materials means more state changes between draws.
- **Material complexity** dropdown — native PBR (glTF metallic-roughness compatible)
  materials in all engines (`StandardMaterial` / `MeshStandardMaterial` /
  `PBRMetallicRoughnessMaterial`):
  - *Simple* — base color / metallic / roughness factors only
  - *Textured* — + unique base color texture per material
  - *Complex* — + metallic-roughness, normal and emissive textures per material
- The grid runs each row cumulatively (build 10K, measure, add 1K more, measure, …) so a
  full column is a single engine session.

Reported metrics per cell:

- **CPU frame time (ms)** — mean main-thread time the engine spends per frame
  (update + draw submission) over 60 measured frames after 10 warmup frames. Measured
  around `renderer.render()` (three), `beginFrame/scene.render/endFrame` (Babylon) and
  between the `frameupdate`/`frameend` app events (PlayCanvas).
- **Effective FPS** — measured frames divided by wall-clock time (includes vsync and
  GPU stalls).

## Adding an engine version

Edit [`engines.config.js`](engines.config.js) and add an entry:

```js
{
    id: 'playcanvas-2.23.0-dev',
    engine: 'playcanvas',
    label: 'PlayCanvas 2.23 dev',
    shortLabel: 'PC 2.23d',
    kind: 'esm',
    url: './local-builds/playcanvas-2.23.0-dev.mjs'
}
```

- Published versions: point `url` at a CDN (jsdelivr/unpkg).
- Custom/unreleased builds: copy a single-file build into `local-builds/` and use a
  relative url as above (for PlayCanvas: `npm run build` then copy
  `build/playcanvas.mjs`).
- `kind: 'script'` with a `global` field loads UMD builds (used for Babylon).

Every entry appears as a column in every test.

## Running locally

Static site, no build step. Serve the repo root with any web server:

```
npx http-server -p 8080 .
```

Dev-only URL params for quick iterations (defaults are the real benchmark):
`?rows=500,1000&warmup=3&measure=20`

## Methodology notes

- Scene, camera, light and materials are defined once in engine-agnostic form
  ([`lib/scene-spec.js`](lib/scene-spec.js)) and instantiated by thin per-engine
  adapters ([`adapters/`](adapters)); everything is deterministic (seeded PRNG).
- One directional light, no shadows, no IBL, no ambient in every engine.
- Each engine run creates a fresh canvas + context and is torn down afterwards;
  a short pause between engines lets the browser reclaim GPU memory.
- Engines keep their default per-frame behavior (culling, transform management) —
  that is part of what is being compared. Nothing is frozen or instanced.
