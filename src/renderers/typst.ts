import { $typst } from '@myriaddreamin/typst.ts';
import {
  resolveFileViewerTypstCompilerWasmUrl,
  resolveFileViewerTypstRendererWasmUrl,
} from '../platform/assets';
import {
  registerFileViewerZoomProvider,
  unregisterFileViewerZoomProvider,
} from '../features/document/dom';
import { createFileViewerZoomChangeEmitter } from '../features/document/zoom';
import { formatCssPixels, type PrintPageSize } from '../output/printLayout';
import { readFileViewerText } from '../source';
import type {
  FileRenderContext,
  FileRenderExportAdapter,
  FileViewerRenderedInstance,
  FileViewerZoomState,
} from '../contracts/types';

declare global {
  interface Window {
    __FLYFISH_TYPST_COMPILER_WASM_URL__?: string;
    __FLYFISH_TYPST_RENDERER_WASM_URL__?: string;
  }
}

type TypstRenderState = 'loading' | 'ready' | 'error';

interface TypstEngineAssetCandidate {
  compilerWasmUrl: string;
  rendererWasmUrl: string;
  source: 'configured' | 'local';
  preflight: boolean;
}

interface TypstRenderedPage extends PrintPageSize {
  index: number;
  svg: string;
}

const typstStyle = `
.typst-viewer{min-height:100%;overflow:auto;background:#eef1f4;color:#172033}
.typst-toolbar{position:sticky;top:0;z-index:2;display:flex;min-height:52px;align-items:center;justify-content:space-between;gap:16px;padding:10px 18px;border-bottom:1px solid rgba(120,134,155,.18);background:rgba(248,250,252,.92);backdrop-filter:blur(16px)}
.typst-toolbar div{min-width:0}
.typst-toolbar strong,.typst-toolbar span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.typst-toolbar strong{color:#172033;font-size:14px;font-weight:800}
.typst-toolbar span,.typst-toolbar em{color:#6a778b;font-size:12px;font-style:normal;font-weight:700}
.typst-pages{display:flex;min-height:calc(100% - 52px);flex-direction:column;align-items:center;gap:22px;box-sizing:border-box;padding:28px 16px 44px}
.typst-page-shell{max-width:100%;overflow:hidden;border:1px solid rgba(20,35,53,.1);background:#fff;box-shadow:0 18px 44px rgba(15,23,42,.14)}
.typst-page-content svg{display:block;width:100%;height:auto}
.typst-loading,.typst-error{width:min(520px,calc(100% - 32px));box-sizing:border-box;margin:80px auto;padding:26px;border:1px solid rgba(120,134,155,.18);border-radius:14px;background:#fff;box-shadow:0 18px 44px rgba(15,23,42,.12)}
.typst-loading{display:grid;justify-items:center;gap:10px;text-align:center}
.typst-loading span{width:34px;height:34px;border:3px solid rgba(46,130,94,.18);border-top-color:#239661;border-radius:999px;animation:typst-spin .8s linear infinite}
.typst-loading strong,.typst-error strong{color:#172033;font-size:16px}
.typst-loading p{margin:0;color:#6a778b;font-size:13px}
.typst-error{color:#9f1d1d}
.typst-error pre{max-height:360px;margin:14px 0 0;overflow:auto;border-radius:10px;background:#fff1f2;color:#9f1d1d;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace;font-size:12px;line-height:1.7;padding:14px;white-space:pre-wrap}
.file-viewer[data-viewer-theme='dark'] .typst-viewer{background:#101820;color:#e6edf3}
.file-viewer[data-viewer-theme='dark'] .typst-toolbar{border-bottom-color:rgba(139,148,158,.22);background:rgba(15,23,42,.9)}
.file-viewer[data-viewer-theme='dark'] .typst-toolbar strong{color:#f8fafc}
.file-viewer[data-viewer-theme='dark'] .typst-toolbar span,.file-viewer[data-viewer-theme='dark'] .typst-toolbar em{color:#9aa7b8}
.file-viewer[data-viewer-theme='dark'] .typst-page-shell{border-color:rgba(139,148,158,.26);box-shadow:0 24px 56px rgba(0,0,0,.38)}
.file-viewer[data-viewer-theme='dark'] .typst-loading,.file-viewer[data-viewer-theme='dark'] .typst-error{border-color:rgba(139,148,158,.22);background:#151b23;box-shadow:0 24px 56px rgba(0,0,0,.32)}
.file-viewer[data-viewer-theme='dark'] .typst-loading strong,.file-viewer[data-viewer-theme='dark'] .typst-error strong{color:#f8fafc}
@keyframes typst-spin{to{transform:rotate(360deg)}}
@media (max-width:767px){.typst-toolbar{align-items:flex-start;flex-direction:column;gap:4px}.typst-pages{gap:16px;padding:16px 10px 28px}}
@media (prefers-color-scheme:dark){.file-viewer[data-viewer-theme='system'] .typst-viewer{background:#101820;color:#e6edf3}.file-viewer[data-viewer-theme='system'] .typst-toolbar{border-bottom-color:rgba(139,148,158,.22);background:rgba(15,23,42,.9)}.file-viewer[data-viewer-theme='system'] .typst-toolbar strong{color:#f8fafc}.file-viewer[data-viewer-theme='system'] .typst-toolbar span,.file-viewer[data-viewer-theme='system'] .typst-toolbar em{color:#9aa7b8}.file-viewer[data-viewer-theme='system'] .typst-page-shell{border-color:rgba(139,148,158,.26);box-shadow:0 24px 56px rgba(0,0,0,.38)}.file-viewer[data-viewer-theme='system'] .typst-loading,.file-viewer[data-viewer-theme='system'] .typst-error{border-color:rgba(139,148,158,.22);background:#151b23;box-shadow:0 24px 56px rgba(0,0,0,.32)}.file-viewer[data-viewer-theme='system'] .typst-loading strong,.file-viewer[data-viewer-theme='system'] .typst-error strong{color:#f8fafc}}
`;

