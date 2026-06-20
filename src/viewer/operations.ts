import {
  buildFileViewerRenderedHtmlDocument,
  triggerFileViewerBlobDownload,
  triggerFileViewerUrlDownload,
  waitForFileViewerPrintWindowReady,
} from '../output/export';
import { DEFAULT_FILE_VIEWER_SOURCE_FILENAME } from '../source';
import type { FileViewerErrorMessageFormatter } from './state';
import type {
  FileRenderExportAdapter,
  FileViewerDownloadOptions,
  FileViewerExportHtmlOptions,
  FileViewerOperationType,
  FileViewerPrintOptions,
  NormalizedFileViewerSource,
} from '../contracts/types';

export interface FileViewerOriginalSourceState {
  buffer?: ArrayBuffer | null;
  file?: File | Blob | null;
  url?: string | null;
  filename?: string | null;
  mimeType?: string | null;
}

export type CreateFileViewerOriginalSourceStateInput = FileViewerOriginalSourceState;

export const DEFAULT_FILE_VIEWER_PREVIEW_TITLE = 'file-viewer-preview';
export const DEFAULT_FILE_VIEWER_EXPORT_FILENAME = 'preview';
export const DEFAULT_FILE_VIEWER_DOWNLOAD_FILENAME = DEFAULT_FILE_VIEWER_SOURCE_FILENAME;

export interface ResolveFileViewerOperationFilenameInput {
  filename?: string | null;
  source?: FileViewerOriginalSourceState | null;
  fallback?: string;
}

export interface FileViewerOperationExecutorBase {
  beforeOperation?: (operation: FileViewerOperationType) => boolean | Promise<boolean>;
}

export interface ExecuteFileViewerDownloadOperationInput
  extends FileViewerOperationExecutorBase,
    FileViewerDownloadOptions {
  source: FileViewerOriginalSourceState;
  throwOnMissingSource?: boolean;
}

export interface ExecuteFileViewerExportHtmlOperationInput
  extends FileViewerOperationExecutorBase,
    FileViewerExportHtmlOptions {
  source: HTMLElement | null | undefined;
  adapter?: FileRenderExportAdapter | null;
}

export interface ExecuteFileViewerPrintOperationInput
  extends FileViewerOperationExecutorBase,
    FileViewerPrintOptions {
  source: HTMLElement | null | undefined;
  adapter?: FileRenderExportAdapter | null;
  printAvailable?: boolean;
}

export type FileViewerFileOperationType = Extract<FileViewerOperationType, 'download' | 'export-html' | 'print'>;

export interface FileViewerOperationActionErrorContext {
  operation: FileViewerFileOperationType;
  error: unknown;
}

export type FileViewerOperationActionErrorFormatter = FileViewerErrorMessageFormatter;

export type FileViewerOperationActionErrorPrefixes = Partial<Record<FileViewerFileOperationType, string>>;

export const FILE_VIEWER_OPERATION_ACTION_ERROR_PREFIXES = {
  download: '下载失败',
  print: '打印失败',
  'export-html': '导出 HTML 失败',
} as const satisfies Record<FileViewerFileOperationType, string>;

export interface ResolveFileViewerOperationActionErrorMessageInput {
  context: FileViewerOperationActionErrorContext;
  formatErrorMessage: FileViewerOperationActionErrorFormatter;
  prefixes?: FileViewerOperationActionErrorPrefixes;
}

export interface CreateFileViewerOperationActionHandlersInput extends FileViewerOperationExecutorBase {
  getBuffer?: () => ArrayBuffer | null | undefined;
  getFile?: () => File | Blob | null | undefined;
  getUrl?: () => string | null | undefined;
  getFilename: () => string | null | undefined;
  getMimeType?: () => string | null | undefined;
  getRenderedSource: () => HTMLElement | null | undefined;
  getAdapter?: () => FileRenderExportAdapter | null | undefined;
  getWatermarkInlineStyle?: () => string | null | undefined;
  getPrintAvailable?: () => boolean | undefined;
  onError?: (context: FileViewerOperationActionErrorContext) => void;
  formatErrorMessage?: FileViewerOperationActionErrorFormatter;
  errorPrefixes?: FileViewerOperationActionErrorPrefixes;
  onErrorMessage?: (message: string, context: FileViewerOperationActionErrorContext) => void;
}

export interface FileViewerOperationActionHandlers {
  downloadOriginalFile(): Promise<boolean | undefined>;
  exportRenderedHtml(): Promise<string | undefined>;
  printRenderedHtml(): Promise<boolean | undefined>;
}

export interface FileViewerPublicOperationActionHandlers {
  downloadOriginalFile(): Promise<void>;
  exportRenderedHtml(): Promise<void>;
  printRenderedHtml(): Promise<void>;
}

interface BuildRenderedHtmlDocumentFromOperationInput {
  source: HTMLElement | null | undefined;
  title?: string;
  filename?: string;
  adapter?: FileRenderExportAdapter | null;
  watermarkInlineStyle?: string;
}

