import { PptxViewer, RECOMMENDED_ZIP_LIMITS } from '@file-viewer/pptx';
import {
  registerFileViewerZoomProvider,
  unregisterFileViewerZoomProvider,
} from '../features/document/dom';
import { createFileViewerZoomChangeEmitter } from '../features/document/zoom';
import { waitForFileViewerNextPaint } from '../output/export';
import type {
  FileRenderContext,
  FileRenderExportAdapter,
  FileViewerRenderedInstance,
  FileViewerZoomState,
} from '../contracts/types';

type PptxRenderState = 'loading' | 'ready' | 'error';

const pptxStyle = `
.pptx-viewer-shell{position:relative;box-sizing:border-box;min-height:100%;padding:24px 20px;background:#eef3f8;color:#1f2d3b;font-family:Aptos,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif}
.pptx-render-surface{min-height:240px}
.pptx-render-surface.is-loading{opacity:.72}
.pptx-loading{position:sticky;top:12px;z-index:3;box-sizing:border-box;display:inline-flex;align-items:center;gap:10px;margin:0 0 16px 50%;padding:10px 14px;border:1px solid rgba(42,94,144,.14);border-radius:999px;background:rgba(255,255,255,.92);color:#41556b;box-shadow:0 12px 32px rgba(24,44,64,.12);transform:translateX(-50%)}
.pptx-loading[hidden],.pptx-error[hidden]{display:none!important}
.pptx-loading-dot{width:9px;height:9px;border-radius:999px;background:#1f9d67;box-shadow:0 0 0 6px rgba(31,157,103,.13)}
.pptx-error{box-sizing:border-box;width:min(680px,calc(100% - 32px));margin:48px auto;padding:24px;border:1px solid rgba(28,43,58,.12);border-radius:14px;background:#fff;color:#1f2d3b;box-shadow:0 16px 42px rgba(25,42,54,.08)}
.pptx-error strong{display:block;margin-bottom:10px;font-size:18px}
.pptx-error p{margin:0;color:#607282;line-height:1.7}
`;

const pptxPrintStyle = `
  .pptx-viewer-shell {
    background: #fff !important;
    padding: 0 !important;
  }
  .pptx-render-surface {
    display: block !important;
    overflow: visible !important;
  }
  .pptx-render-surface [data-slide-index] {
    break-after: page;
    page-break-after: always;
    margin: 0 auto !important;
  }
  .pptx-render-surface [data-slide-index]:last-child {
    break-after: auto;
    page-break-after: auto;
  }
`;

const createStyle = (documentRef: Document) => {
  const style = documentRef.createElement('style');
  style.textContent = pptxStyle;
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

const clampZoomPercent = (value: number) => {
  return Math.min(300, Math.max(25, Math.round(value)));
};

const formatErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || 'PPTX 解析失败');
};

const buildExportAdapter = (targetWindow?: Window | null): FileRenderExportAdapter => ({
  print: true,
  exportHtml: true,
  includeDocumentStyles: true,
  beforeSnapshot: () => waitForFileViewerNextPaint(targetWindow || undefined),
  printStyle: pptxPrintStyle,
});

