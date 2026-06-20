// Rendering orchestration layer.
//
// This module adapts registry entries into disposable renderer sessions. It is
// the only place that should bridge raw buffers, DOM targets, render contexts,
// export adapters, and readiness state.
import { DEFAULT_RENDERER_DEFINITIONS } from '../registry/formats';
import { waitForFileViewerNextPaint } from '../output/export';
import { createFileViewerRendererDispatcher } from './dispatcher';
import type { FileViewerRendererDispatcher } from './dispatcher';
import { createRendererRegistry } from '../registry/registry';
import { getExtension, normalizeFileExtension } from '../source';
import {
  applyFileViewerRenderReadinessState,
  type FileViewerMutableAccessor,
  type MutableFileViewerRenderReadinessState,
} from '../source/loading';
import type {
  FileRenderExportAdapter,
  FileRenderContext,
  FileRenderHandler,
  FileViewerLifecycleContext,
  RendererDefinition,
  RendererLoadContext,
  RendererLoader,
  RendererRegistry,
  RendererSession,
} from '../contracts/types';

export const FILE_VIEWER_RENDER_SESSION_DISPOSE_ERROR_MESSAGE = '预览内容卸载失败';

export interface ResolveFileViewerRenderSessionDisposeErrorMessageInput {
  message?: string;
}

export type FileViewerRenderSessionDisposeErrorLogger = (message: string, error: unknown) => void;

export interface ReportFileViewerRenderSessionDisposeErrorInput
  extends ResolveFileViewerRenderSessionDisposeErrorMessageInput {
  error: unknown;
  onLogError?: FileViewerRenderSessionDisposeErrorLogger | null;
}

export interface RenderFileViewerHandlerInput<
  Rendered = unknown,
  Target extends HTMLElement = HTMLElement,
> {
  dispatcher: Pick<FileViewerRendererDispatcher<FileRenderHandler<Rendered, Target>>, 'resolve'>;
  buffer: ArrayBuffer;
  target: Target;
  type?: string;
  context?: FileRenderContext;
  throwOnMissingHandler?: boolean;
}

export interface CreateFileRenderHandlerLoaderOptions<
  Rendered = unknown,
  Target extends HTMLElement = HTMLElement,
> {
  handler: FileRenderHandler<Rendered, Target>;
  getTarget?: (context: RendererLoadContext) => Target;
  createContext?: (context: RendererLoadContext) => FileRenderContext;
  destroy?: (rendered: Rendered, context: RendererLoadContext) => void | Promise<void>;
}

export interface FileRenderHandlerRendererSession<Rendered = unknown> extends RendererSession {
  rendered: Rendered;
}

export interface DisposeFileViewerRendererSessionOptions {
  onError?: (error: unknown) => void;
}

export interface FileViewerRenderSurfaceState<
  Session extends RendererSession = RendererSession,
> {
  session: Session | null;
  exportAdapter: FileRenderExportAdapter | null;
}

export type MutableFileViewerRenderSurfaceState<
  Session extends RendererSession = RendererSession,
> = FileViewerRenderSurfaceState<Session>;

export interface CreateFileViewerRenderReadinessTargetInput {
  renderedReady: FileViewerMutableAccessor<boolean>;
  progressiveReady: FileViewerMutableAccessor<boolean>;
}

export interface CreateFileViewerRenderSurfaceStateTargetInput<
  Session extends RendererSession = RendererSession,
> {
  session: FileViewerMutableAccessor<Session | null>;
  exportAdapter: FileViewerMutableAccessor<FileRenderExportAdapter | null>;
}

export interface CreateFileViewerRenderTargetOptions {
  className?: string;
}

export interface ResetFileViewerRenderSurfaceInput<
  Session extends RendererSession = RendererSession,
> {
  surfaceState: MutableFileViewerRenderSurfaceState<Session>;
  readinessState: MutableFileViewerRenderReadinessState;
  container?: HTMLElement | null;
  disposeOptions?: DisposeFileViewerRendererSessionOptions;
}

