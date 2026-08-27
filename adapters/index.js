import { createBabylonAdapter } from './babylon.js';
import { createPlayCanvasAdapter } from './playcanvas.js';
import { createThreeAdapter } from './three.js';

/**
 * Benchmark adapter interface (all engines implement this):
 *   async init({ canvas, materialCount, complexity }) — create device, scene, camera, light, materials
 *   setCubeCount(n)  — grow the cube grid to n instances (never shrinks within a run)
 *   start(onFrame)   — begin the frame loop; onFrame(cpuMs) is called once per rendered frame
 *                      with the main-thread time the engine spent updating + submitting that frame
 *   resize()         — viewport size changed
 *   getInfo()        — GPU / renderer info string
 *   destroy()        — tear everything down
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
