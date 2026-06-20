import { resolveFileViewerSpreadsheetWorkerUrl } from '../platform/assets';
import {
  registerFileViewerZoomProvider,
  unregisterFileViewerZoomProvider,
} from '../features/document/dom';
import { createFileViewerZoomChangeEmitter as createZoomChangeEmitter } from '../features/document/zoom';
import {
  createFileViewerWorkerController,
  type FileViewerWorkerFactory,
} from '../platform/worker';
import type {
  FileRenderContext,
  FileViewerRenderedInstance as AppWrapper,
  FileViewerZoomState,
} from '../contracts/types';
import type { SheetDefinition, SheetImage, SheetModel } from './spreadsheet/worker/type';
import {
  buildRows,
  clampWindowStart,
  collectWindowStarts,
  createEmptyVirtualState,
  DEFAULT_SHEET_DEFAULTS,
  displayCellKey,
  getDataKey,
  markWindowState,
  ROW_STATE_FIELD,
  RowState,
  WINDOW_SIZE,
  type ScrollDirection,
  type VirtualSheetState,
} from './spreadsheet/state';
import {
  buildColumns,
  createTableConfig,
  detectIndexOffset,
  getDisplayColumns,
  getRowHeight,
  HEADER_HEIGHT,
  INDEX_COLUMN_WIDTH,
  normalizeCellStyle,
  normalizeRowHeight,
} from './spreadsheet/view';

type EVirtTableInstance = {
  ctx: {
    body: {
      headIndex?: number;
      tailIndex?: number;
    };
    scrollX?: number;
    scrollY?: number;
  };
  on(type: string, handler: () => void): void;
  loadConfig(config: unknown): void;
  loadColumns(columns: unknown[]): void;
  loadData(rows: unknown[]): void;
  draw(): void;
  doLayout(): void;
  scrollTo(x: number, y: number): void;
  destroy(): void;
};

type EVirtTableConstructor = new (
  container: HTMLElement,
  options: { data: unknown[]; columns: unknown[]; config: unknown }
) => EVirtTableInstance;

type WorkerConstructor = new (scriptURL: string | URL, options?: WorkerOptions) => Worker;

type SpreadsheetMessageListener = EventListenerOrEventListenerObject | null;