export interface FileViewerRenderSurfaceMountContext<
  Session extends RendererSession = RendererSession,
> {
  buffer: ArrayBuffer;
  file: File;
  version: number;
  type: string;
  target: HTMLElement;
  filename: string;
  sourceUrl?: string;
  streamUrl?: string;
  onProgressiveRender: () => void;
  registerExportAdapter: (adapter: FileRenderExportAdapter | null) => void;
  surfaceState: MutableFileViewerRenderSurfaceState<Session>;
  readinessState: MutableFileViewerRenderReadinessState;
}

export interface RunFileViewerRenderSurfaceMountInput<
  Session extends RendererSession = RendererSession,
> {
  buffer: ArrayBuffer;
  file: File;
  version: number;
  sourceUrl?: string;
  streamUrl?: string;
  getContainer: () => HTMLElement | null | undefined;
  surfaceState: MutableFileViewerRenderSurfaceState<Session>;
  readinessState: MutableFileViewerRenderReadinessState;
  isCurrent: (version: number) => boolean;
  clearRenderedContent: (reason?: FileViewerLifecycleContext['reason']) => void;
  render: (context: FileViewerRenderSurfaceMountContext<Session>) => Promise<Session | undefined>;
  waitForContainer?: () => Promise<unknown> | unknown;
  waitForPaint?: () => Promise<unknown> | unknown;
  disposeSession?: (session?: Session | null) => void;
  onStartZoomObserver?: () => void;
  onRefreshDocumentIndex?: () => Promise<unknown> | unknown;
  onRefreshZoomProvider?: () => void;
}

export interface RunFileViewerRenderSurfaceClearInput<
  Session extends RendererSession = RendererSession,
  UnloadContext = FileViewerLifecycleContext | null,
> {
  reason?: FileViewerLifecycleContext['reason'];
  surfaceState: MutableFileViewerRenderSurfaceState<Session>;
  readinessState: MutableFileViewerRenderReadinessState;
  container?: HTMLElement | null;
  disposeOptions?: DisposeFileViewerRendererSessionOptions;
  onUnloadStart?: (reason: FileViewerLifecycleContext['reason']) => UnloadContext;
  onUnloadComplete?: (
    context: UnloadContext | undefined,
    reason: FileViewerLifecycleContext['reason']
  ) => void;
  onClearActiveDocumentContext?: () => void;
  onClearDocumentState?: () => void;
  onStopZoomObserver?: () => void;
  onClearZoomProvider?: () => void;
}

export interface FileViewerRenderSurfaceClearState<
  Session extends RendererSession = RendererSession,
  UnloadContext = FileViewerLifecycleContext | null,
> {
  reason: FileViewerLifecycleContext['reason'];
  unloadContext: UnloadContext | undefined;
  session: Session | null | undefined;
}

export interface FileViewerRenderSurfaceActionHandlers<
  Session extends RendererSession = RendererSession,
  UnloadContext = FileViewerLifecycleContext | null,
> {
  destroyRenderSession: (session?: Session | null) => void;
  setActiveRenderSession: (
    session: Session | null
  ) => MutableFileViewerRenderSurfaceState<Session>;
  clearRenderedContent: (
    reason?: FileViewerLifecycleContext['reason']
  ) => FileViewerRenderSurfaceClearState<Session, UnloadContext>;
  mountRenderedContent: (
    buffer: ArrayBuffer,
    file: File,
    version: number,
    sourceUrl?: string,
    streamUrl?: string
  ) => Promise<Session | undefined>;
}

export interface CreateFileViewerRenderSurfaceActionHandlersInput<
  Session extends RendererSession = RendererSession,
  UnloadContext = FileViewerLifecycleContext | null,