let typstEngineConfigKey = '';
const DEFAULT_TYPST_RENDER_TIMEOUT_MS = 60000;

class TypstRenderTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Typst 编译超过 ${Math.round(timeoutMs / 1000)} 秒`);
    this.name = 'TypstRenderTimeoutError';
  }
}

const createStyle = (documentRef: Document) => {
  const style = documentRef.createElement('style');
  style.textContent = typstStyle;
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

const getWindowOverride = (key: '__FLYFISH_TYPST_COMPILER_WASM_URL__' | '__FLYFISH_TYPST_RENDERER_WASM_URL__') => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window[key];
};

const configureTypstEngine = (compilerWasmUrl: string, rendererWasmUrl: string) => {
  const configKey = `${compilerWasmUrl}\n${rendererWasmUrl}`;

  if (typstEngineConfigKey === configKey) {
    return;
  }

  $typst.setCompilerInitOptions({
    getModule: () => compilerWasmUrl,
  });
  $typst.setRendererInitOptions({
    getModule: () => rendererWasmUrl,
  });
  typstEngineConfigKey = configKey;
};

const pushUniqueTypstCandidate = (
  candidates: TypstEngineAssetCandidate[],
  candidate: TypstEngineAssetCandidate
) => {
  if (candidates.some(item => item.compilerWasmUrl === candidate.compilerWasmUrl &&
    item.rendererWasmUrl === candidate.rendererWasmUrl)) {
    return;
  }
  candidates.push(candidate);
};

const resolveTypstEngineCandidates = (
  context?: FileRenderContext,
  documentBaseUrl?: string
): TypstEngineAssetCandidate[] => {
  const typstOptions = context?.options?.typst;
  const compilerOverride = getWindowOverride('__FLYFISH_TYPST_COMPILER_WASM_URL__');
  const rendererOverride = getWindowOverride('__FLYFISH_TYPST_RENDERER_WASM_URL__');
  const compilerWasmUrl = resolveFileViewerTypstCompilerWasmUrl(typstOptions, [
    compilerOverride,
  ], documentBaseUrl);
  const rendererWasmUrl = resolveFileViewerTypstRendererWasmUrl(typstOptions, [
    rendererOverride,
  ], documentBaseUrl);
  const hasConfiguredAsset = Boolean(
    typstOptions?.compilerWasmUrl ||
    typstOptions?.rendererWasmUrl ||
    compilerOverride ||
    rendererOverride
  );
  const candidates: TypstEngineAssetCandidate[] = [];

  pushUniqueTypstCandidate(candidates, {
    compilerWasmUrl,
    rendererWasmUrl,
    source: hasConfiguredAsset ? 'configured' : 'local',
    preflight: !hasConfiguredAsset,
  });

  return candidates;
};

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url);

const isKnownMissingWasmUrl = async (url: string) => {
  if (typeof fetch !== 'function' || !isHttpUrl(url)) {
    return false;
  }

  try {
    const response = await fetch(url, {
      cache: 'force-cache',
      method: 'HEAD',
    });
    return response.status === 404 || response.status === 410;
  } catch {
    return false;
  }
};

const resolveKnownMissingTypstAsset = async (candidate: TypstEngineAssetCandidate) => {
  if (await isKnownMissingWasmUrl(candidate.compilerWasmUrl)) {
    return `Typst compiler WASM missing: ${candidate.compilerWasmUrl}`;
  }
  if (await isKnownMissingWasmUrl(candidate.rendererWasmUrl)) {
    return `Typst renderer WASM missing: ${candidate.rendererWasmUrl}`;
  }
  return '';
};

const isTypstAssetLoadError = (error: unknown) => {
  if (Array.isArray(error)) {
    return false;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /wasm|webassembly|fetch|module|instantiate|compile|network|404|410/i.test(message);
};

const escapeAttribute = (value: string) => {
  return value.replace(/[&<>"']/g, char => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[char] || char;
  });
};

const readNumberAttribute = (element: Element, name: string) => {
  const value = Number.parseFloat(element.getAttribute(name) || '');
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const removeUnsafeSvgContent = (root: Document | Element) => {
  root.querySelectorAll('script').forEach(script => script.remove());
  root.querySelectorAll('*').forEach(element => {
    Array.from(element.attributes).forEach(attribute => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on') || value.startsWith('javascript:')) {
        element.removeAttribute(attribute.name);
      }
    });
  });
};

const serializeNode = (node: Node) => {
  return new XMLSerializer().serializeToString(node);
};

const parseTypstSvgPages = (svgText: string): TypstRenderedPage[] => {
  const parser = new DOMParser();
  const documentSvg = parser.parseFromString(svgText, 'image/svg+xml');
  const parseError = documentSvg.querySelector('parsererror');
  if (parseError) {
    throw new Error(parseError.textContent || 'Typst SVG 解析失败');
  }

  removeUnsafeSvgContent(documentSvg);
  const root = documentSvg.documentElement;
  const sharedNodes = Array.from(root.children)
    .filter(child => ['style', 'defs'].includes(child.tagName.toLowerCase()))
    .map(serializeNode)
    .join('');
  const pageGroups = Array.from(root.querySelectorAll('g.typst-page'));
  const fallbackWidth = readNumberAttribute(root, 'data-width') ||
    readNumberAttribute(root, 'width') ||
    596;
  const fallbackHeight = readNumberAttribute(root, 'data-height') ||
    readNumberAttribute(root, 'height') ||
    842;

  if (!pageGroups.length) {
    return [{
      index: 1,
      width: fallbackWidth,
      height: fallbackHeight,
      svg: svgText,
    }];
  }

  return pageGroups.map((group, index) => {
    const pageWidth = readNumberAttribute(group, 'data-page-width') || fallbackWidth;
    const pageHeight = readNumberAttribute(group, 'data-page-height') || fallbackHeight;
    const pageClone = group.cloneNode(true) as Element;
    pageClone.setAttribute('transform', 'translate(0, 0)');
    const pageSvg = [
      `<svg style="overflow:visible;" class="typst-doc" viewBox="0 0 ${pageWidth} ${pageHeight}" width="${pageWidth}" height="${pageHeight}" data-width="${pageWidth}" data-height="${pageHeight}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:h5="http://www.w3.org/1999/xhtml">`,
      sharedNodes,
      serializeNode(pageClone),
      '</svg>',
    ].join('');

    return {
      index: index + 1,
      width: pageWidth,
      height: pageHeight,
      svg: pageSvg,
    };
  });
};