const getBlobFilename = (file: File | Blob | null | undefined) => {
  return file && 'name' in file && typeof file.name === 'string' ? file.name : '';
};

const getBlobMimeType = (file: File | Blob | null | undefined) => {
  return file && typeof file.type === 'string' ? file.type : '';
};

export const createFileViewerOriginalSourceState = ({
  buffer = null,
  file = null,
  url = null,
  filename = null,
  mimeType = null,
}: CreateFileViewerOriginalSourceStateInput = {}): FileViewerOriginalSourceState => {
  return {
    buffer,
    file,
    url,
    filename,
    mimeType: mimeType || getBlobMimeType(file) || null,
  };
};

export const resolveFileViewerDisplayFilename = (
  source?: Pick<NormalizedFileViewerSource, 'filename'> | null,
  fallback = DEFAULT_FILE_VIEWER_EXPORT_FILENAME
) => {
  return source?.filename || fallback;
};

export const createFileViewerOriginalSourceStateFromNormalizedSource = (
  source?: NormalizedFileViewerSource | null,
  fallbackFilename = DEFAULT_FILE_VIEWER_EXPORT_FILENAME
): FileViewerOriginalSourceState => {
  return createFileViewerOriginalSourceState({
    buffer: source?.buffer,
    file: source?.file,
    url: source?.url,
    filename: resolveFileViewerDisplayFilename(source, fallbackFilename),
    mimeType: source?.file?.type,
  });
};

export const resolveFileViewerOriginalFilename = (
  source: FileViewerOriginalSourceState,
  fallback = 'preview'
) => {
  return source.filename || getBlobFilename(source.file) || fallback;
};

export const resolveFileViewerOperationFilename = ({
  filename,
  source,
  fallback = DEFAULT_FILE_VIEWER_PREVIEW_TITLE,
}: ResolveFileViewerOperationFilenameInput) => {
  return filename || (source ? resolveFileViewerOriginalFilename(source, '') : '') || fallback;
};

export const resolveFileViewerOperationActionErrorMessage = ({
  context,
  formatErrorMessage,
  prefixes,
}: ResolveFileViewerOperationActionErrorMessageInput) => {
  return formatErrorMessage(
    prefixes?.[context.operation] ?? FILE_VIEWER_OPERATION_ACTION_ERROR_PREFIXES[context.operation],
    context.error
  );
};

export const hasFileViewerOriginalSource = (source: FileViewerOriginalSourceState) => {
  return !!source.buffer || !!source.file || !!source.url;
};

const runBeforeOperation = async (
  beforeOperation: FileViewerOperationExecutorBase['beforeOperation'],
  operation: FileViewerOperationType
) => {
  if (!beforeOperation) {
    return true;
  }
  return await beforeOperation(operation);
};

const buildRenderedHtmlDocumentFromOperation = async (
  mode: 'export' | 'print',
  {
    source,
    title,
    filename,
    adapter = null,
    watermarkInlineStyle,
  }: BuildRenderedHtmlDocumentFromOperationInput
) => {
  if (!source) {
    throw new Error('当前没有可导出的预览内容');
  }

  return buildFileViewerRenderedHtmlDocument({
    source,
    mode,
    title: resolveFileViewerOperationFilename({
      filename: title || filename,
      fallback: DEFAULT_FILE_VIEWER_PREVIEW_TITLE,
    }),
    adapter,
    watermarkInlineStyle,
  });
};

export const executeFileViewerDownloadOperation = async ({
  source,
  filename,
  beforeOperation,
  throwOnMissingSource = true,
}: ExecuteFileViewerDownloadOperationInput) => {
  if (!hasFileViewerOriginalSource(source)) {
    if (throwOnMissingSource) {
      throw new Error('当前没有可下载的源文件');
    }
    return false;
  }

  if (!await runBeforeOperation(beforeOperation, 'download')) {
    return false;
  }

  const resolvedFilename = resolveFileViewerOperationFilename({
    filename,
    source,
    fallback: DEFAULT_FILE_VIEWER_DOWNLOAD_FILENAME,
  });

  if (source.buffer) {
    triggerFileViewerBlobDownload(
      new Blob([source.buffer], { type: source.mimeType || source.file?.type || 'application/octet-stream' }),
      resolvedFilename
    );
    return true;
  }

  if (source.file) {
    triggerFileViewerBlobDownload(source.file, resolvedFilename);
    return true;
  }

  triggerFileViewerUrlDownload(source.url as string, resolvedFilename);
  return true;
};