const spreadsheetStyle = `
.excel-wrapper{position:relative;width:100%;height:100%;display:flex;flex-direction:column;background:#fff;color:#172033;font-family:Aptos,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif}
.excel-wrapper *{box-sizing:border-box}
.excel-wrapper .table-wrapper{position:relative;width:100%;flex:1;min-height:0;background:#fff;overflow:hidden}
.excel-wrapper .table-host{position:absolute;inset:0}
.excel-wrapper .table-target{width:100%;height:100%}
.excel-wrapper .table-host .e-virt-table-container,.excel-wrapper .table-host .e-virt-table-stage{width:100%!important}
.excel-wrapper .table-host .e-virt-table-container{height:100%!important}
.excel-wrapper .table-host .e-virt-table-stage{overflow:hidden}
.excel-wrapper .sheet-loading{position:absolute;right:18px;bottom:18px;z-index:20;display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:14px;background:rgba(33,163,102,.1);border:1px solid rgba(33,163,102,.2);box-shadow:0 8px 20px rgba(33,163,102,.12);color:#1a7f50;font-size:12px;font-weight:700;pointer-events:none}
.excel-wrapper .sheet-loading-dot{width:8px;height:8px;flex-shrink:0;border-radius:999px;background:#21a366;box-shadow:0 0 0 6px rgba(33,163,102,.12);animation:sheet-loading-pulse 1.2s ease-in-out infinite}
.excel-wrapper .sheet-loading-summary{color:#5f6368}
.excel-wrapper .excel-image-viewport{position:absolute;right:0;bottom:0;z-index:35;overflow:hidden;pointer-events:none}
.excel-wrapper .excel-image-layer{position:absolute;inset:0 auto auto 0;width:0;height:0;transform-origin:0 0;will-change:transform}
.excel-wrapper .excel-image{position:absolute;display:block;max-width:none;height:auto;object-fit:contain;user-select:none}
.excel-wrapper .loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.96);z-index:999;backdrop-filter:blur(6px)}
.excel-wrapper .loading-card{width:min(100%,460px);display:flex;align-items:center;gap:18px;padding:22px;border-radius:24px;background:rgba(255,255,255,.92);border:1px solid rgba(33,163,102,.1);box-shadow:0 22px 48px rgba(18,36,27,.12)}
.excel-wrapper .loading-brand{flex-shrink:0;width:78px;height:78px;display:flex;align-items:center;justify-content:center;border-radius:22px;background:linear-gradient(135deg,rgba(33,163,102,.14),rgba(33,163,102,.04));color:#1a7f50;font-size:18px;font-weight:900;letter-spacing:0}
.excel-wrapper .loading-copy{min-width:0;flex:1}
.excel-wrapper .loading-kicker{display:block;color:#21a366;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.excel-wrapper .loading-copy strong{display:block;margin-top:6px;color:#183828;font-size:20px;line-height:1.3}
.excel-wrapper .loading-copy p{margin:8px 0 0;color:#64748b;font-size:13px;line-height:1.5}
.excel-wrapper .loading-spinner{width:28px;height:28px;border-radius:999px;border:3px solid rgba(33,163,102,.16);border-top-color:#21a366;animation:sheet-loading-spin .8s linear infinite}
.excel-wrapper .error{position:absolute;left:50%;top:50%;z-index:1000;transform:translate(-50%,-50%);max-width:min(520px,calc(100% - 48px));padding:16px 18px;border-radius:16px;background:#fff7ed;color:#9a3412;border:1px solid rgba(234,88,12,.18);box-shadow:0 18px 42px rgba(154,52,18,.12);font-size:14px;line-height:1.6}
.excel-wrapper .toolbar{min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;border-top:1px solid #e5e7eb;background:#f8fafc}
.excel-wrapper .btn-group{min-width:0;max-width:100%;flex:1 1 auto;display:flex;align-items:center;gap:6px;overflow-x:auto;overflow-y:hidden;scrollbar-gutter:stable;scrollbar-width:thin;overscroll-behavior-x:contain}
.excel-wrapper .sheet-tab{flex:0 0 auto;width:max-content;min-width:72px;max-width:min(260px,70vw);height:30px;border:1px solid transparent;border-radius:8px;padding:0 12px;background:transparent;color:#526173;font:inherit;font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.excel-wrapper .sheet-tab:hover{background:#edf2f7}
.excel-wrapper .sheet-tab.active{border-color:rgba(33,163,102,.28);background:rgba(33,163,102,.12);color:#137347}
.excel-wrapper .summary{flex:0 0 auto;max-width:42%;overflow:hidden;color:#64748b;font-size:12px;font-weight:700;white-space:nowrap;text-overflow:ellipsis}
.excel-wrapper .hidden{display:none!important}
.file-viewer[data-viewer-theme='dark'] .excel-wrapper{background:#0f172a;color:#e5e7eb}
.file-viewer[data-viewer-theme='dark'] .excel-wrapper .table-wrapper{background:#111827}
.file-viewer[data-viewer-theme='dark'] .excel-wrapper .toolbar{background:#111827;border-color:rgba(148,163,184,.22)}
.file-viewer[data-viewer-theme='dark'] .excel-wrapper .sheet-tab{color:#cbd5e1}
.file-viewer[data-viewer-theme='dark'] .excel-wrapper .sheet-tab:hover{background:#1f2937}
@media (prefers-color-scheme:dark){.file-viewer[data-viewer-theme='system'] .excel-wrapper{background:#0f172a;color:#e5e7eb}.file-viewer[data-viewer-theme='system'] .excel-wrapper .table-wrapper{background:#111827}.file-viewer[data-viewer-theme='system'] .excel-wrapper .toolbar{background:#111827;border-color:rgba(148,163,184,.22)}.file-viewer[data-viewer-theme='system'] .excel-wrapper .sheet-tab{color:#cbd5e1}.file-viewer[data-viewer-theme='system'] .excel-wrapper .sheet-tab:hover{background:#1f2937}}
@keyframes sheet-loading-spin{to{transform:rotate(360deg)}}
@keyframes sheet-loading-pulse{0%,100%{opacity:.55;transform:scale(.9)}50%{opacity:1;transform:scale(1)}}
@media (max-width:720px){.excel-wrapper .toolbar{align-items:stretch;flex-direction:column}.excel-wrapper .btn-group{flex:0 0 auto}.excel-wrapper .summary{max-width:none;white-space:normal}.excel-wrapper .sheet-loading{left:12px;right:12px;bottom:58px;justify-content:center}.excel-wrapper .loading-card{margin:18px;flex-direction:column;text-align:center}}
`;

const loadEVirtTable = async (): Promise<EVirtTableConstructor> => {
  const module = await import('e-virt-table') as unknown as {
    default?: EVirtTableConstructor;
  };
  return module.default || (module as unknown as EVirtTableConstructor);
};

const getTargetWindow = (target: HTMLDivElement) => {
  return target.ownerDocument.defaultView;
};

const getDocumentBaseUrl = (target: HTMLDivElement) => {
  return target.ownerDocument.baseURI ||
    target.ownerDocument.URL ||
    'http://localhost/';
};

const callListener = (listener: SpreadsheetMessageListener, event: Event) => {
  if (!listener) {
    return;
  }
  if (typeof listener === 'function') {
    listener(event);
    return;
  }
  listener.handleEvent(event);
};

class MainThreadSpreadsheetWorker {
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;

  private destroyed = false;
  private readonly listeners = new Map<string, Set<SpreadsheetMessageListener>>();
  private readonly targetWindow: Window | null;
  private parserPromise: Promise<typeof import('./spreadsheet/worker/sheetjs/parser')> | null = null;
  private context: import('./spreadsheet/worker/sheetjs/parser').SpreadsheetParserContext | null = null;

