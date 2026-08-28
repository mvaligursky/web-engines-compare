import {
    CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR, CLEAR_COLOR, CUBE_SIZE, LIGHT_DIR, TEXTURE_SIZE,
    baseColorTextureData, cameraDistance, cubePosition, emissiveTextureData, materialSpec,
    metallicRoughnessTextureData, normalTextureData
} from '../lib/scene-spec.js';

/**
 * @param {object} pc - The playcanvas module namespace.
 * @returns {object} Adapter implementing the benchmark adapter interface.
 */
export function createPlayCanvasAdapter(pc) {
    let app = null;
    let device = null;
    let cameraEntity = null;
    let mesh = null;
    /** @type {any[]} */
    let materials = [];
    /** @type {any[]} */
    const entities = [];

    const makeTexture = (data, srgb) => {
        const tex = new pc.Texture(device, {
            width: TEXTURE_SIZE,
            height: TEXTURE_SIZE,
            format: srgb ? pc.PIXELFORMAT_SRGBA8 : pc.PIXELFORMAT_RGBA8,
            mipmaps: true,
            minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
            magFilter: pc.FILTER_LINEAR
        });
        tex.lock().set(data);
        tex.unlock();
        return tex;
    };

    const fitCamera = () => {
        const aspect = window.innerWidth / window.innerHeight;
        cameraEntity.setLocalPosition(0, 0, cameraDistance(aspect));
    };

    return {
        async init({ canvas, backend, materialCount, complexity, drawOrder }) {
            device = await pc.createGraphicsDevice(canvas, {
                deviceTypes: backend === 'webgpu' ? ['webgpu'] : ['webgl2'],
                antialias: false,
                powerPreference: 'high-performance'
            });
            // createGraphicsDevice silently falls back (webgpu -> webgl2 -> null),
            // which would make a WebGPU column a second WebGL run.
            const expected = backend === 'webgpu' ? pc.DEVICETYPE_WEBGPU : pc.DEVICETYPE_WEBGL2;
            if (device.deviceType !== expected) {
                throw new Error(`Requested ${backend} but got '${device.deviceType}'`);
            }
            device.maxPixelRatio = 1;

            const appOptions = new pc.AppOptions();
            appOptions.graphicsDevice = device;
            appOptions.componentSystems = [
                pc.RenderComponentSystem,
                pc.CameraComponentSystem,
                pc.LightComponentSystem
            ];

            app = new pc.AppBase(canvas);
            app.init(appOptions);
            app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
            app.setCanvasResolution(pc.RESOLUTION_AUTO);
            app.scene.ambientLight.set(0, 0, 0);

            // Left alone, the World layer uses SORTMODE_MATERIALMESH, sorting on
            // MeshInstance._sortKeyForward (which packs material.id) so draws group by
            // material. SORTMODE_NONE skips the sort and submits in insertion order.
            if (drawOrder === 'creation') {
                app.scene.layers.getLayerByName('World').opaqueSortMode = pc.SORTMODE_NONE;
            }

            cameraEntity = new pc.Entity('camera');
            cameraEntity.addComponent('camera', {
                clearColor: new pc.Color(CLEAR_COLOR[0], CLEAR_COLOR[1], CLEAR_COLOR[2]),
                fov: CAMERA_FOV,
                nearClip: CAMERA_NEAR,
                farClip: CAMERA_FAR
            });
            fitCamera();
            cameraEntity.lookAt(0, 0, 0);
            app.root.addChild(cameraEntity);

            // pc directional lights shine along the entity's -Y axis
            const light = new pc.Entity('light');
            light.addComponent('light', {
                type: 'directional',
                color: new pc.Color(1, 1, 1),
                intensity: 1.2,
                castShadows: false
            });
            const q = new pc.Quat().setFromDirections(pc.Vec3.DOWN, new pc.Vec3(LIGHT_DIR[0], LIGHT_DIR[1], LIGHT_DIR[2]));
            light.setRotation(q);
            app.root.addChild(light);

            const h = CUBE_SIZE / 2;
            mesh = pc.Mesh.fromGeometry(device, new pc.BoxGeometry({
                halfExtents: new pc.Vec3(h, h, h)
            }));

            materials = [];
            for (let m = 0; m < materialCount; m++) {
                const spec = materialSpec(m);
                const mat = new pc.StandardMaterial();
                // glTF-style metallic-roughness setup (mirrors the glb parser).
                // pc takes color factors gamma-encoded, so spec sRGB values go in raw.
                mat.useMetalness = true;
                mat.diffuse.set(spec.baseColor[0], spec.baseColor[1], spec.baseColor[2]);
                mat.metalness = spec.metallic;
                mat.gloss = spec.roughness;
                mat.glossInvert = true;
                if (complexity === 'textured' || complexity === 'complex') {
                    mat.diffuseMap = makeTexture(baseColorTextureData(m), true);
                }
                if (complexity === 'complex') {
                    const mr = makeTexture(metallicRoughnessTextureData(m), false);
                    mat.metalnessMap = mr;
                    mat.metalnessMapChannel = 'b';
                    mat.glossMap = mr;
                    mat.glossMapChannel = 'g';
                    mat.normalMap = makeTexture(normalTextureData(m), false);
                    mat.emissive.set(spec.emissive[0], spec.emissive[1], spec.emissive[2]);
                    mat.emissiveMap = makeTexture(emissiveTextureData(m), true);
                }
                mat.update();
                materials.push(mat);
            }

            app.start();
            app.resizeCanvas();
        },

        setCubeCount(n) {
            while (entities.length < n) {
                const i = entities.length;
                const e = new pc.Entity(`cube${i}`);
                e.addComponent('render', {
                    meshInstances: [new pc.MeshInstance(mesh, materials[i % materials.length])]
                });
                const p = cubePosition(i);
                e.setLocalPosition(p[0], p[1], p[2]);
                app.root.addChild(e);
                entities.push(e);
            }
        },

        start(onFrame) {
            // app.start() runs the engine's own rAF loop. 'frameupdate' fires just
            // before app.update() and 'frameend' right after app.render(), so this
            // brackets the engine's whole per-frame CPU cost.
            let t0 = 0;
            app.on('frameupdate', () => {
                t0 = performance.now();
            });
            app.on('frameend', () => {
                onFrame(performance.now() - t0);
            });
        },

        // pc drives its own rAF loop and offers no public pause, so an idle column
        // keeps ticking app.update() (cheap: no scripts, render components have no
        // per-frame update) but skips all culling and submission.
        setPaused(paused) {
            app.autoRender = !paused;
        },

        // stats.drawCalls.total is latched in stats.updateBasic() at the start of
        // the next frame, so this reports the previous frame's count.
        getDrawCalls() {
            return app.stats?.drawCalls?.total ?? -1;
        },

        resize() {
            app.resizeCanvas();
            fitCamera();
        },

        getInfo() {
            if (device.isWebGPU) {
                const info = device.gpuAdapter?.info;
                return info ?
                    `vendor: ${info.vendor || '?'}, architecture: ${info.architecture || '?'}, device: ${info.device || '?'}` :
                    'WebGPU (no adapter info)';
            }
            return `renderer: ${device.unmaskedRenderer || '?'}, vendor: ${device.unmaskedVendor || '?'}`;
        },

        destroy() {
            if (app) app.destroy();
            app = null;
            device = null;
        }
    };
}
