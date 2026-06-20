import {
  registerFileViewerZoomProvider,
  unregisterFileViewerZoomProvider,
} from '../features/document/dom';
import { createFileViewerZoomChangeEmitter } from '../features/document/zoom';
import type {
  FileRenderContext,
  FileViewerRenderedInstance,
  FileViewerZoomState,
} from '../contracts/types';

type OfdModule = typeof import('../../vendor/ofd/dltech/ofd/ofd.js');
type OfdRenderState = 'loading' | 'ready' | 'error';

const OFD_MIN_SCALE = 0.35;
const OFD_MAX_SCALE = 3;
const OFD_ZOOM_STEP = 0.1;

const ofdStyle = `
.ofd-viewer{position:relative;box-sizing:border-box;min-height:100%;background:#e9edf2;color:#172033;font-family:Aptos,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif}
.ofd-viewer *{box-sizing:border-box}
.ofd-stage{min-height:100%;padding:18px 0 28px;overflow:auto;scrollbar-gutter:stable}
.ofd-state{position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;background:rgba(246,248,250,.92);color:#64748b;font-size:14px}
.ofd-state.error{color:#b42318}
.ofd-page-frame{position:relative;display:block;margin:0 auto 20px;overflow:visible}
.ofd-page{display:block;margin-left:auto!important;margin-right:auto!important;box-shadow:0 10px 26px rgba(15,23,42,.12);transition:transform .16s ease}
.file-viewer[data-viewer-theme='dark'] .ofd-viewer{background:#172033;color:#e5eef8}
.file-viewer[data-viewer-theme='dark'] .ofd-state{background:rgba(15,23,42,.9);color:#cbd5e1}
@media (prefers-color-scheme:dark){.file-viewer[data-viewer-theme='system'] .ofd-viewer{background:#172033;color:#e5eef8}.file-viewer[data-viewer-theme='system'] .ofd-state{background:rgba(15,23,42,.9);color:#cbd5e1}}
@media print{.ofd-viewer{background:#fff!important}.ofd-stage{padding:0!important;overflow:visible!important}.ofd-page-frame{break-after:page;page-break-after:always;margin:0 auto!important}.ofd-page-frame:last-child{break-after:auto;page-break-after:auto}.ofd-page{box-shadow:none!important;transition:none!important}}
`;

const loadOfdModule = (() => {
  let modulePromise: Promise<OfdModule> | null = null;
  return () => {
    modulePromise ||= import('../../vendor/ofd/dltech/ofd/ofd.js');
    return modulePromise;
  };
})();

const createStyle = (documentRef: Document) => {
  const style = documentRef.createElement('style');
  style.textContent = ofdStyle;
  return style;
};

const createElement = <K extends keyof HTMLElementTagNameMap>(
  documentRef: Document,
  tagName: K,
  className?: string,
  text?: string
) => {
  const element = documentRef.createElement(tagName);
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
    return String(reason || 'OFD 文件解析失败');
  }
};

const clampZoom = (value: number) => Math.min(
  OFD_MAX_SCALE,
  Math.max(OFD_MIN_SCALE, Number(value.toFixed(2)))
);

const waitForPaint = (view?: Window | null) => new Promise<void>(resolve => {
  if (view?.requestAnimationFrame) {
    view.requestAnimationFrame(() => resolve());
    return;
  }
  globalThis.setTimeout(resolve, 0);
});

const parseWithOfdJs = (ofd: OfdModule, buffer: ArrayBuffer) => {
  return new Promise<unknown[]>((resolve, reject) => {
    // 使用 DLTech21/ofd.js 的纯 JS 解析入口，签章验签链路不阻断正文预览。
    ofd.parseOfdDocument({
      ofd: buffer,
      success: documents => resolve(documents),
      fail: reason => reject(reason),
    });
  });
};

const appendPages = (
  documentRef: Document,
  target: HTMLDivElement,
  pages: HTMLElement[]
) => {
  const fragment = documentRef.createDocumentFragment();

  pages.forEach(page => {
    const frame = documentRef.createElement('div');
    frame.className = 'ofd-page-frame';
    page.classList.add('ofd-page');
    frame.appendChild(page);
    fragment.appendChild(frame);
  });

  target.appendChild(fragment);
};

