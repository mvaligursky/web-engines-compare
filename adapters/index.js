import { createBabylonAdapter } from './babylon.js';
import { createPlayCanvasAdapter } from './playcanvas.js';
import { createThreeAdapter } from './three.js';

/**
 * Benchmark adapter interface (all engines implement this):
 *
 *   async init({ canvas, backend, materialCount, meshCount, complexity, drawOrder, shadows })
 *                    — create device/renderer for `backend` ('webgl2' | 'webgpu'),
 *                      then scene, camera, light, the shadow receiving plane,
 *                      meshes and materials. `shadows` turns on the directional
 *                      light's single-cascade shadows. Throws if the engine
 *                      silently fell back to a different backend.
 *                      `drawOrder` pins the opaque submission order (see
 *                      DRAW_ORDER_MODES); every engine reorders opaque draws by
 *                      default and they do not agree on the criteria, so this is
 *                      always set explicitly rather than left to the engine.
 *   setCubeCount(n)  — grow the cube grid to n instances (never shrinks within a run),
 *                      each using mesh cubeMeshIndex(i) and material i % materialCount
 *   start(onFrame)   — begin the frame loop; onFrame(cpuMs) is called once per
 *                      rendered frame with the main-thread time the engine spent
 *                      on that frame (see below)
 *   getDrawCalls()   — draw calls submitted in the last frame, or -1 if unknown
 *   resize()         — viewport size changed
 *   getInfo()        — GPU / renderer info string
 *   destroy()        — tear everything down
 *
 * What `cpuMs` measures, per engine — in all three it is the engine's *whole*
 * per-frame CPU cost on the main thread (world-matrix updates, frustum culling,
 * render-list build and sort, material/uniform binding and draw submission),
 * not just the draw-submission part. It excludes GPU execution and vsync idle,
 * since all three engines return before the GPU has finished the frame.
 *
 *   three    — around renderer.render(); three has no separate update step
 *   babylon  — around beginFrame() + scene.render() + endFrame()
 *   playcanvas — between the 'frameupdate' and 'frameend' app events, which
 *                bracket app.update() (component systems) + app.render()
 *
 * @param {object} entry - Entry from ENGINE_VERSIONS.
 * @param {object} module - Loaded engine module.
 * @returns {object} Adapter.
 */
export function createAdapter(entry, module) {
    switch (entry.engine) {
        case 'playcanvas': return createPlayCanvasAdapter(module);
        case 'three': return createThreeAdapter(module);
        case 'babylon': return createBabylonAdapter(module);
        default: throw new Error(`Unknown engine: ${entry.engine}`);
    }
}
