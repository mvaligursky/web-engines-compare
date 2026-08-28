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
 *              repo, e.g. './local-builds/playcanvas-2.23.0-dev.mjs'
 *   `kind`   — 'esm' loads via dynamic import() (entry must be a single-file
 *              ES module); 'script' loads via a <script> tag
 *   `global` — for kind 'script' only: the window global to capture
 *
 * Omit a backend to skip it for that version (no column is created).
 */
export const ENGINE_VERSIONS = [
    {
        id: 'playcanvas-2.21.4',
        engine: 'playcanvas',
        label: 'PlayCanvas 2.21.4',
        shortLabel: 'PC 2.21',
        builds: {
            webgl2: { kind: 'esm', url: 'https://cdn.jsdelivr.net/npm/playcanvas@2.21.4/build/playcanvas.mjs' },
            webgpu: { kind: 'esm', url: 'https://cdn.jsdelivr.net/npm/playcanvas@2.21.4/build/playcanvas.mjs' }
        }
    },
    {
        id: 'playcanvas-2.22.0-beta.24',
        engine: 'playcanvas',
        label: 'PlayCanvas 2.22.0-beta.24',
        shortLabel: 'PC 2.22b',
        builds: {
            webgl2: { kind: 'esm', url: 'https://cdn.jsdelivr.net/npm/playcanvas@2.22.0-beta.24/build/playcanvas.mjs' },
            webgpu: { kind: 'esm', url: 'https://cdn.jsdelivr.net/npm/playcanvas@2.22.0-beta.24/build/playcanvas.mjs' }
        }
    },
    {
        id: 'three-0.185.1',
        engine: 'three',
        label: 'Three.js r185',
        shortLabel: 'Three r185',
        builds: {
            // three ships the WebGPU renderer in a separate build
            webgl2: { kind: 'esm', url: 'https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js' },
            webgpu: { kind: 'esm', url: 'https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.webgpu.js' }
        }
    },
    {
        id: 'babylon-9.23.0',
        engine: 'babylon',
        label: 'Babylon.js 9.23',
        shortLabel: 'Bab 9.23',
        builds: {
            webgl2: { kind: 'script', url: 'https://cdn.jsdelivr.net/npm/babylonjs@9.23.0/babylon.js', global: 'BABYLON' },
            webgpu: { kind: 'script', url: 'https://cdn.jsdelivr.net/npm/babylonjs@9.23.0/babylon.js', global: 'BABYLON' }
        }
    }
];
