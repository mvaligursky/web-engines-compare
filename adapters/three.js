import {
    CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR, CLEAR_COLOR, CUBE_SIZE, LIGHT_DIR, TEXTURE_SIZE,
    baseColorTextureData, cameraDistance, cubePosition, emissiveTextureData, materialSpec,
    metallicRoughnessTextureData, normalTextureData
} from '../lib/scene-spec.js';

/**
 * @param {object} THREE - The three.js module namespace.
 * @returns {object} Adapter implementing the benchmark adapter interface.
 */
export function createThreeAdapter(THREE) {
    let renderer = null;
    let scene = null;
    let camera = null;
    let geometry = null;
    /** @type {any[]} */
    let materials = [];
    /** @type {any[]} */
    const meshes = [];
    /** @type {any[]} */
    const textures = [];
    let rafId = 0;
    let running = false;

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
        async init({ canvas, materialCount, complexity }) {
            renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
            renderer.setPixelRatio(1);
            renderer.setSize(window.innerWidth, window.innerHeight, false);

            scene = new THREE.Scene();
            // spec colors are sRGB; three numeric color components default to linear
            scene.background = new THREE.Color().setRGB(CLEAR_COLOR[0], CLEAR_COLOR[1], CLEAR_COLOR[2], THREE.SRGBColorSpace);

            camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
            fitCamera();
            scene.add(camera);

            const light = new THREE.DirectionalLight(0xffffff, 3.6);
            light.position.set(-LIGHT_DIR[0] * 100, -LIGHT_DIR[1] * 100, -LIGHT_DIR[2] * 100);
            light.target.position.set(0, 0, 0);
            scene.add(light);
            scene.add(light.target);

            geometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);

            materials = [];
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
                materials.push(mat);
            }
        },

        setCubeCount(n) {
            while (meshes.length < n) {
                const i = meshes.length;
                const mesh = new THREE.Mesh(geometry, materials[i % materials.length]);
                const p = cubePosition(i);
                mesh.position.set(p[0], p[1], p[2]);
                scene.add(mesh);
                meshes.push(mesh);
            }
        },

        start(onFrame) {
            running = true;
            const loop = () => {
                if (!running) return;
                rafId = requestAnimationFrame(loop);
                const t0 = performance.now();
                renderer.render(scene, camera);
                onFrame(performance.now() - t0);
            };
            rafId = requestAnimationFrame(loop);
        },

        resize() {
            renderer.setSize(window.innerWidth, window.innerHeight, false);
            fitCamera();
        },

        getInfo() {
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
            if (geometry) geometry.dispose();
            if (renderer) {
                renderer.dispose();
                renderer.forceContextLoss();
            }
            renderer = null;
            scene = null;
        }
    };
}