const formatTypstError = (error: unknown) => {
  if (Array.isArray(error)) {
    return error.map(item => {
      if (item && typeof item === 'object' && 'message' in item) {
        const severity = 'severity' in item ? String(item.severity) : 'Error';
        return `${severity}: ${String(item.message)}`;
      }
      return String(item);
    }).join('\n');
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const formatTypstRuntimeError = (error: unknown) => {
  const message = formatTypstError(error);

  if (error instanceof TypstRenderTimeoutError) {
    return [
      message,
      '请检查 Typst 源文件复杂度，或通过 options.typst.renderTimeoutMs 调大浏览器端编译超时。'
    ].join('\n\n');
  }

  if (isTypstAssetLoadError(error)) {
    return [
      message,
      'Typst 需要本地 compiler / renderer WASM。请运行 file-viewer-copy-assets，或配置 options.typst.compilerWasmUrl / options.typst.rendererWasmUrl，并确认服务器以 application/wasm 返回资源。'
    ].join('\n\n');
  }

  return message;
};

const clampZoom = (value: number) => {
  return Math.min(3, Math.max(0.3, Number(value.toFixed(2))));
};

const normalizeRenderTimeoutMs = (timeoutMs?: number) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs === undefined) {
    return DEFAULT_TYPST_RENDER_TIMEOUT_MS;
  }
  return Math.max(0, timeoutMs);
};

