import {
  CadViewer,
  type CadLayer,
  type CadLoadProgress,
  type CadViewer as CadViewerInstance,
  type CadViewerLoadResult,
  type CanvasViewerOptions,
  type RenderStats,
  type ViewChangeEvent,
} from '@flyfish-dev/cad-viewer';
import { resolveFileViewerCadAssetUrls } from '../platform/assets';
import {
  registerFileViewerZoomProvider,
  unregisterFileViewerZoomProvider,
} from '../features/document/dom';
import { createFileViewerZoomChangeEmitter } from '../features/document/zoom';
import type {
  FileRenderContext,
  FileViewerCadOptions,
  FileViewerRenderedInstance,
  FileViewerZoomState,
} from '../contracts/types';

type CadStatus = 'loading' | 'ready' | 'error';

type CadLayerItem = CadLayer & {
  name: string;
};

const CAD_WORKER_TIMEOUT = 120000;

const cadStyle = `
.cad-shell{display:flex;height:100%;min-height:100%;flex-direction:column;background:#f5f7fb;color:#142335}
.cad-shell *{box-sizing:border-box}
.cad-toolbar{display:flex;min-height:48px;align-items:center;justify-content:space-between;gap:16px;padding:0 14px;border-bottom:1px solid rgba(15,23,42,.08);background:#fff}
.cad-tools,.cad-meta{display:flex;align-items:center;gap:8px}
.cad-tools button{min-width:34px;min-height:30px;border:0;border-radius:8px;background:rgba(15,23,42,.06);color:#25344c;cursor:pointer;font-weight:800;letter-spacing:0;transition:background-color .18s ease,color .18s ease}
.cad-tools button:hover{background:rgba(31,150,110,.14);color:#0f8f62}
.cad-zoom,.cad-meta span{color:#64748b;font-size:12px;font-weight:800;letter-spacing:0}
.cad-meta span{border-radius:999px;padding:5px 9px;background:rgba(15,23,42,.06)}
.cad-body{display:grid;min-height:0;flex:1;grid-template-columns:minmax(168px,220px) minmax(0,1fr) minmax(150px,190px);background:#eef2f7}
.cad-body.without-layers{grid-template-columns:minmax(0,1fr) minmax(150px,190px)}
.cad-layers,.cad-inspector{min-height:0;overflow:auto;border-right:1px solid rgba(15,23,42,.08);background:#fff}
.cad-layers[hidden]{display:none}
.cad-inspector{border-right:0;border-left:1px solid rgba(15,23,42,.08);padding:14px}
.cad-layers-head{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;padding:12px 12px 8px;background:#fff;color:#1f2a3d;font-size:13px;z-index:1}
.cad-layers-head span{color:#7b8ca5;font-size:12px;font-weight:700}
.cad-layers-list{display:flex;flex-direction:column;padding:0 0 8px}
.cad-layers button{display:flex;width:calc(100% - 16px);min-height:34px;align-items:center;gap:8px;margin:0 8px 6px;border:1px solid rgba(148,163,184,.22);border-radius:8px;background:#f8fafc;color:#25344c;cursor:pointer;font-size:12px;font-weight:700;text-align:left}
.cad-layers button.muted{opacity:.48}
.cad-layer-color{width:10px;height:10px;flex:0 0 auto;border-radius:50%;background:#1f966e;box-shadow:inset 0 0 0 1px rgba(15,23,42,.14)}
.cad-canvas-wrap{position:relative;min-width:0;min-height:0;overflow:hidden;background:linear-gradient(90deg,rgba(15,23,42,.04) 1px,transparent 1px),linear-gradient(180deg,rgba(15,23,42,.04) 1px,transparent 1px),#f8fafc;background-size:28px 28px}
.cad-stage{position:relative;width:100%;height:100%;min-height:420px;overflow:hidden}
.cad-stage canvas{position:absolute;inset:0;display:block;width:100%!important;height:100%!important}
.cad-native-stage{position:absolute;inset:0;z-index:2;display:none;overflow:hidden}
.cad-native-stage:not(:empty),.cad-native-stage.is-active{display:block}
.cad-native-stage *{box-sizing:border-box}
.dwfv-root{height:100%;min-height:0;display:grid;grid-template-rows:auto 1fr;font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#111827}
.dwfv-toolbar{display:flex;gap:8px;align-items:center;padding:8px 12px;background:#fff;border-bottom:1px solid #e5e7eb}
.dwfv-toolbar button,.dwfv-toolbar select{font:inherit}
.dwfv-workspace{min-height:0;display:grid;grid-template-columns:minmax(220px,300px) 1fr}
.dwfv-tree{overflow:auto;border-right:1px solid #d6d8dd;background:#fff;font-size:12px;padding:8px}
.dwfv-tree[style*="display: none"]+.dwfv-stage{grid-column:1/-1}
.dwfv-tree-header{font-weight:700;margin-bottom:4px}
.dwfv-tree-stats{color:#6b7280;margin-bottom:8px}
.dwfv-tree details{margin-left:8px}
.dwfv-tree summary{cursor:pointer;padding:2px 0}
.dwfv-tree-meta{color:#6b7280;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;padding-left:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dwfv-stage{position:relative;overflow:hidden;background:#e5e7eb}
.dwfv-canvas{position:absolute;top:0;right:0;bottom:0;left:0;width:100%;height:100%}
.dwfv-webgl-canvas{pointer-events:none}
.dwfv-overlay-canvas{pointer-events:auto;touch-action:none;cursor:grab}
.dwfv-overlay-canvas:active{cursor:grabbing}
.dwfv-status{margin-left:auto;font-size:12px;color:#4b5563}
.dwfv-warn{color:#92400e}
.cad-viewer-container{position:relative;overflow:hidden;min-width:0;min-height:0}
.cad-viewer-canvas{display:block;width:100%;height:100%;cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none}
.cad-viewer-canvas.is-dragging{cursor:grabbing}
.cad-viewer-webgl-canvas{position:relative;z-index:0}
.cad-viewer-text-overlay{display:block;contain:strict;-webkit-user-select:none;user-select:none}
.cad-viewer-native-host{position:absolute;top:0;right:0;bottom:0;left:0;display:none;z-index:2;min-width:0;min-height:0;background:#05070d}
.cad-viewer-native-host.is-active{display:block}
.cad-viewer-native-host .dwfv-root{height:100%;min-height:0;color:#dbeafe;background:#05070d}
.cad-viewer-native-host .dwfv-toolbar{min-height:34px;padding:5px 8px;gap:6px;border-bottom:1px solid rgba(71,85,105,.65);background:#0f172af5;color:#e5e7eb}
.cad-viewer-native-host .dwfv-toolbar button,.cad-viewer-native-host .dwfv-toolbar select{height:24px;border:1px solid rgba(100,116,139,.75);border-radius:6px;background:#111827;color:#e5e7eb;font-size:12px}
.cad-viewer-native-host .dwfv-toolbar button{padding:0 8px;cursor:pointer}
.cad-viewer-native-host .dwfv-toolbar button:hover,.cad-viewer-native-host .dwfv-toolbar select:hover{border-color:#60a5fa;color:#bfdbfe}
.cad-viewer-native-host .dwfv-status{color:#93c5fd;font-size:12px}
.cad-viewer-native-host .dwfv-workspace{min-height:0;background:#05070d}
.cad-viewer-native-host .dwfv-stage{background:#05070d}
.cad-viewer-native-host .dwfv-tree{border-right:1px solid rgba(71,85,105,.7);background:#0f172a;color:#dbeafe}
.cad-viewer-native-host .dwfv-tree-stats,.cad-viewer-native-host .dwfv-tree-meta{color:#94a3b8}
.cad-viewer-native-host .dwfv-warn{color:#fbbf24}
.cad-native-stage .dwfv-root,.cad-native-stage .dwfv-workspace,.cad-native-stage .dwfv-stage{width:100%;min-width:0;min-height:0}
.cad-native-stage .dwfv-root{height:100%}
.cad-state{position:absolute;inset:50% auto auto 50%;max-width:min(520px,calc(100% - 48px));transform:translate(-50%,-50%);border-radius:12px;padding:14px 18px;background:rgba(255,255,255,.92);box-shadow:0 14px 38px rgba(15,23,42,.12);color:#53637a;font-size:13px;font-weight:800;text-align:center}
.cad-state[hidden]{display:none!important}
.cad-state.error{color:#b42318}
.cad-inspector strong{display:block;margin-bottom:12px;color:#1f2a3d;font-size:13px}
.cad-inspector dl{display:grid;gap:8px;margin:0}
.cad-inspector dl div{display:flex;align-items:center;justify-content:space-between;gap:12px;border-radius:8px;padding:8px 10px;background:#f8fafc}
.cad-inspector dt,.cad-inspector dd{margin:0;font-size:12px}
.cad-inspector dt{color:#7b8ca5;font-weight:700}
.cad-inspector dd{color:#20304a;font-weight:900}
.cad-warning{margin:12px 0 0;border-radius:8px;padding:10px;background:rgba(245,158,11,.13);color:#92400e;font-size:12px;line-height:1.55}
.file-viewer[data-viewer-theme='dark'] .cad-shell{background:#111827;color:#e5edf6}
.file-viewer[data-viewer-theme='dark'] .cad-toolbar,.file-viewer[data-viewer-theme='dark'] .cad-layers,.file-viewer[data-viewer-theme='dark'] .cad-inspector{background:#fff;color:#142335}
@media (prefers-color-scheme:dark){.file-viewer[data-viewer-theme='system'] .cad-shell{background:#111827;color:#e5edf6}.file-viewer[data-viewer-theme='system'] .cad-toolbar,.file-viewer[data-viewer-theme='system'] .cad-layers,.file-viewer[data-viewer-theme='system'] .cad-inspector{background:#fff;color:#142335}}
@media (max-width:860px){.cad-body,.cad-body.without-layers{grid-template-columns:minmax(0,1fr)}.cad-layers,.cad-inspector{display:none}}
`;

