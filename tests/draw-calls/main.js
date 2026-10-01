import { ENGINE_VERSIONS } from '../../engines.config.js';
import { buildColumns } from '../../lib/backends.js';
import { createBenchmarkUI } from '../../lib/bench-ui.js';
import { runSequential } from '../../lib/runner.js';
import { COMPLEXITY_LEVELS, DRAW_ORDER_MODES, SHADOW_MODES } from '../../lib/scene-spec.js';

// Dev-only overrides, e.g. ?rows=500,1000&warmup=2&measure=10&mats=1000&meshes=1&complexity=complex&order=creation&shadows=off
const params = new URLSearchParams(location.search);
const WARMUP_FRAMES = parseInt(params.get('warmup') || '5', 10);
const MEASURE_FRAMES = parseInt(params.get('measure') || '20', 10);

/** @type {number[]} */
const rowValues = params.get('rows') ?
    params.get('rows').split(',').map((v) => parseInt(v, 10)) :
    Array.from({ length: 20 }, (_, i) => 1000 + i * 1000);

const rows = rowValues.map((v) => ({
    value: v,
    label: v >= 1000 && v % 1000 === 0 ? `${v / 1000}K` : `${v}`
}));

const MATERIAL_COUNTS = [1, ...Array.from({ length: 20 }, (_, i) => (i + 1) * 50)];
const MESH_COUNTS = MATERIAL_COUNTS.slice();

let materialCount = parseInt(params.get('mats') || '100', 10);
let meshCount = parseInt(params.get('meshes') || '100', 10);
let complexity = params.get('complexity') || 'complex';
let drawOrder = params.get('order') || DRAW_ORDER_MODES[0].id;
let shadowMode = params.get('shadows') || SHADOW_MODES[0].id;
if (!MATERIAL_COUNTS.includes(materialCount)) MATERIAL_COUNTS.push(materialCount);
if (!MESH_COUNTS.includes(meshCount)) MESH_COUNTS.push(meshCount);

let running = false;

const columns = buildColumns(ENGINE_VERSIONS);

const metrics = [
    { key: 'cpuMs', title: 'CPU frame time (ms)', format: (v) => v.toFixed(2) }
];

