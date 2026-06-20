// Shared contracts for the whole core package.
//
// Keep this layer declarative: no DOM reads, renderer imports, or async loading
// should be introduced here. Higher layers depend on these contracts, never the
// other way around.
export type FileViewerSourceKind = 'file' | 'url' | 'buffer' | 'empty';

export type FileViewerThemeMode = 'light' | 'dark' | 'system';

export type FileViewerFileRef = File | Blob | ArrayBuffer;

export type FileViewerToolbarPosition = 'auto' | 'top' | 'bottom-right';

export type FileViewerLifecyclePhase = 'load-start' | 'load-complete' | 'unload-start' | 'unload-complete';

export type FileViewerOperationType = 'download' | 'print' | 'export-html' | 'zoom-in' | 'zoom-out' | 'zoom-reset';

export type FileViewerRenderStateKind = 'idle' | 'loading' | 'ready' | 'empty' | 'unsupported' | 'error';

export type FileViewerRendererCategory =
  | 'office'
  | 'document'
  | 'archive'
  | 'email'
  | 'eda'
  | 'cad'
  | 'model'
  | 'geo'
  | 'drawing'
  | 'ebook'
  | 'image'
  | 'markdown'
  | 'code'
  | 'media'
  | 'asset'
  | 'fallback';

export interface FileViewerWatermarkOptions {
  enabled?: boolean;
  text?: string;
  image?: string;
  opacity?: number;
  rotate?: number;
  gapX?: number;
  gapY?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
}

export interface FileViewerToolbarOptions {
  download?: boolean;
  print?: boolean;
  exportHtml?: boolean;
  zoom?: boolean;
  position?: FileViewerToolbarPosition;
  beforeOperation?: FileViewerBeforeOperation;
  beforeDownload?: FileViewerBeforeOperation;
  beforePrint?: FileViewerBeforeOperation;
  beforeExportHtml?: FileViewerBeforeOperation;
}

export interface FileViewerArchiveOptions {
  workerUrl?: string;
  wasmUrl?: string;
  workerTimeoutMs?: number;
  cache?: boolean;
  maxArchiveSize?: number;
  maxEntryPreviewSize?: number;
}

export interface FileViewerPdfOptions {
  toolbar?: boolean;
  navigation?: boolean;
  defaultNavigationVisible?: boolean;
  rotation?: number;
  streaming?: boolean | 'same-origin';
  rangeChunkSize?: number;
  withCredentials?: boolean;
  workerUrl?: string;
}

export interface FileViewerDocxOptions {
  worker?: boolean;
  workerUrl?: string;
  progressive?: boolean;
  visualPagination?: boolean;
  workerTimeout?: number;
}

export interface FileViewerSpreadsheetOptions {
  worker?: boolean;
  workerUrl?: string;
}

export type FileRenderExportMode = 'export' | 'print';

export interface FileRenderExportOptions {
  mode: FileRenderExportMode;
  title: string;
}

export interface FileRenderExportAdapter {
  print?: boolean;
  exportHtml?: boolean;
  includeDocumentStyles?: boolean;
  beforeSnapshot?: () => Promise<void> | void;
  printStyle?: string | ((options: FileRenderExportOptions) => Promise<string> | string);
  toHtml?: (options: FileRenderExportOptions) => Promise<string> | string;
}

export interface FileRenderContext {
  filename?: string;
  url?: string;
  streamUrl?: string;
  options?: FileViewerOptions;
  registerExportAdapter?: (adapter: FileRenderExportAdapter | null) => void;
  onProgressiveRender?: () => void;
  renderNestedBuffer?: (
    buffer: ArrayBuffer,
    type: string,
    target: HTMLDivElement,
    context?: FileRenderContext
  ) => Promise<FileViewerRenderedInstance | undefined>;
}

export type FileRenderHandler<
  Rendered = unknown,
  Target extends HTMLElement = HTMLElement,
> = (
  buffer: ArrayBuffer,
  target: Target,
  type?: string,
  context?: FileRenderContext
) => Promise<Rendered>;

export interface FileRenderHandlerComposite<
  Rendered = unknown,
  Target extends HTMLElement = HTMLElement,
> {
  accepts: Array<string>;
  handler: FileRenderHandler<Rendered, Target>;
}

/**
 * Framework-neutral instance returned by a renderer after it mounts content.
 *
 * Vue, React legacy, Web Components or imperative renderers may expose different
 * teardown names, but wrappers can share this single contract when bridging old
 * renderer handlers into the core registry.
 */
