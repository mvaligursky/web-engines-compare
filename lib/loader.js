/**
 * Loads an engine build described by a `builds[backend]` record from
 * engines.config.js. Results are cached per url, so a build is only fetched
 * once per page even when several columns share it.
 */

const cache = new Map();

/**
 * @param {{ kind: string, url: string, global?: string }} build - Build descriptor.
 * @returns {Promise<object>} The engine module (ESM namespace or captured global).
 */
export async function loadEngineModule(build) {
    if (cache.has(build.url)) {
        return cache.get(build.url);
    }

    let modPromise;
    if (build.kind === 'script') {
        modPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = build.url;
            s.onload = () => {
                const mod = window[build.global];
                if (!mod) {
                    reject(new Error(`Script loaded but global '${build.global}' not found: ${build.url}`));
                    return;
                }
                // Capture the global now: a later load of another version of the
                // same engine will overwrite window[global], but this reference
                // stays valid.
                resolve(mod);
            };
            s.onerror = () => reject(new Error(`Failed to load script: ${build.url}`));
            document.head.appendChild(s);
        });
    } else {
        // Resolve relative urls (local builds) against the site root, which is
        // one level up from this file (lib/loader.js), so config paths like
        // './local-builds/foo.mjs' work from any page depth.
        const siteRoot = new URL('..', import.meta.url);
        const url = build.url.startsWith('.') ? new URL(build.url, siteRoot).href : build.url;
        modPromise = import(url);
    }

    cache.set(build.url, modPromise);
    return modPromise;
}