export default async function renderPptx(
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  _type?: string,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> {
  const documentRef = target.ownerDocument || document;
  const targetWindow = documentRef.defaultView || (typeof window !== 'undefined' ? window : null);
  const zoomEmitter = createFileViewerZoomChangeEmitter();
  let viewer: PptxViewer | null = null;
  let state: PptxRenderState = 'loading';
  let errorMessage = '';
  let zoomPercent = 100;
  let progressiveReady = false;
  let disposed = false;

  const style = createStyle(documentRef);
  const shell = createElement(documentRef, 'div', 'pptx-viewer-shell');
  shell.dataset.viewerZoomProvider = 'pptx';

  const loading = createElement(documentRef, 'div', 'pptx-loading');
  loading.setAttribute('aria-live', 'polite');
  loading.append(
    createElement(documentRef, 'span', 'pptx-loading-dot'),
    createElement(documentRef, 'span', undefined, '正在解析 PPTX...')
  );

  const error = createElement(documentRef, 'div', 'pptx-error');
  const errorTitle = createElement(documentRef, 'strong', undefined, 'PPTX 预览失败');
  const errorText = createElement(documentRef, 'p');
  error.append(errorTitle, errorText);

  const surface = createElement(documentRef, 'div', 'pptx-render-surface');
  shell.append(loading, error, surface);
  target.replaceChildren(style, shell);

  const getCurrentZoomPercent = () => clampZoomPercent(viewer?.zoomPercent ?? zoomPercent);

  const getZoomState = (): FileViewerZoomState => {
    const percent = getCurrentZoomPercent();
    return {
      scale: percent / 100,
      label: `${percent}%`,
      canZoomIn: percent < 300,
      canZoomOut: percent > 25,
      canReset: percent !== 100,
      minScale: 0.25,
      maxScale: 3,
    };
  };

  const setZoom = async (percent: number) => {
    const nextPercent = clampZoomPercent(percent);
    zoomPercent = nextPercent;
    if (viewer) {
      await viewer.setZoom(nextPercent);
      zoomPercent = getCurrentZoomPercent();
    }
    zoomEmitter.emit();
    return getZoomState();
  };

  const notifyProgressiveReady = () => {
    if (progressiveReady) {
      return;
    }
    progressiveReady = true;
    context?.onProgressiveRender?.();
  };

  const syncUi = () => {
    loading.hidden = !(state === 'loading' && !errorMessage);
    error.hidden = state !== 'error';
    errorText.textContent = errorMessage;
    surface.classList.toggle('is-loading', state === 'loading');
  };

  const registerExportAdapter = () => {
    context?.registerExportAdapter?.(buildExportAdapter(targetWindow));
  };

  registerFileViewerZoomProvider(shell, {
    zoomIn: () => setZoom(getCurrentZoomPercent() + 15),
    zoomOut: () => setZoom(getCurrentZoomPercent() - 15),
    resetZoom: () => setZoom(100),
    setZoom: scale => setZoom(scale * 100),
    getState: getZoomState,
    subscribe: zoomEmitter.subscribe,
  });

  const openPresentation = async () => {
    state = 'loading';
    errorMessage = '';
    progressiveReady = false;
    syncUi();

    try {
      const nextViewer = await PptxViewer.open(buffer, surface, {
        fitMode: 'contain',
        zoomPercent,
        zipLimits: RECOMMENDED_ZIP_LIMITS,
        lazySlides: true,
        lazyMedia: true,
        listOptions: {
          windowed: true,
          initialSlides: 3,
          batchSize: 4,
          overscanViewport: 1.5,
        },
        onSlideRendered: () => notifyProgressiveReady(),
        onRenderComplete: () => {
          if (disposed) {
            return;
          }
          state = 'ready';
          notifyProgressiveReady();
          zoomPercent = getCurrentZoomPercent();
          syncUi();
          zoomEmitter.emit();
        },
        onSlideError: (_index, error) => {
          console.warn('PPTX slide render warning:', error);
        },
        onError: error => {
          if (disposed) {
            return;
          }
          state = 'error';
          errorMessage = formatErrorMessage(error);
          context?.registerExportAdapter?.(null);
          syncUi();
        },
      });

      if (disposed) {
        nextViewer.destroy();
        return;
      }

      viewer = nextViewer;
      state = 'ready';
      notifyProgressiveReady();
      zoomPercent = getCurrentZoomPercent();
      registerExportAdapter();
      syncUi();
      zoomEmitter.emit();
    } catch (error) {
      if (disposed) {
        return;
      }
      state = 'error';
      errorMessage = formatErrorMessage(error);
      context?.registerExportAdapter?.(null);
      syncUi();
    }
  };

  void openPresentation();

  return {
    $el: shell,
    unmount() {
      disposed = true;
      context?.registerExportAdapter?.(null);
      unregisterFileViewerZoomProvider(shell);
      viewer?.destroy();
      viewer = null;
      target.replaceChildren();
    },
  };
}