export type FileViewerRenderedInstance =
  | {
      $el?: Node;
      unmount: () => void | Promise<void>;
    }
  | {
      $el?: Node;
      $destroy: () => void | Promise<void>;
    }
  | {
      $el?: Node;
      destroy: () => void | Promise<void>;
    };

export interface FileViewerTypstOptions {
  compilerWasmUrl?: string;
  rendererWasmUrl?: string;
  renderTimeoutMs?: number;
}

export interface FileViewerDataOptions {
  sqlWasmUrl?: string;
}

export type FileViewerCadRenderer = 'auto' | 'webgl' | 'canvas2d';
export type FileViewerCadDwfLineWeightMode = 'adaptive' | 'physical' | 'hairline';

export interface FileViewerCadOptions {
  wasmPath?: string;
  workerUrl?: string | URL;
  dwfWasmUrl?: string;
  dxfEncoding?: string;
  useWorker?: boolean;
  workerTimeoutMs?: number;
  renderer?: FileViewerCadRenderer;
  preferDwgWasm?: boolean;
  includePaperSpace?: boolean;
  maxInsertDepth?: number;
  keepRaw?: boolean;
  preloadDwg?: boolean;
  dwfPreferWebgl?: boolean;
  dwfPreferWasm?: boolean;
  dwfBackground?: string;
  dwfMaxDevicePixelRatio?: number;
  dwfMaxCanvasPixels?: number;
  dwfMaxGpuCacheBytes?: number;
  dwfMaxCachedScenes?: number;
  dwfLineWeightMode?: FileViewerCadDwfLineWeightMode;
  dwfMinStrokeCssPx?: number;
  dwfMaxOverviewStrokeCssPx?: number;
  dwfMinTextCssPx?: number;
  dwfMinFilledAreaCssPx?: number;
  canvasOptions?: Record<string, unknown>;
}

export interface FileViewerSearchOptions {
  enabled?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  maxMatches?: number;
  debounce?: number;
  className?: string;
  activeClassName?: string;
}

