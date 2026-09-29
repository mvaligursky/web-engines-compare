/**
 * Generic benchmark page UI, modeled on the PlayCanvas engine's gsplat
 * benchmark example: a result grid per metric with Run All / column / row /
 * cell controls on the first grid, a canvas chart next to each grid, a floating
 * status overlay while tests run, and save-to-txt / save-to-png.
 */

/** Design-time chart dimensions (CSS px); bitmap scales with table width x DPR. */
const CHART_REF_W = 778;
const CHART_REF_H = 389;

/**
 * @param {object} config - See fields below.
 * @param {string} config.title - Page title.
 * @param {string[]} config.legendLines - Explanatory lines shown under the title.
 * @param {object[]} config.columns - Column descriptors from buildColumns().
 * @param {{ value: number, label: string }[]} config.rows - Grid rows.
 * @param {{ key: string, title: string, format: (v: number) => string }[]} config.metrics - One grid + chart per metric; the first is interactive.
 * @param {object[]} config.controls - Dropdown descriptors.
 * @param {object} config.handlers - { runAll, runColumn(c), runColumns(cs), runRow(r), runRowOnly(r), runCell(c, r) }.
 * @param {() => string} config.buildSaveText - Builds the full .txt results dump.
 * @param {string} config.fileBaseName - Base name for downloaded files.
 * @returns {object} UI api.
 */