const createStyle = () => {
  const style = document.createElement('style');
  style.textContent = cadStyle;
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

const normalizeType = (type?: string) => {
  return (type || 'dxf').toLowerCase();
};

const collectLayers = (result: CadViewerLoadResult | null): CadLayerItem[] => {
  if (!result) {
    return [];
  }

  return Object.entries(result.document.layers)
    .map(([name, layer]) => ({ ...layer, name }))
    .sort((left, right) => left.name.localeCompare(right.name));
};

const formatNumber = (value: number | undefined) => {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return new Intl.NumberFormat('zh-CN').format(Math.round(value || 0));
};

const getCadDocumentBaseUrl = (target: HTMLElement) => {
  return target.ownerDocument?.baseURI || 'http://localhost/';
};

export default async function renderCad(
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type = 'dxf',
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> {
  const normalizedType = normalizeType(type);
  const options: FileViewerCadOptions = context?.options?.cad || {};
  let status: CadStatus = 'loading';
  let progressMessage = '正在加载 CAD 预览器...';
  let errorMessage = '';
  let loadResult: CadViewerLoadResult | null = null;
  let renderStats: RenderStats | null = null;
  let viewState: ViewChangeEvent | null = null;
  let layers: CadLayerItem[] = [];
  let viewer: CadViewerInstance | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let abortController: AbortController | null = null;
  let disposed = false;

  const style = createStyle();
  const shell = createElement('div', 'cad-shell');
  shell.dataset.viewerZoomProvider = 'cad';

  const toolbar = createElement('div', 'cad-toolbar');
  const tools = createElement('div', 'cad-tools');
  const fitButton = createElement('button', undefined, '适配') as HTMLButtonElement;
  const zoomOutButton = createElement('button', undefined, '-') as HTMLButtonElement;
  const zoomText = createElement('span', 'cad-zoom', '100%');
  const zoomInButton = createElement('button', undefined, '+') as HTMLButtonElement;
  const meta = createElement('div', 'cad-meta');
  const typeMeta = createElement('span', undefined, normalizedType.toUpperCase());
  const backendMeta = createElement('span', undefined, 'AUTO');
  [fitButton, zoomOutButton, zoomInButton].forEach(button => {
    button.type = 'button';
  });
  zoomOutButton.title = '缩小';
  zoomInButton.title = '放大';
  tools.append(fitButton, zoomOutButton, zoomText, zoomInButton);
  meta.append(typeMeta, backendMeta);
  toolbar.append(tools, meta);

  const body = createElement('div', 'cad-body without-layers');
  const layersPanel = createElement('aside', 'cad-layers');
  layersPanel.hidden = true;
  const layersHead = createElement('div', 'cad-layers-head');
  const layersCount = createElement('span', undefined, '0 项');
  layersHead.append(createElement('strong', undefined, '图层'), layersCount);
  const layersList = createElement('div', 'cad-layers-list');
  layersPanel.append(layersHead, layersList);

  const canvasWrap = createElement('div', 'cad-canvas-wrap');
  const stage = createElement('div', 'cad-stage');
  const nativeHost = createElement('div', 'cad-native-stage');
  stage.append(nativeHost);
  const state = createElement('div', 'cad-state', progressMessage);
  canvasWrap.append(stage, state);

  const inspector = createElement('aside', 'cad-inspector');
  const inspectorTitle = createElement('strong', undefined, '结构');
  const inspectorList = createElement('dl');
  const warningText = createElement('p', 'cad-warning');
  warningText.hidden = true;
  inspector.append(inspectorTitle, inspectorList, warningText);

  body.append(layersPanel, canvasWrap, inspector);
  shell.append(toolbar, body);
  target.replaceChildren(style, shell);

  const buildFileName = () => {
    return context?.filename || `drawing.${normalizedType}`;
  };

  const getWarnings = () => loadResult?.warnings || loadResult?.document.warnings || [];

  const getZoomPercent = () => {
    const zoom = viewState?.zoomPercent ?? viewer?.getZoomPercent?.() ?? 100;
    return Number.isFinite(zoom) ? Math.round(zoom) : 100;
  };

  const getCadZoomState = (): FileViewerZoomState => {
    const ready = status === 'ready' && !!viewer;
    const zoomPercent = getZoomPercent();
    return {
      scale: zoomPercent / 100,
      label: `${zoomPercent}%`,
      canZoomIn: ready,
      canZoomOut: ready,
      canReset: ready,
      minScale: 0.05,
      maxScale: 16,
    };
  };

  const cadZoomEmitter = createFileViewerZoomChangeEmitter();

  const syncInspector = () => {
    const summary = loadResult?.summary;
    const rows: Array<[string, string]> = [
      ['实体', formatNumber(summary?.entityCount)],
      ['块', formatNumber(summary?.blockCount)],
      ['页面', formatNumber(summary?.pageCount)],
      ['绘制', formatNumber(renderStats?.drawn)],
    ];
    inspectorList.replaceChildren(...rows.map(([label, value]) => {
      const row = createElement('div');
      row.append(createElement('dt', undefined, label), createElement('dd', undefined, value));
      return row;
    }));

    const warning = getWarnings()[0];
    warningText.textContent = warning || '';
    warningText.hidden = !warning;
  };

  const syncLayers = () => {
    layersCount.textContent = `${layers.length} 项`;
    layersPanel.hidden = layers.length === 0;
    body.classList.toggle('without-layers', layers.length === 0);
    layersList.replaceChildren(...layers.map(layer => {
      const button = createElement('button') as HTMLButtonElement;
      button.type = 'button';
      button.classList.toggle('muted', layer.isVisible === false || !!layer.isFrozen);
      const color = createElement('span', 'cad-layer-color');
      if (typeof layer.color === 'string') {
        color.style.background = layer.color;
      }
      button.append(color, createElement('span', undefined, layer.name));
      button.addEventListener('click', () => {
        const document = viewer?.getDocument();
        if (!document?.layers[layer.name]) {
          return;
        }

        const current = document.layers[layer.name];
        current.isVisible = current.isVisible === false;
        loadResult = viewer?.setDocument(document, buildFileName()) || null;
        layers = collectLayers(loadResult);
        syncUi();
        queueMicrotask(() => {
          viewer?.fit();
          cadZoomEmitter.emit();
        });
      });
      return button;
    }));
  };

  const syncState = () => {
    zoomText.textContent = `${getZoomPercent()}%`;
    backendMeta.textContent = (renderStats?.backend || 'auto').toUpperCase();
    state.hidden = status === 'ready';
    state.classList.toggle('error', status === 'error');
    if (status === 'loading') {
      state.textContent = progressMessage;
    } else if (status === 'error') {
      state.textContent = errorMessage;
    }
  };

  const syncUi = () => {
    syncState();
    syncLayers();
    syncInspector();
  };

  const updateProgress = (progress: CadLoadProgress) => {
    const prefix = progress.format ? `${progress.format.toUpperCase()} ` : '';
    const percent = Number.isFinite(progress.percent) ? ` ${Math.round(progress.percent || 0)}%` : '';
    progressMessage = `${prefix}${progress.message}${percent}`;
    syncState();
  };

  const fitToView = () => {
    viewer?.fit();
    cadZoomEmitter.emit();
    syncState();
  };

  const zoomIn = () => {
    viewer?.zoomIn();
    cadZoomEmitter.emit();
    syncState();
  };

  const zoomOut = () => {
    viewer?.zoomOut();
    cadZoomEmitter.emit();
    syncState();
  };

  registerFileViewerZoomProvider(shell, {
    zoomIn: () => {
      zoomIn();
      return getCadZoomState();
    },
    zoomOut: () => {
      zoomOut();
      return getCadZoomState();
    },
    resetZoom: () => {
      fitToView();
      return getCadZoomState();
    },
    getState: getCadZoomState,
    subscribe: cadZoomEmitter.subscribe,
  });

  fitButton.addEventListener('click', fitToView);
  zoomInButton.addEventListener('click', zoomIn);
  zoomOutButton.addEventListener('click', zoomOut);

  const createViewer = () => {
    const { wasmPath, workerUrl, dwfWasmUrl } = resolveFileViewerCadAssetUrls(
      options,
      getCadDocumentBaseUrl(target)
    );
    const canvasOptions = {
      background: '#f8fafc',
      foreground: '#0f172a',
      contrastMode: 'adaptive',
      minColorContrast: 2.4,
      showPageBounds: true,
      showUnsupportedMarkers: true,
      enableSpatialIndex: true,
      maxVisibleTextLabels: 2400,
      ...(options.canvasOptions || {}),
    } as CanvasViewerOptions;

    const nextViewer = new CadViewer({
      container: stage,
      nativeHost,
      renderer: options.renderer || 'auto',
      wasmPath,
      workerUrl,
      dwfWasmUrl,
      dxfEncoding: options.dxfEncoding,
      useWorker: options.useWorker ?? true,
      workerTimeoutMs: options.workerTimeoutMs ?? CAD_WORKER_TIMEOUT,
      preferDwgWasm: options.preferDwgWasm ?? true,
      includePaperSpace: options.includePaperSpace ?? true,
      maxInsertDepth: options.maxInsertDepth,
      keepRaw: options.keepRaw ?? false,
      dwfPreferWebgl: options.dwfPreferWebgl ?? true,
      dwfPreferWasm: options.dwfPreferWasm ?? true,
      dwfBackground: options.dwfBackground || '#f8fafc',
      dwfMaxDevicePixelRatio: options.dwfMaxDevicePixelRatio,
      dwfMaxCanvasPixels: options.dwfMaxCanvasPixels,
      dwfMaxGpuCacheBytes: options.dwfMaxGpuCacheBytes,
      dwfMaxCachedScenes: options.dwfMaxCachedScenes,
      dwfLineWeightMode: options.dwfLineWeightMode,
      dwfMinStrokeCssPx: options.dwfMinStrokeCssPx,
      dwfMaxOverviewStrokeCssPx: options.dwfMaxOverviewStrokeCssPx,
      dwfMinTextCssPx: options.dwfMinTextCssPx,
      dwfMinFilledAreaCssPx: options.dwfMinFilledAreaCssPx,
      autoFit: true,
      canvasOptions,
      onLoadProgress: updateProgress,
      onRenderStats: stats => {
        renderStats = stats;
        syncState();
        syncInspector();
      },
      onViewChange: event => {
        viewState = event;
        cadZoomEmitter.emit();
        syncState();
      },
      onLoad: result => {
        loadResult = result;
        layers = collectLayers(result);
        syncUi();
      },
      onError: error => {
        errorMessage = error.message || 'CAD 文件解析失败';
        syncState();
      },
    });

    if (options.preloadDwg !== false && normalizedType === 'dwg') {
      void nextViewer.preloadDwg({ wasmPath, workerUrl }).catch(() => {
        // 预热失败不阻断真实加载，loadBuffer 会返回完整错误上下文。
      });
    }

    return nextViewer;
  };

  const loadCad = async () => {
    status = 'loading';
    progressMessage = '正在解析 CAD...';
    errorMessage = '';
    loadResult = null;
    renderStats = null;
    viewState = null;
    layers = [];
    syncUi();

    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;

    try {
      viewer?.destroy();
      viewer = createViewer();
      const cadAssets = resolveFileViewerCadAssetUrls(options, getCadDocumentBaseUrl(target));
      const result = await viewer.loadBuffer(buffer.slice(0), buildFileName(), {
        signal: controller.signal,
        transferInputBuffer: false,
        dxfEncoding: options.dxfEncoding,
        wasmPath: cadAssets.wasmPath,
        workerUrl: cadAssets.workerUrl,
        dwfWasmUrl: cadAssets.dwfWasmUrl,
      });
      if (disposed || controller.signal.aborted) {
        return;
      }
      loadResult = result;
      layers = collectLayers(result);
      status = 'ready';
      syncUi();
      queueMicrotask(() => {
        viewer?.fit();
        cadZoomEmitter.emit();
        syncState();
      });
    } catch (reason) {
      if (disposed || controller.signal.aborted) {
        return;
      }
      console.error(reason);
      status = 'error';
      errorMessage = reason instanceof Error ? reason.message : 'CAD 文件解析失败';
      syncUi();
    }
  };

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      viewer?.resize();
    });
    resizeObserver.observe(stage);
  }

  syncUi();
  void loadCad();

  return {
    $el: shell,
    unmount() {
      disposed = true;
      unregisterFileViewerZoomProvider(shell);
      abortController?.abort();
      abortController = null;
      resizeObserver?.disconnect();
      resizeObserver = null;
      viewer?.destroy();
      viewer = null;
      target.replaceChildren();
    },
  };
}