const ui = createBenchmarkUI({
    title: 'Draw Call Performance',
    legendLines: [
        'A dense 2D grid of small boxes (deterministic layout, identical view in every engine), each rendered as its own draw call — a CPU submission cost test. The boxes use unique meshes in a deterministic random order and unique materials round-robin, native PBR (glTF metallic-roughness) materials, and one directional light, whose single-cascade shadows the boxes cast onto a plane behind the grid. MSAA off, pixel ratio 1.',
        'Columns are engine version x graphics backend. In the chart, color identifies the engine version and a dashed line means WebGPU.',
        '',
        'Draw order:',
        '  Engine default (default) — every engine sorts opaque draws the way it normally does, which is what an application gets, and groups them by material. The exception is three.js on WebGPU, whose own sort is by depth and does not group: it is given the material-first sort three.js uses on WebGL2.',
        '  Creation order — boxes submitted in grid order, so the material changes on nearly every draw. Every engine and backend submits in exactly the same order, isolating the raw per-draw cost.',
        '',
        'Shadows:',
        '  On (default) — every box is drawn a second time, into the shadow map, so the frame includes the shadow pass with its culling and submission.',
        '  Off — the forward pass alone.',
        '',
        'Controls:',
        'Run All — all columns and all row counts.',
        'Column headers — that column only, all counts.',
        `Left column (e.g. ${rows[0].label} ↑) — every count from ${rows[0].label} up through that row, all columns.`,
        `Right column (e.g. ← ${rows[0].label}) — only that count, all columns.`,
        'Grid cells — that column only, counts up through that row.',
        '',
        `CPU frame time — mean main-thread time the engine spends per frame, over ${MEASURE_FRAMES} measured frames after ${WARMUP_FRAMES} warmup frames. This is the engine's whole frame cost: world-matrix updates, frustum culling, render-list build and sort, and draw submission. It excludes GPU execution and vsync idle, because all three engines return before the GPU has finished the frame.`,
        'Draw calls actually submitted are checked against the requested box count each run; a warning appears above if an engine submitted fewer (e.g. a renderer still compiling pipelines). With shadows on, every engine submits about twice that.',
        'Changing a dropdown clears stored results (they would no longer be comparable).',
        'Isolation: one engine is alive at a time, each in its own iframe, created and destroyed around its column — so peak memory is one scene, not the sum, and adding versions is free.',
        'Every run begins with a warm-up phase that starts and shuts down EVERY enabled engine once. Measured cost attaches to a graphics context\'s ordinal position in the renderer process (the first is ~11% fast, the second ~11% slow, then it plateaus), and nothing else clears it — not an iframe, not a page reload, not a cooldown. Warming all engines puts every measurement past the anomalous positions so no engine benefits from going first.',
        'For a definitive few-percent version comparison, still prefer one column per browser launch: only a fresh browser process fully resets the effect.'
    ],
    columns,
    rows,
    metrics,
    controls: [
        {
            id: 'materials',
            label: 'Unique materials',
            options: MATERIAL_COUNTS.map((v) => ({ value: String(v), label: String(v) })),
            value: String(materialCount),
            onChange: (v) => {
                materialCount = parseInt(v, 10);
                ui.clearResults();
            }
        },
        {
            id: 'meshes',
            label: 'Unique meshes',
            options: MESH_COUNTS.map((v) => ({ value: String(v), label: String(v) })),
            value: String(meshCount),
            onChange: (v) => {
                meshCount = parseInt(v, 10);
                ui.clearResults();
            }
        },
        {
            id: 'complexity',
            label: 'Material complexity',
            options: COMPLEXITY_LEVELS.map((l) => ({ value: l.id, label: l.label })),
            value: complexity,
            onChange: (v) => {
                complexity = v;
                ui.clearResults();
            }
        },
        {
            id: 'shadows',
            label: 'Shadows',
            options: SHADOW_MODES.map((m) => ({ value: m.id, label: m.label })),
            value: shadowMode,
            onChange: (v) => {
                shadowMode = v;
                ui.clearResults();
            }
        },
        {
            id: 'order',
            label: 'Draw order',
            options: DRAW_ORDER_MODES.map((m) => ({ value: m.id, label: m.label })),
            value: drawOrder,
            onChange: (v) => {
                drawOrder = v;
                ui.clearResults();
            }
        }
    ],
    handlers: {
        runAll: () => runSet(allColumns(), allRows()),
        runColumn: (c) => runSet([c], allRows()),
        runColumns: (cs) => runSet(cs, allRows()),
        runRow: (r) => runSet(allColumns(), rangeRows(r)),
        runRowOnly: (r) => runSet(allColumns(), [r]),
        runCell: (c, r) => runSet([c], rangeRows(r))
    },
    buildSaveText,
    fileBaseName: 'draw-call-benchmark'
});

const allColumns = () => columns.map((_, i) => i).filter((i) => !columns[i].disabled);
const allRows = () => rows.map((_, i) => i);
const rangeRows = (r) => Array.from({ length: r + 1 }, (_, i) => i);

/**
 * Run the requested columns over the requested rows, one engine alive at a
 * time, after warming up every enabled column. See lib/runner.js for why.
 *
 * @param {number[]} colIndices - Columns to run, in order.
 * @param {number[]} rowIndices - Rows to run, ascending.
 */
