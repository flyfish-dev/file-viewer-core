import { normalizeFileExtension } from '../source';
import { DEFAULT_RENDERER_DEFINITIONS } from '../registry/formats';
import type {
  FileViewerRenderStateKind,
  FileViewerRendererCategory,
  FileViewerStateDescriptor,
  FileViewerStateTheme,
  RendererDefinition,
} from '../contracts/types';

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

const rendererPackageById: Record<string, string> = {
  'office-word-openxml': '@file-viewer/renderer-word',
  'office-word-binary': '@file-viewer/renderer-word',
  'office-presentation': '@file-viewer/renderer-presentation',
  'open-document': '@file-viewer/renderer-word',
  'spreadsheet-openxml': '@file-viewer/renderer-spreadsheet',
  pdf: '@file-viewer/renderer-pdf',
  ofd: '@file-viewer/renderer-ofd',
  typst: '@file-viewer/renderer-typst',
  archive: '@file-viewer/renderer-archive',
  email: '@file-viewer/renderer-email',
  eda: '@file-viewer/renderer-eda',
  cad: '@file-viewer/renderer-cad',
  model: '@file-viewer/renderer-3d',
  geo: '@file-viewer/renderer-geo',
  drawing: '@file-viewer/renderer-drawing',
  mindmap: '@file-viewer/renderer-mindmap',
  epub: '@file-viewer/renderer-epub',
  umd: '@file-viewer/renderer-epub',
  image: '@file-viewer/renderer-image',
  markdown: '@file-viewer/renderer-text',
  code: '@file-viewer/renderer-text',
  video: '@file-viewer/renderer-media',
  audio: '@file-viewer/renderer-media',
  'data-asset': '@file-viewer/renderer-data',
};

const officeRendererIds = new Set([
  'office-word-openxml',
  'office-word-binary',
  'office-presentation',
  'open-document',
  'spreadsheet-openxml',
  'pdf',
  'ofd',
]);

const liteRendererIds = new Set([
  'image',
  'markdown',
  'code',
  'video',
  'audio',
]);

const engineeringRendererIds = new Set([
  'typst',
  'archive',
  'eda',
  'cad',
  'model',
  'geo',
  'drawing',
  'mindmap',
  'data-asset',
]);

const resolvePresetHint = (definition: RendererDefinition) => {
  if (officeRendererIds.has(definition.id)) {
    return {
      packageName: '@file-viewer/preset-office',
      vitePreset: 'office',
      label: 'Office preset',
    };
  }
  if (engineeringRendererIds.has(definition.id)) {
    return {
      packageName: '@file-viewer/preset-engineering',
      vitePreset: 'engineering',
      label: 'Engineering preset',
    };
  }
  if (liteRendererIds.has(definition.id)) {
    return {
      packageName: '@file-viewer/preset-lite',
      vitePreset: 'lite',
      label: 'Lite preset',
    };
  }
  return {
    packageName: '@file-viewer/preset-all',
    vitePreset: 'all',
    label: 'Full preset',
  };
};

export interface FileViewerRendererInstallHint {
  extension: string;
  rendererId: string;
  rendererLabel: string;
  rendererCategory: FileViewerRendererCategory;
  rendererPackage?: string;
  presetPackage: string;
  vitePreset: string;
  presetLabel: string;
}

export const resolveFileViewerRendererInstallHint = (
  extension = ''
): FileViewerRendererInstallHint | null => {
  const normalized = normalizeFileExtension(extension);
  const definition = DEFAULT_RENDERER_DEFINITIONS.find(item =>
    item.extensions.map(normalizeFileExtension).includes(normalized)
  );
  if (!definition) {
    return null;
  }
  const preset = resolvePresetHint(definition);
  return {
    extension: normalized,
    rendererId: definition.id,
    rendererLabel: definition.label,
    rendererCategory: definition.category,
    rendererPackage: rendererPackageById[definition.id],
    presetPackage: preset.packageName,
    vitePreset: preset.vitePreset,
    presetLabel: preset.label,
  };
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
  const installHint = resolveFileViewerRendererInstallHint(extension);
  if (installHint) {
    const rendererTip = installHint.rendererPackage
      ? `；如果需要极致裁剪，也可以只安装 ${installHint.rendererPackage}`
      : '';
    return createFileViewerStateDescriptor({
      state: 'unsupported',
      extension,
      title: '需要装配预览能力',
      message: `${label} 格式已在支持矩阵中，但当前项目尚未装配 ${installHint.rendererLabel} renderer。`,
      description: `推荐安装 ${installHint.presetPackage} 并启用 @file-viewer/vite-plugin（preset: '${installHint.vitePreset}' 或 preset: 'auto'）${rendererTip}，也可以通过 options.renderers 手动传入对应 renderer。`,
      theme,
      recoverable: true,
    });
  }

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