> {
  getContainer: () => HTMLElement | null | undefined;
  surfaceState: MutableFileViewerRenderSurfaceState<Session>;
  readinessState: MutableFileViewerRenderReadinessState;
  isCurrent: (version: number) => boolean;
  render: (context: FileViewerRenderSurfaceMountContext<Session>) => Promise<Session | undefined>;
  waitForContainer?: () => Promise<unknown> | unknown;
  waitForPaint?: () => Promise<unknown> | unknown;
  disposeOptions?: DisposeFileViewerRendererSessionOptions;
  onUnloadStart?: (reason: FileViewerLifecycleContext['reason']) => UnloadContext;
  onUnloadComplete?: (
    context: UnloadContext | undefined,
    reason: FileViewerLifecycleContext['reason']
  ) => void;
  onClearActiveDocumentContext?: () => void;
  onClearDocumentState?: () => void;
  onStartZoomObserver?: () => void;
  onStopZoomObserver?: () => void;
  onClearZoomProvider?: () => void;
  onRefreshDocumentIndex?: () => Promise<unknown> | unknown;
  onRefreshZoomProvider?: () => void;
}

export const DEFAULT_FILE_VIEWER_RENDER_TARGET_CLASS = 'file-render';

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> => {
  return !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function';
};

export const clearFileViewerRenderSurface = (container?: HTMLElement | null) => {
  if (!container) {
    return;
  }

  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
};

export const createFileViewerRenderTarget = (
  container: HTMLElement,
  options: CreateFileViewerRenderTargetOptions = {}
) => {
  const target = container.ownerDocument.createElement('div');
  target.className = options.className || DEFAULT_FILE_VIEWER_RENDER_TARGET_CLASS;
  container.appendChild(target);
  return target;
};

export const removeFileViewerRenderTarget = (
  container: HTMLElement,
  target: HTMLElement
) => {
  if (target.parentNode !== container) {
    return false;
  }

  container.removeChild(target);
  return true;
};

export const createFileViewerRenderSurfaceState = <
  Session extends RendererSession = RendererSession,
>(): FileViewerRenderSurfaceState<Session> => ({
  session: null,
  exportAdapter: null,
});

export const createFileViewerRenderReadinessTarget = ({
  renderedReady,
  progressiveReady,
}: CreateFileViewerRenderReadinessTargetInput): MutableFileViewerRenderReadinessState => {
  return {
    get renderedReady() {
      return renderedReady.get();
    },
    set renderedReady(value) {
      renderedReady.set(value);
    },
    get progressiveReady() {
      return progressiveReady.get();
    },
    set progressiveReady(value) {
      progressiveReady.set(value);
    },
  };
};

export const createFileViewerRenderSurfaceStateTarget = <
  Session extends RendererSession = RendererSession,
>({
  session,
  exportAdapter,
}: CreateFileViewerRenderSurfaceStateTargetInput<Session>): MutableFileViewerRenderSurfaceState<Session> => {
  return {
    get session() {
      return session.get();
    },
    set session(value) {
      session.set(value);
    },
    get exportAdapter() {
      return exportAdapter.get();
    },
    set exportAdapter(value) {
      exportAdapter.set(value);
    },
  };
};

export const applyFileViewerRenderSurfaceState = <
  Session extends RendererSession,
  Target extends MutableFileViewerRenderSurfaceState<Session>,
>(
  target: Target,
  state: Partial<FileViewerRenderSurfaceState<Session>>
) => {
  if ('session' in state) {
    target.session = state.session ?? null;
  }
  if ('exportAdapter' in state) {
    target.exportAdapter = state.exportAdapter ?? null;
  }

  return target;
};

export const createFileRenderHandlerRendererSession = <Rendered = unknown>(
  rendered: Rendered,
  destroy?: () => void | Promise<void>
): FileRenderHandlerRendererSession<Rendered> => ({
  rendered,
  destroy: () => {
    if (destroy) {
      return destroy();
    }
    return disposeFileViewerRendered(rendered);
  },
});

export interface CreateFileRenderHandlerRegistryOptions<
  Rendered = unknown,
  Target extends HTMLElement = HTMLElement,
> extends Omit<CreateFileRenderHandlerLoaderOptions<Rendered, Target>, 'handler'> {
  definitions?: readonly RendererDefinition[];
  handlers: Iterable<{
    rendererId: string;
    handler: FileRenderHandler<Rendered, Target>;
  }>;
}

