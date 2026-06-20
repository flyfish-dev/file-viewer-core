import {
  getDocument,
  GlobalWorkerOptions,
  PDFWorker as PdfJsWorker,
  PixelsPerInch,
  version,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  EventBus,
  GenericL10n,
  PDFFindController,
  PDFLinkService,
  PDFViewer,
} from 'pdfjs-dist/legacy/web/pdf_viewer.mjs';
import {
  registerFileViewerSearchProvider,
  registerFileViewerZoomProvider,
  unregisterFileViewerSearchProvider,
  unregisterFileViewerZoomProvider,
} from '../features/document/dom';
import { createFileViewerZoomChangeEmitter } from '../features/document/zoom';
import {
  buildPrintPageStyle,
  formatCssPixels,
} from '../output/printLayout';
import { DEFAULT_PDF_RANGE_CHUNK_SIZE } from '../source/loading';
import type {
  FileRenderContext,
  FileRenderExportOptions,
  FileViewerPdfOptions,
  FileViewerRenderedInstance,
  FileViewerSearchOptions,
  FileViewerSearchState,
  FileViewerZoomState,
} from '../contracts/types';
import { pdfViewerStyle } from './pdfStyles';

export const DEFAULT_FILE_VIEWER_PDF_WORKER_URL =
  `https://npm.onmicrosoft.cn/pdfjs-dist@${version}/legacy/build/pdf.worker.mjs`;

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
const SCALE_STEP = 0.1;
const FIT_HORIZONTAL_PADDING = 28;
const PAGE_BORDER_WIDTH = 18;
const PDF_EXPORT_MAX_PAGE_PIXELS = 8_000_000;

type PdfNavMode = 'pages' | 'outline';
type PdfRotation = 0 | 90 | 180 | 270;
type PdfLoadingTask = ReturnType<typeof getDocument>;
type PdfDocumentProxy = Awaited<PdfLoadingTask['promise']>;
type PdfWorkerInstance = {
  destroy: () => void;
};
type PdfResource = {
  loadingTask: PdfLoadingTask;
  worker: PdfWorkerInstance | null;
};
type PdfNavigationResult = void | PromiseLike<void>;
type PdfFindMatchesCount = { current: number; total: number };

interface PdfOutlineItemView {
  id: string;
  title: string;
  dest: string | unknown[] | null;
  items: PdfOutlineItemView[];
  expanded: boolean;
}

interface PdfFlattenedOutlineItem {
  item: PdfOutlineItemView;
  depth: number;
}

const createStyle = (documentRef: Document) => {
  const style = documentRef.createElement('style');
  style.textContent = `${pdfViewerStyle}
.pdf-state[hidden],.pdf-nav-pane[hidden]{display:none!important}
`;
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

const createButton = (
  documentRef: Document,
  className: string,
  title: string,
  label?: string
) => {
  const button = createElement(documentRef, 'button', className) as HTMLButtonElement;
  button.type = 'button';
  button.title = title;
  button.setAttribute('aria-label', title);
  if (label !== undefined) {
    const labelNode = createElement(documentRef, 'span', undefined, label);
    labelNode.setAttribute('aria-hidden', 'true');
    button.append(labelNode);
  }
  return button;
};

const normalizeRotation = (rotation: number): PdfRotation => {
  const normalized = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
  return (normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0) as PdfRotation;
};

const clampScale = (scale: number) => Number(Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)).toFixed(2));

const createPdfSearchState = (query = ''): FileViewerSearchState => ({
  query,
  total: 0,
  currentIndex: -1,
  current: null,
  matches: [],
});

const escapeAttribute = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const waitForPaint = (view?: Window | null) => new Promise<void>(resolve => {
  if (view?.requestAnimationFrame) {
    view.requestAnimationFrame(() => resolve());
    return;
  }
  globalThis.setTimeout(resolve, 0);
});

const resolvePdfWorkerUrl = (
  options: FileViewerPdfOptions | undefined,
  documentUrl?: string
) => {
  const configured = options?.workerUrl;
  if (!configured) {
    return DEFAULT_FILE_VIEWER_PDF_WORKER_URL;
  }
  try {
    return documentUrl ? new URL(configured, documentUrl).href : configured;
  } catch {
    return configured;
  }
};

const buildOutlineItems = (
  items: Array<{ title?: string; dest?: string | unknown[] | null; items?: unknown[] }>,
  prefix = 'outline'
) => items.map((item, index): PdfOutlineItemView => {
  const id = `${prefix}-${index}`;
  const children = Array.isArray(item.items)
    ? buildOutlineItems(item.items as Array<{ title?: string; dest?: string | unknown[] | null; items?: unknown[] }>, id)
    : [];
  return {
    id,
    title: item.title || `目录 ${index + 1}`,
    dest: item.dest || null,
    items: children,
    expanded: index < 4,
  };
});

