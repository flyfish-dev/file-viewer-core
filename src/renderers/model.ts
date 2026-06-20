import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type {
  FileRenderContext,
  FileViewerRenderedInstance,
} from '../contracts/types';

type ModelStatus = 'loading' | 'ready' | 'error';

const modelStyle = `
.model-viewer{display:flex;height:100%;min-height:100%;flex-direction:column;background:#f8fafc;color:#162333}
.model-viewer *{box-sizing:border-box}
.model-toolbar{display:flex;min-height:48px;align-items:center;justify-content:space-between;gap:16px;padding:0 12px;border-bottom:1px solid rgba(15,23,42,.08);background:#fff}
.model-actions{display:flex;min-width:0;flex-wrap:wrap;gap:6px}
.model-actions button{min-height:30px;border:0;border-radius:8px;padding:0 10px;background:rgba(15,23,42,.06);color:#475569;cursor:pointer;font-size:12px;font-weight:700;letter-spacing:0;transition:background-color .18s ease,color .18s ease}
.model-actions button.active,.model-actions button:hover{background:rgba(33,163,102,.14);color:#16804f}
.model-meta{min-width:0;display:flex;align-items:center;justify-content:flex-end;gap:8px;color:#64748b;font-size:12px}
.model-meta strong{color:#0f766e;font-weight:800}
.model-meta span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.model-stage{position:relative;flex:1;min-height:0;overflow:hidden}
.model-stage canvas{display:block;width:100%;height:100%;outline:none}
.model-state{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;background:rgba(248,250,252,.88);color:#64748b;text-align:center;line-height:1.7}
.model-state[hidden]{display:none!important}
.model-state.error{color:#b42318}
.model-state strong{color:#b42318;font-size:18px}
@media (max-width:720px){.model-toolbar{min-height:64px;align-items:flex-start;flex-direction:column;gap:8px;padding:8px 10px}.model-meta{width:100%;justify-content:flex-start}}
`;

class ModelPreviewNotice extends Error {}

const createStyle = () => {
  const style = document.createElement('style');
  style.textContent = modelStyle;
  return style;
};

const createElement = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  text?: string
) => {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
};

const normalizeError = (reason: unknown) => {
  if (reason instanceof Error) {
    return reason.message;
  }
  if (typeof reason === 'string') {
    return reason;
  }
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
};

