// Public browser-facing entrypoint.
//
// Keep this file as a compatibility barrel only: framework packages import from
// here, while implementation details live in the domain folders below
// (`source`, `rendering`, `viewer`, `features`, `lifecycle`, `platform`).
import type {
  FileRenderContext,
  FileViewerRenderedInstance,
} from './contracts/types';

export {
  DEFAULT_FILE_VIEWER_ARCHIVE_WORKER_PATH,
  DEFAULT_FILE_VIEWER_ARCHIVE_WASM_PATH,
  DEFAULT_FILE_VIEWER_CAD_DWF_WASM_PATH,
  DEFAULT_FILE_VIEWER_CAD_WASM_PATH,
  DEFAULT_FILE_VIEWER_CAD_WORKER_PATH,
  DEFAULT_FILE_VIEWER_DATA_SQL_WASM_URL,
  DEFAULT_FILE_VIEWER_DOCX_WORKER_JSZIP_PATH,
  DEFAULT_FILE_VIEWER_DOCX_WORKER_PATH,
  DEFAULT_FILE_VIEWER_RENDERER_ASSET_MANIFESTS,
  DEFAULT_FILE_VIEWER_SPREADSHEET_WORKER_PATH,
  DEFAULT_FILE_VIEWER_TYPST_COMPILER_WASM_URL,
  DEFAULT_FILE_VIEWER_TYPST_RENDERER_WASM_URL,
  DEFAULT_FILE_VIEWER_TYPST_RENDERER_WASM_PACKAGE_PATH,
  getFileViewerRendererAssetManifest,
  listFileViewerRendererAssetManifests,
  resolveFileViewerArchiveWasmUrl,
  resolveFileViewerArchiveWorkerUrl,
  resolveFileViewerAssetUrl,
  resolveFileViewerCadAssetUrls,
  resolveFileViewerDataSqlWasmUrl,
  resolveFileViewerDocxWorkerJsZipUrl,
  resolveFileViewerDocxWorkerUrl,
  resolveFileViewerRendererAssets,
  resolveFileViewerSpreadsheetWorkerUrl,
  resolveFileViewerTypstCompilerWasmUrl,
  resolveFileViewerTypstRendererWasmUrl,
} from './assets';
export {
  ARCHIVE_EXTENSIONS,
  DEFAULT_RENDERER_DEFINITIONS,
  DEFAULT_SUPPORTED_EXTENSIONS,
  IMAGE_EXTENSIONS,
  MODEL_EXTENSIONS,
  TEXT_EXTENSIONS,
} from './registry/formats';
export {
  DEFAULT_FILE_VIEWER_TEXT_CHUNK_OVERLAP,
  DEFAULT_FILE_VIEWER_TEXT_CHUNK_SIZE,
  DEFAULT_FILE_VIEWER_ZOOM_SCALE,
  buildFileViewerDocumentTextChunks,
  createEmptyFileViewerSearchState,
  createFileViewerZoomState,
  normalizeFileViewerAiOptions,
  normalizeFileViewerSearchOptions,
} from './features/document/model';
export {
  DEFAULT_FILE_VIEWER_SEARCH_ACTIVE_CLASS,
  DEFAULT_FILE_VIEWER_SEARCH_MATCH_CLASS,
  DEFAULT_FILE_VIEWER_SEARCH_MAX_MATCHES,
  applyFileViewerSearchState,
  cloneFileViewerSearchState,
  createFileViewerDomSearchController,
  createFileViewerDomSearchControllerActionHandlers,
  destroyFileViewerDomSearchController,
  observeFileViewerDomSearchController,
  runFileViewerDomSearchControllerAction,
  syncFileViewerDomSearchControllerState,
} from './features/document/search';
export type {
  FileViewerDocumentAnchorsTarget,
  FileViewerDomSearchController,
  FileViewerDomSearchControllerActionHandlers,
  FileViewerDomSearchControllerStateTarget,
  MutableFileViewerSearchState,
} from './features/document/search';
export {
  createFileViewerDocumentFeatureActions,
  createFileViewerDocumentFeatureControllerActionHandlers,
  createFileViewerDocumentChangeSnapshot,
  createFileViewerSearchChangeState,
  dispatchFileViewerLocationChange,
  dispatchFileViewerSearchChange,
  resolveFileViewerLocationChangeAnchor,
} from './features/document/events';
export type {
  CreateFileViewerDocumentChangeSnapshotInput,
  FileViewerDocumentFeatureActionOptions,
  DispatchFileViewerLocationChangeInput,
  DispatchFileViewerSearchChangeInput,
  FileViewerDocumentChangeSnapshot,
  FileViewerDocumentFeatureActions,
  FileViewerDocumentFeatureControllerActionHandlers,
  FileViewerDocumentFeatureSearchController,
  CreateFileViewerDocumentFeatureActionsInput,
  CreateFileViewerDocumentFeatureControllerActionHandlersInput,
  ResolveFileViewerLocationChangeAnchorInput,
} from './features/document/events';
export {
  applyFileViewerZoomState,
  clearFileViewerZoomControllerProvider,
  createFileViewerZoomChangeEmitter,
  createFileViewerZoomChangeState,
  cloneFileViewerZoomState,
  createFileViewerZoomController,
  createFileViewerZoomControllerActionHandlers,
  destroyFileViewerZoomController,
  observeFileViewerZoomController,
  refreshFileViewerZoomControllerProvider,
  runFileViewerZoomControllerAction,
  syncFileViewerZoomControllerState,
} from './features/document/zoom';
export type {
  FileViewerZoomController,
  FileViewerZoomControllerActionHandlers,
  MutableFileViewerZoomState,
} from './features/document/zoom';
export {
  DEFAULT_FILE_VIEWER_ANCHOR_EXCLUDE_SELECTOR,
  DEFAULT_FILE_VIEWER_ANCHOR_SELECTOR,
  DEFAULT_FILE_VIEWER_SCROLL_CONTAINER_CANDIDATE_SELECTOR,
  DEFAULT_FILE_VIEWER_SCROLL_CONTAINER_SELECTOR,
  DEFAULT_FILE_VIEWER_SCROLLABLE_OVERFLOW_VALUES,
  collectFileViewerDocumentAnchors,
  findFileViewerAnchorForElement,
  findFileViewerSearchProvider,
  findFileViewerZoomProvider,
  getCurrentFileViewerDocumentAnchor,
  getFileViewerScrollableRange,
  isFileViewerScrollableElement,
  registerFileViewerSearchProvider,
  registerFileViewerZoomProvider,
  resolveFileViewerScrollContainer,
  scrollToFileViewerDocumentAnchor,
  unregisterFileViewerSearchProvider,
  unregisterFileViewerZoomProvider,
} from './features/document/dom';
export {
  buildFileViewerRenderedHtmlDocument,
  buildExportHtmlDocument,
  collectDocumentStyles,
  prepareFileViewerRenderedContentForSnapshot,
  replaceFileViewerCanvasWithImages,
  resolveFileViewerPrintStyle,
  triggerFileViewerBlobDownload,
  triggerFileViewerUrlDownload,
  waitForFileViewerImages,
  waitForFileViewerNextPaint,
  waitForFileViewerPrintWindowReady,
} from './output/export';
export {
  DEFAULT_FILE_VIEWER_DOWNLOAD_FILENAME,
  DEFAULT_FILE_VIEWER_EXPORT_FILENAME,
  DEFAULT_FILE_VIEWER_PREVIEW_TITLE,
  FILE_VIEWER_OPERATION_ACTION_ERROR_PREFIXES,
  createFileViewerOperationActionHandlers,
  createFileViewerOriginalSourceState,
  createFileViewerOriginalSourceStateFromNormalizedSource,
  createFileViewerPublicOperationActionHandlers,
  executeFileViewerDownloadOperation,
  executeFileViewerExportHtmlOperation,
  executeFileViewerPrintOperation,
  hasFileViewerOriginalSource,
  resolveFileViewerDisplayFilename,
  resolveFileViewerOperationActionErrorMessage,
  resolveFileViewerOperationFilename,
  resolveFileViewerOriginalFilename,
} from './viewer/operations';
export type {
  CreateFileViewerOperationActionHandlersInput,
  FileViewerOperationActionErrorFormatter,
  FileViewerFileOperationType,
  FileViewerOperationActionErrorContext,
  FileViewerOperationActionErrorPrefixes,
  FileViewerOperationActionHandlers,
  FileViewerPublicOperationActionHandlers,
  ResolveFileViewerOperationActionErrorMessageInput,
} from './viewer/operations';
export { createRendererRegistry } from './registry/registry';
export {
  coreBrowserRendererHandlers,
  createFileViewerCoreRendererRegistry,
  fileViewerCoreRendererDispatcher,
  fileViewerCoreRendererRegistry,
  fileViewerCoreRendererRegistryBridge,
  missingFileViewerCoreRendererHandlers,
} from './renderers/index';
export const renderFileViewerAudio = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string
): Promise<FileViewerRenderedInstance> => {
  const { default: renderAudio } = await import('./renderers/audio');
  return renderAudio(buffer, target, type);
};
export const renderFileViewerArchive = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> => {
  const { default: renderArchive } = await import('./renderers/archive');
  return renderArchive(buffer, target, type, context);
};
export const renderFileViewerCad = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> => {
  const { default: renderCad } = await import('./renderers/cad');
  return renderCad(buffer, target, type, context);
};
export const renderFileViewerCode = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string
): Promise<FileViewerRenderedInstance> => {
  const { default: renderCode } = await import('./renderers/code');
  return renderCode(buffer, target, type);
};
export const renderFileViewerDataAsset = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> => {
  const { default: renderDataAsset } = await import('./renderers/data');
  return renderDataAsset(buffer, target, type, context);
};
export const renderFileViewerDrawing = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> => {
  const { default: renderDrawing } = await import('./renderers/drawing');
  return renderDrawing(buffer, target, type, context);
};
export const renderFileViewerEda = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> => {
  const { default: renderEda } = await import('./renderers/eda');
  return renderEda(buffer, target, type, context);
};
export const renderFileViewerEmail = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> => {
  const { default: renderEmail } = await import('./renderers/email');
  return renderEmail(buffer, target, type, context);
};
export const renderFileViewerEpub = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement
): Promise<FileViewerRenderedInstance> => {
  const { default: renderEpub } = await import('./renderers/epub');
  return renderEpub(buffer, target);
};
export const renderFileViewerGeo = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string
): Promise<FileViewerRenderedInstance> => {
  const { default: renderGeo } = await import('./renderers/geo');
  return renderGeo(buffer, target, type);
};
export const renderFileViewerImage = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string
): Promise<FileViewerRenderedInstance> => {
  const { default: renderImage } = await import('./renderers/image');
  return renderImage(buffer, target, type);
};
export const renderFileViewerMarkdown = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement
): Promise<FileViewerRenderedInstance> => {
  const { default: renderMarkdown } = await import('./renderers/markdown');
  return renderMarkdown(buffer, target);
};
export const renderFileViewerModel = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> => {
  const { default: renderModel } = await import('./renderers/model');
  return renderModel(buffer, target, type, context);
};
export const renderFileViewerOfd = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> => {
  const { default: renderOfd } = await import('./renderers/ofd');
  return renderOfd(buffer, target, context);
};
export const renderFileViewerOpenDocument = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string
): Promise<FileViewerRenderedInstance> => {
  const { default: renderOpenDocument } = await import('./renderers/openDocument');
  return renderOpenDocument(buffer, target, type);
};
export const renderFileViewerPdf = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> => {
  const { default: renderPdf } = await import('./renderers/pdf');
  return renderPdf(buffer, target, context);
};
export const renderFileViewerPptx = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> => {
  const { default: renderPptx } = await import('./renderers/pptx');
  return renderPptx(buffer, target, type, context);
};
export const renderFileViewerTypst = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> => {
  const { default: renderTypst } = await import('./renderers/typst');
  return renderTypst(buffer, target, type, context);
};
export const renderFileViewerUmd = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement
): Promise<FileViewerRenderedInstance> => {
  const { default: renderUmd } = await import('./renderers/umd');
  return renderUmd(buffer, target);
};
export const renderFileViewerVideo = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> => {
  const { default: renderVideo } = await import('./renderers/video');
  return renderVideo(buffer, target, type, context);
};
export const renderFileViewerWordDoc = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> => {
  const { default: renderWordDoc } = await import('./renderers/wordDoc');
  return renderWordDoc(buffer, target, context);
};
export const renderFileViewerWordDocx = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> => {
  const { default: renderWordDocx } = await import('./renderers/wordDocx');
  return renderWordDocx(buffer, target, context);
};
export const renderFileViewerSpreadsheet = async (
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> => {
  const { default: renderSpreadsheet } = await import('./renderers/spreadsheet');
  return renderSpreadsheet(buffer, target, type, context);
};
export {
  parseEdaFile,
} from './renderers/edaParser';
export type {
  EdaDiagnostic,
  EdaDiagnosticLevel,
  EdaDomainRole,
  EdaEntity,
  EdaFileType,
  EdaParseResult,
  EdaParserMode,
  EdaProperty,
  EdaStats,
  EdaStreamKind,
  EdaStreamView,
  EdaTreeNode,
} from './renderers/edaParser';
export {
  ADAPTER_PRINT_REQUIRED_EXTENSIONS,
  createUnsupportedAvailability,
  DEFAULT_OPERATION_AVAILABILITY,
  DOM_PRINTABLE_EXTENSIONS,
  getRendererAvailability,
  isDomPrintableExtension,
  isKnownNonPrintableExtension,
  needsDedicatedPrintAdapter,
  NON_PRINTABLE_EXTENSIONS,
  resolvePrintAvailability,
} from './registry/capabilities';
export {
  FILE_VIEWER_LIFECYCLE_HOOKS,
  FILE_VIEWER_BEFORE_OPERATION_ERROR_PREFIX,
  FILE_VIEWER_LIFECYCLE_HOOK_ERROR_MESSAGE_PREFIX,
  FILE_VIEWER_OPERATION_LABELS,
  buildFileViewerLifecycleContext,
  buildFileViewerLifecycleContextFromNormalizedSource,
  buildFileViewerOperationContext,
  buildFileViewerOperationContextFromLifecycleState,
  cloneFileViewerOperationAvailability,
  createFileViewerLifecycleActions,
  createFileViewerLifecycleStateController,
  createFileViewerPublicApi,
  createFileViewerToolbarActions,
  createFileViewerToolbarControllerActionHandlers,
  createFileViewerToolbarZoomSyncSnapshot,
  DEFAULT_FILE_VIEWER_LIFECYCLE_HOOK_ERROR_LOGGER,
  DEFAULT_FILE_VIEWER_OPERATION_ERROR_LOGGER,
  dispatchFileViewerLifecycleEvent,
  dispatchFileViewerOperationContextEvent,
  dispatchFileViewerOperationAvailabilityChange,
  dispatchFileViewerZoomChange,
  emitFileViewerComponentLifecycleEvent,
  getFileViewerBeforeOperationHooks,
  getFileViewerLifecycleHookName,
  hasVisibleFileViewerToolbarActions,
  isFileViewerZoomButtonDisabled,
  normalizeFileViewerToolbar,
  reportFileViewerLifecycleHookError,
  reportFileViewerOperationError,
  resolveFileViewerLifecycleFallbackSource,
  resolveFileViewerLifecycleHookErrorMessage,
  resolveFileViewerBeforeOperationErrorMessage,
  resolveFileViewerOperationAvailability,
  resolveFileViewerToolbarState,
  resolveFileViewerToolbarPosition,
  resolveVisibleFileViewerToolbar,
  runFileViewerActiveUnloadComplete,
  runFileViewerActiveUnloadStart,
  runFileViewerBeforeOperation,
  runFileViewerLifecycleHook,
  runFileViewerToolbarAvailabilitySync,
  runFileViewerToolbarZoomSync,
  serializeFileViewerContext,
} from './lifecycle/operations';
export type {
  BuildFileViewerOperationContextFromLifecycleStateInput,
  CreateFileViewerLifecycleActionsInput,
  DispatchFileViewerLifecycleEventInput,
  DispatchFileViewerOperationContextEventInput,
  DispatchFileViewerOperationAvailabilityChangeInput,
  DispatchFileViewerZoomChangeInput,
  FileViewerActiveUnloadState,
  FileViewerLifecycleActions,
  FileViewerLifecycleComponentEmit,
  FileViewerToolbarActions,
  FileViewerToolbarControllerActionHandlers,
  FileViewerToolbarZoomSyncSnapshot,
  FileViewerZoomButtonAction,
  FileViewerToolbarState,
  CreateFileViewerPublicApiInput,
  CreateFileViewerToolbarActionsInput,
  CreateFileViewerToolbarControllerActionHandlersInput,
  BuildFileViewerLifecycleContextFromNormalizedSourceInput,
  ResolveFileViewerBeforeOperationErrorMessageInput,
  ResolveFileViewerToolbarStateInput,
  RunFileViewerActiveUnloadCompleteInput,
  RunFileViewerActiveUnloadStartInput,
  RunFileViewerToolbarAvailabilitySyncInput,
  RunFileViewerToolbarZoomSyncInput,
} from './lifecycle/operations';
export {
  FALLBACK_FILE_VIEWER_LOADING_THEME,
  FILE_VIEWER_LOADING_THEME_MAP,
  applyFileViewerLoadingState,
  cloneFileViewerLoadingState,
  createFileViewerLoadingController,
  createFileViewerLoadingControllerActionHandlers,
  createFileViewerLoadingState,
  createFileViewerLoadingStyleVars,
  runFileViewerLoadingControllerAction,
  runFileViewerLoadingExtensionSync,
  resolveFileViewerLoadingTheme,
  syncFileViewerLoadingControllerState,
} from './viewer/loading';
export type {
  FileViewerLoadingController,
  FileViewerLoadingControllerActionHandlers,
  RunFileViewerLoadingExtensionSyncInput,
} from './viewer/loading';
export {
  createFileViewerLifecycleFacade,
} from './lifecycle/facade';
export type {
  BuildFileViewerLifecycleFacadeLoadStartStateInput,
  BuildFileViewerLifecycleFacadeRenderCompleteStateInput,
  CreateFileViewerLifecycleFacadeInput,
  FileViewerLifecycleFacade,
} from './lifecycle/facade';
export {
  getFileViewerOptionsSearchParam,
  normalizeFileViewerTheme,
  parseFileViewerOptions,
  sanitizeFileViewerOptions,
  serializeFileViewerOptions,
  setFileViewerOptionsSearchParam,
} from './config/options';
export {
  resolveFileViewerPresentationState,
} from './presentation/state';
export type {
  FileViewerPresentationState,
  ResolveFileViewerPresentationStateInput,
} from './presentation/state';
export {
  createFileViewerRendererDispatcher,
} from './rendering/dispatcher';
export {
  buildFileRenderContextFromLoadContext,
  applyFileViewerRenderSurfaceState,
  clearFileViewerRenderSurface,
  createFileRenderHandlerRendererSession,
  createFileRenderHandlerRegistry,
  createFileRenderHandlerLoader,
  createFileViewerRenderSurfaceActionHandlers,
  createFileViewerRenderReadinessTarget,
  createFileViewerRenderSurfaceState,
  createFileViewerRenderSurfaceStateTarget,
  createFileViewerRenderTarget,
  DEFAULT_FILE_VIEWER_RENDER_TARGET_CLASS,
  DEFAULT_FILE_VIEWER_RENDER_SESSION_DISPOSE_ERROR_LOGGER,
  FILE_VIEWER_RENDER_SESSION_DISPOSE_ERROR_MESSAGE,
  disposeActiveFileViewerRendererSession,
  disposeFileViewerRendered,
  disposeFileViewerRendererSession,
  removeFileViewerRenderTarget,
  reportFileViewerRenderSessionDisposeError,
  resetFileViewerRenderSurface,
  resolveFileViewerRenderSessionDisposeErrorMessage,
  runFileViewerRenderSurfaceClear,
  runFileViewerRenderSurfaceMount,
  renderFileViewerHandler,
} from './rendering/handler';
export type {
  CreateFileViewerRenderSurfaceActionHandlersInput,
  CreateFileViewerRenderReadinessTargetInput,
  CreateFileViewerRenderSurfaceStateTargetInput,
  FileViewerRenderSurfaceActionHandlers,
  FileViewerRenderSurfaceClearState,
  FileViewerRenderSurfaceState,
  FileViewerRenderSurfaceMountContext,
  FileViewerRenderSessionDisposeErrorLogger,
  MutableFileViewerRenderSurfaceState,
  ReportFileViewerRenderSessionDisposeErrorInput,
  ResetFileViewerRenderSurfaceInput,
  ResolveFileViewerRenderSessionDisposeErrorMessageInput,
  RunFileViewerRenderSurfaceClearInput,
  RunFileViewerRenderSurfaceMountInput,
} from './rendering/handler';
export {
  DEFAULT_FILE_VIEWER_SOURCE_FILENAME,
  decodeFilename,
  getExtension,
  normalizeFileExtension,
  normalizeFilename,
  resolveFileViewerSourceFilename,
  normalizeSource,
  readFileViewerBuffer,
  readFileViewerDataUrl,
  readFileViewerText,
  wrapFileViewerFileRef,
} from './source';
export type { FileViewerReadResult } from './source';
export {
  DEFAULT_FILE_VIEWER_STATE_THEME,
  DEFAULT_FILE_VIEWER_UNSUPPORTED_DESCRIPTION,
  FILE_VIEWER_PREVIEW_MESSAGES,
  createFileViewerEmptyState,
  createFileViewerErrorState,
  createFileViewerPreviewLoadingState,
  createFileViewerReadyState,
  createFileViewerUnsupportedState,
  formatFileViewerErrorMessage,
  normalizeFileViewerErrorMessage,
} from './viewer/state';
export type {
  FileViewerErrorMessageFormatter,
} from './viewer/state';
export {
  buildFileViewerWatermarkBackgroundImage,
  buildFileViewerWatermarkInlineStyle,
  buildFileViewerWatermarkStyle,
  buildFileViewerWatermarkSvg,
  normalizeFileViewerWatermark,
  resolveFileViewerWatermarkPresentationState,
} from './features/watermark';
export type {
  FileViewerWatermarkPresentationState,
  FileViewerWatermarkStyle,
} from './features/watermark';
export {
  cancelFileViewerPreviewRequest,
  DEFAULT_FILE_VIEWER_STREAMING_PDF_FILENAME,
  DEFAULT_FILE_VIEWER_PREVIEW_LOAD_ERROR_LOGGER,
  DEFAULT_PDF_RANGE_CHUNK_SIZE,
  FILE_VIEWER_PREVIEW_LOAD_ERROR_PREFIXES,
  FILE_VIEWER_REMOTE_MISSING_DATA_ERROR_MESSAGE,
  applyFileViewerEmptyPreviewState,
  applyFileViewerPreviewFilenameState,
  applyFileViewerPreviewSourceUrlState,
  applyFileViewerReadPreviewState,
  applyFileViewerRenderReadinessState,
  applyFileViewerPreviewRequestResetState,
  commitFileViewerEmptyPreviewResetState,
  commitFileViewerLoadStartState,
  commitFileViewerPreviewRequestStartState,
  commitFileViewerRenderCompleteState,
  commitFileViewerRemoteDownloadState,
  createFileViewerEmptyPreviewState,
  createFileViewerLoadStartState,
  createFileViewerPreviewStateTarget,
  createFileViewerSourceLoadingActionHandlers,
  createFileViewerReadPreviewState,
  createFileViewerPreviewRequestResetState,
  createFileViewerRenderCompleteState,
  createFileViewerRequestController,
  createFileViewerRequestScope,
  createFileViewerStreamingPdfPlaceholderFile,
  finalizeFileViewerPreviewLoadState,
  hasFileViewerPreviewSource,
  isFileViewerAbortError,
  isSameOriginUrl,
  normalizeFileViewerSourceUrl,
  normalizePdfStreamingMode,
  resolveFileViewerFileRefSourcePlan,
  resolveFileViewerLoadStartMessage,
  resolveFileViewerMissingRemoteDataErrorMessage,
  resolveFileViewerPreviewLoadErrorMessage,
  resolveFileViewerPreviewRequestReason,
  resolveFileViewerRemoteSourcePlan,
  resolveFileViewerPageHref,
  reportFileViewerMissingRemoteData,
  reportFileViewerPreviewLoadError,
  runFileViewerLocalFilePreview,
  runFileViewerPreviewComponentUnmount,
  runFileViewerPreviewRequest,
  runFileViewerPreviewSourceChange,
  runFileViewerRemoteFilePreview,
  runFileViewerReadAndRenderFile,
  runFileViewerStreamingPdfPreview,
  shouldStreamPdfUrl,
} from './source/loading';
export type {
  CreateFileViewerPreviewStateTargetInput,
  CreateFileViewerSourceLoadingActionHandlersInput,
  CreateFileViewerLoadStartStateInput,
  CreateFileViewerReadPreviewStateInput,
  CreateFileViewerRenderCompleteStateInput,
  CommitFileViewerEmptyPreviewResetStateInput,
  CancelFileViewerPreviewRequestInput,
  CommitFileViewerLoadStartStateInput,
  CommitFileViewerPreviewRequestStartStateInput,
  CommitFileViewerRenderCompleteStateInput,
  CommitFileViewerRemoteDownloadStateInput,
  FileViewerEmptyPreviewState,
  FileViewerMutableAccessor,
  FileViewerLocationLike,
  FileViewerFileRefSourcePlan,
  FileViewerLocalFilePreviewState,
  FileViewerLoadStartState,
  FileViewerPreviewLoadErrorKind,
  FileViewerPreviewLoadErrorPrefixes,
  FileViewerPreviewLoadErrorLogger,
  FileViewerPreviewComponentUnmountState,
  FileViewerPreviewRequestResetState,
  FileViewerSourceLoadingActionHandlers,
  FileViewerReadAndRenderFileState,
  FileViewerRenderCompleteState,
  FileViewerRenderReadinessState,
  FileViewerRemoteDownloadState,
  FileViewerRemoteFilePreviewErrorKind,
  FileViewerRemoteFilePreviewState,
  FileViewerRemoteFileDownloadInput,
  FileViewerReadPreviewState,
  FileViewerPreviewRequestRunState,
  FileViewerRemoteSourcePlan,
  FileViewerRequestController,
  FileViewerRequestScope,
  FileViewerStreamingPdfPreviewState,
  FinalizeFileViewerPreviewLoadStateInput,
  MutableFileViewerPreviewFilenameState,
  MutableFileViewerPreviewSourceUrlState,
  MutableFileViewerPreviewRequestState,
  MutableFileViewerPreviewState,
  MutableFileViewerRenderReadinessState,
  MutableFileViewerReadPreviewState,
  RunFileViewerLocalFilePreviewInput,
  RunFileViewerPreviewComponentUnmountInput,
  RunFileViewerPreviewRequestInput,
  RunFileViewerPreviewSourceChangeInput,
  RunFileViewerRemoteFilePreviewInput,
  RunFileViewerReadAndRenderFileInput,
  RunFileViewerStreamingPdfPreviewInput,
  ResolveFileViewerFileRefSourcePlanInput,
  ResolveFileViewerMissingRemoteDataErrorMessageInput,
  ResolveFileViewerPreviewLoadErrorMessageInput,
  ResolveFileViewerPreviewRequestReasonInput,
  ReportFileViewerMissingRemoteDataInput,
  ReportFileViewerPreviewLoadErrorInput,
} from './source/loading';
export { createViewer } from './viewer/createViewer';
export {
  WorkerRefImpl,
  createFileViewerWorkerController,
  refWorker,
} from './platform/worker';
export type {
  FileViewerRendererAssetDefinition,
  FileViewerRendererAssetKind,
  FileViewerRendererAssetManifest,
  FileViewerRendererAssetOptionPath,
  FileViewerRendererAssetTarget,
  ResolveFileViewerAssetUrlOptions,
  ResolveFileViewerRendererAssetsOptions,
  ResolvedFileViewerRendererAsset,
  ResolvedFileViewerCadAssetUrls,
} from './assets';
export type {
  BuildFileViewerLifecycleContextInput,
  BuiltFileViewerLifecycleContext,
  BuiltFileViewerOperationContext,
  FileViewerLifecycleStateController,
  FileViewerLifecycleHookErrorLogger,
  FileViewerOperationErrorLogger,
  ResolveFileViewerOperationAvailabilityInput,
  ReportFileViewerLifecycleHookErrorInput,
  ReportFileViewerOperationErrorInput,
  RunFileViewerBeforeOperationInput,
  SerializedFileViewerContext,
  ResolveFileViewerLifecycleHookErrorMessageInput,
} from './lifecycle/operations';
export type {
  FileViewerLoadingState,
  FileViewerLoadingTheme,
  MutableFileViewerLoadingState,
} from './viewer/loading';
export type {
  ExecuteFileViewerDownloadOperationInput,
  ExecuteFileViewerExportHtmlOperationInput,
  ExecuteFileViewerPrintOperationInput,
  FileViewerOperationExecutorBase,
  FileViewerOriginalSourceState,
  ResolveFileViewerOperationFilenameInput,
} from './viewer/operations';
export type {
  FileViewerSerializableCadOptions,
  FileViewerSerializableOptions,
  FileViewerSerializableToolbarOptions,
} from './config/options';
export type {
  CreateFileViewerRendererDispatcherOptions,
  FileViewerRendererDispatcher,
  FileViewerRendererHandlerEntry,
} from './rendering/dispatcher';
export type {
  CreateFileViewerRenderTargetOptions,
  CreateFileRenderHandlerRegistryOptions,
  CreateFileRenderHandlerLoaderOptions,
  DisposeFileViewerRendererSessionOptions,
  FileRenderHandlerRegistryResult,
  FileRenderHandlerRendererSession,
  RenderFileViewerHandlerInput,
} from './rendering/handler';
export type {
  FileViewerSearchProviderHost,
  ResolveFileViewerScrollContainerOptions,
  FileViewerZoomProviderHost,
} from './features/document/dom';
export type {
  CreateFileViewerDomSearchControllerOptions,
  FileViewerInternalSearchMatch,
} from './features/document/search';
export type {
  CreateFileViewerZoomControllerOptions,
  FileViewerZoomOperation,
} from './features/document/zoom';
export type { CreateViewerOptions } from './viewer/createViewer';
export type {
  BuildExportHtmlDocumentOptions,
  BuildFileViewerRenderedHtmlDocumentOptions,
} from './output/export';
export type {
  CreateFileViewerWorkerControllerOptions,
  FileViewerWorkerContext,
  FileViewerWorkerController,
  FileViewerWorkerErrorHook,
  FileViewerWorkerEventHandler,
  FileViewerWorkerFactory,
  FileViewerWorkerMessageHook,
  WorkerProvider,
  WorkerRef,
} from './platform/worker';
export type {
  FileViewerAiOptions,
  FileViewerArchiveOptions,
  FileViewerBeforeOperation,
  FileViewerCadDwfLineWeightMode,
  FileViewerCadOptions,
  FileViewerCadRenderer,
  FileViewerComponentEmits,
  FileViewerComponentEventMap,
  FileViewerComponentProps,
  FileViewerDocumentAnchor,
  FileViewerDocumentChunk,
  FileViewerDownloadOptions,
  FileViewerDocxOptions,
  FileViewerEvent,
  FileViewerEventHandler,
  FileViewerEventType,
  FileViewerExportHtmlOptions,
  FileViewerFileRef,
  FileRenderContext,
  FileRenderExportAdapter,
  FileRenderExportMode,
  FileRenderExportOptions,
  FileRenderHandler,
  FileRenderHandlerComposite,
  FileViewerInstance,
  FileViewerLifecycleContext,
  FileViewerLifecycleHooks,
  FileViewerLifecyclePhase,
  FileViewerOperationAvailability,
  FileViewerOperationContext,
  FileViewerOperationType,
  FileViewerOptions,
  FileViewerPdfOptions,
  FileViewerPrintOptions,
  FileViewerPublicApi,
  FileViewerRenderedInstance,
  FileViewerRenderStateKind,
  FileViewerRendererCategory,
  FileViewerSearchMatch,
  FileViewerSearchOptions,
  FileViewerSearchProvider,
  FileViewerSearchState,
  FileViewerSource,
  FileViewerSourceKind,
  FileViewerSpreadsheetOptions,
  FileViewerStateDescriptor,
  FileViewerStateTheme,
  FileViewerThemeMode,
  FileViewerToolbarOptions,
  FileViewerToolbarPosition,
  FileViewerTypstOptions,
  FileViewerWatermarkOptions,
  FileViewerZoomProvider,
  FileViewerZoomState,
  NormalizedFileViewerSource,
  RendererCapability,
  RendererDefinition,
  RendererPlugin,
  RendererLoadContext,
  RendererLoader,
  RendererRegistry,
  RendererSession,
  RenderSurface,
  ViewerCapabilityState,
  ViewerLifecycleContext,
  ViewerOperationContext,
} from './contracts/types';