export interface FileRenderHandlerRegistryResult<
  Rendered = unknown,
  Target extends HTMLElement = HTMLElement,
> {
  registry: RendererRegistry;
  dispatcher: FileViewerRendererDispatcher<FileRenderHandler<Rendered, Target>>;
  missingRendererIds: string[];
}

export const disposeFileViewerRendered = (rendered?: unknown) => {
  if (!rendered || typeof rendered !== 'object') {
    return;
  }

  const disposable = rendered as {
    unmount?: () => void | Promise<void>;
    $destroy?: () => void | Promise<void>;
    destroy?: () => void | Promise<void>;
  };

  if (typeof disposable.unmount === 'function') {
    return disposable.unmount();
  }
  if (typeof disposable.$destroy === 'function') {
    return disposable.$destroy();
  }
  if (typeof disposable.destroy === 'function') {
    return disposable.destroy();
  }
};

export const resolveFileViewerRenderSessionDisposeErrorMessage = ({
  message = FILE_VIEWER_RENDER_SESSION_DISPOSE_ERROR_MESSAGE,
}: ResolveFileViewerRenderSessionDisposeErrorMessageInput = {}) => message;

export const DEFAULT_FILE_VIEWER_RENDER_SESSION_DISPOSE_ERROR_LOGGER: FileViewerRenderSessionDisposeErrorLogger = (
  message,
  error
) => {
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(message, error);
  }
};

export const reportFileViewerRenderSessionDisposeError = ({
  error,
  onLogError = DEFAULT_FILE_VIEWER_RENDER_SESSION_DISPOSE_ERROR_LOGGER,
  ...messageInput
}: ReportFileViewerRenderSessionDisposeErrorInput) => {
  const message = resolveFileViewerRenderSessionDisposeErrorMessage(messageInput);
  onLogError?.(message, error);
  return message;
};

export const disposeFileViewerRendererSession = (
  session?: RendererSession | null,
  options: DisposeFileViewerRendererSessionOptions = {}
) => {
  if (!session?.destroy) {
    return;
  }

  const handleError = (error: unknown) => {
    options.onError?.(error);
  };

  try {
    const result = session.destroy();
    if (isPromiseLike(result)) {
      void Promise.resolve(result).catch(handleError);
    }
  } catch (error) {
    handleError(error);
  }
};

export const disposeActiveFileViewerRendererSession = <
  Session extends RendererSession,
  Target extends MutableFileViewerRenderSurfaceState<Session>,
>(
  target: Target,
  options: DisposeFileViewerRendererSessionOptions = {}
) => {
  const session = target.session;

  try {
    disposeFileViewerRendererSession(session, options);
  } finally {
    target.session = null;
  }

  return session;
};

export const resetFileViewerRenderSurface = <
  Session extends RendererSession,
>({
  surfaceState,
  readinessState,
  container,
  disposeOptions,
}: ResetFileViewerRenderSurfaceInput<Session>) => {
  const session = disposeActiveFileViewerRendererSession(surfaceState, disposeOptions) as Session | null;
  applyFileViewerRenderSurfaceState(surfaceState, { exportAdapter: null });
  applyFileViewerRenderReadinessState(readinessState, {
    renderedReady: false,
    progressiveReady: false,
  });
  clearFileViewerRenderSurface(container);
  return session;
};

export const runFileViewerRenderSurfaceClear = <
  Session extends RendererSession,
  UnloadContext = FileViewerLifecycleContext | null,
>({
  reason = 'replace',
  surfaceState,
  readinessState,
  container,
  disposeOptions,
  onUnloadStart,
  onUnloadComplete,
  onClearActiveDocumentContext,
  onClearDocumentState,
  onStopZoomObserver,
  onClearZoomProvider,
}: RunFileViewerRenderSurfaceClearInput<Session, UnloadContext>): FileViewerRenderSurfaceClearState<Session, UnloadContext> => {
  const unloadContext = onUnloadStart?.(reason);
  let session: Session | null | undefined;

  try {
    session = resetFileViewerRenderSurface<Session>({
      surfaceState,
      readinessState,
      container,
      disposeOptions,
    });
  } finally {
    onClearActiveDocumentContext?.();
    onClearDocumentState?.();
    onStopZoomObserver?.();
    onClearZoomProvider?.();
  }

  onUnloadComplete?.(unloadContext, reason);

  return {
    reason,
    unloadContext,
    session,
  };
};