export interface FileViewerAiOptions {
  enabled?: boolean;
  collectText?: boolean;
  maxTextLength?: number;
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface FileViewerOptions {
  theme?: FileViewerThemeMode;
  watermark?: boolean | FileViewerWatermarkOptions;
  toolbar?: boolean | FileViewerToolbarOptions;
  search?: boolean | FileViewerSearchOptions;
  ai?: boolean | FileViewerAiOptions;
  archive?: FileViewerArchiveOptions;
  pdf?: FileViewerPdfOptions;
  docx?: FileViewerDocxOptions;
  spreadsheet?: FileViewerSpreadsheetOptions;
  typst?: FileViewerTypstOptions;
  data?: FileViewerDataOptions;
  cad?: FileViewerCadOptions;
  hooks?: FileViewerLifecycleHooks;
  beforeOperation?: FileViewerBeforeOperation;
}

export interface FileViewerLifecycleContext {
  phase: FileViewerLifecyclePhase;
  type: string;
  filename: string;
  source: FileViewerSourceKind;
  url?: string;
  file?: File;
  size?: number;
  version: number;
  timestamp: number;
  duration?: number;
  reason?: 'replace' | 'reset' | 'component-unmount';
}

export interface FileViewerLifecycleHooks {
  onLoadStart?: (context: FileViewerLifecycleContext) => void | Promise<void>;
  onLoadComplete?: (context: FileViewerLifecycleContext) => void | Promise<void>;
  onUnloadStart?: (context: FileViewerLifecycleContext) => void | Promise<void>;
  onUnloadComplete?: (context: FileViewerLifecycleContext) => void | Promise<void>;
}

export interface FileViewerOperationContext extends Omit<FileViewerLifecycleContext, 'phase'> {
  operation: FileViewerOperationType;
  label: string;
}

export type FileViewerBeforeOperation = (
  context: FileViewerOperationContext
) => boolean | void | Promise<boolean | void>;

export interface FileViewerOperationAvailability {
  download: boolean;
  print: boolean;
  exportHtml: boolean;
  zoom: boolean;
  zoomIn: boolean;
  zoomOut: boolean;
  zoomReset: boolean;
}

export interface FileViewerStateTheme {
  accent: string;
  badge: string;
  hint: string;
  label: string;
  soft: string;
}

export interface FileViewerStateDescriptor {
  state: FileViewerRenderStateKind;
  extension: string;
  title: string;
  message: string;
  description?: string;
  theme: FileViewerStateTheme;
  recoverable: boolean;
}

export interface FileViewerZoomState {
  scale: number;
  label: string;
  canZoomIn: boolean;
  canZoomOut: boolean;
  canReset: boolean;
  minScale?: number;
  maxScale?: number;
}

export interface FileViewerZoomProvider {
  zoomIn: () => FileViewerZoomState | Promise<FileViewerZoomState>;
  zoomOut: () => FileViewerZoomState | Promise<FileViewerZoomState>;
  resetZoom: () => FileViewerZoomState | Promise<FileViewerZoomState>;
  setZoom?: (scale: number) => FileViewerZoomState | Promise<FileViewerZoomState>;
  getState: () => FileViewerZoomState;
  subscribe?: (listener: () => void) => () => void;
}

export interface FileViewerSearchMatch {
  id: string;
  index: number;
  text: string;
  anchor: FileViewerDocumentAnchor | null;
  line?: number;
  page?: number;
}

export interface FileViewerSearchState {
  query: string;
  total: number;
  currentIndex: number;
  current: FileViewerSearchMatch | null;
  matches: FileViewerSearchMatch[];
}

export interface FileViewerSearchProvider {
  search: (query: string, options?: FileViewerSearchOptions) => FileViewerSearchState | Promise<FileViewerSearchState>;
  next?: () => FileViewerSearchState | Promise<FileViewerSearchState>;
  previous?: () => FileViewerSearchState | Promise<FileViewerSearchState>;
  clear?: () => FileViewerSearchState | Promise<FileViewerSearchState>;
  getState?: () => FileViewerSearchState;
}

export interface FileViewerDocumentAnchor {
  id: string;
  index: number;
  line: number;
  type: 'page' | 'line' | 'block';
  label: string;
  text: string;
  page?: number;
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface FileViewerDocumentChunk {
  id: string;
  text: string;
  anchor: FileViewerDocumentAnchor;
  startLine: number;
  endLine: number;
}

export interface FileViewerComponentProps {
  file?: FileViewerFileRef;
  url?: string;
  options?: FileViewerOptions;
}

export interface FileViewerComponentEventMap {
  'load-start': FileViewerLifecycleContext;
  'load-complete': FileViewerLifecycleContext;
  'unload-start': FileViewerLifecycleContext;
  'unload-complete': FileViewerLifecycleContext;
  'operation-before': FileViewerOperationContext;
  'operation-cancel': FileViewerOperationContext;
  'operation-availability-change': FileViewerOperationAvailability;
  'search-change': FileViewerSearchState;
  'location-change': FileViewerDocumentAnchor | null;
  'zoom-change': FileViewerZoomState;
}

export type FileViewerEventType = keyof FileViewerComponentEventMap;

export type FileViewerEvent = {
  [EventType in FileViewerEventType]: {
    type: EventType;
    payload: FileViewerComponentEventMap[EventType];
  };
}[FileViewerEventType];

export type FileViewerEventHandler = (event: FileViewerEvent) => void;

export interface FileViewerComponentEmits {
  (event: 'load-start', context: FileViewerComponentEventMap['load-start']): void;
  (event: 'load-complete', context: FileViewerComponentEventMap['load-complete']): void;
  (event: 'unload-start', context: FileViewerComponentEventMap['unload-start']): void;
  (event: 'unload-complete', context: FileViewerComponentEventMap['unload-complete']): void;
  (event: 'operation-before', context: FileViewerComponentEventMap['operation-before']): void;
  (event: 'operation-cancel', context: FileViewerComponentEventMap['operation-cancel']): void;
  (event: 'operation-availability-change', availability: FileViewerComponentEventMap['operation-availability-change']): void;
  (event: 'search-change', state: FileViewerComponentEventMap['search-change']): void;
  (event: 'location-change', anchor: FileViewerComponentEventMap['location-change']): void;
  (event: 'zoom-change', state: FileViewerComponentEventMap['zoom-change']): void;
}

export interface FileViewerPublicApi {
  downloadOriginalFile(): Promise<void>;
  printRenderedHtml(): Promise<void>;
  exportRenderedHtml(): Promise<void>;
  zoomIn(): Promise<FileViewerZoomState>;
  zoomOut(): Promise<FileViewerZoomState>;
  resetZoom(): Promise<FileViewerZoomState>;
  getZoomState(): FileViewerZoomState;
  getOperationAvailability(): FileViewerOperationAvailability;
  getScrollContainer(): HTMLElement | null;
  searchDocument(query: string): Promise<FileViewerSearchState>;
  clearDocumentSearch(): Promise<FileViewerSearchState>;
  nextSearchResult(): Promise<FileViewerSearchState>;
  previousSearchResult(): Promise<FileViewerSearchState>;
  getSearchState(): FileViewerSearchState;
  collectDocumentAnchors(): Promise<FileViewerDocumentAnchor[]>;
  scrollToAnchor(anchor: FileViewerDocumentAnchor | string): Promise<boolean>;
  scrollToLine(line: number): Promise<boolean>;
  getDocumentTextChunks(): FileViewerDocumentChunk[];
}

export interface FileViewerDownloadOptions {
  filename?: string;
}

export interface FileViewerExportHtmlOptions {
  download?: boolean;
  filename?: string;
  title?: string;
  watermarkInlineStyle?: string;
}

export interface FileViewerPrintOptions {
  autoPrint?: boolean;
  openWindow?: () => Window | null;
  printWindow?: Window | null;
  title?: string;
  watermarkInlineStyle?: string;
}

export interface FileViewerSource {
  url?: string;
  file?: File | Blob;
  buffer?: ArrayBuffer;
  filename?: string;
  type?: string;
  size?: number;
}

export interface NormalizedFileViewerSource {
  kind: FileViewerSourceKind;
  filename: string;
  extension: string;
  url?: string;
  file?: File | Blob;
  buffer?: ArrayBuffer;
  size?: number;
}

export interface RenderSurface {
  container: HTMLElement;
  shadowRoot?: ShadowRoot;
}

export interface RendererCapability {
  download?: boolean;
  print?: boolean | 'adapter';
  exportHtml?: boolean | 'adapter';
  zoom?: boolean | 'provider';
  search?: boolean | 'provider';
}

export interface RendererDefinition {
  id: string;
  label: string;
  category: FileViewerRendererCategory;
  extensions: readonly string[];
  async?: boolean;
  capabilities?: RendererCapability;
  load?: RendererLoader;
}

export type RendererPlugin = RendererDefinition;

export type ViewerLifecycleContext = FileViewerLifecycleContext;

export type ViewerOperationContext = FileViewerOperationContext;

export type ViewerCapabilityState = FileViewerOperationAvailability;

export interface RendererLoadContext {
  source: NormalizedFileViewerSource;
  surface: RenderSurface;
  options: FileViewerOptions;
  signal?: AbortSignal;
  registerExportAdapter?: (adapter: FileRenderExportAdapter | null) => void;
  renderContext?: FileRenderContext;
}

export interface RendererSession {
  destroy?: () => void | Promise<void>;
  getAvailability?: () => Partial<FileViewerOperationAvailability>;
}

export type RendererLoader = (context: RendererLoadContext) => RendererSession | Promise<RendererSession>;

export interface RendererRegistry {
  register(definition: RendererDefinition): void;
  unregister(id: string): boolean;
  getById(id: string): RendererDefinition | undefined;
  getByExtension(extension: string): RendererDefinition | undefined;
  hasExtension(extension: string): boolean;
  list(): RendererDefinition[];
  listExtensions(): string[];
}

export interface FileViewerInstance {
  readonly container: HTMLElement;
  load(source: FileViewerSource): Promise<RendererSession | null>;
  destroy(reason?: FileViewerLifecycleContext['reason']): Promise<void>;
  updateOptions(options: Partial<FileViewerOptions>): void;
  getCapabilities(extension?: string): FileViewerOperationAvailability;
  getRenderer(extension?: string): RendererDefinition | undefined;
  getSource(): NormalizedFileViewerSource | null;
  registerExportAdapter(adapter: FileRenderExportAdapter | null): void;
  getExportAdapter(): FileRenderExportAdapter | null;
  download(options?: FileViewerDownloadOptions): Promise<void>;
  exportHtml(options?: FileViewerExportHtmlOptions): Promise<string>;
  print(options?: FileViewerPrintOptions): Promise<void>;
  zoomIn(): Promise<FileViewerZoomState>;
  zoomOut(): Promise<FileViewerZoomState>;
  resetZoom(): Promise<FileViewerZoomState>;
  getZoomState(): FileViewerZoomState;
  search(query: string): Promise<FileViewerSearchState>;
  nextSearchResult(): Promise<FileViewerSearchState>;
  previousSearchResult(): Promise<FileViewerSearchState>;
  clearSearch(): Promise<FileViewerSearchState>;
  getSearchState(): FileViewerSearchState;
  collectDocumentAnchors(): Promise<FileViewerDocumentAnchor[]>;
  getCurrentDocumentAnchor(): FileViewerDocumentAnchor | null;
  scrollToDocumentAnchor(anchor: FileViewerDocumentAnchor | string | number | null | undefined): boolean;
  scrollToLine(line: number): Promise<boolean>;
  getDocumentTextChunks(options?: boolean | FileViewerAiOptions): FileViewerDocumentChunk[];
}