export default async function renderOfd(
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> {
  const documentRef = target.ownerDocument || document;
  const targetWindow = documentRef.defaultView || (typeof window !== 'undefined' ? window : null);
  const zoomEmitter = createFileViewerZoomChangeEmitter();
  let disposed = false;
  let renderVersion = 0;
  let resizeObserver: ResizeObserver | null = null;
  let resizeTimer = 0;
  let lastRenderedWidth = 0;
  let state: OfdRenderState = 'loading';
  let errorMessage = '';
  let zoom = 1;
  let ofdDocumentPromise: Promise<unknown> | null = null;

  const style = createStyle(documentRef);
  const viewer = createElement(documentRef, 'div', 'ofd-viewer');
  viewer.dataset.viewerZoomProvider = 'ofd';
  const stateNode = createElement(documentRef, 'div', 'ofd-state', '正在解析 OFD...');
  stateNode.setAttribute('aria-live', 'polite');
  const stage = createElement(documentRef, 'div', 'ofd-stage');
  viewer.append(stateNode, stage);
  target.replaceChildren(style, viewer);

  const clearStage = () => {
    stage.replaceChildren();
  };

  const syncState = () => {
    stateNode.hidden = state === 'ready';
    stateNode.classList.toggle('error', state === 'error');
    stateNode.textContent = state === 'error' ? errorMessage : '正在解析 OFD...';
  };

  const getOfdDocument = async (ofd: OfdModule) => {
    // OFD 解压和 XML 解析成本较高，尺寸变化只重排页面，不重复解析压缩包。
    ofdDocumentPromise ||= parseWithOfdJs(ofd, buffer).then(documents => {
      const ofdDocument = documents[0];
      if (!ofdDocument) {
        throw new Error('OFD 文件中没有可渲染的文档');
      }
      return ofdDocument;
    });
    return ofdDocumentPromise;
  };

  const getRenderWidth = () => {
    const baseWidth = viewer.getBoundingClientRect().width || stage.getBoundingClientRect().width || 0;
    return Math.max(Math.floor(baseWidth - 48), 240);
  };

  const getZoomState = (): FileViewerZoomState => ({
    scale: zoom,
    label: `${Math.round(zoom * 100)}%`,
    canZoomIn: zoom < OFD_MAX_SCALE,
    canZoomOut: zoom > OFD_MIN_SCALE,
    canReset: zoom !== 1,
    minScale: OFD_MIN_SCALE,
    maxScale: OFD_MAX_SCALE,
  });

  const syncPageZoom = () => {
    const HTMLElementCtor = targetWindow?.HTMLElement || globalThis.HTMLElement;
    stage.querySelectorAll<HTMLElement>('.ofd-page-frame').forEach(frame => {
      const page = frame.firstElementChild;
      if (!HTMLElementCtor || !(page instanceof HTMLElementCtor)) {
        return;
      }

      page.style.position = 'absolute';
      page.style.top = '0';
      page.style.left = '50%';
      page.style.transform = `translateX(-50%) scale(${zoom})`;
      page.style.transformOrigin = 'top center';
      page.style.marginLeft = '0';
      page.style.marginRight = '0';

      const pageWidth = page.offsetWidth;
      const pageHeight = page.offsetHeight;
      if (!pageWidth || !pageHeight) {
        return;
      }

      frame.style.width = `${Math.ceil(pageWidth * zoom)}px`;
      frame.style.height = `${Math.ceil(pageHeight * zoom)}px`;
    });
  };

  const setZoom = (nextZoom: number) => {
    zoom = clampZoom(nextZoom);
    syncPageZoom();
    zoomEmitter.emit();
    return getZoomState();
  };

  registerFileViewerZoomProvider(viewer, {
    zoomIn: () => setZoom(zoom + OFD_ZOOM_STEP),
    zoomOut: () => setZoom(zoom - OFD_ZOOM_STEP),
    resetZoom: () => setZoom(1),
    setZoom,
    getState: getZoomState,
    subscribe: zoomEmitter.subscribe,
  });

  const renderWithOfdJs = async (width: number) => {
    const ofd = await loadOfdModule();
    const ofdDocument = await getOfdDocument(ofd);
    if (disposed) {
      return [];
    }
    return Promise.resolve(ofd.renderOfd(width, ofdDocument));
  };

  const render = async (options: { force?: boolean; showLoading?: boolean } = {}) => {
    if (disposed) {
      return;
    }

    const width = getRenderWidth();
    if (!options.force && state === 'ready' && Math.abs(width - lastRenderedWidth) < 8) {
      return;
    }

    const version = ++renderVersion;
    if (options.showLoading || state !== 'ready') {
      state = 'loading';
      clearStage();
      syncState();
    }
    errorMessage = '';

    try {
      await waitForPaint(targetWindow);
      const pages = await renderWithOfdJs(width);
      if (disposed || version !== renderVersion) {
        return;
      }

      clearStage();
      appendPages(documentRef, stage, pages);
      lastRenderedWidth = width;
      await waitForPaint(targetWindow);
      syncPageZoom();
      state = 'ready';
      syncState();
      zoomEmitter.emit();
      context?.onProgressiveRender?.();
    } catch (reason) {
      if (disposed || version !== renderVersion) {
        return;
      }
      console.error(reason);
      state = 'error';
      errorMessage = normalizeError(reason) || 'OFD 文件解析失败';
      syncState();
    }
  };

  const startResizeObserver = () => {
    if (!targetWindow?.ResizeObserver || resizeObserver) {
      return;
    }

    resizeObserver = new targetWindow.ResizeObserver(() => {
      targetWindow.clearTimeout(resizeTimer);
      resizeTimer = targetWindow.setTimeout(() => {
        void render({ showLoading: false });
      }, 180);
    });
    resizeObserver.observe(viewer);
  };

  void render({ force: true, showLoading: true }).finally(() => {
    if (!disposed) {
      startResizeObserver();
    }
  });

  return {
    $el: viewer,
    unmount() {
      disposed = true;
      renderVersion += 1;
      targetWindow?.clearTimeout(resizeTimer);
      resizeObserver?.disconnect();
      resizeObserver = null;
      unregisterFileViewerZoomProvider(viewer);
      clearStage();
      context?.registerExportAdapter?.(null);
    },
  };
}
