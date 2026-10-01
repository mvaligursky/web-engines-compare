/**
 * Shared, engine-agnostic scene specification for the draw-call benchmark.
 * Everything here is deterministic so every engine renders the same view
 * with the same materials and meshes.
 *
 * The scene is a dense 2D grid of tiny boxes in the XY plane, viewed by a
 * perspective camera on the +Z axis looking at the origin. The grid layout is
 * fixed for the maximum cube count; smaller counts fill the grid top-down in
 * row-major order, so growing the count never moves existing cubes. Each cube
 * uses one of a set of unique box meshes, picked in a deterministic random
 * order, and one of a set of unique materials, assigned round-robin. A plane
 * behind the grid receives the shadows the cubes cast from the one directional
 * light.
 */

export const MAX_CUBES = 20000;
export const GRID_SIZE = 142; // 142^2 = 20164 >= MAX_CUBES
export const SPACING = 1;
export const CUBE_SIZE = 0.42;

/** The plane behind the grid, facing the camera, which receives the cubes' shadows. */
export const PLANE_Z = -1;
export const PLANE_SIZE = GRID_SIZE * SPACING + 8;
export const PLANE_COLOR = [0.55, 0.55, 0.55]; // sRGB
export const PLANE_ROUGHNESS = 0.9;

/** Resolution of the directional light's shadow map, which has a single cascade. */
export const SHADOW_MAP_SIZE = 2048;

export const CAMERA_FOV = 45; // vertical, degrees
export const CAMERA_NEAR = 1;
export const CAMERA_FAR = 600;

export const CLEAR_COLOR = [0.035, 0.035, 0.06];

/** @type {number[]} Normalized direction the light travels (toward the scene). */
export const LIGHT_DIR = normalize3([-0.35, -0.45, -0.82]);

export const TEXTURE_SIZE = 32;

export const COMPLEXITY_LEVELS = [
    { id: 'simple', label: 'Simple (factors only, no textures)' },
    { id: 'textured', label: 'Textured (base color texture)' },
    { id: 'complex', label: 'Complex (base color + metallic-roughness + normal + emissive textures)' }
];

/**
 * Shadows of the directional light. The first entry is the default.
 *
 * - 'on' — the light casts shadows with a single cascade: every cube is drawn
 *   a second time into the shadow map, and the plane behind the grid receives
 *   them. The cubes cast but do not receive shadows.
 * - 'off' — no shadow pass, and the plane is lit without shadows.
 */
export const SHADOW_MODES = [
    { id: 'on', label: 'On (directional light, single cascade)' },
    { id: 'off', label: 'Off' }
];

/**
 * Draw submission order. The first entry is the default.
 *
 * - 'default' — each engine's own opaque sort. This is the default, because it is
 *   what a real application gets, and so the representative case for tracking one
 *   engine across versions. PlayCanvas, Babylon and three.js-on-WebGL2 group opaque
 *   draws by material. three.js-on-WebGPU sorts by depth and does not group, so it
 *   is given three.js-on-WebGL2's material-first sort, and every column groups
 *   opaque draws by material.
 * - 'creation' — cubes submitted in creation (grid) order, so the material
 *   changes on nearly every draw. Every engine and backend submits in exactly
 *   the same order, which makes the columns directly comparable and isolates the
 *   raw per-draw cost, including a material bind on almost every draw.
 */
export const DRAW_ORDER_MODES = [
    { id: 'default', label: 'Engine default (per-engine sort)' },
    { id: 'creation', label: 'Creation order (no material grouping)' }
];

/**
 * @param {number[]} v - Vector.
 * @returns {number[]} Normalized copy.
 */
