import { ENGINE_VERSIONS } from '../../engines.config.js';
import { createBenchmarkUI } from '../../lib/bench-ui.js';
import { runColumnBenchmark } from '../../lib/runner.js';
import { COMPLEXITY_LEVELS } from '../../lib/scene-spec.js';

// Dev-only overrides, e.g. ?rows=500,1000&warmup=3&measure=20
const params = new URLSearchParams(location.search);
const WARMUP_FRAMES = parseInt(params.get('warmup') || '10', 10);
const MEASURE_FRAMES = parseInt(params.get('measure') || '60', 10);

/** @type {number[]} */
const rowValues = params.get('rows') ?
    params.get('rows').split(',').map((v) => parseInt(v, 10)) :
    Array.from({ length: 11 }, (_, i) => 10000 + i * 1000);

const rows = rowValues.map((v) => ({
    value: v,
    label: v >= 1000 && v % 1000 === 0 ? `${v / 1000}K` : `${v}`
}));

const MATERIAL_COUNTS = [1, ...Array.from({ length: 20 }, (_, i) => (i + 1) * 50)];

let materialCount = parseInt(params.get('mats') || '100', 10);
let complexity = params.get('complexity') || 'simple';
if (!MATERIAL_COUNTS.includes(materialCount)) MATERIAL_COUNTS.push(materialCount);
let running = false;

const columns = ENGINE_VERSIONS.map((e) => ({ id: e.id, label: e.label, shortLabel: e.shortLabel }));

const metrics = [
    { key: 'cpuMs', title: 'CPU frame time (ms)', format: (v) => v.toFixed(2) },
    { key: 'fps', title: `Effective FPS (${MEASURE_FRAMES} frames / wall clock)`, format: (v) => v.toFixed(1) }
];

const ui = createBenchmarkUI({
    title: 'Draw Call Performance',
    legendLines: [
        `A dense 2D grid of tiny cubes (deterministic layout, identical view in every engine) rendered as one draw call each — a CPU submission cost test. Native PBR (glTF metallic-roughness) materials, one directional light, no shadows, MSAA off, pixel ratio 1.`,
        '',
        'Controls:',
        'Run All — all engine columns and all row counts.',
        'Column headers — that engine only, all counts.',
        `Left column (e.g. ${rows[0].label} ↑) — every count from ${rows[0].label} up through that row, all engines.`,
        `Right column (e.g. ← ${rows[0].label}) — only that count, all engines.`,
        'Grid cells — that engine only, counts up through that row.',
        '',
        `CPU frame time — mean main-thread time the engine spends per frame (update + draw submission) over ${MEASURE_FRAMES} measured frames after ${WARMUP_FRAMES} warmup frames.`,
        `Effective FPS — measured frames divided by wall-clock time (includes vsync and GPU stalls).`,
        'Changing a dropdown clears stored results (they would no longer be comparable).'
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
            id: 'complexity',
            label: 'Material complexity',
            options: COMPLEXITY_LEVELS.map((l) => ({ value: l.id, label: l.label })),
            value: complexity,
            onChange: (v) => {
                complexity = v;
                ui.clearResults();
            }
        }
    ],
    handlers: {
        runAll: () => runSet(allColumns(), allRows()),
        runColumn: (c) => runSet([c], allRows()),
        runRow: (r) => runSet(allColumns(), rangeRows(r)),
        runRowOnly: (r) => runSet(allColumns(), [r]),
        runCell: (c, r) => runSet([c], rangeRows(r))
    },
    buildSaveText,
    fileBaseName: 'draw-call-benchmark'
});

const allColumns = () => columns.map((_, i) => i);
const allRows = () => rows.map((_, i) => i);
const rangeRows = (r) => Array.from({ length: r + 1 }, (_, i) => i);

/**
 * @param {number[]} colIndices - Columns to run, in order.
 * @param {number[]} rowIndices - Rows to run per column, ascending.
 */
async function runSet(colIndices, rowIndices) {
    if (running) return;
    running = true;
    ui.setRunning(true);
    try {
        for (const c of colIndices) {
            ui.setCellsPending(c, rowIndices);
            // eslint-disable-next-line no-await-in-loop
            const info = await runColumnBenchmark({
                entry: ENGINE_VERSIONS[c],
                rowValues,
                rowIndices,
                materialCount,
                complexity,
                warmupFrames: WARMUP_FRAMES,
                measureFrames: MEASURE_FRAMES,
                onStatus: (t) => ui.setStatus(t),
                onRowResult: (ri, res) => ui.setResult(c, ri, res)
            });
            ui.setColumnInfo(c, info);
        }
        ui.setStatus('Done.');
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
 * @returns {string} Plain-text dump of settings + both result tables.
 */
function buildSaveText() {
    const COL_W = 12;
    const results = ui.results;
    const header = `${'Count'.padEnd(10)}${columns.map((c) => c.shortLabel.padStart(COL_W)).join('')}`;
    const lineW = header.length;

    let text = 'Web Engines Compare — Draw Call Performance\n';
    text += `${'═'.repeat(lineW)}\n`;
    text += `Unique materials: ${materialCount}\n`;
    text += `Material complexity: ${complexity}\n`;
    text += `Frames: ${WARMUP_FRAMES} warmup + ${MEASURE_FRAMES} measured per count\n`;
    text += `Viewport: ${window.innerWidth}x${window.innerHeight} (pixel ratio forced to 1, MSAA off)\n`;
    for (let c = 0; c < columns.length; c++) {
        const entry = ENGINE_VERSIONS[c];
        text += `${columns[c].label}: ${entry.url}\n`;
    }
    text += `${'═'.repeat(lineW)}\n`;

    for (const metric of metrics) {
        text += `\n${metric.title}\n${header}\n${'─'.repeat(lineW)}\n`;
        for (let r = 0; r < rows.length; r++) {
            let line = rows[r].label.padEnd(10);
            for (let c = 0; c < columns.length; c++) {
                const res = results[c][r];
                line += (res ? metric.format(res[metric.key]) : '—').padStart(COL_W);
            }
            text += `${line}\n`;
        }
        text += `${'─'.repeat(lineW)}\n`;
    }

    text += '\nCPU frame time medians (ms)\n';
    for (let r = 0; r < rows.length; r++) {
        let line = rows[r].label.padEnd(10);
        for (let c = 0; c < columns.length; c++) {
            const res = results[c][r];
            line += (res ? res.cpuMsMedian.toFixed(2) : '—').padStart(COL_W);
        }
        text += `${line}\n`;
    }

    text += `\nUserAgent: ${navigator.userAgent}\n`;
    text += `Date: ${new Date().toISOString()}\n`;
    return text;
}
