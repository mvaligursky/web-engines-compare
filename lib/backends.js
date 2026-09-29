/**
 * Graphics backends every engine version can be tested on, and expansion of
 * the version registry into benchmark columns (version x backend).
 */

export const BACKENDS = [
    { id: 'webgl2', label: 'WebGL2', shortLabel: 'GL2', dash: [] },
    { id: 'webgpu', label: 'WebGPU', shortLabel: 'WGPU', dash: [7, 4] }
];

/** Display names for the engine groups, used by the per-engine run buttons. */
const ENGINE_LABELS = {
    playcanvas: 'PlayCanvas',
    three: 'Three.js',
    babylon: 'Babylon.js'
};

/** Line colors, assigned per engine version so a new version is visually distinct. */
const VERSION_COLORS = ['#ff6b6b', '#2ecc71', '#a06bff', '#f7dc6f', '#4a9eff', '#4fd1c5', '#f78fb3'];

/**
 * @param {string} backendId - Backend id.
 * @returns {boolean} True if this browser can run the backend at all.
 */
export function isBackendAvailable(backendId) {
    if (backendId === 'webgpu') {
        return typeof navigator !== 'undefined' && !!navigator.gpu;
    }
    return true;
}

/**
 * Expand the enabled engine versions into one column per (version, backend)
 * pair that the version declares a build for. Columns for backends this browser lacks are
 * kept but flagged `disabled`, so the table shape stays stable and the reason
 * is visible instead of the run failing mid-way.
 *
 * @param {object[]} versions - ENGINE_VERSIONS entries.
 * @returns {object[]} Column descriptors.
 */
export function buildColumns(versions) {
    const columns = [];
    versions.filter((entry) => entry.enabled !== false).forEach((entry, versionIndex) => {
        for (const backend of BACKENDS) {
            const build = entry.builds?.[backend.id];
            if (!build) continue;
            const available = isBackendAvailable(backend.id);
            columns.push({
                id: `${entry.id}-${backend.id}`,
                entry,
                engine: entry.engine,
                engineLabel: ENGINE_LABELS[entry.engine] ?? entry.engine,
                build,
                backend: backend.id,
                label: `${entry.label} (${backend.label})`,
                shortLabel: `${entry.shortLabel}\n${backend.shortLabel}`,
                chartLabel: `${entry.shortLabel} ${backend.shortLabel}`,
                color: VERSION_COLORS[versionIndex % VERSION_COLORS.length],
                dash: backend.dash,
                disabled: !available,
                disabledReason: available ? '' : `${backend.label} not available in this browser`
            });
        }
    });
    return columns;
}