export function createBenchmarkUI(config) {
    const { columns, rows, metrics, handlers } = config;

    /** results[col][row] = { [metricKey]: number, ... } | null */
    const results = columns.map(() => rows.map(() => null));
    /** @type {Record<string, string>} */
    const infoByColumn = {};
    /** @type {Set<string>} */
    const warnings = new Set();

    // ── Page scaffolding ─────────────────────────────────────────────────────

    const containerEl = document.createElement('div');
    Object.assign(containerEl.style, {
        position: 'relative',
        zIndex: '100',
        color: '#fff',
        background: '#111',
        fontFamily: 'monospace',
        fontSize: '13px',
        padding: '20px',
        boxSizing: 'border-box',
        minHeight: '100vh'
    });
    document.body.appendChild(containerEl);

    const styleEl = document.createElement('style');
    styleEl.textContent =
        'html, body { margin: 0; background: #111; } ' +
        '.bench-cell { background: #1a1a2e; border-radius: 3px; transition: background 0.15s; } ' +
        '.bench-cell:hover { background: #2a2a4e; } ' +
        '.bench-cell-off, .bench-cell-off:hover { background: #181820; }';
    document.head.appendChild(styleEl);

    const backEl = document.createElement('a');
    backEl.textContent = '← all tests';
    backEl.href = '../../';
    Object.assign(backEl.style, { color: '#4a9eff', fontSize: '12px', textDecoration: 'none' });
    containerEl.appendChild(backEl);

    const titleEl = document.createElement('h2');
    titleEl.textContent = config.title;
    Object.assign(titleEl.style, { margin: '6px 0 4px 0', fontSize: '20px', fontWeight: 'normal' });
    containerEl.appendChild(titleEl);

    const warnEl = document.createElement('div');
    Object.assign(warnEl.style, {
        display: 'none',
        margin: '8px 0 10px',
        padding: '8px 10px',
        background: '#2a2218',
        border: '1px solid #664',
        borderRadius: '4px',
        color: '#ffb347',
        fontSize: '12px',
        lineHeight: '1.45',
        maxWidth: '900px',
        whiteSpace: 'pre-wrap'
    });
    containerEl.appendChild(warnEl);

    const infoEl = document.createElement('div');
    Object.assign(infoEl.style, { marginBottom: '8px', color: '#888', fontSize: '12px', whiteSpace: 'pre-wrap' });
    containerEl.appendChild(infoEl);

    const legendEl = document.createElement('div');
    legendEl.textContent = config.legendLines.join('\n');
    Object.assign(legendEl.style, {
        marginBottom: '12px',
        color: '#aaa',
        fontSize: '11px',
        lineHeight: '1.45',
        whiteSpace: 'pre-wrap',
        maxWidth: '900px'
    });
    containerEl.appendChild(legendEl);

    // ── Dropdown controls ────────────────────────────────────────────────────

    // one control per line, the labels in a column so the dropdowns line up
    const controlsRow = document.createElement('div');
    Object.assign(controlsRow.style, {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '6px',
        marginBottom: '14px'
    });
    containerEl.appendChild(controlsRow);

    /** @type {HTMLSelectElement[]} */
    const selectEls = [];
    for (const ctl of config.controls) {
        const label = document.createElement('label');
        Object.assign(label.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: '#aaa',
            fontSize: '13px'
        });
        const text = document.createElement('span');
        text.style.minWidth = '160px';
        text.textContent = ctl.label;
        label.appendChild(text);
        const select = document.createElement('select');
        Object.assign(select.style, {
            background: '#222',
            color: '#fff',
            border: '1px solid #444',
            borderRadius: '3px',
            fontFamily: 'monospace',
            fontSize: '13px',
            padding: '4px 6px'
        });
        for (const opt of ctl.options) {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            select.appendChild(o);
        }
        select.value = ctl.value;
        select.onchange = () => ctl.onChange(select.value);
        label.appendChild(select);
        controlsRow.appendChild(label);
        selectEls.push(select);
    }

    // ── Result grids ─────────────────────────────────────────────────────────

    const headerBtnCss = [
        'background: #4a9eff', 'color: #fff', 'border: none', 'border-radius: 3px',
        'cursor: pointer', 'font-family: monospace', 'font-size: 12px',
        'padding: 5px 8px', 'width: 100%', 'white-space: pre', 'line-height: 1.35'
    ].join(';');
    const compactBtnCss = headerBtnCss
        .replace('padding: 5px 8px', 'padding: 3px 6px')
        .replace('font-size: 12px', 'font-size: 11px');
    const compactRowOnlyBtnCss = compactBtnCss.replace('#4a9eff', '#2fa36b');
    const compactRunAllBtnCss = compactBtnCss.replace('#4a9eff', '#e05555');

    const narrowCellBase =
        'padding: 4px 5px; border: 1px solid #333; text-align: center; white-space: nowrap; background: #222; color: #fff;';
    const COL_EDGE_W = 76;
    const narrowEdgeColCss = `${narrowCellBase} box-sizing: border-box; width: ${COL_EDGE_W}px; min-width: ${COL_EDGE_W}px; max-width: ${COL_EDGE_W}px;`;
    const COLUMN_W = 96;
    const cellCss = `padding: 8px 6px; border: 1px solid #333; text-align: center; box-sizing: border-box; width: ${COLUMN_W}px; min-width: ${COLUMN_W}px; max-width: ${COLUMN_W}px;`;
    const headerCellCss = `${cellCss} background: #222; color: #fff; white-space: pre; line-height: 1.35;`;
    const headerGroupCellCss = `${cellCss} background: #1a1a1a; color: #aaa; white-space: nowrap;`;
    const compactGroupBtnCss = compactBtnCss.replace('#4a9eff', '#7a5cd6');

    /** @type {HTMLButtonElement[]} */
    const allBtns = [];

    /**
     * @param {boolean} interactive - True for the first grid only.
     * @returns {{ table: HTMLTableElement, cellEls: Map<string, HTMLTableCellElement> }} Table and result cells.
     */
    function createBenchTable(interactive) {
        const tbl = document.createElement('table');
        Object.assign(tbl.style, {
            borderCollapse: 'collapse',
            marginBottom: '0',
            fontSize: '14px',
            width: 'max-content',
            tableLayout: 'fixed'
        });

        const cg = document.createElement('colgroup');
        const cc = document.createElement('col');
        cc.style.width = `${COL_EDGE_W}px`;
        cg.appendChild(cc);
        for (let i = 0; i < columns.length; i++) {
            const col = document.createElement('col');
            col.style.width = `${COLUMN_W}px`;
            cg.appendChild(col);
        }
        const co = document.createElement('col');
        co.style.width = `${COL_EDGE_W}px`;
        cg.appendChild(co);
        tbl.appendChild(cg);

        const thead = document.createElement('thead');

        // ── group header: one run button per engine, spanning its columns ────────
        const groupTr = document.createElement('tr');
        const groupCornerTh = document.createElement('th');
        groupCornerTh.style.cssText = narrowEdgeColCss;
        groupTr.appendChild(groupCornerTh);

        for (let c = 0; c < columns.length;) {
            const engine = columns[c].engine;
            let end = c;
            while (end < columns.length && columns[end].engine === engine) end++;
            const groupCols = [];
            for (let i = c; i < end; i++) {
                if (!columns[i].disabled) groupCols.push(i);
            }

            const th = document.createElement('th');
            th.style.cssText = headerGroupCellCss;
            th.colSpan = end - c;
            if (interactive && groupCols.length > 0) {
                const btn = document.createElement('button');
                btn.textContent = `${columns[c].engineLabel} (${groupCols.length})`;
                btn.style.cssText = compactGroupBtnCss;
                btn.title = `Run every ${columns[c].engineLabel} column over all rows`;
                btn.onclick = () => handlers.runColumns(groupCols);
                th.appendChild(btn);
                allBtns.push(btn);
            } else {
                th.textContent = columns[c].engineLabel;
            }
            groupTr.appendChild(th);
            c = end;
        }

        const groupOnlyTh = document.createElement('th');
        groupOnlyTh.style.cssText = narrowEdgeColCss;
        groupTr.appendChild(groupOnlyTh);
        thead.appendChild(groupTr);

        const headTr = document.createElement('tr');

        const cornerTh = document.createElement('th');
        cornerTh.style.cssText = narrowEdgeColCss;
        if (interactive) {
            const runAllBtn = document.createElement('button');
            runAllBtn.textContent = 'Run All';
            runAllBtn.style.cssText = compactRunAllBtnCss;
            runAllBtn.onclick = () => handlers.runAll();
            cornerTh.appendChild(runAllBtn);
            allBtns.push(runAllBtn);
        } else {
            cornerTh.textContent = '—';
        }
        headTr.appendChild(cornerTh);

        for (let c = 0; c < columns.length; c++) {
            const th = document.createElement('th');
            th.style.cssText = headerCellCss;
            if (interactive && !columns[c].disabled) {
                const btn = document.createElement('button');
                btn.textContent = columns[c].shortLabel;
                btn.style.cssText = headerBtnCss;
                btn.onclick = () => handlers.runColumn(c);
                th.appendChild(btn);
                allBtns.push(btn);
            } else {
                th.textContent = columns[c].shortLabel;
                if (columns[c].disabled) {
                    th.style.color = '#666';
                    th.title = columns[c].disabledReason;
                }
            }
            headTr.appendChild(th);
        }

        const onlyHeaderTh = document.createElement('th');
        onlyHeaderTh.style.cssText = narrowEdgeColCss;
        onlyHeaderTh.textContent = interactive ? 'Only' : '';
        headTr.appendChild(onlyHeaderTh);

        thead.appendChild(headTr);
        tbl.appendChild(thead);

        const tbody = document.createElement('tbody');
        /** @type {Map<string, HTMLTableCellElement>} */
        const cellMap = new Map();

        for (let r = 0; r < rows.length; r++) {
            const tr = document.createElement('tr');
            const firstTd = document.createElement('td');
            firstTd.style.cssText = narrowEdgeColCss;
            if (interactive) {
                const rowBtn = document.createElement('button');
                rowBtn.textContent = `${rows[r].label} ↑`;
                rowBtn.style.cssText = compactBtnCss;
                rowBtn.onclick = () => handlers.runRow(r);
                firstTd.appendChild(rowBtn);
                allBtns.push(rowBtn);
            } else {
                firstTd.textContent = rows[r].label;
            }
            tr.appendChild(firstTd);

            for (let c = 0; c < columns.length; c++) {
                const td = document.createElement('td');
                const off = columns[c].disabled;
                td.style.cssText = `${cellCss} color: ${off ? '#555' : '#555'};`;
                td.className = off ? 'bench-cell-off' : 'bench-cell';
                td.textContent = off ? 'n/a' : '—';
                if (off) {
                    td.title = columns[c].disabledReason;
                    td.style.cursor = 'default';
                } else if (interactive) {
                    td.style.cursor = 'pointer';
                    td.onclick = () => handlers.runCell(c, r);
                } else {
                    td.style.cursor = 'default';
                }
                tr.appendChild(td);
                cellMap.set(`${r}:${c}`, td);
            }

            const onlyTd = document.createElement('td');
            onlyTd.style.cssText = narrowEdgeColCss;
            if (interactive) {
                const onlyBtn = document.createElement('button');
                onlyBtn.textContent = `← ${rows[r].label}`;
                onlyBtn.style.cssText = compactRowOnlyBtnCss;
                onlyBtn.onclick = () => handlers.runRowOnly(r);
                onlyTd.appendChild(onlyBtn);
                allBtns.push(onlyBtn);
            }
            tr.appendChild(onlyTd);

            tbody.appendChild(tr);
        }
        tbl.appendChild(tbody);

        return { table: tbl, cellEls: cellMap };
    }

    const grids = metrics.map((_, i) => createBenchTable(i === 0));

    /**
     * @param {string} label - Section heading text.
     * @returns {HTMLDivElement} Heading element.
     */
    function sectionLabel(label) {
        const el = document.createElement('div');
        el.textContent = label;
        Object.assign(el.style, { fontSize: '12px', color: '#888', marginBottom: '5px' });
        return el;
    }

    const mainGrid = document.createElement('div');
    Object.assign(mainGrid.style, {
        display: 'grid',
        gridTemplateColumns: 'max-content max-content',
        columnGap: '16px',
        rowGap: '14px',
        alignItems: 'start',
        justifyItems: 'start',
        width: 'max-content',
        maxWidth: '100%',
        boxSizing: 'border-box'
    });

    const chartWraps = metrics.map(() => document.createElement('div'));
    for (let i = 0; i < metrics.length; i++) {
        const section = document.createElement('div');
        section.appendChild(sectionLabel(metrics[i].title));
        section.appendChild(grids[i].table);
        Object.assign(chartWraps[i].style, { minWidth: '0' });
        mainGrid.appendChild(section);
        mainGrid.appendChild(chartWraps[i]);
    }

    const actionsRow = document.createElement('div');
    Object.assign(actionsRow.style, { gridColumn: '1 / -1', marginTop: '2px' });
    mainGrid.appendChild(actionsRow);

    containerEl.appendChild(mainGrid);

    const statusEl = document.createElement('div');
    Object.assign(statusEl.style, {
        marginTop: '10px',
        color: '#aaa',
        whiteSpace: 'pre',
        lineHeight: '1.4',
        minHeight: '1.4em',
        fontSize: '14px'
    });
    containerEl.appendChild(statusEl);

    const floatingStatus = document.createElement('div');
    Object.assign(floatingStatus.style, {
        position: 'fixed',
        top: '10px',
        left: '10px',
        zIndex: '300',
        color: '#fff',
        background: 'rgba(0, 0, 0, 0.7)',
        fontFamily: 'monospace',
        fontSize: '14px',
        padding: '8px 14px',
        borderRadius: '4px',
        display: 'none',
        pointerEvents: 'none'
    });
    document.body.appendChild(floatingStatus);

    // ── Cell + state helpers ─────────────────────────────────────────────────

    /**
     * @param {number} c - Column index.
     * @param {number} r - Row index.
     * @param {string[]} texts - One text per metric grid.
     * @param {string} [color] - Text color.
     */
    function setCellTexts(c, r, texts, color) {
        for (let i = 0; i < grids.length; i++) {
            const td = grids[i].cellEls.get(`${r}:${c}`);
            if (td) {
                td.textContent = texts[i];
                td.style.color = color || '#fff';
            }
        }
    }

    function setButtonsEnabled(enabled) {
        for (const btn of allBtns) {
            btn.disabled = !enabled;
            btn.style.opacity = enabled ? '1' : '0.4';
            btn.style.cursor = enabled ? 'pointer' : 'default';
        }
        for (const select of selectEls) {
            select.disabled = !enabled;
        }
        for (const [key, td] of grids[0].cellEls) {
            const c = parseInt(key.split(':')[1], 10);
            if (columns[c].disabled) continue;
            td.style.cursor = enabled ? 'pointer' : 'default';
            td.style.pointerEvents = enabled ? 'auto' : 'none';
        }
    }

    function updateInfoLine() {
        const lines = [];
        for (const col of columns) {
            if (infoByColumn[col.id]) lines.push(`${col.label}: ${infoByColumn[col.id]}`);
        }
        infoEl.textContent = lines.join('\n');
    }

    function syncWarnings() {
        const list = [...warnings];
        warnEl.style.display = list.length ? 'block' : 'none';
        warnEl.textContent = list.join('\n');
    }

    // ── Charts ───────────────────────────────────────────────────────────────

    /**
     * @param {HTMLCanvasElement} chartCanvas - Chart canvas.
     * @param {HTMLTableElement} sizeTable - Table whose box drives chart CSS size.
     */
    function layoutChartCanvas(chartCanvas, sizeTable) {
        const tw = Math.max(sizeTable.offsetWidth, sizeTable.scrollWidth, Math.ceil(sizeTable.getBoundingClientRect().width));
        const th = Math.max(sizeTable.offsetHeight, sizeTable.scrollHeight, Math.ceil(sizeTable.getBoundingClientRect().height));
        const cssW = Math.max(1, Math.ceil(tw));
        const fallbackH = Math.ceil(cssW * (CHART_REF_H / CHART_REF_W));
        const cssH = Math.max(1, th > 0 ? Math.ceil(th) : fallbackH);
        const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;

        Object.assign(chartCanvas.style, {
            display: 'block',
            background: '#1a1a2e',
            borderRadius: '4px',
            width: `${cssW}px`,
            height: `${cssH}px`,
            maxWidth: 'none',
            boxSizing: 'border-box'
        });
        chartCanvas.width = Math.max(1, Math.round(cssW * dpr));
        chartCanvas.height = Math.max(1, Math.round(cssH * dpr));
    }

    /**
     * @param {HTMLCanvasElement} chartCanvas - Canvas.
     * @param {number} metricIndex - Which metric to plot.
     */
    function drawChart(chartCanvas, metricIndex) {
        const ctx = chartCanvas.getContext('2d');
        if (!ctx) return;
        const metric = metrics[metricIndex];

        const W = chartCanvas.width;
        const H = chartCanvas.height;
        const scale = W / CHART_REF_W;

        ctx.clearRect(0, 0, W, H);
        ctx.font = `${11 * scale}px monospace`;

        // Lay the legend out first: it wraps across as many lines as the columns
        // need, and the plot area's top padding grows to stay clear of it.
        const LEGEND_LINE_W = 16 * scale;
        const LEGEND_GAP = 14 * scale;
        const LEGEND_ROW_H = 14 * scale;
        const legendItems = [];
        for (let c = 0; c < columns.length; c++) {
            if (!results[c].some((r) => r !== null)) continue;
            const text = columns[c].chartLabel || columns[c].shortLabel.replace(/\n/g, ' ');
            legendItems.push({ text, color: columns[c].color, dash: columns[c].dash || [], w: LEGEND_LINE_W + 4 * scale + ctx.measureText(text).width });
        }
        const PAD = { top: 0, right: 20 * scale, bottom: 40 * scale, left: 56 * scale };
        const legendAvailW = W - PAD.left - PAD.right;
        const legendRows = [[]];
        let rowW = 0;
        for (const item of legendItems) {
            if (rowW > 0 && rowW + item.w > legendAvailW) {
                legendRows.push([]);
                rowW = 0;
            }
            legendRows[legendRows.length - 1].push({ ...item, x: rowW });
            rowW += item.w + LEGEND_GAP;
        }
        PAD.top = 12 * scale + legendRows.length * LEGEND_ROW_H;

        const plotW = W - PAD.left - PAD.right;
        const plotH = H - PAD.top - PAD.bottom;

        // x range from rows that have any results
        let minV = Infinity;
        let maxV = -Infinity;
        let maxY = 0;
        for (let c = 0; c < columns.length; c++) {
            for (let r = 0; r < rows.length; r++) {
                const res = results[c][r];
                if (!res) continue;
                minV = Math.min(minV, rows[r].value);
                maxV = Math.max(maxV, rows[r].value);
                maxY = Math.max(maxY, res[metric.key]);
            }
        }
        if (!(minV <= maxV)) {
            minV = rows[0].value;
            maxV = rows[rows.length - 1].value;
        }
        const spanV = maxV - minV;
        maxY = maxY * 1.15;
        if (maxY === 0) maxY = 1;

        const toX = (v) => (spanV <= 0 ? PAD.left + plotW * 0.5 : PAD.left + ((v - minV) / spanV) * plotW);
        const toY = (v) => PAD.top + plotH - (v / maxY) * plotH;

        // axes
        ctx.strokeStyle = '#444';
        ctx.lineWidth = Math.max(1, scale);
        ctx.beginPath();
        ctx.moveTo(PAD.left, PAD.top);
        ctx.lineTo(PAD.left, H - PAD.bottom);
        ctx.lineTo(W - PAD.right, H - PAD.bottom);
        ctx.stroke();

        // y ticks + gridlines
        const yTicks = 5;
        for (let i = 0; i <= yTicks; i++) {
            const v = (maxY / yTicks) * i;
            const y = toY(v);
            ctx.strokeStyle = '#2a2a3e';
            ctx.beginPath();
            ctx.moveTo(PAD.left, y);
            ctx.lineTo(W - PAD.right, y);
            ctx.stroke();
            ctx.fillStyle = '#888';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(metric.format(v), PAD.left - 6 * scale, y);
        }

        // x ticks per row
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let r = 0; r < rows.length; r++) {
            if (rows[r].value < minV || rows[r].value > maxV) continue;
            const x = toX(rows[r].value);
            ctx.strokeStyle = '#333';
            ctx.beginPath();
            ctx.moveTo(x, H - PAD.bottom);
            ctx.lineTo(x, H - PAD.bottom + 4 * scale);
            ctx.stroke();
            ctx.fillStyle = '#888';
            ctx.fillText(rows[r].label, x, H - PAD.bottom + 7 * scale);
        }

        // lines per column: color identifies the engine version, dash the backend
        for (let c = 0; c < columns.length; c++) {
            const pts = [];
            for (let r = 0; r < rows.length; r++) {
                const res = results[c][r];
                if (res) pts.push([toX(rows[r].value), toY(res[metric.key])]);
            }
            if (!pts.length) continue;
            ctx.strokeStyle = columns[c].color;
            ctx.lineWidth = 2 * scale;
            ctx.setLineDash((columns[c].dash || []).map((d) => d * scale));
            ctx.beginPath();
            for (let i = 0; i < pts.length; i++) {
                if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]);
                else ctx.lineTo(pts[i][0], pts[i][1]);
            }
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = columns[c].color;
            for (const [x, y] of pts) {
                ctx.beginPath();
                ctx.arc(x, y, 3 * scale, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // legend (title is already the section label above the table)
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        for (let row = 0; row < legendRows.length; row++) {
            const ly = 6 * scale + row * LEGEND_ROW_H;
            for (const item of legendRows[row]) {
                const lx = PAD.left + item.x;
                ctx.strokeStyle = item.color;
                ctx.lineWidth = 2 * scale;
                ctx.setLineDash(item.dash.map((d) => d * scale));
                ctx.beginPath();
                ctx.moveTo(lx, ly + 5 * scale);
                ctx.lineTo(lx + LEGEND_LINE_W, ly + 5 * scale);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = '#ccc';
                ctx.fillText(item.text, lx + LEGEND_LINE_W + 4 * scale, ly);
            }
        }
    }

    // ── Save buttons + chart refresh ─────────────────────────────────────────

    function refreshChartsAndActions() {
        for (const wrap of chartWraps) wrap.innerHTML = '';
        actionsRow.innerHTML = '';

        const anyResults = results.some((col) => col.some((r) => r !== null));
        if (!anyResults) return;

        const canvases = metrics.map((_, i) => {
            const cv = document.createElement('canvas');
            chartWraps[i].appendChild(cv);
            return cv;
        });

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                for (let i = 0; i < metrics.length; i++) {
                    layoutChartCanvas(canvases[i], grids[i].table);
                    drawChart(canvases[i], i);
                }
            });
        });

        const btnStyle = {
            padding: '8px 16px',
            background: '#4a9eff',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontSize: '13px'
        };

        const saveResultsBtn = document.createElement('button');
        saveResultsBtn.textContent = 'Save Results (.txt)';
        Object.assign(saveResultsBtn.style, btnStyle);
        saveResultsBtn.onclick = () => {
            const blob = new Blob([config.buildSaveText()], { type: 'text/plain' });
            downloadBlob(blob, `${config.fileBaseName}-${Date.now()}.txt`);
        };
        actionsRow.appendChild(saveResultsBtn);

        const savePageBtn = document.createElement('button');
        savePageBtn.textContent = 'Save Page (.png)';
        Object.assign(savePageBtn.style, { ...btnStyle, marginLeft: '8px' });
        savePageBtn.onclick = async () => {
            const blob = await pageToPngBlob(containerEl);
            if (blob) downloadBlob(blob, `${config.fileBaseName}-${Date.now()}.png`);
        };
        actionsRow.appendChild(savePageBtn);
    }

    /**
     * @param {Blob} blob - Data.
     * @param {string} name - Download filename.
     */
    function downloadBlob(blob, name) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
    }

    let uiResizeTimer = 0;
    window.addEventListener('resize', () => {
        window.clearTimeout(uiResizeTimer);
        uiResizeTimer = window.setTimeout(() => {
            if (results.some((col) => col.some((r) => r !== null))) refreshChartsAndActions();
        }, 200);
    });

    // ── Public api ───────────────────────────────────────────────────────────

    return {
        containerEl,
        results,

        setStatus(text) {
            statusEl.textContent = text;
            floatingStatus.textContent = text;
        },

        setRunning(running) {
            containerEl.style.display = running ? 'none' : '';
            floatingStatus.style.display = running ? 'block' : 'none';
            setButtonsEnabled(!running);
        },

        setColumnInfo(colIndex, info) {
            infoByColumn[columns[colIndex].id] = info;
            updateInfoLine();
        },

        setCellsPending(colIndex, rowIndices) {
            for (const r of rowIndices) {
                setCellTexts(colIndex, r, metrics.map(() => '...'), '#666');
            }
        },

        setCellsError(colIndex, rowIndices) {
            for (const r of rowIndices) {
                if (results[colIndex][r]) continue;
                setCellTexts(colIndex, r, metrics.map(() => 'err'), '#e05555');
            }
        },

        setResult(colIndex, rowIndex, values) {
            results[colIndex][rowIndex] = values;
            setCellTexts(colIndex, rowIndex, metrics.map((m) => m.format(values[m.key])), '#fff');
        },

        addWarning(text) {
            warnings.add(text);
            syncWarnings();
        },

        clearResults() {
            warnings.clear();
            syncWarnings();
            for (let c = 0; c < columns.length; c++) {
                for (let r = 0; r < rows.length; r++) {
                    results[c][r] = null;
                    if (columns[c].disabled) continue;
                    setCellTexts(c, r, metrics.map(() => '—'), '#555');
                }
            }
            refreshChartsAndActions();
        },

        refresh() {
            refreshChartsAndActions();
        }
    };
}

