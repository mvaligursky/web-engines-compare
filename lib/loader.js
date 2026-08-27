/**
 * Loads an engine build described by an entry from engines.config.js.
 * Results are cached per url, so a version is only fetched once per page.
 */

const cache = new Map();

/**
 * @param {object} entry - Entry from ENGINE_VERSIONS.
 * @returns {Promise<object>} The engine module (ESM namespace or captured global).
 */
export async function loadEngineModule(entry) {
    if (cache.has(entry.url)) {
        return cache.get(entry.url);
    }

    let modPromise;
    if (entry.kind === 'script') {
        modPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = entry.url;
            s.onload = () => {
                const mod = window[entry.global];
                if (!mod) {
                    reject(new Error(`Script loaded but global '${entry.global}' not found: ${entry.url}`));
                    return;
                }
                // Capture the global now: a later load of another version of the
                // same engine will overwrite window[global], but this reference
                // stays valid.
                resolve(mod);
            };
            s.onerror = () => reject(new Error(`Failed to load script: ${entry.url}`));
            document.head.appendChild(s);
        });
    } else {
        // Resolve relative urls (local builds) against the site root, which is
        // one level up from this file (lib/loader.js), so config paths like
        // './local-builds/foo.mjs' work from any page depth.
        const siteRoot = new URL('..', import.meta.url);
        const url = entry.url.startsWith('.') ? new URL(entry.url, siteRoot).href : entry.url;
        modPromise = import(url);
    }

    cache.set(entry.url, modPromise);
    return modPromise;
}
