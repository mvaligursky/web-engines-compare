import {
    CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR, CLEAR_COLOR, LIGHT_DIR, PLANE_COLOR, PLANE_ROUGHNESS,
    PLANE_SIZE, PLANE_Z, SHADOW_MAP_SIZE, TEXTURE_SIZE,
    baseColorTextureData, cameraDistance, cubeMeshIndex, cubePosition, emissiveTextureData,
    materialSpec, meshSpec, metallicRoughnessTextureData, normalTextureData
} from '../lib/scene-spec.js';

/**
 * @param {object} THREE - The three.js module namespace (three.module.js for
 * WebGL2, three.webgpu.js for WebGPU — the latter re-exports the whole core).
 * @returns {object} Adapter implementing the benchmark adapter interface.
 */
export function createThreeAdapter(THREE) {
    let renderer = null;
    let scene = null;
    let camera = null;
    let castShadows = false;
    /** @type {any[]} */
    let geometries = [];
    /** @type {{ geometries: any[], materials: any[] }} */
    let cubes = { geometries: [], materials: [] };
    /** @type {any[]} */
    let materials = [];
    /** @type {any[]} */
    const meshes = [];
    /** @type {any[]} */
    const textures = [];
    let rafId = 0;
    let running = false;
    /** @type {(() => void)|null} */
    let loopFn = null;

    const makeTexture = (data, srgb) => {
        const tex = new THREE.DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat);
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        textures.push(tex);
        return tex;
    };

    const fitCamera = () => {
        const aspect = window.innerWidth / window.innerHeight;
        camera.aspect = aspect;
        camera.position.set(0, 0, cameraDistance(aspect));
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
    };

    return {
        async init({ canvas, backend, materialCount, meshCount, complexity, drawOrder, shadows }) {
            if (backend === 'webgpu') {
                if (!THREE.WebGPURenderer) {
                    throw new Error('This three build has no WebGPURenderer (use the three.webgpu.js build)');
                }
                renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL: false });
                await renderer.init();
                // forceWebGL:false only *prefers* WebGPU; confirm we did not get
                // the WebGL fallback backend, which would duplicate the GL column.
                const backendName = renderer.backend?.constructor?.name || '?';
                if (!backendName.includes('WebGPU')) {
                    throw new Error(`Requested webgpu but three chose '${backendName}'`);
                }
            } else {
                renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
            }
            renderer.setPixelRatio(1);
            renderer.setSize(window.innerWidth, window.innerHeight, false);
            castShadows = shadows;
            renderer.shadowMap.enabled = shadows;
            renderer.shadowMap.type = THREE.PCFShadowMap;

            // 'default' leaves the renderer's own sort alone: WebGLRenderer groups by
            // material.id, the WebGPU renderer sorts by depth instead.
            if (drawOrder === 'creation') {
                // skips both the sort and the per-object depth projection;
                // order becomes scene-graph traversal order
                renderer.sortObjects = false;
            }

            scene = new THREE.Scene();
            // spec colors are sRGB; three numeric color components default to linear
            scene.background = new THREE.Color().setRGB(CLEAR_COLOR[0], CLEAR_COLOR[1], CLEAR_COLOR[2], THREE.SRGBColorSpace);

            camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
            fitCamera();
            scene.add(camera);

            const light = new THREE.DirectionalLight(0xffffff, 3.6);
            light.position.set(-LIGHT_DIR[0] * 100, -LIGHT_DIR[1] * 100, -LIGHT_DIR[2] * 100);
            light.target.position.set(0, 0, 0);
            if (shadows) {
                // one orthographic shadow map around the whole plane, three's only
                // directional shadow type - its equivalent of a single cascade
                light.castShadow = true;
                light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
                const half = PLANE_SIZE / 2;
                Object.assign(light.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 300 });
                light.shadow.camera.updateProjectionMatrix();
            }
            scene.add(light);
            scene.add(light.target);

            // the plane behind the grid - PlaneGeometry faces +Z
            const plane = new THREE.Mesh(
                new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE),
                new THREE.MeshStandardMaterial({
                    color: new THREE.Color().setRGB(PLANE_COLOR[0], PLANE_COLOR[1], PLANE_COLOR[2], THREE.SRGBColorSpace),
                    metalness: 0,
                    roughness: PLANE_ROUGHNESS
                })
            );
            plane.position.z = PLANE_Z;
            plane.receiveShadow = shadows;
            scene.add(plane);
            geometries = [plane.geometry];
            materials = [plane.material];

            const cubeGeometries = [];
            for (let k = 0; k < meshCount; k++) {
                const size = meshSpec(k);
                cubeGeometries.push(new THREE.BoxGeometry(size[0], size[1], size[2]));
            }
            geometries.push(...cubeGeometries);

            const cubeMaterials = [];
            for (let m = 0; m < materialCount; m++) {
                const spec = materialSpec(m);
                const mat = new THREE.MeshStandardMaterial({
                    color: new THREE.Color().setRGB(spec.baseColor[0], spec.baseColor[1], spec.baseColor[2], THREE.SRGBColorSpace),
                    metalness: spec.metallic,
                    roughness: spec.roughness
                });
                if (complexity === 'textured' || complexity === 'complex') {
                    mat.map = makeTexture(baseColorTextureData(m), true);
                }
                if (complexity === 'complex') {
                    const mr = makeTexture(metallicRoughnessTextureData(m), false);
                    mat.metalnessMap = mr;
                    mat.roughnessMap = mr;
                    mat.normalMap = makeTexture(normalTextureData(m), false);
                    mat.emissive = new THREE.Color().setRGB(spec.emissive[0], spec.emissive[1], spec.emissive[2], THREE.SRGBColorSpace);
                    mat.emissiveMap = makeTexture(emissiveTextureData(m), true);
                }
                cubeMaterials.push(mat);
            }
            materials.push(...cubeMaterials);
            cubes = { geometries: cubeGeometries, materials: cubeMaterials };
        },

        setCubeCount(n) {
            while (meshes.length < n) {
                const i = meshes.length;
                const mesh = new THREE.Mesh(
                    cubes.geometries[cubeMeshIndex(i, cubes.geometries.length)],
                    cubes.materials[i % cubes.materials.length]
                );
                mesh.castShadow = castShadows;
                const p = cubePosition(i);
                mesh.position.set(p[0], p[1], p[2]);
                scene.add(mesh);
                meshes.push(mesh);
            }
        },

        setPaused(paused) {
            if (paused) {
                running = false;
                cancelAnimationFrame(rafId);
            } else if (!running && loopFn) {
                running = true;
                rafId = requestAnimationFrame(loopFn);
            }
        },

        start(onFrame) {
            running = true;
            const loop = () => {
                if (!running) return;
                rafId = requestAnimationFrame(loop);
                // render() covers world-matrix update, frustum culling, render-list
                // build + sort and draw submission — three has no separate update step.
                const t0 = performance.now();
                renderer.render(scene, camera);
                onFrame(performance.now() - t0);
            };
            loopFn = loop;
            rafId = requestAnimationFrame(loop);
        },

        // WebGPURenderer counts drawCalls, WebGLRenderer calls - both reset every render()
        getDrawCalls() {
            const render = renderer.info?.render;
            return render?.drawCalls ?? render?.calls ?? -1;
        },

        resize() {
            renderer.setSize(window.innerWidth, window.innerHeight, false);
            fitCamera();
        },

        getInfo() {
            if (renderer.backend) {
                // three's WebGPUBackend keeps only the device, not the adapter
                const info = renderer.backend.device?.adapterInfo ?? renderer.backend.adapter?.info;
                return info ?
                    `vendor: ${info.vendor || '?'}, architecture: ${info.architecture || '?'}, device: ${info.device || '?'}` :
                    'WebGPU (no adapter info)';
            }
            const gl = renderer.getContext();
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
            return `renderer: ${name}`;
        },

        destroy() {
            running = false;
            cancelAnimationFrame(rafId);
            for (const t of textures) t.dispose();
            for (const m of materials) m.dispose();
            for (const g of geometries) g.dispose();
            if (renderer) {
                renderer.dispose();
                // WebGL only; frees the context immediately rather than at GC
                renderer.forceContextLoss?.();
            }
            renderer = null;
            scene = null;
        }
    };
}
