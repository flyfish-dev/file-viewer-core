// Imperative viewer composition root.
//
// `createViewer` wires source normalization, lifecycle hooks, renderer
// sessions, document features, watermarking, and public operations into a
// framework-neutral controller. Framework packages should wrap this API instead
// of reimplementing the orchestration.
import {
  createEmptyFileViewerSearchState,
} from '../features/document/model';
import {
  createFileViewerDocumentFeatureControllerActionHandlers,
} from '../features/document/events';
import { createFileViewerZoomController } from '../features/document/zoom';
import {
  DEFAULT_FILE_VIEWER_DOWNLOAD_FILENAME,
  DEFAULT_FILE_VIEWER_EXPORT_FILENAME,
  DEFAULT_FILE_VIEWER_PREVIEW_TITLE,
  createFileViewerOriginalSourceStateFromNormalizedSource,
  executeFileViewerDownloadOperation,
  executeFileViewerExportHtmlOperation,
  executeFileViewerPrintOperation,
  resolveFileViewerDisplayFilename,
  resolveFileViewerOperationFilename,
} from './operations';
import { getRendererAvailability, createUnsupportedAvailability } from '../registry/capabilities';
import {
  buildFileViewerLifecycleContextFromNormalizedSource,
  buildFileViewerOperationContext,
  runFileViewerBeforeOperation,
  runFileViewerLifecycleHook,
} from '../lifecycle/operations';
import { createRendererRegistry } from '../registry/registry';
import {
  applyFileViewerRenderSurfaceState,
  createFileViewerRenderSurfaceState,
} from '../rendering/handler';
import { createFileViewerRequestScope } from '../source/loading';
import { normalizeSource } from '../source';
import { buildFileViewerWatermarkInlineStyle } from '../features/watermark';
import type {
  FileRenderExportAdapter,
  FileViewerAiOptions,
  FileViewerDocumentAnchor,
  FileViewerDownloadOptions,
  FileViewerEventHandler,
  FileViewerExportHtmlOptions,
  FileViewerInstance,
  FileViewerLifecycleContext,
  FileViewerOperationType,
  FileViewerOptions,
  FileViewerPrintOptions,
  FileViewerSource,
  NormalizedFileViewerSource,
  RendererRegistry,
  RendererSession,
} from '../contracts/types';

export interface CreateViewerOptions {
  registry?: RendererRegistry;
  options?: FileViewerOptions;
  signal?: AbortSignal;
  onEvent?: FileViewerEventHandler;
}

const emitLifecycle = async (
  options: FileViewerOptions,
  onEvent: FileViewerEventHandler | undefined,
  phase: FileViewerLifecycleContext['phase'],
  source: NormalizedFileViewerSource,
  version: number,
  startedAt: number,
  reason?: FileViewerLifecycleContext['reason']
) => {
  const now = Date.now();
  const context = buildFileViewerLifecycleContextFromNormalizedSource({
    phase,
    source,
    version,
    timestamp: now,
    startedAt,
    reason,
  });

  await runFileViewerLifecycleHook(context, options.hooks, error => {
    throw error;
  });
  onEvent?.({ type: phase, payload: context });
};