export const executeFileViewerExportHtmlOperation = async ({
  download = true,
  filename,
  beforeOperation,
  ...input
}: ExecuteFileViewerExportHtmlOperationInput) => {
  if (!await runBeforeOperation(beforeOperation, 'export-html')) {
    return '';
  }

  const html = await buildRenderedHtmlDocumentFromOperation('export', {
    ...input,
    filename,
  });

  if (download !== false) {
    const baseName = resolveFileViewerOperationFilename({
      filename: filename || input.title,
      fallback: DEFAULT_FILE_VIEWER_EXPORT_FILENAME,
    });
    triggerFileViewerBlobDownload(
      new Blob([html], { type: 'text/html;charset=utf-8' }),
      `${baseName}.rendered.html`
    );
  }

  return html;
};

export const executeFileViewerPrintOperation = async ({
  autoPrint = true,
  beforeOperation,
  openWindow,
  printAvailable = true,
  printWindow,
  ...input
}: ExecuteFileViewerPrintOperationInput) => {
  if (!printAvailable) {
    throw new Error('当前文件类型不支持完整打印，请下载原文件后在本地应用中打印');
  }

  if (!await runBeforeOperation(beforeOperation, 'print')) {
    return false;
  }

  const html = await buildRenderedHtmlDocumentFromOperation('print', input);
  const targetWindow = printWindow ||
    openWindow?.() ||
    (typeof window !== 'undefined' ? window.open('', '_blank') : null);

  if (!targetWindow) {
    throw new Error('浏览器拦截了打印窗口');
  }

  targetWindow.document.open();
  targetWindow.document.write(html);
  targetWindow.document.close();
  targetWindow.focus();
  await waitForFileViewerPrintWindowReady(targetWindow);

  if (autoPrint !== false) {
    targetWindow.print();
  }

  return true;
};

const handleFileViewerOperationActionError = (
  operation: FileViewerFileOperationType,
  error: unknown,
  {
    errorPrefixes,
    formatErrorMessage,
    onError,
    onErrorMessage,
  }: Pick<
    CreateFileViewerOperationActionHandlersInput,
    'errorPrefixes' | 'formatErrorMessage' | 'onError' | 'onErrorMessage'
  >
) => {
  const context = { operation, error };
  onError?.(context);
  if (formatErrorMessage && onErrorMessage) {
    onErrorMessage(resolveFileViewerOperationActionErrorMessage({
      context,
      formatErrorMessage,
      prefixes: errorPrefixes,
    }), context);
  }
};

export const createFileViewerOperationActionHandlers = ({
  getBuffer,
  getFile,
  getUrl,
  getFilename,
  getMimeType,
  getRenderedSource,
  getAdapter,
  getWatermarkInlineStyle,
  getPrintAvailable,
  beforeOperation,
  errorPrefixes,
  formatErrorMessage,
  onError,
  onErrorMessage,
}: CreateFileViewerOperationActionHandlersInput): FileViewerOperationActionHandlers => {
  const getOriginalSource = () => {
    const file = getFile?.() ?? null;
    return createFileViewerOriginalSourceState({
      buffer: getBuffer?.() ?? null,
      file,
      url: getUrl?.() ?? null,
      filename: getFilename(),
      mimeType: getMimeType?.() ?? getBlobMimeType(file),
    });
  };

  const getRenderedOperationInput = () => {
    const filename = getFilename() || undefined;
    return {
      source: getRenderedSource(),
      adapter: getAdapter?.() ?? null,
      title: filename,
      filename,
      watermarkInlineStyle: getWatermarkInlineStyle?.() ?? undefined,
      beforeOperation,
    };
  };

  return {
    async downloadOriginalFile() {
      try {
        return await executeFileViewerDownloadOperation({
          source: getOriginalSource(),
          beforeOperation,
          throwOnMissingSource: false,
        });
      } catch (error) {
        handleFileViewerOperationActionError('download', error, {
          errorPrefixes,
          formatErrorMessage,
          onError,
          onErrorMessage,
        });
        return undefined;
      }
    },
    async exportRenderedHtml() {
      try {
        return await executeFileViewerExportHtmlOperation(getRenderedOperationInput());
      } catch (error) {
        handleFileViewerOperationActionError('export-html', error, {
          errorPrefixes,
          formatErrorMessage,
          onError,
          onErrorMessage,
        });
        return undefined;
      }
    },
    async printRenderedHtml() {
      try {
        return await executeFileViewerPrintOperation({
          ...getRenderedOperationInput(),
          printAvailable: getPrintAvailable?.() ?? true,
        });
      } catch (error) {
        handleFileViewerOperationActionError('print', error, {
          errorPrefixes,
          formatErrorMessage,
          onError,
          onErrorMessage,
        });
        return undefined;
      }
    },
  };
};

export const createFileViewerPublicOperationActionHandlers = (
  input: CreateFileViewerOperationActionHandlersInput
): FileViewerPublicOperationActionHandlers => {
  const actions = createFileViewerOperationActionHandlers(input);

  return {
    async downloadOriginalFile() {
      await actions.downloadOriginalFile();
    },
    async exportRenderedHtml() {
      await actions.exportRenderedHtml();
    },
    async printRenderedHtml() {
      await actions.printRenderedHtml();
    },
  };
};
