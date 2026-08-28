/**
 * Parent-side orchestrator: ONE engine alive at a time.
 *
 * Each column runs in its own iframe (`bench-frame.html`), which is created,
 * measured and thrown away before the next column starts. Peak memory is
 * therefore the largest single scene rather than the sum of all of them, so
 * adding engine versions costs nothing.
 *
 * ── Why the warm-up phase ──
 * Measured cost attaches to the ordinal position of a graphics context within
 * the renderer process, not to measurement order: with two byte-identical
 * builds served from different CDNs, whichever context is created second is
 * slower, and swapping the creation order swaps which one is slow. The first
 * context in a process is anomalously fast (~-11%) and the second anomalously
 * slow (~+11% vs the plateau); from the third onwards it flattens out, and
 * consecutive plateau positions agree to within ~1-2%.
 *
 * Neither an iframe, a page reload (programmatic or via the browser button) nor
 * a cooldown clears it — only a fresh browser process does. Bare WebGL/WebGPU
 * contexts advance the ordinal only ~40%, so they are not enough.
 *
 * So before measuring anything we start and shut down EVERY enabled column's
 * engine once. Every measurement then happens past the anomalous positions, and
 * no engine benefits from having gone first. The warm-up set is always all
 * enabled columns, independent of which ones are being measured, so numbers
 * from a single-column run and a full run stay comparable.
 */

/** Inactivity timeout per message exchange with a frame. */
const IDLE_TIMEOUT_MS = 180000;

/** Cubes built during a warm-up cycle: enough to compile and submit real work. */
const WARMUP_CUBES = 1000;

/** Unique materials during warm-up; capped so warm-up stays quick. */
const WARMUP_MATERIALS = 8;

/** Frames rendered during a warm-up cycle. */
const WARMUP_MEASURE_FRAMES = 3;

/** Pause after discarding a frame so the browser can reclaim GPU memory. */
const RECLAIM_MS = 500;

/**
 * @param {number} ms - Delay.
 * @returns {Promise<void>} Resolves after ms.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wraps one iframe and its message plumbing.
 *
 * @param {object} column - Column descriptor.
 * @param {(text: string) => void} onStatus - Status sink.
 * @returns {object} Frame handle.
 */
function createFrame(column, onStatus) {
    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        border: '0',
        zIndex: '200'
    });
    iframe.src = new URL('../bench-frame.html', import.meta.url).href;

    let pending = null;

    const onMessage = (e) => {
        if (e.origin !== location.origin || e.source !== iframe.contentWindow) return;
        const msg = e.data;
        if (!msg || !msg.type) return;

        if (msg.type === 'status') {
            onStatus(msg.text);
            pending?.touch();
            return;
        }
        if (!pending) return;

        if (msg.type === 'error') {
            pending.reject(new Error(msg.message));
        } else if (msg.type === pending.expect) {
            pending.resolve(msg);
        }
    };
    window.addEventListener('message', onMessage);

    const exchange = (expect, send) => new Promise((resolve, reject) => {
        let timer = 0;
        const settle = (fn) => (v) => {
            window.clearTimeout(timer);
            pending = null;
            fn(v);
        };
        const touch = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(
                () => settle(reject)(new Error(`benchmark frame silent for ${IDLE_TIMEOUT_MS / 1000}s`)),
                IDLE_TIMEOUT_MS
            );
        };
        pending = { expect, resolve: settle(resolve), reject: settle(reject), touch };
        touch();
        if (send) iframe.contentWindow.postMessage(send, location.origin);
    });

    return {
        column,
        attach() {
            const p = exchange('ready', null);
            document.body.appendChild(iframe);
            return p;
        },
        async init(config) {
            const msg = await exchange('inited', { type: 'init', config });
            return msg.info;
        },
        async measure(opts) {
            const msg = await exchange('row', { type: 'measure', opts });
            return msg.result;
        },
        async shutdown() {
            try {
                await exchange('shutdown-done', { type: 'shutdown' });
            } catch {
                // teardown is best-effort; the frame is about to be discarded anyway
            }
        },
        dispose() {
            window.removeEventListener('message', onMessage);
            pending = null;
            iframe.src = 'about:blank';
            iframe.remove();
        }
    };
}

