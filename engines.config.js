/**
 * Registry of engine builds available to the benchmarks.
 *
 * To add a new version (e.g. a PlayCanvas build with your optimizations),
 * add an entry here. `url` can be:
 *   - a CDN url (jsdelivr / unpkg) for published versions
 *   - a relative path for custom builds committed to this repo,
 *     e.g. './local-builds/playcanvas-2.23.0-dev.mjs' (path is relative
 *     to the site root, so from a test page it resolves via new URL()).
 *
 * `kind`:
 *   - 'esm'    — loaded with dynamic import(), entry must be a single-file ES module
 *   - 'script' — loaded with a <script> tag, `global` names the window global to capture
 */
export const ENGINE_VERSIONS = [
    {
        id: 'playcanvas-2.21.4',
        engine: 'playcanvas',
        label: 'PlayCanvas 2.21.4',
        shortLabel: 'PC 2.21',
        kind: 'esm',
        url: 'https://cdn.jsdelivr.net/npm/playcanvas@2.21.4/build/playcanvas.mjs'
    },
    {
        id: 'three-0.185.1',
        engine: 'three',
        label: 'Three.js r185',
        shortLabel: 'Three r185',
        kind: 'esm',
        url: 'https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js'
    },
    {
        id: 'babylon-9.23.0',
        engine: 'babylon',
        label: 'Babylon.js 9.23',
        shortLabel: 'Bab 9.23',
        kind: 'script',
        url: 'https://cdn.jsdelivr.net/npm/babylonjs@9.23.0/babylon.js',
        global: 'BABYLON'
    }
];
