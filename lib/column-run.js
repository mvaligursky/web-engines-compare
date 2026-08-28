import { createAdapter } from '../adapters/index.js';
import { loadEngineModule } from './loader.js';

/**
 * Frames rendered after a scene change before warmup starts (texture uploads,
 * first shader/pipeline compiles). Generous because three and Babylon build
 * WebGPU pipelines asynchronously and skip draws until they are ready.
 */
const SETTLE_FRAMES = 8;

/**
 * Hosts ONE column's engine for the whole run, inside its own iframe realm.
 *
 * The engine is created once and then measured on demand, so the orchestrator
 * can interleave rows across columns (all columns at 10K, then all at 11K, …)
 * instead of running a column to completion. Interleaving keeps every cell of a
 * table row measured within seconds of its neighbours, so slow drift hits the
 * whole row equally instead of penalising whichever column ran last.
 *
 * While a column is not being measured it is paused, so idle engines do not
 * spend frames competing with the active one.
 */
export function createColumnHost(emit) {
    let adapter = null;
    let canvas = null;
    /** @type {((cpuMs: number) => void)|null} */
    let frameHandler = null;
    let onResize = null;

    return {
        /**
         * @param {object} config - Column config (engine/build/backend/settings).
         * @returns {Promise<string>} Renderer info string.
         */
        async init(config) {
            const { engine, build, backend, label, materialCount, complexity, drawOrder } = config;

            emit({ type: 'status', text: `${label}  Loading engine...` });
            const module = await loadEngineModule(build);

            canvas = document.createElement('canvas');
            Object.assign(canvas.style, {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%'
            });
            document.body.appendChild(canvas);

            adapter = createAdapter({ engine }, module);
            emit({ type: 'status', text: `${label}  Creating scene (${materialCount} materials, ${complexity}, ${drawOrder} order)...` });
            await adapter.init({ canvas, backend, materialCount, complexity, drawOrder });

            onResize = () => adapter.resize();
            window.addEventListener('resize', onResize);
            adapter.start((cpuMs) => {
                if (frameHandler) frameHandler(cpuMs);
            });
            adapter.setPaused(true);

            return adapter.getInfo();
        },

        /**
         * Grow the scene to `count` cubes and measure it.
         *
         * @param {object} opts - { count, label, warmupFrames, measureFrames }.
         * @returns {Promise<object>} Row result.
         */
        async measure({ count, label, warmupFrames, measureFrames }) {
            const rowLabel = `${label} [${count}]`;
            emit({ type: 'status', text: `${rowLabel}  Building scene...` });
            adapter.setCubeCount(count);
            adapter.setPaused(false);

            try {
                return await new Promise((resolve) => {
                    const cpuTimes = [];
                    const drawCallSamples = [];
                    let frame = 0;
                    let tFirst = 0;
                    let tLast = 0;

                    frameHandler = (cpuMs) => {
                        frame++;
                        if (frame <= SETTLE_FRAMES) return;
                        const w = frame - SETTLE_FRAMES;
                        if (w <= warmupFrames) {
                            emit({ type: 'status', text: `${rowLabel}  Warming up ${w}/${warmupFrames}` });
                            return;
                        }
                        const m = w - warmupFrames;
                        emit({ type: 'status', text: `${rowLabel}  Measuring ${m}/${measureFrames}` });
                        const now = performance.now();
                        if (m === 1) tFirst = now;
                        tLast = now;
                        cpuTimes.push(cpuMs);
                        const dc = adapter.getDrawCalls?.() ?? -1;
                        if (dc >= 0) drawCallSamples.push(dc);

                        if (m >= measureFrames) {
                            frameHandler = null;
                            const sorted = cpuTimes.slice().sort((a, b) => a - b);
                            resolve({
                                cpuMs: cpuTimes.reduce((a, b) => a + b, 0) / cpuTimes.length,
                                cpuMsMedian: sorted[Math.floor(sorted.length / 2)],
                                cpuMsMin: sorted[0],
                                wallMs: tLast - tFirst,
                                // Median, so one settling frame cannot skew the guard
                                drawCalls: drawCallSamples.length ?
                                    drawCallSamples.slice().sort((a, b) => a - b)[Math.floor(drawCallSamples.length / 2)] :
                                    -1,
                                expectedDrawCalls: count
                            });
                        }
                    };
                });
            } finally {
                frameHandler = null;
                adapter.setPaused(true);
            }
        },

        destroy() {
            frameHandler = null;
            if (onResize) window.removeEventListener('resize', onResize);
            adapter?.destroy();
            if (canvas) {
                canvas.width = 0;
                canvas.height = 0;
                canvas.remove();
            }
            adapter = null;
            canvas = null;
        }
    };
}