function normalize3(v) {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Box dimensions of unique mesh `index`. Each axis is between 60% and 100% of
 * CUBE_SIZE, so every mesh has its own vertex and index buffers while its
 * screen coverage stays close to a cube's.
 *
 * @param {number} index - Mesh index.
 * @returns {number[]} [width, height, depth].
 */
export function meshSpec(index) {
    const rng = createRng(index * 2246822519 + 31);
    return [0, 1, 2].map(() => CUBE_SIZE * (0.6 + rng() * 0.4));
}

/**
 * The unique mesh of cube `i`, in a deterministic random order. It depends only
 * on the cube index and the mesh count, so growing the cube count never changes
 * the mesh of existing cubes.
 *
 * @param {number} i - Cube index.
 * @param {number} meshCount - Number of unique meshes.
 * @returns {number} Mesh index in [0, meshCount).
 */
export function cubeMeshIndex(i, meshCount) {
    return Math.floor(createRng(i * 3266489917 + 7)() * meshCount);
}

/**
 * @param {number} i - Cube index.
 * @returns {number[]} [x, y, z] world position of cube i.
 */
export function cubePosition(i) {
    const col = i % GRID_SIZE;
    const row = Math.floor(i / GRID_SIZE);
    return [
        (col - (GRID_SIZE - 1) / 2) * SPACING,
        ((GRID_SIZE - 1) / 2 - row) * SPACING,
        0
    ];
}

/**
 * Camera distance along +Z so the whole grid fits the viewport.
 *
 * @param {number} aspect - Viewport width / height.
 * @returns {number} Distance from the origin.
 */
export function cameraDistance(aspect) {
    const half = (GRID_SIZE * SPACING) / 2 + 1;
    const tanHalfFov = Math.tan((CAMERA_FOV * Math.PI) / 360);
    const distV = half / tanHalfFov;
    const distH = half / (tanHalfFov * Math.max(aspect, 0.1));
    return Math.max(distV, distH) * 1.02;
}

/**
 * mulberry32 — small deterministic PRNG.
 *
 * @param {number} seed - Seed.
 * @returns {() => number} Generator of floats in [0, 1).
 */
export function createRng(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * @param {number} h - Hue [0, 1].
 * @param {number} s - Saturation [0, 1].
 * @param {number} l - Lightness [0, 1].
 * @returns {number[]} [r, g, b] in [0, 1].
 */
function hslToRgb(h, s, l) {
    const f = (n) => {
        const k = (n + h * 12) % 12;
        const a = s * Math.min(l, 1 - l);
        return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4)];
}

/**
 * Deterministic glTF-style metallic-roughness material parameters.
 *
 * @param {number} index - Material index.
 * @returns {{ baseColor: number[], metallic: number, roughness: number, emissive: number[] }} Spec.
 */
export function materialSpec(index) {
    const rng = createRng(index * 2654435761 + 97);
    const hue = (index * 0.6180339887498949) % 1;
    const baseColor = hslToRgb(hue, 0.55 + rng() * 0.25, 0.5 + rng() * 0.15);
    return {
        baseColor,
        metallic: Math.round(rng() * 4) / 4, // 0, 0.25, 0.5, 0.75, 1
        roughness: 0.25 + rng() * 0.7,
        emissive: [baseColor[0] * 0.25, baseColor[1] * 0.25, baseColor[2] * 0.25]
    };
}

/**
 * @param {number} seed - Seed.
 * @param {(rng: () => number, px: Uint8Array, i: number, x: number, y: number) => void} fill - Per-texel fill.
 * @returns {Uint8Array} RGBA8 data, TEXTURE_SIZE x TEXTURE_SIZE.
 */
function makeTexture(seed, fill) {
    const size = TEXTURE_SIZE;
    const data = new Uint8Array(size * size * 4);
    const rng = createRng(seed);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            fill(rng, data, (y * size + x) * 4, x, y);
        }
    }
    return data;
}

/**
 * Base color texture: checker of the material color and a darker variant.
 *
 * @param {number} index - Material index.
 * @returns {Uint8Array} RGBA8 data (sRGB).
 */
export function baseColorTextureData(index) {
    const spec = materialSpec(index);
    const c = spec.baseColor;
    return makeTexture(index * 7919 + 1, (rng, px, i, x, y) => {
        const dark = ((x >> 2) + (y >> 2)) % 2 === 0;
        const k = dark ? 0.55 : 1.0;
        const n = 0.92 + rng() * 0.08;
        px[i + 0] = Math.round(255 * Math.min(1, c[0] * k * n));
        px[i + 1] = Math.round(255 * Math.min(1, c[1] * k * n));
        px[i + 2] = Math.round(255 * Math.min(1, c[2] * k * n));
        px[i + 3] = 255;
    });
}

/**
 * glTF-packed metallic-roughness texture: roughness in G, metallic in B.
 *
 * @param {number} index - Material index.
 * @returns {Uint8Array} RGBA8 data (linear).
 */
export function metallicRoughnessTextureData(index) {
    const spec = materialSpec(index);
    return makeTexture(index * 104729 + 3, (rng, px, i, x, y) => {
        const stripe = (x >> 3) % 2 === 0;
        px[i + 0] = 255;
        px[i + 1] = Math.round(255 * Math.min(1, spec.roughness * (stripe ? 1.0 : 0.6) + rng() * 0.05));
        px[i + 2] = Math.round(255 * (stripe ? spec.metallic : Math.min(1, spec.metallic + 0.3)));
        px[i + 3] = 255;
    });
}

/**
 * Normal map: mostly flat with a deterministic low-amplitude ripple.
 *
 * @param {number} index - Material index.
 * @returns {Uint8Array} RGBA8 data (linear).
 */
export function normalTextureData(index) {
    const phase = (index % 16) * 0.5;
    return makeTexture(index * 15485863 + 5, (rng, px, i, x, y) => {
        const nx = Math.sin((x + phase) * 0.8) * 0.18;
        const ny = Math.cos((y + phase) * 0.8) * 0.18;
        px[i + 0] = Math.round(128 + nx * 127);
        px[i + 1] = Math.round(128 + ny * 127);
        px[i + 2] = 255;
        px[i + 3] = 255;
    });
}

/**
 * Emissive texture: dark with a few bright texels.
 *
 * @param {number} index - Material index.
 * @returns {Uint8Array} RGBA8 data (sRGB).
 */
export function emissiveTextureData(index) {
    const spec = materialSpec(index);
    const c = spec.baseColor;
    return makeTexture(index * 49979687 + 7, (rng, px, i) => {
        const on = rng() > 0.93;
        const k = on ? 1 : 0.05;
        px[i + 0] = Math.round(255 * Math.min(1, c[0] * k));
        px[i + 1] = Math.round(255 * Math.min(1, c[1] * k));
        px[i + 2] = Math.round(255 * Math.min(1, c[2] * k));
        px[i + 3] = 255;
    });
}