export default async function renderPdf(
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> {
  const documentRef = target.ownerDocument || document;
  const targetWindow = documentRef.defaultView || (typeof window !== 'undefined' ? window : null);
  if (!targetWindow) {
    throw new Error('PDF preview requires a browser window');
  }
  const options = context?.options?.pdf;
  const navigationEnabled = options?.navigation !== false;
  const toolbarVisible = options?.toolbar !== false;
  const zoomEmitter = createFileViewerZoomChangeEmitter();

  let navVisible = options?.navigation === false ? false : options?.defaultNavigationVisible !== false;
  let navMode: PdfNavMode = 'pages';
  let loadStatus: 'loading' | 'ready' | 'error' = 'loading';
  let errorMessage = '';
  let currentPage = 1;
  let pageCount = 0;
  let currentScale = 1;
  let autoFitWidth = true;
  let currentRotation = normalizeRotation(options?.rotation ?? 0);
  let outlineItems: PdfOutlineItemView[] = [];
  let resizeObserver: ResizeObserver | null = null;
  let fitFrame = 0;
  let destroyed = false;
  let loadVersion = 0;
  let pdfSearchState = createPdfSearchState();
  let pdfMatchesCount: PdfFindMatchesCount = { current: 0, total: 0 };
  let pdfSearchOptions: FileViewerSearchOptions | undefined;
  let pdfSearchWaiters: Array<{
    resolve: (state: FileViewerSearchState) => void;
    timer: number;
  }> = [];

  const pdfContext = {
    viewer: null as PDFViewer | null,
    linkService: null as PDFLinkService | null,
    eventBus: null as EventBus | null,
    findController: null as PDFFindController | null,
    resource: null as PdfResource | null,
    document: null as PdfDocumentProxy | null,
    search: '',
  };

  const root = createElement(documentRef, 'div', 'pdf-shell');
  root.dataset.viewerSearchProvider = 'pdf';
  root.dataset.viewerZoomProvider = 'pdf';

  const toolbar = createElement(documentRef, 'div', 'pdf-toolbar');
  const navToggleButton = createButton(documentRef, 'pdf-icon-button', '切换导航窗格');
  navToggleButton.setAttribute('aria-pressed', String(navVisible));
  navToggleButton.append(createElement(documentRef, 'span', 'pdf-panel-icon'));

  const pageGroup = createElement(documentRef, 'div', 'pdf-toolbar-group');
  const previousPageButton = createButton(documentRef, 'pdf-icon-button', '上一页', '‹');
  const pageMeter = createElement(documentRef, 'span', 'pdf-page-meter');
  const pageMeterCurrent = createElement(documentRef, 'strong', undefined, '1');
  const pageMeterTotal = createElement(documentRef, 'span', undefined, '/ -');
  pageMeter.append(pageMeterCurrent, pageMeterTotal);
  const nextPageButton = createButton(documentRef, 'pdf-icon-button', '下一页', '›');
  pageGroup.append(previousPageButton, pageMeter, nextPageButton);

  const zoomGroup = createElement(documentRef, 'div', 'pdf-toolbar-group pdf-toolbar-group--zoom');
  const zoomOutButton = createButton(documentRef, 'pdf-icon-button', '缩小', '−');
  const scaleButton = createElement(documentRef, 'button', 'pdf-scale-button', '100%') as HTMLButtonElement;
  scaleButton.type = 'button';
  scaleButton.title = '适合宽度';
  const zoomInButton = createButton(documentRef, 'pdf-icon-button', '放大', '+');
  zoomGroup.append(zoomOutButton, scaleButton, zoomInButton);

  const rotateGroup = createElement(documentRef, 'div', 'pdf-toolbar-group pdf-toolbar-group--rotate');
  const rotateLeftButton = createButton(documentRef, 'pdf-icon-button', '向左旋转', '↺');
  const rotationMeter = createElement(documentRef, 'span', 'pdf-rotation-meter', `${currentRotation}°`);
  const rotateRightButton = createButton(documentRef, 'pdf-icon-button', '向右旋转', '↻');
  rotateGroup.append(rotateLeftButton, rotationMeter, rotateRightButton);

  if (navigationEnabled) {
    toolbar.append(navToggleButton);
  }
  toolbar.append(pageGroup, zoomGroup, rotateGroup);

  const content = createElement(documentRef, 'div', 'pdf-content');
  const navPane = createElement(documentRef, 'aside', 'pdf-nav-pane');
  const navHead = createElement(documentRef, 'div', 'pdf-nav-head');
  const navTitle = createElement(documentRef, 'span', undefined, '页面导航');
  const navCount = createElement(documentRef, 'strong', undefined, '0 页');
  navHead.append(navTitle, navCount);

  const navTabs = createElement(documentRef, 'div', 'pdf-nav-tabs');
  navTabs.setAttribute('role', 'tablist');
  navTabs.setAttribute('aria-label', 'PDF 导航类型');
  const pagesTab = createButton(documentRef, '', '页面') as HTMLButtonElement;
  const outlineTab = createButton(documentRef, '', '目录') as HTMLButtonElement;
  pagesTab.textContent = '页面';
  outlineTab.textContent = '目录';
  pagesTab.setAttribute('role', 'tab');
  outlineTab.setAttribute('role', 'tab');
  navTabs.append(pagesTab, outlineTab);

  const navList = createElement(documentRef, 'div');
  navPane.append(navHead, navTabs, navList);

  const viewport = createElement(documentRef, 'div', 'pdf-viewport');
  const container = createElement(documentRef, 'div', 'pdf-wrapper');
  container.dataset.viewerScrollContainer = 'true';
  const pdfViewerRoot = createElement(documentRef, 'div', 'pdfViewer');
  const stateNode = createElement(documentRef, 'div', 'pdf-state', '正在加载 PDF...');
  container.append(pdfViewerRoot, stateNode);
  viewport.append(container);
  content.append(navPane, viewport);
  root.append(content);
  if (toolbarVisible) {
    root.insertBefore(toolbar, content);
  }
  target.replaceChildren(createStyle(documentRef), root);

  const scaleText = () => `${Math.round(currentScale * 100)}%`;
  const rotationText = () => `${currentRotation}°`;
  const canGoPrevious = () => currentPage > 1;
  const canGoNext = () => currentPage < pageCount;
  const canZoomOut = () => currentScale > MIN_SCALE;
  const canZoomIn = () => currentScale < MAX_SCALE;
  const outlineCount = () => {
    const countItems = (items: PdfOutlineItemView[]): number => (
      items.reduce((total, item) => total + 1 + countItems(item.items), 0)
    );
    return countItems(outlineItems);
  };
  const flattenedOutlineItems = () => {
    const result: PdfFlattenedOutlineItem[] = [];
    const visit = (items: PdfOutlineItemView[], depth: number) => {
      items.forEach(item => {
        result.push({ item, depth });
        if (item.expanded && item.items.length) {
          visit(item.items, depth + 1);
        }
      });
    };
    visit(outlineItems, 0);
    return result;
  };

  const renderNavList = () => {
    navList.replaceChildren();
    navList.className = navMode === 'pages' ? 'pdf-page-list' : 'pdf-outline-list';

    if (navMode === 'pages') {
      for (let page = 1; page <= pageCount; page += 1) {
        const button = createElement(documentRef, 'button', 'pdf-page-button') as HTMLButtonElement;
        button.type = 'button';
        button.classList.toggle('pdf-page-button--active', page === currentPage);
        button.append(
          createElement(documentRef, 'span', 'pdf-page-thumb', String(page)),
          createElement(documentRef, 'span', 'pdf-page-label', `第 ${page} 页`)
        );
        button.addEventListener('click', () => goToPage(page));
        navList.append(button);
      }
      return;
    }

    const entries = flattenedOutlineItems();
    entries.forEach(entry => {
      const button = createElement(documentRef, 'button', 'pdf-outline-button') as HTMLButtonElement;
      button.type = 'button';
      button.style.setProperty('--outline-depth', String(entry.depth));
      const toggle = createElement(documentRef, 'span', 'pdf-outline-toggle');
      toggle.classList.toggle('pdf-outline-toggle--open', entry.item.expanded);
      toggle.classList.toggle('pdf-outline-toggle--empty', !entry.item.items.length);
      toggle.setAttribute('aria-hidden', 'true');
      toggle.addEventListener('click', event => {
        event.stopPropagation();
        toggleOutlineItem(entry.item);
      });
      button.append(toggle, createElement(documentRef, 'span', 'pdf-outline-title', entry.item.title));
      button.addEventListener('click', () => goToOutlineItem(entry.item));
      navList.append(button);
    });

    if (!entries.length) {
      navList.append(createElement(documentRef, 'div', 'pdf-outline-empty', '当前 PDF 没有可用目录'));
    }
  };

  const syncUi = () => {
    root.classList.toggle('pdf-shell--nav-hidden', !navigationEnabled || !navVisible);
    root.classList.toggle('pdf-shell--toolbar-hidden', !toolbarVisible);
    navToggleButton.classList.toggle('pdf-icon-button--active', navVisible);
    navToggleButton.setAttribute('aria-pressed', String(navVisible));
    navPane.hidden = !navigationEnabled || !navVisible;
    pagesTab.classList.toggle('active', navMode === 'pages');
    outlineTab.classList.toggle('active', navMode === 'outline');
    pagesTab.setAttribute('aria-selected', navMode === 'pages' ? 'true' : 'false');
    outlineTab.setAttribute('aria-selected', navMode === 'outline' ? 'true' : 'false');
    navTitle.textContent = navMode === 'pages' ? '页面导航' : '目录导航';
    navCount.textContent = navMode === 'pages' ? `${pageCount} 页` : `${outlineCount()} 项`;
    pageMeterCurrent.textContent = String(currentPage);
    pageMeterTotal.textContent = `/ ${pageCount || '-'}`;
    scaleButton.textContent = scaleText();
    rotationMeter.textContent = rotationText();
    previousPageButton.disabled = !canGoPrevious();
    nextPageButton.disabled = !canGoNext();
    zoomOutButton.disabled = !canZoomOut();
    zoomInButton.disabled = !canZoomIn();
    stateNode.hidden = loadStatus === 'ready';
    stateNode.classList.toggle('pdf-state--error', loadStatus === 'error');
    stateNode.textContent = loadStatus === 'error' ? errorMessage : '正在加载 PDF...';
    renderNavList();
  };

  const createPdfWorker = () => {
    if (!targetWindow?.Worker) {
      return null;
    }

    GlobalWorkerOptions.workerSrc = resolvePdfWorkerUrl(options, documentRef.URL || undefined);
    try {
      return PdfJsWorker.create({ name: 'file-viewer-pdf-worker' });
    } catch (error) {
      console.warn('[file-viewer] PDF Worker 无法创建，回退到 PDF.js 默认加载策略。', error);
      return null;
    }
  };

  const resolvePdfSearchWaiters = (state: FileViewerSearchState) => {
    const waiters = pdfSearchWaiters;
    pdfSearchWaiters = [];
    waiters.forEach(waiter => {
      targetWindow.clearTimeout(waiter.timer);
      waiter.resolve(state);
    });
  };

  const readPdfMatchesCount = (): PdfFindMatchesCount => {
    const findController = pdfContext.findController;
    if (!findController) {
      return { current: 0, total: 0 };
    }

    const pageMatches = findController.pageMatches || [];
    const selected = findController.selected;
    const total = pageMatches.reduce((sum: number, matches: number[] | undefined) => sum + (matches?.length || 0), 0);
    let current = 0;
    if (selected && selected.pageIdx >= 0 && selected.matchIdx >= 0 && total > 0) {
      for (let index = 0; index < selected.pageIdx; index += 1) {
        current += pageMatches[index]?.length || 0;
      }
      current += selected.matchIdx + 1;
    }
    return { current, total };
  };

  const commitPdfSearchState = (
    matchesCount: PdfFindMatchesCount = readPdfMatchesCount(),
    query = pdfContext.search,
    shouldResolve = false
  ) => {
    pdfMatchesCount = matchesCount;
    const current = Math.max(0, matchesCount.current || 0);
    const total = Math.max(0, matchesCount.total || 0);
    const selected = pdfContext.findController?.selected;
    const page = selected && selected.pageIdx >= 0 ? selected.pageIdx + 1 : undefined;
    pdfSearchState = {
      query,
      total,
      currentIndex: current > 0 ? current - 1 : -1,
      current: current > 0
        ? {
            id: `pdf-search-match-${current}`,
            index: current - 1,
            text: query,
            anchor: null,
            page,
          }
        : null,
      matches: [],
    };

    if (shouldResolve) {
      resolvePdfSearchWaiters(pdfSearchState);
    }
    return pdfSearchState;
  };

  const waitForPdfSearchState = (query: string) => new Promise<FileViewerSearchState>(resolve => {
    const timer = targetWindow.setTimeout(() => {
      const waiterIndex = pdfSearchWaiters.findIndex(waiter => waiter.resolve === resolve);
      if (waiterIndex >= 0) {
        pdfSearchWaiters.splice(waiterIndex, 1);
      }
      resolve(commitPdfSearchState(readPdfMatchesCount(), query));
    }, 1200);
    pdfSearchWaiters.push({ resolve, timer });
  });

  const handlePdfFindMatchesCount = (event: { matchesCount?: PdfFindMatchesCount }) => {
    if (event.matchesCount) {
      commitPdfSearchState(event.matchesCount, pdfContext.search);
    }
  };

  const handlePdfFindControlState = (event: {
    state?: number;
    matchesCount?: PdfFindMatchesCount;
    rawQuery?: string | null;
  }) => {
    const query = typeof event.rawQuery === 'string' ? event.rawQuery : pdfContext.search;
    pdfContext.search = query;
    const matchesCount = event.matchesCount?.total ? event.matchesCount : readPdfMatchesCount();
    const shouldResolve = event.state !== 3 && (matchesCount.total > 0 || event.state === 1);
    commitPdfSearchState(matchesCount, query, shouldResolve);
  };

  const clampHorizontalScroll = (scrollLeft: number) => {
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    return Math.min(Math.max(0, scrollLeft), maxScrollLeft);
  };

  const restoreHorizontalScroll = (scrollLeft: number) => {
    container.scrollLeft = clampHorizontalScroll(scrollLeft);
  };

  const stabilizeHorizontalScroll = (scrollLeft: number) => {
    restoreHorizontalScroll(scrollLeft);
    void waitForPaint(targetWindow).then(() => restoreHorizontalScroll(scrollLeft));
    targetWindow.requestAnimationFrame(() => {
      restoreHorizontalScroll(scrollLeft);
      targetWindow.requestAnimationFrame(() => restoreHorizontalScroll(scrollLeft));
    });
    targetWindow.setTimeout(() => restoreHorizontalScroll(scrollLeft), 120);
  };

  const runPdfFind = async (
    query: string,
    searchOptionsInput: FileViewerSearchOptions | undefined,
    type: '' | 'again',
    findPrevious = false
  ) => {
    if (!pdfContext.eventBus) {
      return commitPdfSearchState({ current: 0, total: 0 }, query);
    }

    pdfContext.search = query;
    pdfSearchOptions = searchOptionsInput || pdfSearchOptions;
    const searchOptions = searchOptionsInput || pdfSearchOptions;
    const previousScrollLeft = clampHorizontalScroll(container.scrollLeft || 0);
    pdfContext.eventBus.dispatch('find', {
      source: root,
      type,
      query,
      phraseSearch: true,
      caseSensitive: !!searchOptions?.caseSensitive,
      entireWord: !!searchOptions?.wholeWord,
      highlightAll: true,
      findPrevious,
      matchDiacritics: false,
    });

    try {
      return await waitForPdfSearchState(query);
    } finally {
      stabilizeHorizontalScroll(previousScrollLeft);
    }
  };

  const clearPdfFind = () => {
    pdfContext.search = '';
    pdfSearchOptions = undefined;
    pdfMatchesCount = { current: 0, total: 0 };
    pdfContext.eventBus?.dispatch('findbarclose', {
      source: root,
    });
    return commitPdfSearchState(pdfMatchesCount, '', true);
  };

  const getPdfZoomState = (): FileViewerZoomState => ({
    scale: currentScale,
    label: scaleText(),
    canZoomIn: !!pdfContext.viewer && canZoomIn(),
    canZoomOut: !!pdfContext.viewer && canZoomOut(),
    canReset: !!pdfContext.viewer,
    minScale: MIN_SCALE,
    maxScale: MAX_SCALE,
  });

  const setScale = (scale: number) => {
    if (!pdfContext.viewer) {
      return;
    }
    const normalizedScale = clampScale(scale);
    pdfContext.viewer.currentScale = normalizedScale;
    currentScale = normalizedScale;
    zoomEmitter.emit();
    syncUi();
  };

  const getPageWidthAtScaleOne = (pdfViewer: PDFViewer) => {
    const pageView = pdfViewer.getPageView(0);
    const pdfPage = pageView?.pdfPage;
    if (pdfPage) {
      return pdfPage.getViewport({
        scale: PixelsPerInch.PDF_TO_CSS_UNITS,
        rotation: currentRotation,
      }).width;
    }

    const viewportWidth = pageView?.viewport?.width;
    if (viewportWidth && currentScale) {
      return viewportWidth / currentScale;
    }
    return 0;
  };

  const getFitWidthScale = (pdfViewer: PDFViewer) => {
    const pageWidth = getPageWidthAtScaleOne(pdfViewer);
    const containerWidth = container.clientWidth || targetWindow.innerWidth;
    const availableWidth = Math.max(containerWidth - FIT_HORIZONTAL_PADDING - PAGE_BORDER_WIDTH, 96);
    return pageWidth ? clampScale(availableWidth / pageWidth) : 1;
  };

  const fitToWidth = () => {
    if (!pdfContext.viewer) {
      return;
    }
    autoFitWidth = true;
    setScale(getFitWidthScale(pdfContext.viewer));
    void waitForPaint(targetWindow).then(() => {
      pdfContext.viewer?.update();
    });
  };

  const scheduleFitToWidth = () => {
    if (!autoFitWidth || !pdfContext.viewer) {
      return;
    }
    targetWindow.cancelAnimationFrame(fitFrame);
    fitFrame = targetWindow.requestAnimationFrame(() => fitToWidth());
  };

  const zoomIn = () => {
    autoFitWidth = false;
    setScale(currentScale + SCALE_STEP);
  };

  const zoomOut = () => {
    autoFitWidth = false;
    setScale(currentScale - SCALE_STEP);
  };

  const applyRotation = (rotation: number) => {
    const normalized = normalizeRotation(rotation);
    currentRotation = normalized;
    if (!pdfContext.viewer) {
      syncUi();
      return;
    }
    pdfContext.viewer.pagesRotation = normalized;
    void waitForPaint(targetWindow).then(() => {
      if (autoFitWidth) {
        fitToWidth();
        return;
      }
      pdfContext.viewer?.update();
      syncUi();
    });
  };

  const runWithStableHorizontalScroll = (action: () => PdfNavigationResult) => {
    const previousScrollLeft = clampHorizontalScroll(container.scrollLeft || 0);
    const result = action();
    stabilizeHorizontalScroll(previousScrollLeft);
    if (result && typeof result.then === 'function') {
      void Promise.resolve(result).finally(() => stabilizeHorizontalScroll(previousScrollLeft));
    }
  };

  function goToPage(pageNumber: number) {
    if (!pdfContext.viewer || !pageCount) {
      return;
    }
    const nextPage = Math.min(pageCount, Math.max(1, pageNumber));
    runWithStableHorizontalScroll(() => {
      pdfContext.viewer!.currentPageNumber = nextPage;
      currentPage = nextPage;
      syncUi();
    });
  }

  const toggleNav = () => {
    if (!navigationEnabled) {
      return;
    }
    navVisible = !navVisible;
    syncUi();
    void waitForPaint(targetWindow).then(() => {
      if (autoFitWidth) {
        fitToWidth();
        return;
      }
      pdfContext.viewer?.update();
    });
  };

  const setNavMode = (mode: PdfNavMode) => {
    navMode = mode;
    syncUi();
  };

  const toggleOutlineItem = (item: PdfOutlineItemView) => {
    if (!item.items.length) {
      return;
    }
    item.expanded = !item.expanded;
    syncUi();
  };

  const goToOutlineItem = (item: PdfOutlineItemView) => {
    if (!item.dest || !pdfContext.linkService) {
      return;
    }
    runWithStableHorizontalScroll(() => pdfContext.linkService!.goToDestination(item.dest!));
  };

  const destroyPdfResource = async (resource: PdfResource | null) => {
    if (!resource) {
      return;
    }
    try {
      await resource.loadingTask.destroy();
    } catch (error) {
      console.warn('PDF 加载任务销毁失败', error);
    } finally {
      resource.worker?.destroy();
    }
  };

  const loadOutline = async (pdfDocument: PdfDocumentProxy) => {
    try {
      const outline = await pdfDocument.getOutline();
      if (destroyed || pdfContext.document !== pdfDocument) {
        return;
      }
      outlineItems = Array.isArray(outline)
        ? buildOutlineItems(outline as Array<{ title?: string; dest?: string | unknown[] | null; items?: unknown[] }>)
        : [];
      syncUi();
    } catch (error) {
      console.warn('PDF 大纲读取失败', error);
      outlineItems = [];
      syncUi();
    }
  };

  const getPdfExportRatio = (width: number, height: number, mode: FileRenderExportOptions['mode']) => {
    const preferredRatio = mode === 'print' ? 1.75 : 1.5;
    const maxRatio = Math.sqrt(PDF_EXPORT_MAX_PAGE_PIXELS / Math.max(width * height, 1));
    return Math.max(0.75, Math.min(preferredRatio, maxRatio));
  };

  const getPdfPrintPageSize = async (pageNumber = 1) => {
    const pdfDocument = pdfContext.document;
    if (!pdfDocument) {
      throw new Error('PDF 尚未加载完成，请稍后再试');
    }
    const page = await pdfDocument.getPage(Math.min(Math.max(pageNumber, 1), pdfDocument.numPages));
    const viewport = page.getViewport({
      scale: PixelsPerInch.PDF_TO_CSS_UNITS,
      rotation: currentRotation,
    });
    (page as { cleanup?: () => void }).cleanup?.();
    return {
      width: Math.ceil(viewport.width),
      height: Math.ceil(viewport.height),
    };
  };

  const buildPdfPrintStyle = async () => {
    const size = await getPdfPrintPageSize();
    return buildPrintPageStyle({
      selector: '.viewer-export-content .pdf-export-page',
      width: size.width,
      height: size.height,
    });
  };

  const renderPdfPagesForExport = async (exportOptions: FileRenderExportOptions) => {
    const pdfDocument = pdfContext.document;
    if (!pdfDocument) {
      throw new Error('PDF 尚未加载完成，请稍后再试');
    }

    const pagesHtml: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      if (destroyed) {
        throw new Error('PDF 已卸载，无法继续打印');
      }

      const page = await pdfDocument.getPage(pageNumber);
      const baseViewport = page.getViewport({
        scale: PixelsPerInch.PDF_TO_CSS_UNITS,
        rotation: currentRotation,
      });
      const pageWidth = Math.ceil(baseViewport.width);
      const pageHeight = Math.ceil(baseViewport.height);
      const exportRatio = getPdfExportRatio(baseViewport.width, baseViewport.height, exportOptions.mode);
      const renderViewport = page.getViewport({
        scale: PixelsPerInch.PDF_TO_CSS_UNITS * exportRatio,
        rotation: currentRotation,
      });
      const canvas = documentRef.createElement('canvas');
      const canvasContext = canvas.getContext('2d');
      if (!canvasContext) {
        throw new Error('当前浏览器无法创建 PDF 打印画布');
      }

      canvas.width = Math.ceil(renderViewport.width);
      canvas.height = Math.ceil(renderViewport.height);
      await page.render({ canvas, canvasContext, viewport: renderViewport }).promise;

      const pageTitle = `${exportOptions.title} - 第 ${pageNumber} 页`;
      const pageStyle = [
        `--viewer-print-page-width:${formatCssPixels(pageWidth)}`,
        `--viewer-print-page-height:${formatCssPixels(pageHeight)}`,
        `width:${formatCssPixels(pageWidth)}`,
        `height:${formatCssPixels(pageHeight)}`,
      ].join(';');
      pagesHtml.push(`<section class="pdf-export-page viewer-print-page" style="${pageStyle}" aria-label="${escapeAttribute(pageTitle)}"><img src="${canvas.toDataURL('image/png')}" alt="${escapeAttribute(pageTitle)}" /></section>`);

      canvas.width = 0;
      canvas.height = 0;
      (page as { cleanup?: () => void }).cleanup?.();
    }

    return `<div class="pdf-export-document">${pagesHtml.join('')}</div>`;
  };

  const loadFile = async () => {
    const requestVersion = ++loadVersion;
    loadStatus = 'loading';
    errorMessage = '';
    pdfContext.document = null;
    outlineItems = [];
    context?.registerExportAdapter?.(null);
    syncUi();
    let resource: PdfResource | null = null;

    try {
      if (destroyed || requestVersion !== loadVersion) {
        return;
      }

      const eventBus = new EventBus();
      const pdfLinkService = new PDFLinkService({ eventBus });
      const pdfFindController = new PDFFindController({
        eventBus,
        linkService: pdfLinkService,
        updateMatchesCountOnProgress: true,
      });

      const pdfViewer = new PDFViewer({
        container,
        eventBus,
        linkService: pdfLinkService,
        findController: pdfFindController,
        l10n: new GenericL10n('zh-CN'),
        enableAutoLinking: false,
      });
      pdfContext.viewer = pdfViewer;
      pdfContext.linkService = pdfLinkService;
      pdfContext.eventBus = eventBus;
      pdfContext.findController = pdfFindController;
      pdfLinkService.setViewer(pdfViewer);

      eventBus.on('updatefindmatchescount', handlePdfFindMatchesCount);
      eventBus.on('updatefindcontrolstate', handlePdfFindControlState);
      eventBus.on('pagesinit', () => {
        applyRotation(currentRotation);
        fitToWidth();
        loadStatus = 'ready';
        syncUi();
        context?.onProgressiveRender?.();
        if (pdfContext.search) {
          eventBus.dispatch('find', { type: '', query: pdfContext.search });
        }
      });
      eventBus.on('pagechanging', ({ pageNumber }: { pageNumber: number }) => {
        currentPage = pageNumber;
        syncUi();
      });
      eventBus.on('scalechanging', ({ scale }: { scale: number }) => {
        currentScale = clampScale(scale);
        zoomEmitter.emit();
        syncUi();
      });

      if (!context?.streamUrl && !buffer.byteLength) {
        throw new Error('PDF 缺少可读取的数据源');
      }

      const worker = createPdfWorker();
      const source = context?.streamUrl
        ? {
            url: context.streamUrl,
            rangeChunkSize: options?.rangeChunkSize || DEFAULT_PDF_RANGE_CHUNK_SIZE,
            withCredentials: options?.withCredentials === true,
          }
        : {
            data: buffer,
          };
      const loadingTask = getDocument({
        ...source,
        worker: worker || undefined,
        cMapUrl: `https://npm.onmicrosoft.cn/pdfjs-dist@${version}/cmaps/`,
        wasmUrl: `https://npm.onmicrosoft.cn/pdfjs-dist@${version}/wasm/`,
        useWorkerFetch: true,
        cMapPacked: true,
        enableXfa: true,
      });
      resource = { loadingTask, worker };
      pdfContext.resource = resource;

      const pdfDocument = await loadingTask.promise;
      if (destroyed || requestVersion !== loadVersion || pdfContext.resource !== resource) {
        if (pdfContext.resource === resource) {
          pdfContext.resource = null;
          await destroyPdfResource(resource);
        }
        return;
      }

      pageCount = pdfDocument.numPages;
      currentPage = 1;
      pdfContext.document = pdfDocument;
      context?.registerExportAdapter?.({
        includeDocumentStyles: false,
        printStyle: buildPdfPrintStyle,
        toHtml: renderPdfPagesForExport,
      });
      void loadOutline(pdfDocument);
      pdfViewer.setDocument(pdfDocument);
      pdfLinkService.setDocument(pdfDocument, null);
      syncUi();
    } catch (error) {
      if (pdfContext.resource === resource) {
        pdfContext.resource = null;
        void destroyPdfResource(resource);
      }
      if (destroyed || requestVersion !== loadVersion) {
        return;
      }
      loadStatus = 'error';
      errorMessage = error instanceof Error ? error.message : 'PDF 加载失败';
      syncUi();
    }
  };

  registerFileViewerSearchProvider(root, {
    search: (query, searchOptions) => runPdfFind(query, searchOptions, '', false),
    next: () => pdfContext.search
      ? runPdfFind(pdfContext.search, undefined, 'again', false)
      : pdfSearchState,
    previous: () => pdfContext.search
      ? runPdfFind(pdfContext.search, undefined, 'again', true)
      : pdfSearchState,
    clear: clearPdfFind,
    getState: () => pdfSearchState,
  });

  registerFileViewerZoomProvider(root, {
    zoomIn: () => {
      zoomIn();
      return getPdfZoomState();
    },
    zoomOut: () => {
      zoomOut();
      return getPdfZoomState();
    },
    resetZoom: () => {
      fitToWidth();
      return getPdfZoomState();
    },
    setZoom: scale => {
      autoFitWidth = false;
      setScale(scale);
      return getPdfZoomState();
    },
    getState: getPdfZoomState,
    subscribe: zoomEmitter.subscribe,
  });

  navToggleButton.addEventListener('click', toggleNav);
  previousPageButton.addEventListener('click', () => goToPage(currentPage - 1));
  nextPageButton.addEventListener('click', () => goToPage(currentPage + 1));
  zoomOutButton.addEventListener('click', zoomOut);
  zoomInButton.addEventListener('click', zoomIn);
  scaleButton.addEventListener('click', fitToWidth);
  rotateLeftButton.addEventListener('click', () => applyRotation(currentRotation - 90));
  rotateRightButton.addEventListener('click', () => applyRotation(currentRotation + 90));
  pagesTab.addEventListener('click', () => setNavMode('pages'));
  outlineTab.addEventListener('click', () => setNavMode('outline'));

  if (targetWindow.ResizeObserver) {
    resizeObserver = new targetWindow.ResizeObserver(() => scheduleFitToWidth());
    resizeObserver.observe(container);
  }

  syncUi();
  void loadFile();

  return {
    $el: root,
    unmount() {
      destroyed = true;
      loadVersion += 1;
      targetWindow.cancelAnimationFrame(fitFrame);
      resizeObserver?.disconnect();
      resizeObserver = null;
      unregisterFileViewerSearchProvider(root);
      unregisterFileViewerZoomProvider(root);
      outlineItems = [];
      context?.registerExportAdapter?.(null);
      const resource = pdfContext.resource;
      pdfContext.viewer = null;
      pdfContext.linkService = null;
      pdfContext.eventBus = null;
      pdfContext.findController = null;
      pdfContext.document = null;
      pdfContext.resource = null;
      pdfSearchWaiters.forEach(waiter => targetWindow.clearTimeout(waiter.timer));
      pdfSearchWaiters = [];
      void destroyPdfResource(resource);
      target.replaceChildren();
    },
  };
}
