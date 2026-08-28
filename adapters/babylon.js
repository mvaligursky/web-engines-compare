import {
    CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR, CLEAR_COLOR, CUBE_SIZE, LIGHT_DIR, TEXTURE_SIZE,
    baseColorTextureData, cameraDistance, cubePosition, emissiveTextureData, materialSpec,
    metallicRoughnessTextureData, normalTextureData
} from '../lib/scene-spec.js';

/**
 * @param {object} B - The Babylon.js module (captured BABYLON global).
 * @returns {object} Adapter implementing the benchmark adapter interface.
 */
export function createBabylonAdapter(B) {
    let engine = null;
    let scene = null;
    let camera = null;
    /** @type {any[]} */
    let materials = [];
    /** @type {any[]} */
    const meshes = [];
    let master = null;
    let rafId = 0;
    let running = false;
    /** @type {(() => void)|null} */
    let loopFn = null;

    const makeTexture = (data) => {
        return new B.RawTexture(
            data, TEXTURE_SIZE, TEXTURE_SIZE,
            B.Constants.TEXTUREFORMAT_RGBA, scene,
            true /* generateMipMaps */, false /* invertY */,
            B.Texture.TRILINEAR_SAMPLINGMODE
        );
    };

    const fitCamera = () => {
        const aspect = window.innerWidth / window.innerHeight;
        camera.position.set(0, 0, cameraDistance(aspect));
        camera.setTarget(B.Vector3.Zero());
    };

    return {
        async init({ canvas, backend, materialCount, complexity, drawOrder }) {
            if (backend === 'webgpu') {
                if (!(await B.WebGPUEngine.IsSupportedAsync)) {
                    throw new Error('Babylon reports WebGPU is not supported here');
                }
                engine = new B.WebGPUEngine(canvas, { antialias: false, stencil: false });
                await engine.initAsync();
                if (!engine.isWebGPU) {
                    throw new Error('Requested webgpu but Babylon engine is not WebGPU');
                }
            } else {
                engine = new B.Engine(canvas, false /* antialias */, {
                    powerPreference: 'high-performance',
                    stencil: false
                }, false /* adaptToDeviceRatio -> pixel ratio 1 */);
            }
            // WebGPUEngine ignores the ctor's adaptToDeviceRatio arg
            engine.setHardwareScalingLevel(1);

            scene = new B.Scene(engine);
            scene.useRightHandedSystem = true;
            scene.clearColor = new B.Color4(CLEAR_COLOR[0], CLEAR_COLOR[1], CLEAR_COLOR[2], 1);

            camera = new B.FreeCamera('camera', new B.Vector3(0, 0, 1), scene);
            camera.fov = (CAMERA_FOV * Math.PI) / 180; // vertical-fixed by default
            camera.minZ = CAMERA_NEAR;
            camera.maxZ = CAMERA_FAR;
            fitCamera();

            const light = new B.DirectionalLight('light', new B.Vector3(LIGHT_DIR[0], LIGHT_DIR[1], LIGHT_DIR[2]), scene);
            light.intensity = 3.4;

            // Left alone, Babylon uses RenderingGroup.PainterSortCompare, which groups by
            // material.uniqueId. There is no unsorted opaque path (the opaqueSortCompareFn
            // setter always installs the sorted renderer and coerces null back to
            // PainterSortCompare), so creation order needs an explicit comparator;
            // uniqueId is assigned in creation order. Stored now and picked up when the
            // rendering group is created on first render.
            if (drawOrder === 'creation') {
                scene.setRenderingOrder(0, (a, b) => a.getMesh().uniqueId - b.getMesh().uniqueId);
            }

            materials = [];
            for (let m = 0; m < materialCount; m++) {
                const spec = materialSpec(m);
                const mat = new B.PBRMetallicRoughnessMaterial(`mat${m}`, scene);
                // spec colors are sRGB; Babylon PBR color factors are linear (like glTF)
                mat.baseColor = new B.Color3(spec.baseColor[0], spec.baseColor[1], spec.baseColor[2]).toLinearSpace();
                mat.metallic = spec.metallic;
                mat.roughness = spec.roughness;
                if (complexity === 'textured' || complexity === 'complex') {
                    mat.baseTexture = makeTexture(baseColorTextureData(m));
                }
                if (complexity === 'complex') {
                    const mrTex = makeTexture(metallicRoughnessTextureData(m));
                    mrTex.gammaSpace = false;
                    mat.metallicRoughnessTexture = mrTex;
                    const normalTex = makeTexture(normalTextureData(m));
                    normalTex.gammaSpace = false;
                    mat.normalTexture = normalTex;
                    mat.emissiveColor = new B.Color3(spec.emissive[0], spec.emissive[1], spec.emissive[2]).toLinearSpace();
                    mat.emissiveTexture = makeTexture(emissiveTextureData(m));
                }
                materials.push(mat);
            }
        },

        setCubeCount(n) {
            while (meshes.length < n) {
                const i = meshes.length;
                let mesh;
                if (!master) {
                    master = B.MeshBuilder.CreateBox('cube0', { size: CUBE_SIZE }, scene);
                    mesh = master;
                } else {
                    // clone shares the geometry but is submitted as its own draw call
                    mesh = master.clone(`cube${i}`);
                }
                mesh.material = materials[i % materials.length];
                const p = cubePosition(i);
                mesh.position.set(p[0], p[1], p[2]);
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
                // scene.render() covers world-matrix update, active-mesh evaluation
                // (culling), render-list build + sort and draw submission.
                const t0 = performance.now();
                engine.beginFrame();
                scene.render();
                engine.endFrame();
                onFrame(performance.now() - t0);
            };
            loopFn = loop;
            rafId = requestAnimationFrame(loop);
        },

        getDrawCalls() {
            return engine._drawCalls?.current ?? -1;
        },

        resize() {
            engine.resize();
            fitCamera();
        },

        getInfo() {
            if (engine.isWebGPU) {
                const info = engine._adapterInfo || engine.adapterInfo;
                return info ?
                    `vendor: ${info.vendor || '?'}, architecture: ${info.architecture || '?'}, device: ${info.device || '?'}` :
                    'WebGPU (no adapter info)';
            }
            const info = engine.getGlInfo();
            return `renderer: ${info.renderer || '?'}, vendor: ${info.vendor || '?'}`;
        },

        destroy() {
            running = false;
            cancelAnimationFrame(rafId);
            if (scene) scene.dispose();
            if (engine) engine.dispose();
            scene = null;
            engine = null;
        }
    };
}