export const runFileViewerRenderSurfaceMount = async <
  Session extends RendererSession,
>({
  buffer,
  file,
  version,
  sourceUrl,
  streamUrl,
  getContainer,
  surfaceState,
  readinessState,
  isCurrent,
  clearRenderedContent,
  render,
  waitForContainer,
  waitForPaint = waitForFileViewerNextPaint,
  disposeSession = disposeFileViewerRendererSession,
  onStartZoomObserver,
  onRefreshDocumentIndex,
  onRefreshZoomProvider,
}: RunFileViewerRenderSurfaceMountInput<Session>): Promise<Session | undefined> => {
  if (!getContainer()) {
    await waitForContainer?.();
  }

  const container = getContainer();
  if (!container || !isCurrent(version)) {
    return undefined;
  }

  clearRenderedContent('replace');

  const target = createFileViewerRenderTarget(container);
  onStartZoomObserver?.();
  await waitForContainer?.();
  await waitForPaint();

  if (!isCurrent(version)) {
    removeFileViewerRenderTarget(container, target);
    return undefined;
  }

  const registerExportAdapter = (adapter: FileRenderExportAdapter | null) => {
    applyFileViewerRenderSurfaceState(surfaceState, { exportAdapter: adapter });
  };

  const onProgressiveRender = () => {
    if (isCurrent(version)) {
      applyFileViewerRenderReadinessState(readinessState, { progressiveReady: true });
    }
  };

  try {
    const session = await render({
      buffer,
      file,
      version,
      type: getExtension(file.name),
      target,
      filename: file.name,
      sourceUrl,
      streamUrl,
      onProgressiveRender,
      registerExportAdapter,
      surfaceState,
      readinessState,
    });

    if (!isCurrent(version)) {
      disposeSession(session);
      removeFileViewerRenderTarget(container, target);
      return undefined;
    }

    void onRefreshDocumentIndex?.();
    onRefreshZoomProvider?.();
    return session;
  } catch (error) {
    removeFileViewerRenderTarget(container, target);
    throw error;
  }
};

export const createFileViewerRenderSurfaceActionHandlers = <
  Session extends RendererSession,
  UnloadContext = FileViewerLifecycleContext | null,
>({
  getContainer,
  surfaceState,
  readinessState,
  isCurrent,
  render,
  waitForContainer,
  waitForPaint,
  disposeOptions,
  onUnloadStart,
  onUnloadComplete,
  onClearActiveDocumentContext,
  onClearDocumentState,
  onStartZoomObserver,
  onStopZoomObserver,
  onClearZoomProvider,
  onRefreshDocumentIndex,
  onRefreshZoomProvider,
}: CreateFileViewerRenderSurfaceActionHandlersInput<Session, UnloadContext>): FileViewerRenderSurfaceActionHandlers<Session, UnloadContext> => {
  const handleDisposeError = (error: unknown) => {
    if (disposeOptions?.onError) {
      disposeOptions.onError(error);
      return;
    }
    reportFileViewerRenderSessionDisposeError({ error });
  };

  const mergedDisposeOptions: DisposeFileViewerRendererSessionOptions = {
    ...disposeOptions,
    onError: handleDisposeError,
  };

  const destroyRenderSession = (session?: Session | null) => {
    disposeFileViewerRendererSession(session, mergedDisposeOptions);
  };

  const setActiveRenderSession = (session: Session | null) => {
    return applyFileViewerRenderSurfaceState(surfaceState, { session });
  };

  const clearRenderedContent = (reason: FileViewerLifecycleContext['reason'] = 'replace') => {
    return runFileViewerRenderSurfaceClear<Session, UnloadContext>({
      reason,
      surfaceState,
      readinessState,
      container: getContainer(),
      disposeOptions: mergedDisposeOptions,
      onUnloadStart,
      onUnloadComplete,
      onClearActiveDocumentContext,
      onClearDocumentState,
      onStopZoomObserver,
      onClearZoomProvider,
    });
  };

  const mountRenderedContent = async (
    buffer: ArrayBuffer,
    file: File,
    version: number,
    sourceUrl?: string,
    streamUrl?: string
  ) => {
    return await runFileViewerRenderSurfaceMount<Session>({
      buffer,
      file,
      version,
      sourceUrl,
      streamUrl,
      getContainer,
      surfaceState,
      readinessState,
      isCurrent,
      clearRenderedContent,
      render,
      waitForContainer,
      waitForPaint,
      disposeSession: destroyRenderSession,
      onStartZoomObserver,
      onRefreshDocumentIndex,
      onRefreshZoomProvider,
    });
  };

  return {
    destroyRenderSession,
    setActiveRenderSession,
    clearRenderedContent,
    mountRenderedContent,
  };
};

