import { createAdapter } from '../adapters/index.js';
import { loadEngineModule } from './loader.js';

/** Frames rendered after a scene change before warmup starts (uploads, first compiles). */
const SETTLE_FRAMES = 3;

/**
 * @param {number} ms - Delay.
 * @returns {Promise<void>} Resolves after ms.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run one engine column over a set of rows. The engine app is created once;
 * the scene grows incrementally between rows.
 *
 * @param {object} opts - Options.
 * @param {object} opts.entry - Engine entry from ENGINE_VERSIONS.
 * @param {number[]} opts.rowValues - Cube count per row.
 * @param {number[]} opts.rowIndices - Which rows to run (ascending).
 * @param {number} opts.materialCount - Number of unique materials.
 * @param {string} opts.complexity - Material complexity id.
 * @param {number} opts.warmupFrames - Warmup frames per row.
 * @param {number} opts.measureFrames - Measured frames per row.
 * @param {(text: string) => void} opts.onStatus - Status callback.
 * @param {(rowIndex: number, result: { cpuMs: number, cpuMsMedian: number, fps: number }) => void} opts.onRowResult - Per-row result callback.
 * @returns {Promise<string>} Renderer / GPU info string.
 */
export async function runColumnBenchmark({
    entry, rowValues, rowIndices, materialCount, complexity,
    warmupFrames, measureFrames, onStatus, onRowResult
}) {
    onStatus(`${entry.label}  Loading engine...`);
    const module = await loadEngineModule(entry);

    const canvas = document.createElement('canvas');
    canvas.id = `bench-${Date.now()}`;
    Object.assign(canvas.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        zIndex: '200'
    });
    document.body.appendChild(canvas);

    const adapter = createAdapter(entry, module);
    /** @type {((cpuMs: number) => void)|null} */
    let frameHandler = null;

    const onResize = () => adapter.resize();

    try {
        onStatus(`${entry.label}  Creating scene (${materialCount} materials, ${complexity})...`);
        await adapter.init({ canvas, materialCount, complexity });
        window.addEventListener('resize', onResize);
        adapter.start((cpuMs) => {
            if (frameHandler) frameHandler(cpuMs);
        });

        const info = adapter.getInfo();

        for (const ri of rowIndices) {
            const count = rowValues[ri];
            const label = `${entry.label} [${count}]`;
            onStatus(`${label}  Building scene...`);
            adapter.setCubeCount(count);

            // eslint-disable-next-line no-await-in-loop
            const result = await new Promise((resolve) => {
                const cpuTimes = [];
                let frame = 0;
                let tFirst = 0;
                let tLast = 0;

                frameHandler = (cpuMs) => {
                    frame++;
                    if (frame <= SETTLE_FRAMES) return;
                    const w = frame - SETTLE_FRAMES;
                    if (w <= warmupFrames) {
                        onStatus(`${label}  Warming up ${w}/${warmupFrames}`);
                        return;
                    }
                    const m = w - warmupFrames;
                    onStatus(`${label}  Measuring ${m}/${measureFrames}`);
                    const now = performance.now();
                    if (m === 1) tFirst = now;
                    tLast = now;
                    cpuTimes.push(cpuMs);
                    if (m >= measureFrames) {
                        frameHandler = null;
                        const wallSec = Math.max(1e-9, (tLast - tFirst) / 1000);
                        const sorted = cpuTimes.slice().sort((a, b) => a - b);
                        resolve({
                            cpuMs: cpuTimes.reduce((a, b) => a + b, 0) / cpuTimes.length,
                            cpuMsMedian: sorted[Math.floor(sorted.length / 2)],
                            fps: cpuTimes.length > 1 ? (cpuTimes.length - 1) / wallSec : 0
                        });
                    }
                };
            });

            onRowResult(ri, result);
        }

        return info;
    } finally {
        frameHandler = null;
        window.removeEventListener('resize', onResize);
        adapter.destroy();
        canvas.width = 0;
        canvas.height = 0;
        canvas.remove();
        // let the browser reclaim GPU memory before the next engine spins up
        await sleep(800);
    }
}
