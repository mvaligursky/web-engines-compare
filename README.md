# Web Engines Compare

Benchmarks comparing [PlayCanvas](https://playcanvas.com), [Three.js](https://threejs.org)
and [Babylon.js](https://www.babylonjs.com) — across engine versions *and* graphics
backends, so optimizations can be measured release to release.

**Live:** https://mvaligursky.github.io/web-engines-compare/

Every engine version declares a build per backend (WebGL2 and WebGPU), and each
(version, backend) pair becomes a column in every test. In the charts, color identifies
the engine version and a dashed line means WebGPU.

## Tests

### Draw Call Performance (`tests/draw-calls/`)

CPU submission cost test: a dense 2D grid of tiny cubes (1K–20K in 1K steps), each cube
its own draw call, viewed by matching perspective cameras so every engine renders the
same deterministic image. Cubes are tiny in screen space and MSAA is off with pixel
ratio forced to 1, so GPU cost stays low and the numbers reflect main-thread submission
cost. (Verified: shrinking the viewport 8x moves the results by only a few percent, so
the test really is CPU-bound.)

- **Unique materials** dropdown (1, 50, 100 … 1000): materials are assigned round-robin,
  so more unique materials means more state changes between draws.
- **Material complexity** dropdown — native PBR (glTF metallic-roughness compatible)
  materials in all engines (`StandardMaterial` / `MeshStandardMaterial` /
  `PBRMetallicRoughnessMaterial`):
  - *Simple* — base color / metallic / roughness factors only
  - *Textured* — + unique base color texture per material
  - *Complex* (default) — + metallic-roughness, normal and emissive textures per material
- **Draw order** dropdown — see below.
- The grid runs each row cumulatively (build 1K, measure, add 1K more, measure, …) so a
  full column is a single engine session.

## Draw order

This test is about submitting **lots of unsorted meshes**, so the default is creation
order: every engine and backend submits in exactly the same grid order and the material
changes on nearly every draw.

That matters because, left to themselves, these engines reorder opaque draws and **do not
agree on the criteria**. Five of the six columns group draws by material — which collapses
the per-draw material binds this test exists to measure — while three.js on WebGPU sorts
by depth and does not group, so it performs ~100x more material rebinds than its
neighbours. That divergence is real engine behaviour and is never overridden; it is simply
not the interesting case here, and it makes the columns incomparable.

| Engine | Default opaque sort | Groups by material? |
| --- | --- | --- |
| PlayCanvas (both) | `SORTMODE_MATERIALMESH` on `MeshInstance._sortKeyForward` (packs `material.id`) | yes |
| Three.js WebGL2 | `painterSortStable`: groupOrder → renderOrder → `material.id` → variant → z → id | yes |
| Three.js WebGPU | a *different* `painterSortStable`: groupOrder → renderOrder → **z** → id | **no** |
| Babylon.js (both) | `RenderingGroup.PainterSortCompare` = `material.uniqueId` difference | yes |

The two modes:

- **Creation order** (default) — cubes submitted in grid order, so the material changes on
  nearly every draw. Same submission order in every engine and backend, isolating raw
  per-draw cost.
- **Engine default** — nothing overridden; every engine sorts however it normally would
  (the table above). Shows what each engine's own sort buys it, but the columns are not
  submitting in the same order, so cross-engine numbers are not like-for-like.

Only creation order is forced, and here is how, per engine:

| Engine | Forcing creation order |
| --- | --- |
| PlayCanvas | `layer.opaqueSortMode = SORTMODE_NONE` — skips the sort, submits in MeshInstance insertion order |
| Three.js | `renderer.sortObjects = false` — skips the sort *and* the per-object depth projection (both backends) |
| Babylon.js | `scene.setRenderingOrder(0, byUniqueId)` — Babylon has **no** unsorted opaque path, so an explicit comparator is required |

Verified at two independent levels: each engine's own submission order (material switches
come out at 99 grouped vs 1999 forced, for 2000 cubes / 100 materials) and GPU-API state
churn on WebGL (texture rebinds per frame, 100 vs 2000).

## What is measured

**CPU frame time (ms)** — the mean main-thread time the engine spends per frame, over 20
measured frames after 5 warmup frames (plus 8 discarded settle frames).

This is the engine's **whole per-frame CPU cost**, not just the draw-submission part. It
includes world-matrix updates, frustum culling, render-list build and sort, material and
uniform binding, and draw submission. It excludes GPU execution and vsync idle, because
all three engines return before the GPU has finished the frame — so a GPU-bound scene
would *not* show up here (which is why the scene is deliberately GPU-light).

Where the timer sits in each engine:

| Engine | Measured window | Covers |
| --- | --- | --- |
| Three.js | around `renderer.render()` | matrix update, culling, sort, submission (three has no separate update step) |
| Babylon.js | around `beginFrame()` + `scene.render()` + `endFrame()` | matrix update, active-mesh evaluation, sort, submission |
| PlayCanvas | between the `frameupdate` and `frameend` app events | `app.update()` (component systems) + `app.render()` |

The `.txt` export also records median and min CPU frame time, and the number of draw
calls each engine actually submitted. That last one is a correctness guard: if a renderer
submits fewer draws than the row's cube count (e.g. WebGPU pipelines still compiling), a
warning appears on the page and that row is flagged as not comparable.

## Measurement isolation

**One engine is alive at a time.** Each column runs in its own iframe
(`bench-frame.html` + [`lib/column-run.js`](lib/column-run.js)), created and destroyed
around that column, so peak memory is the largest *single* scene rather than the sum —
adding engine versions costs nothing.

### The warm-up phase

Every run first **starts and shuts down every enabled engine once** with a small scene
(1000 cubes, 8 materials, 3 frames) before measuring anything.

This is needed because measured cost attaches to a graphics context's **ordinal position
in the renderer process**, not to measurement order. Proved with two byte-identical
PlayCanvas builds served from different CDNs, where the true ratio is exactly 1.0:

| Creation order | A (jsdelivr) | B (unpkg) | Slower |
| --- | --- | --- | --- |
| A then B | 9.91 ms | 10.14 ms | B — created second |
| B then A | 10.63 ms | 9.44 ms | A — created second |

The shape of that penalty, for one column at a fixed workload:

| Ordinal | #1 | #2 | #3 | #4 | #5 | #7 | #9 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ms | 8.88 | 10.78 | 9.92 | 9.90 | 9.61 | 10.14 | 10.25 |

The first context is ~11% fast, the second ~11% slow, then it plateaus. Nothing else clears
it: not a per-column iframe, not a page reload (programmatic *or* the browser button), not
a 30 s cooldown — only a fresh browser process. Bare WebGL/WebGPU contexts advance the
ordinal only ~40%, so they are not a substitute for real engine sessions.

Warming every engine puts all measurements past the anomalous positions, and no engine
benefits from having gone first. The warm-up set is always *all* enabled columns whatever
subset you measure, so a single-column run stays comparable with a full run.

**Verified** by a null test — the same column measured first vs second in the same page,
3 paired reps: **-1.0%** (-2.4%, -1.1%, +0.5%), down from 14.4-14.8% before the warm-up.

### Cost

| | |
| --- | --- |
| Full 8-column x 20-row matrix (1K-20K, complex) | ~184 s, peak 720 MB |
| Single light column to 20K (incl. warm-up) | ~7 s, peak 148-196 MB |
| Single Babylon WebGPU column to 20K | ~15 s, peak 471 MB |

Peak is set by the heaviest column plus teardown lag, not by how many columns you run.
Per-cube scene cost at 20K differs a lot by engine — Babylon ~17-22 KB, PlayCanvas
~5-6 KB, three ~3-6 KB — so Babylon is what puts a run near the limit. On memory-tight
devices, lower the cube range or skip the Babylon columns (they are individually runnable
from their column headers).

For a definitive few-percent version comparison, still prefer one column per browser
launch: only a fresh browser process fully resets the ordinal effect.

## Adding an engine version

Edit [`engines.config.js`](engines.config.js) and add an entry:

```js
{
    id: 'playcanvas-2.23.0-dev',
    engine: 'playcanvas',
    label: 'PlayCanvas 2.23 dev',
    shortLabel: 'PC 2.23d',
    builds: {
        webgl2: { kind: 'esm', url: './local-builds/playcanvas-2.23.0-dev.mjs' },
        webgpu: { kind: 'esm', url: './local-builds/playcanvas-2.23.0-dev.mjs' }
    }
}
```

- Published versions: point `url` at a CDN (jsdelivr/unpkg).
- Custom/unreleased builds: copy a single-file build into `local-builds/` and use a
  relative url as above (for PlayCanvas: `npm run build` then copy
  `build/playcanvas.mjs`).
- `kind: 'script'` with a `global` field loads UMD builds (used for Babylon).
- Omit a backend to skip it for that version — no column is created. Columns for a
  backend the *browser* lacks are shown as `n/a` rather than failing the run.

## Running locally

Static site, no build step. Serve the repo root with any web server:

```
npx http-server -p 8080 .
```

Dev-only URL params for quick iterations (defaults are the real benchmark):
`?rows=500,1000&warmup=2&measure=10&mats=1000&complexity=complex&order=default`

`scene-viewer.html` renders the shared scene with a single engine, for checking visual
parity: `scene-viewer.html?engine=three&backend=webgpu&count=2000&materials=100&complexity=complex`

## Methodology notes

- Scene, camera, light and materials are defined once in engine-agnostic form
  ([`lib/scene-spec.js`](lib/scene-spec.js)) and instantiated by thin per-engine
  adapters ([`adapters/`](adapters)); everything is deterministic (seeded PRNG).
- Color parity is handled per engine: the spec's colors are sRGB, which PlayCanvas takes
  as-is, three needs `Color.setRGB(..., SRGBColorSpace)` (its numeric constructor is
  linear), and Babylon's PBR factors need `.toLinearSpace()`. Light intensities are tuned
  per engine so measured on-screen brightness matches within a few percent.
- One directional light, no shadows, no IBL, no ambient in every engine.
- Adapters assert they got the backend they asked for — all three engines can silently
  fall back to WebGL, which would make a "WebGPU" column a second WebGL run.
- Each column creates a fresh canvas + context and is torn down afterwards; a short pause
  between columns lets the browser reclaim GPU memory.
- Engines keep their default per-frame behavior (culling, transform management) —
  that is part of what is being compared. Nothing is frozen or instanced.