export const buildFileRenderContextFromLoadContext = ({
  source,
  options,
  registerExportAdapter,
  renderContext,
}: RendererLoadContext): FileRenderContext => ({
  filename: source.filename,
  url: source.url,
  streamUrl: source.url,
  options,
  registerExportAdapter,
  ...renderContext,
});

export const renderFileViewerHandler = async <
  Rendered = unknown,
  Target extends HTMLElement = HTMLElement,
>({
  dispatcher,
  buffer,
  target,
  type = '',
  context,
  throwOnMissingHandler = false,
}: RenderFileViewerHandlerInput<Rendered, Target>) => {
  const normalizedType = normalizeFileExtension(type);
  const handler = dispatcher.resolve(normalizedType);

  if (!handler) {
    if (throwOnMissingHandler) {
      throw new Error(`No file viewer renderer is registered for "${normalizedType}".`);
    }
    return undefined;
  }

  return handler(buffer, target, normalizedType, context);
};

export const createFileRenderHandlerLoader = <
  Rendered = unknown,
  Target extends HTMLElement = HTMLElement,
>({
  handler,
  getTarget = context => context.surface.container as Target,
  createContext = buildFileRenderContextFromLoadContext,
  destroy,
}: CreateFileRenderHandlerLoaderOptions<Rendered, Target>): RendererLoader => {
  return async context => {
    const { source } = context;
    if (!source.buffer) {
      throw new Error('FileRenderHandler renderer requires an ArrayBuffer source.');
    }

    const target = getTarget(context);
    const rendered = await handler(
      source.buffer,
      target,
      source.extension,
      createContext(context)
    );

    return createFileRenderHandlerRendererSession(rendered, () => {
      if (destroy) {
        return destroy(rendered, context);
      }
      return disposeFileViewerRendered(rendered);
    });
  };
};

export const createFileRenderHandlerRegistry = <
  Rendered = unknown,
  Target extends HTMLElement = HTMLElement,
>({
  definitions = DEFAULT_RENDERER_DEFINITIONS,
  handlers,
  getTarget,
  createContext,
  destroy,
}: CreateFileRenderHandlerRegistryOptions<Rendered, Target>): FileRenderHandlerRegistryResult<Rendered, Target> => {
  const baseRegistry = createRendererRegistry(definitions);
  const dispatcher = createFileViewerRendererDispatcher<FileRenderHandler<Rendered, Target>>({
    registry: baseRegistry,
    handlers,
  });
  const definitionsWithLoaders = baseRegistry.list().map(definition => {
    const handler = dispatcher.handlersByRendererId.get(definition.id);
    if (!handler) {
      return definition;
    }

    return {
      ...definition,
      load: createFileRenderHandlerLoader({
        handler,
        getTarget,
        createContext,
        destroy,
      }),
    } satisfies RendererDefinition;
  });

  return {
    registry: createRendererRegistry(definitionsWithLoaders),
    dispatcher,
    missingRendererIds: dispatcher.missingRendererIds,
  };
};