/**
 * Rasterize a page container to a PNG blob, trimming uniform #111 edges.
 * (Ported from the PlayCanvas gsplat benchmark example.)
 *
 * @param {HTMLElement} containerEl - Root element to capture.
 * @returns {Promise<Blob|null>} PNG blob.
 */
async function pageToPngBlob(containerEl) {
    const rect = containerEl.getBoundingClientRect();
    let maxW = Math.max(containerEl.scrollWidth, containerEl.offsetWidth, rect.width);
    let maxH = Math.max(containerEl.scrollHeight, containerEl.offsetHeight, rect.height);
    containerEl.querySelectorAll('canvas, img, table, button').forEach((node) => {
        const r = node.getBoundingClientRect();
        maxW = Math.max(maxW, r.right - rect.left);
        maxH = Math.max(maxH, r.bottom - rect.top);
    });
    const W = Math.ceil(Math.max(1, maxW));
    const H = Math.ceil(Math.max(1, maxH));

    // Clone; canvases don't render inside foreignObject, so swap them for <img>.
    const clone = /** @type {HTMLElement} */ (containerEl.cloneNode(true));
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    clone.style.boxSizing = 'border-box';
    clone.style.width = `${W}px`;
    clone.style.minHeight = `${H}px`;
    clone.style.overflow = 'visible';

    clone.querySelectorAll('table').forEach((t) => {
        t.style.width = 'max-content';
        t.style.maxWidth = 'none';
    });

    const lives = containerEl.querySelectorAll('canvas');
    clone.querySelectorAll('canvas').forEach((c, i) => {
        const live = lives[i];
        const rr = live.getBoundingClientRect();
        const img = document.createElement('img');
        img.src = live.toDataURL();
        img.width = live.width;
        img.height = live.height;
        img.style.cssText = [
            'display:block',
            `background:${live.style.background || '#1a1a2e'}`,
            `border-radius:${live.style.borderRadius || '4px'}`,
            `width:${Math.ceil(rr.width)}px`,
            `height:${Math.ceil(rr.height)}px`,
            'max-width:none',
            'box-sizing:border-box'
        ].join(';');
        c.replaceWith(img);
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(clone)}</foreignObject></svg>`;
    const pageImg = new Image();
    pageImg.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await pageImg.decode();

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(pageImg, 0, 0, W, H);

    // Trim uniform #111 margins.
    const data = ctx.getImageData(0, 0, W, H).data;
    const BG = 0x11;
    const TOL = 4;
    const PAD = 16;
    const isContent = (i) => {
        if (data[i + 3] < 255) return true;
        return Math.abs(data[i] - BG) > TOL || Math.abs(data[i + 1] - BG) > TOL || Math.abs(data[i + 2] - BG) > TOL;
    };
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            if (isContent(i)) {
                x0 = Math.min(x0, x);
                x1 = Math.max(x1, x);
                y0 = Math.min(y0, y);
                y1 = Math.max(y1, y);
            }
        }
    }
    if (x1 < 0) {
        x0 = 0;
        y0 = 0;
        x1 = W - 1;
        y1 = H - 1;
    } else {
        x0 = Math.max(0, x0 - PAD);
        y0 = Math.max(0, y0 - PAD);
        x1 = Math.min(W - 1, x1 + PAD);
        y1 = Math.min(H - 1, y1 + PAD);
    }

    const out = document.createElement('canvas');
    out.width = x1 - x0 + 1;
    out.height = y1 - y0 + 1;
    /** @type {CanvasRenderingContext2D} */ (out.getContext('2d')).drawImage(canvas, -x0, -y0);
    return new Promise((resolve) => {
        out.toBlob(resolve, 'image/png');
    });
}
