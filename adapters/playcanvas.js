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
    let cameraEntity = null;
    let mesh = null;
    /** @type {any[]} */
    let materials = [];
    /** @type {any[]} */
    const entities = [];

    const makeTexture = (data, srgb) => {
        const tex = new pc.Texture(app.graphicsDevice, {
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
        async init({ canvas, materialCount, complexity }) {
            app = new pc.Application(canvas, {
                graphicsDeviceOptions: {
                    antialias: false,
                    powerPreference: 'high-performance'
                }
            });
            app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
            app.setCanvasResolution(pc.RESOLUTION_AUTO);
            app.graphicsDevice.maxPixelRatio = 1;
            app.scene.ambientLight.set(0, 0, 0);

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
            mesh = pc.Mesh.fromGeometry(app.graphicsDevice, new pc.BoxGeometry({
                halfExtents: new pc.Vec3(h, h, h)
            }));

            materials = [];
            for (let m = 0; m < materialCount; m++) {
                const spec = materialSpec(m);
                const mat = new pc.StandardMaterial();
                // glTF-style metallic-roughness setup (mirrors the glb parser)
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
            // app.start() runs the engine's own rAF loop; measure the CPU window
            // between 'frameupdate' (fired just before update()) and 'frameend'
            // (fired right after render()).
            let t0 = 0;
            app.on('frameupdate', () => {
                t0 = performance.now();
            });
            app.on('frameend', () => {
                onFrame(performance.now() - t0);
            });
        },

        resize() {
            app.resizeCanvas();
            fitCamera();
        },

        getInfo() {
            const device = app.graphicsDevice;
            return `renderer: ${device.unmaskedRenderer || '?'}, vendor: ${device.unmaskedVendor || '?'}`;
        },

        destroy() {
            if (app) app.destroy();
            app = null;
        }
    };
}