  constructor(targetWindow: Window | null) {
    this.targetWindow = targetWindow;
  }

  addEventListener(type: string, listener: SpreadsheetMessageListener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)?.add(listener);
  }

  removeEventListener(type: string, listener: SpreadsheetMessageListener) {
    this.listeners.get(type)?.delete(listener);
  }

  terminate() {
    this.destroyed = true;
    this.listeners.clear();
  }

  postMessage(message: unknown) {
    void this.handleMessage(message);
  }

  private async loadParser() {
    if (!this.parserPromise) {
      this.parserPromise = import('./spreadsheet/worker/sheetjs/parser');
    }
    const parser = await this.parserPromise;
    if (!this.context) {
      this.context = parser.createSpreadsheetParserContext();
    }
    return parser;
  }

  private dispatch(type: string, event: Event) {
    this.listeners.get(type)?.forEach(listener => callListener(listener, event));
  }

  private dispatchMessage(data: unknown) {
    const targetGlobal = this.targetWindow as unknown as typeof globalThis | null;
    const MessageEventCtor = targetGlobal?.MessageEvent ||
      (typeof MessageEvent !== 'undefined' ? MessageEvent : undefined);
    const event = MessageEventCtor
      ? new MessageEventCtor('message', { data })
      : ({ type: 'message', data } as MessageEvent);
    this.onmessage?.(event);
    this.dispatch('message', event);
  }

  private dispatchError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const targetGlobal = this.targetWindow as unknown as typeof globalThis | null;
    const ErrorEventCtor = targetGlobal?.ErrorEvent ||
      (typeof ErrorEvent !== 'undefined' ? ErrorEvent : undefined);
    const event = ErrorEventCtor
      ? new ErrorEventCtor('error', { message, error })
      : ({ type: 'error', message, error } as ErrorEvent);
    this.onerror?.(event);
    this.dispatch('error', event);
  }

  private async handleMessage(message: unknown) {
    if (this.destroyed) {
      return;
    }
    try {
      const parser = await this.loadParser();
      parser.handleSpreadsheetWorkerRequest(
        this.context || parser.createSpreadsheetParserContext(),
        message as import('./spreadsheet/worker/sheetjs/parser').SpreadsheetWorkerRequest
      ).forEach(response => {
        if (!this.destroyed) {
          this.dispatchMessage(response);
        }
      });
    } catch (error) {
      if (!this.destroyed) {
        this.dispatchError(error);
      }
    }
  }
}

const createMainThreadSpreadsheetWorker = (target: HTMLDivElement) => {
  return new MainThreadSpreadsheetWorker(getTargetWindow(target)) as unknown as Worker;
};

const createSpreadsheetWorkerFactory = (
  target: HTMLDivElement,
  context?: FileRenderContext
): FileViewerWorkerFactory => {
  return () => {
    if (context?.options?.spreadsheet?.worker !== true) {
      return createMainThreadSpreadsheetWorker(target);
    }

    const view = getTargetWindow(target);
    const WorkerCtor = view?.Worker ||
      (typeof Worker !== 'undefined' ? Worker : undefined);
    if (!WorkerCtor) {
      return createMainThreadSpreadsheetWorker(target);
    }

    const workerUrl = resolveFileViewerSpreadsheetWorkerUrl(
      context?.options?.spreadsheet,
      getDocumentBaseUrl(target)
    );

    try {
      return new (WorkerCtor as WorkerConstructor)(workerUrl, { type: 'module' });
    } catch (moduleWorkerError) {
      try {
        return new (WorkerCtor as WorkerConstructor)(workerUrl);
      } catch (classicWorkerError) {
        console.warn(
          '[file-viewer] Spreadsheet Worker 无法创建，已回退到主线程解析。',
          classicWorkerError || moduleWorkerError
        );
        return createMainThreadSpreadsheetWorker(target);
      }
    }
  };
};

const createStyle = (documentRef: Document) => {
  const style = documentRef.createElement('style');
  style.textContent = spreadsheetStyle;
  return style;
};

const setHidden = (element: HTMLElement, hidden: boolean) => {
  element.classList.toggle('hidden', hidden);
};

const clampZoom = (value: number) => {
  return Math.min(2.5, Math.max(0.5, Number(value.toFixed(2))));
};