async function runSet(colIndices, rowIndices) {
    if (running) return;
    const active = colIndices.filter((c) => !columns[c].disabled);
    if (!active.length) return;

    running = true;
    ui.setRunning(true);
    const failed = [];

    for (const c of active) ui.setCellsPending(c, rowIndices);

    try {
        await runSequential({
            // every enabled column is warmed, whatever subset is being measured,
            // so a single-column run and a full run stay comparable
            warmUpColumns: allColumns().map((c) => columns[c]),
            columns: active.map((c) => columns[c]),
            rowValues,
            rowIndices,
            materialCount,
            meshCount,
            complexity,
            drawOrder,
            shadows: shadowMode === 'on',
            warmupFrames: WARMUP_FRAMES,
            measureFrames: MEASURE_FRAMES,
            onStatus: (t) => ui.setStatus(t),
            onColumnInfo: (column, info) => ui.setColumnInfo(columns.indexOf(column), info),
            onRowResult: (column, ri, res) => {
                const c = columns.indexOf(column);
                ui.setResult(c, ri, res);
                if (res.drawCalls >= 0 && res.drawCalls < res.expectedDrawCalls) {
                    ui.addWarning(
                        `${column.label} @ ${rows[ri].label}: submitted ${res.drawCalls} draw calls, ` +
                        `expected ${res.expectedDrawCalls} — that row is not comparable.`
                    );
                }
            },
            onColumnError: (column, err) => {
                // A dead column is skipped for the remaining rows; the rest continue.
                console.error(`${column.label} failed:`, err);
                const c = columns.indexOf(column);
                ui.setCellsError(c, rowIndices);
                ui.addWarning(`${column.label} failed: ${err.message}`);
                failed.push(column.label);
            }
        });
        ui.setStatus(failed.length ? `Done, with failures: ${failed.join(', ')}` : 'Done.');
    } catch (err) {
        console.error(err);
        ui.setStatus(`Error: ${err.message}`);
    } finally {
        running = false;
        ui.setRunning(false);
        ui.refresh();
    }
}

/**
 * @returns {string} Plain-text dump of settings + results.
 */
function buildSaveText() {
    // wide enough for the longest column label, with a gap
    const COL_W = Math.max(13, ...columns.map((c) => (c.chartLabel || c.id).length + 2));
    const results = ui.results;
    const header = `${'Count'.padEnd(10)}${columns.map((c) => (c.chartLabel || c.id).padStart(COL_W)).join('')}`;
    const lineW = header.length;

    let text = 'Web Engines Compare — Draw Call Performance\n';
    text += `${'═'.repeat(lineW)}\n`;
    text += `Unique materials: ${materialCount} (round-robin)\n`;
    text += `Unique meshes: ${meshCount} (deterministic random order)\n`;
    text += `Material complexity: ${complexity}\n`;
    text += `Shadows: ${shadowMode} (${SHADOW_MODES.find((m) => m.id === shadowMode)?.label ?? '?'})\n`;
    text += `Draw order: ${drawOrder} (${DRAW_ORDER_MODES.find((m) => m.id === drawOrder)?.label ?? '?'})\n`;
    text += `Frames: ${WARMUP_FRAMES} warmup + ${MEASURE_FRAMES} measured per count\n`;
    text += 'Isolation: one engine alive at a time, in its own iframe, after a warm-up of every enabled engine\n';
    text += `Viewport: ${window.innerWidth}x${window.innerHeight} (pixel ratio forced to 1, MSAA off)\n`;
    text += '\nCPU frame time = whole engine frame on the main thread (matrix updates, culling,\n';
    text += 'render-list build + sort, draw submission). Excludes GPU execution and vsync idle.\n\n';
    for (const col of columns) {
        text += `${col.label}: ${col.build.url}${col.disabled ? ' [unavailable]' : ''}\n`;
    }
    text += `${'═'.repeat(lineW)}\n`;

    const table = (title, pick) => {
        let out = `\n${title}\n${header}\n${'─'.repeat(lineW)}\n`;
        for (let r = 0; r < rows.length; r++) {
            let line = rows[r].label.padEnd(10);
            for (let c = 0; c < columns.length; c++) {
                const res = results[c][r];
                line += (res ? pick(res) : '—').padStart(COL_W);
            }
            out += `${line}\n`;
        }
        return `${out}${'─'.repeat(lineW)}\n`;
    };

    text += table('CPU frame time — mean (ms)', (res) => res.cpuMs.toFixed(2));
    text += table('CPU frame time — median (ms)', (res) => res.cpuMsMedian.toFixed(2));
    text += table('CPU frame time — min (ms)', (res) => res.cpuMsMin.toFixed(2));
    text += table('Draw calls submitted (median; at least the row count, about twice it with shadows)', (res) => (res.drawCalls >= 0 ? String(res.drawCalls) : 'n/a'));

    text += `\nUserAgent: ${navigator.userAgent}\n`;
    text += `Date: ${new Date().toISOString()}\n`;
    return text;
}