/**
 * Start and immediately shut down one column's engine, so that later
 * measurements do not sit at an anomalous graphics-context position.
 *
 * @param {object} column - Column descriptor.
 * @param {object} settings - { complexity, drawOrder }.
 * @param {(text: string) => void} onStatus - Status sink.
 * @returns {Promise<void>} Resolves when the engine is down again.
 */
async function warmUpColumn(column, settings, onStatus) {
    const frame = createFrame(column, () => {});
    try {
        await frame.attach();
        onStatus(`Warm-up: starting ${column.label}...`);
        await frame.init({
            engine: column.entry.engine,
            build: column.build,
            backend: column.backend,
            label: column.label,
            materialCount: WARMUP_MATERIALS,
            complexity: settings.complexity,
            drawOrder: settings.drawOrder
        });
        await frame.measure({
            rowIndex: -1,
            count: WARMUP_CUBES,
            label: `${column.label} warm-up`,
            warmupFrames: 0,
            measureFrames: WARMUP_MEASURE_FRAMES
        });
        await frame.shutdown();
    } catch (err) {
        // A column that cannot even warm up will fail loudly in the measure
        // phase; nothing to report here.
        console.warn(`warm-up failed for ${column.label}:`, err);
    } finally {
        frame.dispose();
        await sleep(RECLAIM_MS);
    }
}

/**
 * Warm every enabled column, then measure the requested ones, one engine at a
 * time.
 *
 * @param {object} opts - Options.
 * @param {object[]} opts.warmUpColumns - Every enabled column (warm-up set).
 * @param {object[]} opts.columns - Columns to actually measure, in order.
 * @param {number[]} opts.rowValues - Cube count per row.
 * @param {number[]} opts.rowIndices - Which rows to run (ascending).
 * @param {number} opts.materialCount - Number of unique materials.
 * @param {string} opts.complexity - Material complexity id.
 * @param {string} opts.drawOrder - Draw order mode id.
 * @param {number} opts.warmupFrames - Warmup frames per measurement.
 * @param {number} opts.measureFrames - Measured frames per measurement.
 * @param {(text: string) => void} opts.onStatus - Status callback.
 * @param {(column: object, rowIndex: number, result: object) => void} opts.onRowResult - Result callback.
 * @param {(column: object, info: string) => void} opts.onColumnInfo - Renderer info callback.
 * @param {(column: object, err: Error) => void} opts.onColumnError - Per-column failure callback.
 * @returns {Promise<void>} Resolves when everything is measured.
 */
export async function runSequential({
    warmUpColumns, columns, rowValues, rowIndices, materialCount, complexity, drawOrder,
    warmupFrames, measureFrames, onStatus, onRowResult, onColumnInfo, onColumnError
}) {
    // ── phase 1: start + stop every engine, so nobody is measured at an
    //    anomalous graphics-context position ──
    for (let i = 0; i < warmUpColumns.length; i++) {
        onStatus(`Warm-up ${i + 1}/${warmUpColumns.length}: ${warmUpColumns[i].label}`);
        // eslint-disable-next-line no-await-in-loop
        await warmUpColumn(warmUpColumns[i], { complexity, drawOrder }, onStatus);
    }

    // ── phase 2: measure, one engine alive at a time ──
    for (let i = 0; i < columns.length; i++) {
        const column = columns[i];
        const frame = createFrame(column, onStatus);
        const step = `[${i + 1}/${columns.length}]`;
        try {
            // eslint-disable-next-line no-await-in-loop
            await frame.attach();
            // eslint-disable-next-line no-await-in-loop
            const info = await frame.init({
                engine: column.entry.engine,
                build: column.build,
                backend: column.backend,
                label: `${step} ${column.label}`,
                materialCount,
                complexity,
                drawOrder
            });
            onColumnInfo(column, info);

            for (const ri of rowIndices) {
                // eslint-disable-next-line no-await-in-loop
                const result = await frame.measure({
                    rowIndex: ri,
                    count: rowValues[ri],
                    label: `${step} ${column.label}`,
                    warmupFrames,
                    measureFrames
                });
                onRowResult(column, ri, result);
            }
            // eslint-disable-next-line no-await-in-loop
            await frame.shutdown();
        } catch (err) {
            onColumnError(column, err);
        } finally {
            frame.dispose();
            // eslint-disable-next-line no-await-in-loop
            await sleep(RECLAIM_MS);
        }
    }
}