const getResourcePath = (sourceUrl?: string) => {
  if (!sourceUrl) {
    return '';
  }

  try {
    return new URL('.', sourceUrl).href;
  } catch {
    const clean = sourceUrl.split(/[?#]/)[0] || sourceUrl;
    const slashIndex = clean.lastIndexOf('/');
    return slashIndex >= 0 ? clean.slice(0, slashIndex + 1) : '';
  }
};

const disposeMaterial = (material: THREE.Material | THREE.Material[]) => {
  const materials = Array.isArray(material) ? material : [material];
  materials.forEach(item => item.dispose());
};

const disposeObject = (object: THREE.Object3D) => {
  object.traverse(child => {
    const mesh = child as THREE.Mesh;
    const points = child as THREE.Points;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      disposeMaterial(mesh.material);
    }
    if (points.material) {
      disposeMaterial(points.material);
    }
  });
};

export default async function renderModel(
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type = 'glb',
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> {
  const normalizedType = type.toLowerCase();
  const sourceUrl = context?.url;
  let status: ModelStatus = 'loading';
  let errorMessage = '';
  let objectSummary = '正在加载模型';
  let autoRotate = false;
  let wireframe = false;
  let showGrid = true;
  let showAxes = true;
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let controls: OrbitControls | null = null;
  let modelRoot: THREE.Object3D | null = null;
  let gridHelper: THREE.GridHelper | null = null;
  let axesHelper: THREE.AxesHelper | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let animationFrame = 0;
  let activeVersion = 0;
  let mixer: THREE.AnimationMixer | null = null;
  const clock = new THREE.Clock();

  const root = createElement('div', 'model-viewer');
  const toolbar = createElement('div', 'model-toolbar');
  const actions = createElement('div', 'model-actions');
  const fitButton = createElement('button', undefined, '适配') as HTMLButtonElement;
  const rotateButton = createElement('button', undefined, '旋转') as HTMLButtonElement;
  const wireframeButton = createElement('button', undefined, '线框') as HTMLButtonElement;
  const gridButton = createElement('button', undefined, '网格') as HTMLButtonElement;
  const axesButton = createElement('button', undefined, '坐标') as HTMLButtonElement;
  const meta = createElement('div', 'model-meta');
  const typeText = createElement('strong', undefined, normalizedType.toUpperCase());
  const summaryText = createElement('span', undefined, objectSummary);
  const stage = createElement('div', 'model-stage');
  const canvas = document.createElement('canvas');
  const state = createElement('div', 'model-state', '正在解析 3D 模型...');
  const buttons = [fitButton, rotateButton, wireframeButton, gridButton, axesButton];

  buttons.forEach(button => {
    button.type = 'button';
  });
  actions.append(fitButton, rotateButton, wireframeButton, gridButton, axesButton);
  meta.append(typeText, summaryText);
  toolbar.append(actions, meta);
  stage.append(canvas, state);
  root.append(toolbar, stage);
  target.replaceChildren(createStyle(), root);

  const readText = () => {
    if (typeof TextDecoder === 'function') {
      return new TextDecoder('utf-8').decode(buffer);
    }
    const bytes = new Uint8Array(buffer);
    let text = '';
    for (let index = 0; index < bytes.length; index += 1) {
      text += String.fromCharCode(bytes[index]);
    }
    return text;
  };
  const updateUi = () => {
    rotateButton.classList.toggle('active', autoRotate);
    wireframeButton.classList.toggle('active', wireframe);
    gridButton.classList.toggle('active', showGrid);
    axesButton.classList.toggle('active', showAxes);
    summaryText.textContent = objectSummary;
    state.hidden = status === 'ready';
    state.classList.toggle('error', status === 'error');
    if (status === 'loading') {
      state.textContent = '正在解析 3D 模型...';
    } else if (status === 'error') {
      state.replaceChildren(
        createElement('strong', undefined, '模型解析失败'),
        createElement('span', undefined, errorMessage)
      );
    }
  };

  const updateHelperVisibility = () => {
    if (gridHelper) {
      gridHelper.visible = showGrid;
    }
    if (axesHelper) {
      axesHelper.visible = showAxes;
    }
    updateUi();
  };

  const resize = () => {
    if (!renderer || !camera) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const ensureScene = () => {
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        canvas,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0xf8fafc, 1);
    }

    if (!scene) {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf8fafc);

      const hemiLight = new THREE.HemisphereLight(0xffffff, 0xd7dee8, 2.4);
      scene.add(hemiLight);

      const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
      keyLight.position.set(8, 10, 8);
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xffffff, 0.9);
      fillLight.position.set(-7, 5, -4);
      scene.add(fillLight);

      gridHelper = new THREE.GridHelper(10, 10, 0xcbd5e1, 0xe2e8f0);
      scene.add(gridHelper);

      axesHelper = new THREE.AxesHelper(3);
      scene.add(axesHelper);
    }

    if (!camera) {
      camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100000);
      camera.position.set(5, 4, 6);
    }

    if (!controls && camera && renderer) {
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.screenSpacePanning = true;
      controls.autoRotateSpeed = 1.2;
    }

    updateHelperVisibility();
    resize();
  };

  const clearModel = () => {
    if (modelRoot && scene) {
      scene.remove(modelRoot);
      disposeObject(modelRoot);
    }
    modelRoot = null;
    mixer = null;
  };

  const createSurfaceMaterial = () => new THREE.MeshStandardMaterial({
    color: 0x4f8fba,
    metalness: 0.08,
    roughness: 0.78,
    side: THREE.DoubleSide,
    wireframe,
  });

  const createPointMaterial = () => new THREE.PointsMaterial({
    color: 0x1f7a8c,
    size: 0.035,
    sizeAttenuation: true,
  });

  const applyDefaultMaterials = (object: THREE.Object3D) => {
    object.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && !mesh.material) {
        mesh.material = createSurfaceMaterial();
      }
      if (mesh.isMesh && mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach(material => {
          if ('wireframe' in material) {
            material.wireframe = wireframe;
          }
          material.needsUpdate = true;
        });
      }
    });
  };

  const countMeshes = (object: THREE.Object3D) => {
    let meshes = 0;
    let points = 0;
    object.traverse(child => {
      if ((child as THREE.Mesh).isMesh) {
        meshes += 1;
      }
      if ((child as THREE.Points).isPoints) {
        points += 1;
      }
    });
    return { meshes, points };
  };

  const summarizeModel = (object: THREE.Object3D) => {
    const { meshes, points } = countMeshes(object);
    const parts = [];
    if (meshes) {
      parts.push(`${meshes} 个网格`);
    }
    if (points) {
      parts.push(`${points} 个点云`);
    }
    objectSummary = parts.length ? parts.join('，') : '模型已加载';
    updateUi();
  };

  const normalizeObject = (object: THREE.Object3D) => {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) {
      return {
        center: new THREE.Vector3(),
        size: new THREE.Vector3(4, 4, 4),
      };
    }

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    object.position.sub(center);

    return {
      center: new THREE.Vector3(),
      size,
    };
  };

  const fitToView = () => {
    if (!modelRoot || !camera || !controls) {
      return;
    }

    const box = new THREE.Box3().setFromObject(modelRoot);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 1);
    const distance = radius / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.65;

    camera.near = Math.max(distance / 1000, 0.01);
    camera.far = Math.max(distance * 1000, 1000);
    camera.position.copy(center).add(new THREE.Vector3(distance, distance * 0.62, distance));
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.update();
  };

  const addModelToScene = async (object: THREE.Object3D) => {
    if (!scene) {
      return;
    }

    clearModel();
    applyDefaultMaterials(object);
    const { size } = normalizeObject(object);
    modelRoot = object;
    scene.add(object);
    fitToView();
    summarizeModel(object);

    const maxSize = Math.max(size.x, size.y, size.z, 1);
    if (gridHelper) {
      gridHelper.scale.setScalar(Math.max(maxSize / 10, 1));
    }
  };

  const parseGlbOrGltf = async () => {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const resourcePath = getResourcePath(sourceUrl);
    const input = normalizedType === 'gltf' ? readText() : buffer;

    return await new Promise<THREE.Object3D>((resolve, reject) => {
      loader.parse(
        input,
        resourcePath,
        gltf => {
          if (gltf.animations?.length) {
            mixer = new THREE.AnimationMixer(gltf.scene);
            gltf.animations.forEach(clip => mixer?.clipAction(clip).play());
          }
          resolve(gltf.scene);
        },
        reject
      );
    });
  };

  const parseObj = async () => {
    const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
    return new OBJLoader().parse(readText());
  };

  const parseStl = async () => {
    const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
    const geometry = new STLLoader().parse(buffer);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, createSurfaceMaterial());
  };

  const parsePly = async () => {
    const { PLYLoader } = await import('three/addons/loaders/PLYLoader.js');
    const geometry = new PLYLoader().parse(buffer);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, createSurfaceMaterial());
  };

  const parseFbx = async () => {
    const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
    const object = new FBXLoader().parse(buffer, getResourcePath(sourceUrl));
    if (object.animations?.length) {
      mixer = new THREE.AnimationMixer(object);
      object.animations.forEach((clip: THREE.AnimationClip) => mixer?.clipAction(clip).play());
    }
    return object;
  };

  const parseDae = async () => {
    const { ColladaLoader } = await import('three/addons/loaders/ColladaLoader.js');
    const result = new ColladaLoader().parse(readText(), getResourcePath(sourceUrl));
    if (!result?.scene) {
      throw new Error('DAE 模型未解析出有效场景');
    }
    return result.scene;
  };

  const parse3ds = async () => {
    const { TDSLoader } = await import('three/addons/loaders/TDSLoader.js');
    return new TDSLoader().parse(buffer, getResourcePath(sourceUrl));
  };

  const parse3mf = async () => {
    const { ThreeMFLoader } = await import('three/addons/loaders/3MFLoader.js');
    return new ThreeMFLoader().parse(buffer);
  };

  const parseAmf = async () => {
    const { AMFLoader } = await import('three/addons/loaders/AMFLoader.js');
    return new AMFLoader().parse(buffer);
  };

  const parseUsd = async () => {
    const { USDLoader } = await import('three/addons/loaders/USDLoader.js');
    return new USDLoader().parse(buffer);
  };

  const parseKmz = async () => {
    const { KMZLoader } = await import('three/addons/loaders/KMZLoader.js');
    return new KMZLoader().parse(buffer).scene;
  };

  const explainEngineeringModel = (modelType: string): never => {
    const upperType = modelType.toUpperCase();
    if (modelType === 'ifc') {
      throw new ModelPreviewNotice('IFC 是 BIM 模型格式，浏览器端完整解析通常依赖 web-ifc 这类 WebAssembly BIM 内核。当前 Apache-2.0 前端包不默认打入这类重型运行时，建议在私有服务端转换为 GLB/GLTF 后预览。');
    }
    if (modelType === '3dm') {
      throw new ModelPreviewNotice('3DM 是 Rhino/OpenNURBS 模型格式，浏览器端解析需要 rhino3dm WebAssembly 运行时。当前前端包未内置该运行时，建议在私有转换链路输出 GLB/GLTF 后预览。');
    }
    throw new ModelPreviewNotice(`${upperType} 属于 CAD B-Rep / 工程交换格式，浏览器端完整解析通常需要 OpenCascade 等 WebAssembly 几何内核。当前前端包不默认打入这类重型运行时，建议在私有服务端转换为 GLB/GLTF 或轻量网格格式后预览。`);
  };

  const parsePcd = async () => {
    const { PCDLoader } = await import('three/addons/loaders/PCDLoader.js');
    return (new PCDLoader() as { parse(data: ArrayBuffer, url?: string): THREE.Points }).parse(
      buffer,
      sourceUrl || 'model.pcd'
    );
  };

  const parseVrml = async () => {
    const { VRMLLoader } = await import('three/addons/loaders/VRMLLoader.js');
    return new VRMLLoader().parse(readText(), getResourcePath(sourceUrl));
  };

  const parseXyz = async () => {
    const { XYZLoader } = await import('three/addons/loaders/XYZLoader.js');
    const geometry = (new XYZLoader() as unknown as { parse(text: string): THREE.BufferGeometry }).parse(readText());
    geometry.computeBoundingSphere();
    return new THREE.Points(geometry, createPointMaterial());
  };

  const parseVtk = async () => {
    const { VTKLoader } = await import('three/addons/loaders/VTKLoader.js');
    const geometry = (new VTKLoader() as unknown as { parse(data: ArrayBuffer): THREE.BufferGeometry }).parse(buffer);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, createSurfaceMaterial());
  };

  const parseModel = (modelType: string) => {
    switch (modelType) {
      case 'glb':
      case 'gltf':
        return parseGlbOrGltf();
      case 'obj':
        return parseObj();
      case 'stl':
        return parseStl();
      case 'ply':
        return parsePly();
      case 'fbx':
        return parseFbx();
      case 'dae':
        return parseDae();
      case '3ds':
        return parse3ds();
      case '3mf':
        return parse3mf();
      case 'amf':
        return parseAmf();
      case 'usd':
      case 'usda':
      case 'usdc':
      case 'usdz':
        return parseUsd();
      case 'kmz':
        return parseKmz();
      case 'step':
      case 'stp':
      case 'iges':
      case 'igs':
      case 'ifc':
      case '3dm':
        return explainEngineeringModel(modelType);
      case 'pcd':
        return parsePcd();
      case 'wrl':
      case 'vrml':
        return parseVrml();
      case 'xyz':
        return parseXyz();
      case 'vtk':
      case 'vtp':
        return parseVtk();
      default:
        throw new Error(`暂不支持 .${modelType} 模型格式`);
    }
  };

  const loadModel = async () => {
    const version = ++activeVersion;
    status = 'loading';
    errorMessage = '';
    objectSummary = '正在加载模型';
    updateUi();
    ensureScene();

    try {
      const object = await parseModel(normalizedType);
      if (version !== activeVersion) {
        disposeObject(object);
        return;
      }
      await addModelToScene(object);
      status = 'ready';
      updateUi();
    } catch (reason) {
      if (version !== activeVersion) {
        return;
      }
      if (!(reason instanceof ModelPreviewNotice)) {
        console.error(reason);
      }
      status = 'error';
      errorMessage = normalizeError(reason) || `${normalizedType.toUpperCase()} 模型解析失败`;
      updateUi();
    }
  };

  const renderFrame = () => {
    if (!renderer || !scene || !camera || !controls) {
      return;
    }

    controls.autoRotate = autoRotate;
    controls.update();
    const delta = clock.getDelta();
    mixer?.update(delta);
    renderer.render(scene, camera);
    animationFrame = window.requestAnimationFrame(renderFrame);
  };

  const updateWireframe = () => {
    if (modelRoot) {
      applyDefaultMaterials(modelRoot);
    }
    updateUi();
  };

  fitButton.addEventListener('click', fitToView);
  rotateButton.addEventListener('click', () => {
    autoRotate = !autoRotate;
    updateUi();
  });
  wireframeButton.addEventListener('click', () => {
    wireframe = !wireframe;
    updateWireframe();
  });
  gridButton.addEventListener('click', () => {
    showGrid = !showGrid;
    updateHelperVisibility();
  });
  axesButton.addEventListener('click', () => {
    showAxes = !showAxes;
    updateHelperVisibility();
  });

  updateUi();
  ensureScene();
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  clock.start();
  renderFrame();
  void loadModel();

  return {
    $el: root,
    unmount() {
      activeVersion += 1;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      resizeObserver = null;
      clearModel();
      controls?.dispose();
      controls = null;
      renderer?.dispose();
      renderer = null;
      clock.stop();
      scene = null;
      camera = null;
      gridHelper = null;
      axesHelper = null;
      target.replaceChildren();
    },
  };
}