const renderFileViewerSpreadsheet = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  _type?: string,
  context?: FileRenderContext
): Promise<AppWrapper> => {
  const documentRef = target.ownerDocument;
  const EVirtTable = await loadEVirtTable();
  const zoomEmitter = createZoomChangeEmitter();

  const root = documentRef.createElement('div');
  root.className = 'excel-wrapper';
  root.dataset.viewerZoomProvider = 'xlsx';

  const loading = documentRef.createElement('div');
  loading.className = 'loading';
  loading.innerHTML = `
    <div class="loading-card">
      <div class="loading-brand">XLSX</div>
      <div class="loading-copy">
        <span class="loading-kicker">Excel 表格</span>
        <strong data-loading-title>正在解析 Excel 工作簿</strong>
        <p>正在准备工作表、样式和大数据视口，请稍候。</p>
      </div>
      <span class="loading-spinner"></span>
    </div>
  `;

  const error = documentRef.createElement('div');
  error.className = 'error hidden';

  const tableWrapper = documentRef.createElement('div');
  tableWrapper.className = 'table-wrapper';

  const sheetLoading = documentRef.createElement('div');
  sheetLoading.className = 'sheet-loading hidden';
  sheetLoading.innerHTML = `
    <span class="sheet-loading-dot"></span>
    <span>正在平滑补充可视区数据</span>
    <span class="sheet-loading-summary"></span>
  `;

  const tableHostShell = documentRef.createElement('div');
  tableHostShell.className = 'table-host';
  const tableHost = documentRef.createElement('div');
  tableHost.className = 'table-target';
  const imageViewport = documentRef.createElement('div');
  imageViewport.className = 'excel-image-viewport hidden';
  const imageLayer = documentRef.createElement('div');
  imageLayer.className = 'excel-image-layer';
  imageViewport.appendChild(imageLayer);
  tableHostShell.append(tableHost, imageViewport);
  tableWrapper.append(sheetLoading, tableHostShell);

  const toolbar = documentRef.createElement('div');
  toolbar.className = 'toolbar';
  const sheetTabsBar = documentRef.createElement('div');
  sheetTabsBar.className = 'btn-group';
  sheetTabsBar.setAttribute('aria-label', '工作表列表');
  const summary = documentRef.createElement('div');
  summary.className = 'summary';
  toolbar.append(sheetTabsBar, summary);

  root.append(loading, error, tableWrapper, toolbar);
  target.replaceChildren(createStyle(documentRef), root);

  let sheets: SheetDefinition[] = [];
  let sheetIndex = 0;
  let errorMessage = '';
  let totalRows = 0;
  let totalCols = 0;
  let sheetDefaults = { ...DEFAULT_SHEET_DEFAULTS };
  let sheetInitializing = true;
  let hasInitialWindow = false;
  let loadedWindowCount = 0;
  let loadingWindowCount = 0;
  let sheetImages: SheetImage[] = [];
  let zoom = 1;
  let imageViewportState = {
    scrollX: 0,
    scrollY: 0,
    width: 0,
    height: 0,
  };
  let loadingState = true;
  let virtualState = createEmptyVirtualState();
  const sheetStateCache = new Map<number, VirtualSheetState>();
  const sheetImageCache = new Map<number, SheetImage[]>();
  let table: EVirtTableInstance | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let resizeFrame = 0;
  let scrollFrame = 0;
  let viewportRange = { start: 0, end: 0 };
  let scrollDirection: ScrollDirection = 1;
  let lastScrollY = 0;
  let sheetSessionId = 0;
  let disposed = false;
  let hasNotifiedFirstPaint = false;

  const controller = createFileViewerWorkerController(
    createSpreadsheetWorkerFactory(target, context),
    { logErrors: false }
  );

  const getActiveSheet = () => sheets.find(sheet => sheet.id === sheetIndex);
  const getSheetTabs = () => {
    const visible = sheets.filter(sheet => !sheet.hidden);
    return visible.length ? visible : sheets;
  };
  const getActiveSheetId = () => sheetIndex ?? sheets[0]?.id;
  const getHostHeight = () => tableHost.clientHeight || 0;
  const showBlockingLoading = () => !errorMessage && !hasInitialWindow && (loadingState || sheetInitializing);
  const showStreamingLoading = () => !showBlockingLoading() &&
    !errorMessage &&
    hasInitialWindow &&
    loadingWindowCount > 0;
  const scalePx = (value: number) => Math.max(1, Math.round(value * zoom));
  const scaleRowHeight = (value: number) => Math.max(0.1, Math.round(value * zoom));

  const getSheetLoadingText = () => {
    if (!sheets.length) {
      return '正在解析 Excel 工作簿，请耐心等待...';
    }
    const activeName = getActiveSheet()?.name;
    return activeName ? `正在准备「${activeName}」...` : '正在准备工作表内容...';
  };

  const getCachedSummary = () => {
    if (!totalRows) {
      return '';
    }
    const cachedRows = Math.min(loadedWindowCount * WINDOW_SIZE, totalRows);
    return `已缓存 ${cachedRows.toLocaleString()} / ${totalRows.toLocaleString()} 行`;
  };

  const getStatusSummary = () => {
    const rows = totalRows || getActiveSheet()?.rowCount || 0;
    const cols = totalCols || getActiveSheet()?.colCount || 0;
    if (!rows) {
      return '';
    }
    if (!cols) {
      return `共 ${rows} 行，按视口预取平滑加载`;
    }
    return `共 ${rows} 行，${cols} 列，按视口预取平滑加载`;
  };

  const getZoomState = (): FileViewerZoomState => ({
    scale: zoom,
    label: `${Math.round(zoom * 100)}%`,
    canZoomIn: zoom < 2.5,
    canZoomOut: zoom > 0.5,
    canReset: zoom !== 1,
    minScale: 0.5,
    maxScale: 2.5,
  });

  const renderImages = () => {
    const margin = 240;
    const width = Math.max(imageViewportState.width - scalePx(INDEX_COLUMN_WIDTH), 0);
    const height = Math.max(imageViewportState.height - scalePx(HEADER_HEIGHT), 0);
    const visibleImages = sheetImages.filter((image) => {
      const x = scalePx(image.left) - imageViewportState.scrollX;
      const y = scalePx(image.top) - imageViewportState.scrollY;
      return x + scalePx(image.width) >= -margin &&
        x <= width + margin &&
        y + scalePx(image.height) >= -margin &&
        y <= height + margin;
    });

    setHidden(imageViewport, visibleImages.length === 0);
    Object.assign(imageViewport.style, {
      left: `${scalePx(INDEX_COLUMN_WIDTH)}px`,
      top: `${scalePx(HEADER_HEIGHT)}px`,
    });
    imageLayer.style.transform =
      `translate(${-imageViewportState.scrollX}px, ${-imageViewportState.scrollY}px)`;
    imageLayer.replaceChildren(...visibleImages.map((image, index) => {
      const element = documentRef.createElement('img');
      element.className = 'excel-image';
      element.src = image.src;
      element.alt = image.id;
      element.draggable = false;
      Object.assign(element.style, {
        left: `${scalePx(image.left)}px`,
        top: `${scalePx(image.top)}px`,
        width: `${scalePx(image.width)}px`,
        height: `${scalePx(image.height)}px`,
      });
      element.dataset.imageIndex = `${index}`;
      return element;
    }));
  };

  const scrollActiveSheetIntoView = () => {
    requestAnimationFrame(() => {
      sheetTabsBar.querySelector<HTMLElement>('.sheet-tab.active')?.scrollIntoView({
        block: 'nearest',
        inline: 'center',
        behavior: 'smooth',
      });
    });
  };

  const renderChrome = () => {
    setHidden(loading, !showBlockingLoading());
    const loadingTitle = loading.querySelector<HTMLElement>('[data-loading-title]');
    if (loadingTitle) {
      loadingTitle.textContent = getSheetLoadingText();
    }
    error.textContent = errorMessage;
    setHidden(error, !errorMessage);
    setHidden(sheetLoading, !showStreamingLoading());
    const cacheText = sheetLoading.querySelector<HTMLElement>('.sheet-loading-summary');
    if (cacheText) {
      cacheText.textContent = getCachedSummary();
    }
    summary.textContent = getStatusSummary();

    sheetTabsBar.replaceChildren(...getSheetTabs().map(sheet => {
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = `sheet-tab${sheetIndex === sheet.id ? ' active' : ''}`;
      button.title = sheet.name;
      button.textContent = sheet.name;
      button.setAttribute('aria-pressed', sheetIndex === sheet.id ? 'true' : 'false');
      button.addEventListener('click', () => handleSheet(sheet.id));
      return button;
    }));
    renderImages();
  };

  const setLoading = (value: boolean) => {
    loadingState = value;
    renderChrome();
  };

  const emitWorker = (type: string, payload: Record<string, unknown>) => {
    setLoading(true);
    controller.emit(type, payload);
  };

  const applyRowHeight = (row: VirtualSheetState['rows'][number], baseHeight: number) => {
    row.__baseHeight = baseHeight;
    row._height = scaleRowHeight(baseHeight);
  };

  const syncScaledRowHeights = () => {
    virtualState.rowHeightCache.forEach((height, rowIndex) => {
      const row = virtualState.rows[rowIndex];
      if (row) {
        applyRowHeight(row, height);
      }
    });
  };

  const setZoom = (scale: number) => {
    zoom = clampZoom(scale);
    syncScaledRowHeights();
    syncTableLayout();
    zoomEmitter.emit();
    renderChrome();
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

  const syncWindowStats = () => {
    loadedWindowCount = virtualState.loadedWindows.size;
    loadingWindowCount = virtualState.loadingWindows.size;
    renderChrome();
  };

  const syncImageViewport = () => {
    imageViewportState = {
      scrollX: table?.ctx.scrollX || 0,
      scrollY: table?.ctx.scrollY || 0,
      width: tableHost.clientWidth || 0,
      height: tableHost.clientHeight || 0,
    };
    renderImages();
  };

  const buildTableView = () => ({
    config: createTableConfig({
      hostHeight: getHostHeight(),
      sheetDefaults,
      virtualState,
      zoomScale: zoom,
    }),
    columns: getDisplayColumns(virtualState.columns, zoom),
  });

  const resetViewportTracking = () => {
    viewportRange = { start: 0, end: 0 };
    scrollDirection = 1;
    lastScrollY = 0;
  };

  const ensureViewportWindows = (startRow: number, endRow: number) => {
    if (!virtualState.active || !virtualState.totalRows) {
      return;
    }

    collectWindowStarts({
      startRow,
      endRow,
      direction: scrollDirection,
      totalRows: virtualState.totalRows,
    }).forEach(windowStart => requestWindow(windowStart, true));
  };

  const scheduleViewportLoad = () => {
    if (!table || disposed) {
      return;
    }
    if (scrollFrame) {
      cancelAnimationFrame(scrollFrame);
    }
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      if (!table || !virtualState.active || !virtualState.totalRows || disposed) {
        return;
      }

      const head = Math.max(table.ctx.body.headIndex || 0, 0);
      const tail = Math.max(table.ctx.body.tailIndex || head, head);
      const scrollY = table.ctx.scrollY || 0;
      scrollDirection = scrollY >= lastScrollY ? 1 : -1;
      lastScrollY = scrollY;
      viewportRange = { start: head, end: tail };
      syncImageViewport();
      ensureViewportWindows(head, tail);
    });
  };

  const ensureTable = () => {
    if (table) {
      return table;
    }

    table = new EVirtTable(tableHost, {
      data: [],
      columns: [],
      config: createTableConfig({
        hostHeight: getHostHeight(),
        sheetDefaults,
        virtualState,
        zoomScale: zoom,
      }),
    });
    table.on('onScrollX', scheduleViewportLoad);
    table.on('onScrollY', scheduleViewportLoad);
    table.on('resize', scheduleViewportLoad);

    return table;
  };

  const renderTable = (
    instance: EVirtTableInstance,
    columns = virtualState.columns,
    rows = virtualState.rows,
    resetScroll = false
  ) => {
    const view = {
      config: createTableConfig({
        hostHeight: getHostHeight(),
        sheetDefaults,
        virtualState,
        zoomScale: zoom,
      }),
      columns: getDisplayColumns(columns, zoom),
    };

    instance.loadConfig(view.config);
    instance.loadColumns(view.columns);
    instance.loadData(rows);
    instance.draw();
    syncImageViewport();

    if (resetScroll) {
      requestAnimationFrame(() => {
        instance.scrollTo(0, 0);
        instance.draw();
        syncImageViewport();
        scheduleViewportLoad();
      });
      return;
    }

    scheduleViewportLoad();
  };

  function syncTableLayout() {
    const instance = ensureTable();
    const { config, columns } = buildTableView();
    instance.loadConfig(config);
    if (virtualState.active && columns.length) {
      instance.loadColumns(columns);
    }
    instance.doLayout();
    instance.draw();
    syncImageViewport();
    scheduleViewportLoad();
  }

  function requestWindow(startRow = 0, silent = true) {
    const sheetId = getActiveSheetId();
    if (sheetId === undefined) {
      return;
    }

    const windowStart = clampWindowStart(startRow, virtualState.totalRows);
    if (virtualState.loadedWindows.has(windowStart) || virtualState.loadingWindows.has(windowStart)) {
      return;
    }

    virtualState.loadingWindows.add(windowStart);
    syncWindowStats();
    if (virtualState.active) {
      markWindowState(virtualState.rows, virtualState.totalRows, windowStart, RowState.Loading);
      table?.draw();
    }

    errorMessage = '';
    emitWorker('parseSheet', {
      sheet: sheetId,
      startRow: windowStart,
      pageSize: WINDOW_SIZE,
      sessionId: sheetSessionId,
    });

    if (silent) {
      loadingState = false;
      renderChrome();
    }
  }

  const initializeVirtualSheet = (ws: SheetModel) => {
    const meta = ws.meta;
    if (!meta) {
      return;
    }

    const { columns, dataKeys } = buildColumns(ws);
    virtualState = {
      ...createEmptyVirtualState(),
      active: true,
      totalRows: meta.totalRows,
      totalCols: meta.totalCols,
      indexOffset: detectIndexOffset(ws),
      defaults: ws.defaults,
      dataKeys,
      rows: buildRows(meta.totalRows),
      columns,
    };

    sheetDefaults = ws.defaults;
    totalRows = meta.totalRows;
    totalCols = meta.totalCols;
    syncWindowStats();

    queueMicrotask(() => {
      if (disposed) {
        return;
      }
      renderTable(ensureTable(), columns, virtualState.rows, true);
    });
  };

  const clearVirtualRow = (row: Record<string, unknown>) => {
    virtualState.dataKeys.forEach((key) => {
      delete row[key];
    });
  };

  const applyStructureRowHeights = (rowHeights: number | number[] | undefined) => {
    if (!Array.isArray(rowHeights)) {
      return;
    }

    rowHeights.forEach((rawHeight, absoluteRow) => {
      if (rawHeight === undefined) {
        return;
      }
      const row = virtualState.rows[absoluteRow];
      if (!row) {
        return;
      }
      const height = normalizeRowHeight(rawHeight, virtualState.defaults.rowHeight);
      applyRowHeight(row, height);
      virtualState.rowHeightCache.set(absoluteRow, height);
    });
  };

  const applyWindowRows = (ws: SheetModel) => {
    const meta = ws.meta;
    if (!meta) {
      return;
    }

    const rowIndexes: number[] = [];
    const endRow = Math.min(meta.endRow, virtualState.totalRows);
    for (let absoluteRow = meta.startRow; absoluteRow < endRow; absoluteRow += 1) {
      const row = virtualState.rows[absoluteRow];
      const relativeRow = absoluteRow - meta.startRow;
      if (!row) {
        continue;
      }

      clearVirtualRow(row);
      const data = ws.data?.[relativeRow] || [];
      data.forEach((value, colIndex) => {
        if (value === '' || value === null || value === undefined) {
          return;
        }
        row[getDataKey(colIndex)] = value;
      });

      const windowHeight = getRowHeight(ws.rowHeights, relativeRow, virtualState.defaults.rowHeight);
      const height = normalizeRowHeight(
        getRowHeight(ws.structure?.rowHeights, absoluteRow, windowHeight),
        virtualState.defaults.rowHeight
      );
      applyRowHeight(row, height);
      row[ROW_STATE_FIELD] = RowState.Loaded;
      virtualState.rowHeightCache.set(absoluteRow, height);
      rowIndexes.push(absoluteRow);
    }

    virtualState.windowRows.set(meta.startRow, rowIndexes);
  };

  const applyWindowCells = (ws: SheetModel) => {
    const meta = ws.meta;
    if (!meta) {
      return;
    }

    const keys: string[] = [];
    Object.entries(ws.cell || {}).forEach(([key, value]) => {
      const [row, col] = key.split('-').map(Number);
      const absoluteKey = displayCellKey(meta.startRow + row, col + 1);
      const style = normalizeCellStyle(value as { className?: string; style: any });
      if (!style) {
        return;
      }
      virtualState.cellCache.set(absoluteKey, style);
      keys.push(absoluteKey);
    });

    virtualState.windowCells.set(meta.startRow, keys);
  };

  const setSheetMerges = (merges: Array<{ row: number; col: number; rowspan: number; colspan: number }>) => {
    virtualState.mergeStartMap.clear();
    virtualState.mergeCoveredMap.clear();

    merges.forEach((merge) => {
      const startKey = displayCellKey(merge.row, merge.col + 1);
      virtualState.mergeStartMap.set(startKey, {
        ...merge,
        col: merge.col + 1,
      });

      for (let rowOffset = 0; rowOffset < merge.rowspan; rowOffset += 1) {
        for (let colOffset = 0; colOffset < merge.colspan; colOffset += 1) {
          if (rowOffset === 0 && colOffset === 0) {
            continue;
          }
          const coveredKey = displayCellKey(
            merge.row + rowOffset,
            merge.col + colOffset + 1
          );
          virtualState.mergeCoveredMap.set(coveredKey, true);
        }
      }
    });
  };

  const applySheetStructure = (ws: SheetModel) => {
    const structure = ws.structure;
    const mergeList = structure?.merge;
    if (mergeList) {
      setSheetMerges(mergeList);
    } else {
      const meta = ws.meta;
      if (meta && !virtualState.mergeStartMap.size) {
        setSheetMerges((ws.merge || []).map((merge) => ({
          ...merge,
          row: merge.row + meta.startRow,
        })));
      }
    }

    applyStructureRowHeights(structure?.rowHeights);
    if (structure?.images) {
      sheetImages = structure.images;
      const sheetId = getActiveSheetId();
      if (sheetId !== undefined) {
        sheetImageCache.set(sheetId, structure.images);
      }
    }
  };

  const applyVirtualWindow = (ws: SheetModel) => {
    const meta = ws.meta;
    if (!meta) {
      return;
    }

    if (!virtualState.active) {
      initializeVirtualSheet(ws);
    }

    applySheetStructure(ws);
    applyWindowRows(ws);
    applyWindowCells(ws);

    virtualState.loadedWindows.add(meta.startRow);
    virtualState.loadingWindows.delete(meta.startRow);
    syncWindowStats();
    hasInitialWindow = true;

    const activeSheetId = getActiveSheetId();
    if (activeSheetId !== undefined) {
      sheetStateCache.set(activeSheetId, virtualState);
    }

    table?.draw();
    loadingState = false;
    sheetInitializing = false;
    renderChrome();
    if (!hasNotifiedFirstPaint) {
      hasNotifiedFirstPaint = true;
      context?.onProgressiveRender?.();
    }

    const start = viewportRange.start || meta.startRow;
    const end = Math.max(viewportRange.end, meta.endRow - 1, meta.startRow);
    ensureViewportWindows(start, end);
  };

  const resetViewState = () => {
    errorMessage = '';
    totalRows = 0;
    totalCols = 0;
    sheetDefaults = { ...DEFAULT_SHEET_DEFAULTS };
    sheetImages = [];
    virtualState = createEmptyVirtualState();
    hasInitialWindow = false;
    resetViewportTracking();
    syncWindowStats();
    syncImageViewport();

    if (!table) {
      return;
    }
    table.loadColumns([]);
    table.loadData([]);
    table.scrollTo(0, 0);
    table.draw();
  };

  const cacheCurrentSheetState = () => {
    const sheetId = getActiveSheetId();
    if (sheetId === undefined || !virtualState.active) {
      return;
    }
    sheetStateCache.set(sheetId, virtualState);
  };

  const restoreCachedSheetState = (sheetId: number) => {
    const cached = sheetStateCache.get(sheetId);
    if (!cached) {
      return false;
    }

    cached.loadingWindows.clear();
    virtualState = cached;
    errorMessage = '';
    totalRows = cached.totalRows;
    totalCols = cached.totalCols;
    sheetDefaults = cached.defaults;
    sheetImages = sheetImageCache.get(sheetId) || [];
    hasInitialWindow = cached.loadedWindows.size > 0;
    sheetInitializing = !hasInitialWindow;
    syncWindowStats();

    queueMicrotask(() => {
      if (disposed) {
        return;
      }
      renderTable(ensureTable(), cached.columns, cached.rows);
      syncImageViewport();
    });

    return true;
  };

  const startSheetSession = () => {
    const sheetId = getActiveSheetId();
    if (sheetId === undefined) {
      loadingState = false;
      sheetInitializing = false;
      renderChrome();
      return;
    }

    sheetSessionId += 1;
    if (restoreCachedSheetState(sheetId)) {
      loadingState = false;
      renderChrome();
      return;
    }

    sheetInitializing = true;
    resetViewState();
    requestWindow(0, false);
  };

  function handleSheet(index: number) {
    if (sheetIndex === index) {
      scrollActiveSheetIntoView();
      return;
    }
    cacheCurrentSheetState();
    sheetIndex = index;
    renderChrome();
    startSheetSession();
    scrollActiveSheetIntoView();
  }

  const emitParseWorkbook = () => {
    emitWorker('parseWorkbook', { workbook: buffer });
  };

  controller.onWorkerEvent('sheets', ({ sheets: list }: { sheets: SheetDefinition[] }) => {
    sheets = list;
    const firstSheet = list.find((sheet: SheetDefinition) => !sheet.hidden) || list[0];
    if (firstSheet) {
      sheetIndex = firstSheet.id;
      renderChrome();
      startSheetSession();
      scrollActiveSheetIntoView();
      return;
    }
    sheetInitializing = false;
    loadingState = false;
    renderChrome();
  });

  controller.onWorkerEvent('parseSheet', ({ sessionId, sheet, sheetData: ws }) => {
    if (sessionId !== sheetSessionId || sheet !== getActiveSheetId()) {
      return;
    }
    applyVirtualWindow(ws as SheetModel);
  });

  controller.onWorkerEvent('parseError', ({ sessionId, startRow, message }) => {
    if (sessionId && sessionId !== sheetSessionId) {
      return;
    }

    sheetInitializing = false;
    loadingState = false;
    if (typeof startRow === 'number') {
      virtualState.loadingWindows.delete(startRow);
      syncWindowStats();
      if (virtualState.active) {
        markWindowState(virtualState.rows, virtualState.totalRows, startRow, RowState.Placeholder);
        table?.draw();
      }
    } else {
      virtualState.loadingWindows.clear();
      syncWindowStats();
    }
    errorMessage = message || 'Excel 解析失败';
    renderChrome();
  });

  controller.onWorkerError((event) => {
    sheetInitializing = false;
    loadingState = false;
    errorMessage = event.message || 'Excel Worker 运行失败';
    renderChrome();
  });

  context?.registerExportAdapter?.({
    print: false,
    exportHtml: false,
  });

  ensureTable();
  const ResizeObserverCtor = getTargetWindow(target)?.ResizeObserver ||
    (typeof ResizeObserver !== 'undefined' ? ResizeObserver : undefined);
  if (ResizeObserverCtor) {
    resizeObserver = new ResizeObserverCtor(() => {
      if (resizeFrame) {
        cancelAnimationFrame(resizeFrame);
      }
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        syncTableLayout();
      });
    });
    resizeObserver.observe(tableHost);
  }
  renderChrome();
  emitParseWorkbook();

  return {
    $el: root,
    unmount() {
      disposed = true;
      if (resizeFrame) {
        cancelAnimationFrame(resizeFrame);
      }
      if (scrollFrame) {
        cancelAnimationFrame(scrollFrame);
      }
      resizeObserver?.disconnect();
      resizeObserver = null;
      unregisterFileViewerZoomProvider(root);
      controller.destroy();
      table?.destroy();
      table = null;
      context?.registerExportAdapter?.(null);
    },
  };
};

export default renderFileViewerSpreadsheet;