export const createViewer = (
  container: HTMLElement,
  createOptions: CreateViewerOptions = {}
): FileViewerInstance => {
  const registry = createOptions.registry || createRendererRegistry();
  let options = createOptions.options || {};
  let currentSource: NormalizedFileViewerSource | null = null;
  const renderSurfaceState = createFileViewerRenderSurfaceState<RendererSession>();
  const requestScope = createFileViewerRequestScope();
  const documentTarget = {
    anchors: { value: [] as FileViewerDocumentAnchor[] },
    state: createEmptyFileViewerSearchState(),
  };

  const buildCurrentLifecycleContext = () => {
    const source = currentSource || normalizeSource({});
    return buildFileViewerLifecycleContextFromNormalizedSource({
      phase: 'load-complete',
      source,
      version: requestScope.getCurrentVersion(),
      timestamp: Date.now(),
    });
  };

  const runBeforeViewerOperation = async (operation: FileViewerOperationType) => {
    const context = buildFileViewerOperationContext(operation, buildCurrentLifecycleContext());
    return runFileViewerBeforeOperation({
      context,
      options,
      onBefore: nextContext => {
        createOptions.onEvent?.({ type: 'operation-before', payload: nextContext });
      },
      onCancel: nextContext => {
        createOptions.onEvent?.({ type: 'operation-cancel', payload: nextContext });
      },
      onError(error) {
        throw error;
      },
    });
  };

  const getWatermarkInlineStyle = (override?: string) => {
    if (typeof override === 'string') {
      return override;
    }
    return buildFileViewerWatermarkInlineStyle(options.watermark);
  };

  const getCapabilitiesForExtension = (extension?: string) => {
    const targetExtension = extension || currentSource?.extension || '';
    const renderer = registry.getByExtension(targetExtension);
    if (!renderer) {
      return createUnsupportedAvailability(targetExtension);
    }
    return getRendererAvailability(renderer, renderSurfaceState.session);
  };

  const emitOperationAvailabilityChange = () => {
    createOptions.onEvent?.({
      type: 'operation-availability-change',
      payload: getCapabilitiesForExtension(),
    });
  };

  const emitZoomChange = (state = zoomController.getState()) => {
    createOptions.onEvent?.({
      type: 'zoom-change',
      payload: state,
    });
  };

  const zoomController = createFileViewerZoomController({
    root: () => container,
    beforeZoom: runBeforeViewerOperation,
  });
  const documentActions = createFileViewerDocumentFeatureControllerActionHandlers({
    root: () => container,
    searchTarget: documentTarget,
    searchOptions: () => options.search,
    getAiOptions: () => options.ai,
    onSearchChange: state => {
      createOptions.onEvent?.({ type: 'search-change', payload: state });
    },
    onLocationChange: anchor => {
      createOptions.onEvent?.({ type: 'location-change', payload: anchor });
    },
  });
  zoomController.observe();

  const destroyCurrent = async (reason: FileViewerLifecycleContext['reason'] = 'replace') => {
    if (!currentSource) {
      return;
    }
    const source = currentSource;
    const startedAt = Date.now();
    const version = requestScope.getCurrentVersion();
    await emitLifecycle(options, createOptions.onEvent, 'unload-start', source, version, startedAt, reason);
    await renderSurfaceState.session?.destroy?.();
    currentSource = null;
    applyFileViewerRenderSurfaceState(renderSurfaceState, {
      session: null,
      exportAdapter: null,
    });
    await documentActions.clearDocumentState();
    zoomController.clearProvider();
    emitOperationAvailabilityChange();
    emitZoomChange();
    await emitLifecycle(options, createOptions.onEvent, 'unload-complete', source, version, startedAt, reason);
  };

  return {
    container,
    async load(source: FileViewerSource) {
      await destroyCurrent('replace');

      const normalized = normalizeSource(source);
      currentSource = normalized;
      const version = requestScope.requestController.createVersion();

      const renderer = registry.getByExtension(normalized.extension);
      const startedAt = Date.now();
      await emitLifecycle(options, createOptions.onEvent, 'load-start', normalized, version, startedAt);

      if (!renderer?.load) {
        applyFileViewerRenderSurfaceState(renderSurfaceState, { session: null });
        emitOperationAvailabilityChange();
        emitZoomChange();
        await emitLifecycle(options, createOptions.onEvent, 'load-complete', normalized, version, startedAt);
        return null;
      }

      const session = await renderer.load({
        source: normalized,
        surface: { container },
        options,
        signal: createOptions.signal,
        registerExportAdapter: adapter => {
          applyFileViewerRenderSurfaceState(renderSurfaceState, { exportAdapter: adapter });
        },
      });
      applyFileViewerRenderSurfaceState(renderSurfaceState, { session });
      zoomController.refreshProvider();
      await documentActions.refreshDocumentIndex({ notify: false });
      emitOperationAvailabilityChange();
      emitZoomChange();
      await emitLifecycle(options, createOptions.onEvent, 'load-complete', normalized, version, startedAt);
      return session;
    },
    async destroy(reason = 'component-unmount') {
      await destroyCurrent(reason);
      documentActions.destroyDocumentFeatures();
      zoomController.destroy();
    },
    updateOptions(nextOptions: Partial<FileViewerOptions>) {
      options = {
        ...options,
        ...nextOptions,
      };
    },
    getCapabilities(extension?: string) {
      return getCapabilitiesForExtension(extension);
    },
    getRenderer(extension?: string) {
      return registry.getByExtension(extension || currentSource?.extension || '');
    },
    getSource() {
      return currentSource;
    },
    registerExportAdapter(adapter: FileRenderExportAdapter | null) {
      applyFileViewerRenderSurfaceState(renderSurfaceState, { exportAdapter: adapter });
    },
    getExportAdapter() {
      return renderSurfaceState.exportAdapter;
    },
    async download(downloadOptions: FileViewerDownloadOptions = {}) {
      const source = createFileViewerOriginalSourceStateFromNormalizedSource(currentSource);
      await executeFileViewerDownloadOperation({
        source,
        filename: downloadOptions.filename || resolveFileViewerOperationFilename({
          source,
          fallback: DEFAULT_FILE_VIEWER_DOWNLOAD_FILENAME,
        }),
        beforeOperation: runBeforeViewerOperation,
      });
    },
    async exportHtml(exportOptions: FileViewerExportHtmlOptions = {}) {
      return executeFileViewerExportHtmlOperation({
        source: container,
        adapter: renderSurfaceState.exportAdapter,
        download: exportOptions.download,
        filename: exportOptions.filename || resolveFileViewerOperationFilename({
          filename: resolveFileViewerDisplayFilename(currentSource),
          fallback: DEFAULT_FILE_VIEWER_EXPORT_FILENAME,
        }),
        title: exportOptions.title || resolveFileViewerOperationFilename({
          filename: resolveFileViewerDisplayFilename(currentSource),
          fallback: DEFAULT_FILE_VIEWER_PREVIEW_TITLE,
        }),
        watermarkInlineStyle: getWatermarkInlineStyle(exportOptions.watermarkInlineStyle),
        beforeOperation: runBeforeViewerOperation,
      });
    },
    async print(printOptions: FileViewerPrintOptions = {}) {
      await executeFileViewerPrintOperation({
        source: container,
        adapter: renderSurfaceState.exportAdapter,
        autoPrint: printOptions.autoPrint,
        openWindow: printOptions.openWindow,
        printWindow: printOptions.printWindow,
        title: printOptions.title || resolveFileViewerOperationFilename({
          filename: resolveFileViewerDisplayFilename(currentSource),
          fallback: DEFAULT_FILE_VIEWER_PREVIEW_TITLE,
        }),
        watermarkInlineStyle: getWatermarkInlineStyle(printOptions.watermarkInlineStyle),
        printAvailable: getCapabilitiesForExtension().print,
        beforeOperation: runBeforeViewerOperation,
      });
    },
    async zoomIn() {
      const state = await zoomController.zoomIn();
      emitZoomChange(state);
      return state;
    },
    async zoomOut() {
      const state = await zoomController.zoomOut();
      emitZoomChange(state);
      return state;
    },
    async resetZoom() {
      const state = await zoomController.resetZoom();
      emitZoomChange(state);
      return state;
    },
    getZoomState() {
      return zoomController.getState();
    },
    search(query: string) {
      return documentActions.searchDocument(query);
    },
    nextSearchResult() {
      return documentActions.nextSearchResult();
    },
    previousSearchResult() {
      return documentActions.previousSearchResult();
    },
    clearSearch() {
      return documentActions.clearDocumentSearch();
    },
    getSearchState() {
      return documentActions.getSearchState();
    },
    collectDocumentAnchors() {
      return documentActions.collectDocumentAnchors({ notify: false });
    },
    getCurrentDocumentAnchor() {
      return documentActions.getCurrentDocumentAnchor();
    },
    scrollToDocumentAnchor(anchor: FileViewerDocumentAnchor | string | number | null | undefined) {
      return documentActions.scrollToLoadedAnchor(anchor);
    },
    scrollToLine(line: number) {
      return documentActions.scrollToLine(line);
    },
    getDocumentTextChunks(textOptions?: boolean | FileViewerAiOptions) {
      return documentActions.getDocumentTextChunks(textOptions);
    },
  };
};
