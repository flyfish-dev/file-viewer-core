import { normalizeFileExtension } from '../source';
import type { FileViewerRenderStateKind, FileViewerStateDescriptor, FileViewerStateTheme } from '../contracts/types';

export type FileViewerErrorMessageFormatter = (prefix: string, error: unknown) => string;

export const FILE_VIEWER_PREVIEW_MESSAGES = Object.freeze({
  downloading: '正在下载文件资源...',
  streamingPdf: '正在建立 PDF 流式预览...',
  reading: '正在解析文件内容...',
});

export const DEFAULT_FILE_VIEWER_STATE_THEME: FileViewerStateTheme = Object.freeze({
  accent: '#5f6f82',
  soft: 'rgba(95, 111, 130, 0.12)',
  badge: 'DOC',
  label: '文件内容',
  hint: '正在整理内容结构并生成预览。',
});

export const DEFAULT_FILE_VIEWER_UNSUPPORTED_DESCRIPTION =
  '支持 Office、PDF、OFD、Typst、压缩包、邮件、OLB/DRA、CAD、地理数据、3D 模型、Excalidraw、draw.io、EPUB、UMD、Markdown、代码/文本、图片、音视频、字体和数据资产的在线预览';

const extensionLabel = (extension: string) => {
  const normalized = normalizeFileExtension(extension);
  return normalized ? `.${normalized}` : '当前';
};

const createFileViewerStateDescriptor = ({
  state,
  extension = '',
  title,
  message,
  description,
  theme = DEFAULT_FILE_VIEWER_STATE_THEME,
  recoverable,
}: {
  state: FileViewerRenderStateKind;
  extension?: string;
  title: string;
  message: string;
  description?: string;
  theme?: FileViewerStateTheme;
  recoverable: boolean;
}): FileViewerStateDescriptor => ({
  state,
  extension: normalizeFileExtension(extension),
  title,
  message,
  description,
  theme,
  recoverable,
});

export const createFileViewerPreviewLoadingState = (
  extension = '',
  message = FILE_VIEWER_PREVIEW_MESSAGES.reading,
  theme: FileViewerStateTheme = DEFAULT_FILE_VIEWER_STATE_THEME
) => createFileViewerStateDescriptor({
  state: 'loading',
  extension,
  title: theme.label,
  message,
  description: theme.hint,
  theme,
  recoverable: false,
});

export const createFileViewerReadyState = (
  extension = '',
  theme: FileViewerStateTheme = DEFAULT_FILE_VIEWER_STATE_THEME
) => createFileViewerStateDescriptor({
  state: 'ready',
  extension,
  title: '预览完成',
  message: '文件内容已完成渲染。',
  theme,
  recoverable: false,
});

export const createFileViewerEmptyState = (
  extension = '',
  theme: FileViewerStateTheme = DEFAULT_FILE_VIEWER_STATE_THEME
) => createFileViewerStateDescriptor({
  state: 'empty',
  extension,
  title: '暂无文件',
  message: '请选择文件或提供可访问的文件地址后开始预览。',
  theme,
  recoverable: true,
});

export const createFileViewerUnsupportedState = (
  extension = '',
  theme: FileViewerStateTheme = DEFAULT_FILE_VIEWER_STATE_THEME
) => {
  const label = extensionLabel(extension);
  return createFileViewerStateDescriptor({
    state: 'unsupported',
    extension,
    title: '暂不支持在线预览',
    message: `不支持${label}格式的在线预览，请下载后预览或转换为支持的格式。`,
    description: DEFAULT_FILE_VIEWER_UNSUPPORTED_DESCRIPTION,
    theme,
    recoverable: true,
  });
};

export const normalizeFileViewerErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

export const formatFileViewerErrorMessage: FileViewerErrorMessageFormatter = (prefix, error) => {
  return `${prefix}：${normalizeFileViewerErrorMessage(error)}`;
};

export const createFileViewerErrorState = (
  extension = '',
  error: unknown = '未知错误',
  theme: FileViewerStateTheme = DEFAULT_FILE_VIEWER_STATE_THEME
) => createFileViewerStateDescriptor({
  state: 'error',
  extension,
  title: '预览失败',
  message: normalizeFileViewerErrorMessage(error),
  theme,
  recoverable: true,
});
