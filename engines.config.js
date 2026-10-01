/**
 * Registry of engine builds available to the benchmarks.
 *
 * Each entry is one engine version and declares a build per graphics backend.
 * Every (version, backend) pair becomes a column in every test.
 *
 * To add a new version (e.g. a PlayCanvas build with your optimizations), copy
 * an entry and change `id` / `label` / `shortLabel` / the build urls.
 *
 * Build fields:
 *   `url`    — a CDN url (jsdelivr / unpkg) for published versions, or a path
 *              relative to the site root for custom builds committed to this
 *              repo, e.g. './local-builds/playcanvas-2.24.0-dev.mjs'
 *   `kind`   — 'esm' loads via dynamic import() (entry must be a single-file
 *              ES module); 'script' loads via a <script> tag
 *   `global` — for kind 'script' only: the window global to capture
 *
 * Omit a backend to skip it for that version (no column is created), and set
 * `enabled: false` on an entry to leave it out of every test entirely.
 */
export const ENGINE_VERSIONS = [
    {
        id: 'playcanvas-2.22.6',
        engine: 'playcanvas',
        label: 'PlayCanvas 2.22.6',
        shortLabel: 'PC 2.22',
        builds: {
            webgl2: { kind: 'esm', url: 'https://cdn.jsdelivr.net/npm/playcanvas@2.22.6/build/playcanvas.mjs' },
            webgpu: { kind: 'esm', url: 'https://cdn.jsdelivr.net/npm/playcanvas@2.22.6/build/playcanvas.mjs' }
        }
    },
    {
        id: 'playcanvas-2.23.0',
        engine: 'playcanvas',
        label: 'PlayCanvas 2.23.0',
        shortLabel: 'PC 2.23',
        builds: {
            webgl2: { kind: 'esm', url: 'https://cdn.jsdelivr.net/npm/playcanvas@2.23.0/build/playcanvas.mjs' },
            webgpu: { kind: 'esm', url: 'https://cdn.jsdelivr.net/npm/playcanvas@2.23.0/build/playcanvas.mjs' }
        }
    },
    {
        // the engine branch currently under test, see local-builds/README.md - set
        // `enabled: true` while working on an optimization, with the build in place
        id: 'playcanvas-local',
        enabled: false,
        engine: 'playcanvas',
        label: 'PlayCanvas local build',
        shortLabel: 'PC local',
        builds: {
            webgl2: { kind: 'esm', url: './local-builds/playcanvas-local.mjs' },
            webgpu: { kind: 'esm', url: './local-builds/playcanvas-local.mjs' }
        }
    },
    {
        id: 'three-0.186.1',
        engine: 'three',
        label: 'Three.js r186',
        shortLabel: 'Three r186',
        builds: {
            // three ships the WebGPU renderer in a separate build
            webgl2: { kind: 'esm', url: 'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js' },
            webgpu: { kind: 'esm', url: 'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.webgpu.js' }
        }
    },
    {
        id: 'babylon-9.29.0',
        engine: 'babylon',
        label: 'Babylon.js 9.29',
        shortLabel: 'Bab 9.29',
        builds: {
            webgl2: { kind: 'script', url: 'https://cdn.jsdelivr.net/npm/babylonjs@9.29.0/babylon.js', global: 'BABYLON' },
            webgpu: { kind: 'script', url: 'https://cdn.jsdelivr.net/npm/babylonjs@9.29.0/babylon.js', global: 'BABYLON' }
        }
    }
];