const withRenderTimeout = async <T>(promise: Promise<T>, timeoutMs: number) => {
  if (timeoutMs <= 0) {
    return promise;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new TypstRenderTimeoutError(timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const buildExportStyles = () => `
  <style>
    .typst-export-document {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
      margin: 0;
      padding: 24px;
      background: #eef1f4;
    }
    .typst-export-page {
      box-sizing: border-box;
      flex: 0 0 auto;
      overflow: hidden;
      background: #ffffff;
      box-shadow: 0 18px 42px rgba(15, 23, 42, 0.14);
    }
    .typst-export-page svg {
      display: block;
      width: 100%;
      height: auto;
    }
  </style>
`;

const buildExportHtml = (pages: TypstRenderedPage[], filename?: string) => {
  return `${buildExportStyles()}<main class="typst-export-document" aria-label="${escapeAttribute(filename || 'Typst document')}">${pages.map(page => {
    const width = formatCssPixels(page.width);
    const height = formatCssPixels(page.height);
    return `<section class="typst-export-page viewer-print-page" style="--viewer-print-page-width:${width};--viewer-print-page-height:${height};width:${width};height:${height};" aria-label="Page ${page.index}">${page.svg}</section>`;
  }).join('')}</main>`;
};

const buildPrintStyle = (pages: TypstRenderedPage[]) => {
  const firstPage = pages[0];
  const width = firstPage ? formatCssPixels(firstPage.width) : '596px';
  const height = firstPage ? formatCssPixels(firstPage.height) : '842px';

  return `
    @page { size: ${width} ${height}; margin: 0; }
    @media print {
      html,
      body {
        width: ${width};
        min-width: ${width};
        margin: 0 !important;
        background: #ffffff !important;
      }
      .typst-export-document {
        display: block !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
      }
      .typst-export-page {
        display: block !important;
        margin: 0 !important;
        border: 0 !important;
        box-shadow: none !important;
        break-after: page;
        page-break-after: always;
      }
      .typst-export-page:last-child {
        break-after: auto;
        page-break-after: auto;
      }
      .typst-export-page svg {
        width: 100% !important;
        height: auto !important;
      }
    }
  `;
};

const buildExportAdapter = (
  pages: TypstRenderedPage[],
  filename?: string
): FileRenderExportAdapter | null => {
  if (!pages.length) {
    return null;
  }

  return {
    includeDocumentStyles: false,
    print: true,
    exportHtml: true,
    printStyle: () => buildPrintStyle(pages),
    toHtml: () => buildExportHtml(pages, filename),
  };
};

const getPageSummary = (pages: TypstRenderedPage[]) => {
  if (!pages.length) {
    return '0 pages';
  }
  const firstPage = pages[0];
  return `${pages.length} pages / ${Math.round(firstPage.width)} x ${Math.round(firstPage.height)} pt`;
};

export default async function renderTypst(
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  _type?: string,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> {
  const source = await readFileViewerText(buffer);
  const documentRef = target.ownerDocument || document;
  const zoomEmitter = createFileViewerZoomChangeEmitter();
  let state: TypstRenderState = 'loading';
  let pages: TypstRenderedPage[] = [];
  let errorMessage = '';
  let zoom = 1;
  let renderToken = 0;
  let disposed = false;
  const pageShells = new Map<number, HTMLElement>();

  const root = createElement(documentRef, 'div', 'typst-viewer');
  root.dataset.viewerZoomProvider = 'typst';
  const toolbar = createElement(documentRef, 'header', 'typst-toolbar');
  const titleGroup = createElement(documentRef, 'div');
  const title = createElement(documentRef, 'strong', undefined, context?.filename || 'Typst document');
  const summary = createElement(documentRef, 'span', undefined, 'Typst WASM renderer');
  const status = createElement(documentRef, 'em', undefined, '正在编译');
  const body = createElement(documentRef, 'div');

  titleGroup.append(title, summary);
  toolbar.append(titleGroup, status);
  root.append(toolbar, body);
  target.replaceChildren(createStyle(documentRef), root);

  const getZoomState = (): FileViewerZoomState => ({
    scale: zoom,
    label: `${Math.round(zoom * 100)}%`,
    canZoomIn: zoom < 3,
    canZoomOut: zoom > 0.3,
    canReset: zoom !== 1,
    minScale: 0.3,
    maxScale: 3,
  });

  const applyPageZoom = () => {
    pages.forEach(page => {
      const shell = pageShells.get(page.index);
      if (!shell) {
        return;
      }
      shell.style.width = `${page.width * zoom}px`;
      shell.style.maxWidth = '100%';
      shell.style.height = 'auto';
    });
  };

  const setZoom = (scale: number) => {
    zoom = clampZoom(scale);
    applyPageZoom();
    zoomEmitter.emit();
    return getZoomState();
  };

  registerFileViewerZoomProvider(root, {
    zoomIn: () => setZoom(zoom + 0.1),
    zoomOut: () => setZoom(zoom - 0.1),
    resetZoom: () => setZoom(1),
    setZoom,
    getState: getZoomState,
    subscribe: zoomEmitter.subscribe,
  });

  const registerExportAdapter = () => {
    context?.registerExportAdapter?.(buildExportAdapter(pages, context.filename));
  };

  const renderLoading = () => {
    const loading = createElement(documentRef, 'div', 'typst-loading');
    loading.setAttribute('role', 'status');
    loading.append(
      createElement(documentRef, 'span'),
      createElement(documentRef, 'strong', undefined, '正在解析 Typst'),
      createElement(documentRef, 'p', undefined, '加载编译器并生成页面预览...')
    );
    body.replaceChildren(loading);
  };

  const renderError = () => {
    const error = createElement(documentRef, 'div', 'typst-error');
    error.append(
      createElement(documentRef, 'strong', undefined, 'Typst 渲染失败'),
      createElement(documentRef, 'pre', undefined, errorMessage)
    );
    body.replaceChildren(error);
  };

  const renderPages = () => {
    pageShells.clear();
    const pagesRoot = createElement(documentRef, 'main', 'typst-pages');
    pagesRoot.setAttribute('aria-label', 'Typst preview pages');

    pages.forEach(page => {
      const shell = createElement(documentRef, 'section', 'typst-page-shell');
      shell.setAttribute('aria-label', `Page ${page.index}`);
      const content = createElement(documentRef, 'div', 'typst-page-content');
      content.innerHTML = page.svg;
      shell.append(content);
      pageShells.set(page.index, shell);
      pagesRoot.append(shell);
    });

    body.replaceChildren(pagesRoot);
    applyPageZoom();
  };

  const syncUi = () => {
    summary.textContent = state === 'ready'
      ? getPageSummary(pages)
      : 'Typst WASM renderer';
    status.textContent = state === 'loading'
      ? '正在编译'
      : state === 'error'
        ? '编译失败'
        : '已渲染';

    if (state === 'loading') {
      renderLoading();
    } else if (state === 'error') {
      renderError();
    } else {
      renderPages();
    }
  };

  const renderTypstSvg = async () => {
    const candidates = resolveTypstEngineCandidates(context, documentRef.baseURI);
    const timeoutMs = normalizeRenderTimeoutMs(context?.options?.typst?.renderTimeoutMs);
    let lastError: unknown;

    for (const candidate of candidates) {
      const missingAsset = candidate.preflight
        ? await resolveKnownMissingTypstAsset(candidate)
        : '';
      if (missingAsset) {
        lastError = new Error(missingAsset);
        continue;
      }

      try {
        configureTypstEngine(candidate.compilerWasmUrl, candidate.rendererWasmUrl);
        return await withRenderTimeout($typst.svg({
          mainContent: source,
          data_selection: {
            body: true,
            defs: true,
            css: true,
            js: false,
          },
        }), timeoutMs);
      } catch (error) {
        lastError = error;
        if (error instanceof TypstRenderTimeoutError || !isTypstAssetLoadError(error)) {
          throw error;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Typst WASM 加载失败');
  };

  const render = async () => {
    const token = ++renderToken;
    state = 'loading';
    errorMessage = '';
    pages = [];
    context?.registerExportAdapter?.(null);
    syncUi();

    try {
      const svg = await renderTypstSvg();

      if (disposed || token !== renderToken) {
        return;
      }

      pages = parseTypstSvgPages(svg);
      state = 'ready';
      syncUi();
      registerExportAdapter();
      context?.onProgressiveRender?.();
    } catch (error) {
      if (disposed || token !== renderToken) {
        return;
      }
      errorMessage = formatTypstRuntimeError(error);
      state = 'error';
      syncUi();
    }
  };

  void render();

  return {
    $el: target,
    unmount() {
      disposed = true;
      renderToken += 1;
      unregisterFileViewerZoomProvider(root);
      context?.registerExportAdapter?.(null);
      target.replaceChildren();
    },
  };
}
