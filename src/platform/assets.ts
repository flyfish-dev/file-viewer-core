import type {
  FileViewerArchiveOptions,
  FileViewerCadOptions,
  FileViewerDataOptions,
  FileViewerDocxOptions,
  FileViewerOptions,
  FileViewerSpreadsheetOptions,
  FileViewerTypstOptions,
} from '../contracts/types';

export const DEFAULT_FILE_VIEWER_ARCHIVE_WORKER_PATH = 'vendor/libarchive/worker-bundle.js';
export const DEFAULT_FILE_VIEWER_ARCHIVE_WASM_PATH = 'vendor/libarchive/libarchive.wasm';
export const DEFAULT_FILE_VIEWER_DOCX_WORKER_PATH = 'vendor/docx/docx.worker.js';
export const DEFAULT_FILE_VIEWER_SPREADSHEET_WORKER_PATH = 'vendor/xlsx/sheet.worker.js';
export const DEFAULT_FILE_VIEWER_CAD_WASM_PATH = 'wasm/cad/';
export const DEFAULT_FILE_VIEWER_CAD_WORKER_PATH = 'wasm/cad/dwg-worker.js';
export const DEFAULT_FILE_VIEWER_CAD_DWF_WASM_PATH = 'wasm/cad/dwfv-render.wasm';
export const DEFAULT_FILE_VIEWER_TYPST_COMPILER_WASM_URL =
  'wasm/typst/typst_ts_web_compiler_bg.wasm';
export const DEFAULT_FILE_VIEWER_TYPST_RENDERER_WASM_URL =
  'wasm/typst/typst_ts_renderer_bg.wasm';
export const FALLBACK_FILE_VIEWER_TYPST_COMPILER_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-web-compiler@0.7.0/pkg/typst_ts_web_compiler_bg.wasm';
export const FALLBACK_FILE_VIEWER_TYPST_RENDERER_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-renderer@0.7.0/pkg/typst_ts_renderer_bg.wasm';
export const DEFAULT_FILE_VIEWER_TYPST_COMPILER_WASM_PACKAGE_PATH =
  '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm';
export const DEFAULT_FILE_VIEWER_TYPST_RENDERER_WASM_PACKAGE_PATH =
  '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm';
export const DEFAULT_FILE_VIEWER_DATA_SQL_WASM_URL = 'wasm/data/sql-wasm.wasm';
export const DEFAULT_FILE_VIEWER_DATA_SQL_WASM_PACKAGE_PATH = 'sql.js/dist/sql-wasm.wasm';

export interface ResolveFileViewerAssetUrlOptions {
  baseUrl?: string;
  documentBaseUrl?: string;
  trimTrailingSlash?: boolean;
}

export interface ResolvedFileViewerCadAssetUrls {
  wasmPath: string;
  workerUrl: string;
  dwfWasmUrl: string;
}

export type FileViewerRendererAssetKind =
  | 'worker'
  | 'wasm'
  | 'wasm-directory'
  | 'script'
  | 'bundled-wasm';

export type FileViewerRendererAssetTarget = 'public' | 'bundled' | 'external';

export type FileViewerRendererAssetOptionPath =
  | 'archive.workerUrl'
  | 'archive.wasmUrl'
  | 'cad.wasmPath'
  | 'cad.workerUrl'
  | 'cad.dwfWasmUrl'
  | 'data.sqlWasmUrl'
  | 'docx.workerUrl'
  | 'spreadsheet.workerUrl'
  | 'typst.compilerWasmUrl'
  | 'typst.rendererWasmUrl';

export interface FileViewerRendererAssetDefinition {
  id: string;
  rendererId: string;
  kind: FileViewerRendererAssetKind;
  target: FileViewerRendererAssetTarget;
  required: boolean;
  defaultPath?: string;
  defaultUrl?: string;
  packagePath?: string;
  optionPath?: FileViewerRendererAssetOptionPath;
  description: string;
}

export interface FileViewerRendererAssetManifest {
  rendererId: string;
  assets: readonly FileViewerRendererAssetDefinition[];
}

export interface ResolvedFileViewerRendererAsset extends FileViewerRendererAssetDefinition {
  configured: boolean;
  url?: string;
  packagePath?: string;
}

export interface ResolveFileViewerRendererAssetsOptions extends ResolveFileViewerAssetUrlOptions {
  options?: FileViewerOptions | null;
}

export const DEFAULT_FILE_VIEWER_RENDERER_ASSET_MANIFESTS: readonly FileViewerRendererAssetManifest[] = [
  {
    rendererId: 'archive',
    assets: [
      {
        id: 'libarchive-worker',
        rendererId: 'archive',
        kind: 'worker',
        target: 'public',
        required: false,
        defaultPath: DEFAULT_FILE_VIEWER_ARCHIVE_WORKER_PATH,
        optionPath: 'archive.workerUrl',
        description: 'libarchive.js module worker used for broad archive format parsing.',
      },
      {
        id: 'libarchive-wasm',
        rendererId: 'archive',
        kind: 'wasm',
        target: 'public',
        required: false,
        defaultPath: DEFAULT_FILE_VIEWER_ARCHIVE_WASM_PATH,
        optionPath: 'archive.wasmUrl',
        description: 'libarchive.js WebAssembly module expected next to the public worker.',
      },
    ],
  },
  {
    rendererId: 'cad',
    assets: [
      {
        id: 'cad-wasm-directory',
        rendererId: 'cad',
        kind: 'wasm-directory',
        target: 'public',
        required: true,
        defaultPath: DEFAULT_FILE_VIEWER_CAD_WASM_PATH,
        optionPath: 'cad.wasmPath',
        description: '@flyfish-dev/cad-viewer WebAssembly directory for DWG/DXF helpers.',
      },
      {
        id: 'cad-dwg-worker',
        rendererId: 'cad',
        kind: 'worker',
        target: 'public',
        required: true,
        defaultPath: DEFAULT_FILE_VIEWER_CAD_WORKER_PATH,
        optionPath: 'cad.workerUrl',
        description: 'DWG worker entry used by @flyfish-dev/cad-viewer.',
      },
      {
        id: 'cad-dwf-wasm',
        rendererId: 'cad',
        kind: 'wasm',
        target: 'public',
        required: true,
        defaultPath: DEFAULT_FILE_VIEWER_CAD_DWF_WASM_PATH,
        optionPath: 'cad.dwfWasmUrl',
        description: 'DWF/DWFx/XPS raster WebAssembly module used by @flyfish-dev/cad-viewer.',
      },
    ],
  },
  {
    rendererId: 'office-word-openxml',
    assets: [
      {
        id: 'docx-worker',
        rendererId: 'office-word-openxml',
        kind: 'worker',
        target: 'public',
        required: false,
        defaultPath: DEFAULT_FILE_VIEWER_DOCX_WORKER_PATH,
        optionPath: 'docx.workerUrl',
        description: 'Optional DOCX worker for off-main-thread docx-preview parsing and HTML assembly.',
      },
    ],
  },
  {
    rendererId: 'spreadsheet-openxml',
    assets: [
      {
        id: 'spreadsheet-worker',
        rendererId: 'spreadsheet-openxml',
        kind: 'worker',
        target: 'public',
        required: false,
        defaultPath: DEFAULT_FILE_VIEWER_SPREADSHEET_WORKER_PATH,
        optionPath: 'spreadsheet.workerUrl',
        description: 'Optional Spreadsheet worker for off-main-thread styled-exceljs workbook parsing.',
      },
    ],
  },
  {
    rendererId: 'typst',
    assets: [
      {
        id: 'typst-compiler-wasm',
        rendererId: 'typst',
        kind: 'wasm',
        target: 'public',
        required: true,
        defaultPath: DEFAULT_FILE_VIEWER_TYPST_COMPILER_WASM_URL,
        packagePath: DEFAULT_FILE_VIEWER_TYPST_COMPILER_WASM_PACKAGE_PATH,
        optionPath: 'typst.compilerWasmUrl',
        description: 'Typst compiler WebAssembly module copied to the public assets directory.',
      },
      {
        id: 'typst-renderer-wasm',
        rendererId: 'typst',
        kind: 'wasm',
        target: 'public',
        required: true,
        defaultPath: DEFAULT_FILE_VIEWER_TYPST_RENDERER_WASM_URL,
        packagePath: DEFAULT_FILE_VIEWER_TYPST_RENDERER_WASM_PACKAGE_PATH,
        optionPath: 'typst.rendererWasmUrl',
        description: 'Typst SVG renderer WebAssembly module copied to the public assets directory.',
      },
    ],
  },
  {
    rendererId: 'data-asset',
    assets: [
      {
        id: 'data-sql-wasm',
        rendererId: 'data-asset',
        kind: 'wasm',
        target: 'public',
        required: false,
        defaultPath: DEFAULT_FILE_VIEWER_DATA_SQL_WASM_URL,
        packagePath: DEFAULT_FILE_VIEWER_DATA_SQL_WASM_PACKAGE_PATH,
        optionPath: 'data.sqlWasmUrl',
        description: 'sql.js WebAssembly module copied to the public assets directory for SQLite previews.',
      },
    ],
  },
];

const DEFAULT_FILE_VIEWER_DOCUMENT_BASE_URL = 'http://localhost/';

export const resolveFileViewerAssetUrl = (
  value: string | URL | undefined,
  fallback: string,
  options: ResolveFileViewerAssetUrlOptions = {}
) => {
  const raw = value ? String(value) : fallback;
  const documentBaseUrl = options.documentBaseUrl || DEFAULT_FILE_VIEWER_DOCUMENT_BASE_URL;
  const baseUrl = options.baseUrl
    ? options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`
    : documentBaseUrl;
  const resolvedBase = options.baseUrl
    ? new URL(baseUrl, documentBaseUrl).href
    : baseUrl;
  const resolved = new URL(raw, resolvedBase).href;

  return options.trimTrailingSlash ? resolved.replace(/\/+$/, '') : resolved;
};

export const resolveFileViewerArchiveWorkerUrl = (
  options?: Pick<FileViewerArchiveOptions, 'workerUrl'> | null,
  baseUrl?: string
) => {
  return resolveFileViewerAssetUrl(options?.workerUrl, DEFAULT_FILE_VIEWER_ARCHIVE_WORKER_PATH, { baseUrl });
};

export const resolveFileViewerArchiveWasmUrl = (
  options?: Pick<FileViewerArchiveOptions, 'wasmUrl'> | null,
  fallback = ''
) => {
  if (!options?.wasmUrl) {
    return fallback;
  }
  return resolveFileViewerAssetUrl(options.wasmUrl, fallback || options.wasmUrl);
};

export const resolveFileViewerCadAssetUrls = (
  options?: Pick<FileViewerCadOptions, 'wasmPath' | 'workerUrl' | 'dwfWasmUrl'> | null,
  documentBaseUrl?: string
): ResolvedFileViewerCadAssetUrls => {
  return {
    wasmPath: resolveFileViewerAssetUrl(options?.wasmPath, DEFAULT_FILE_VIEWER_CAD_WASM_PATH, {
      documentBaseUrl,
      trimTrailingSlash: true,
    }),
    workerUrl: resolveFileViewerAssetUrl(options?.workerUrl, DEFAULT_FILE_VIEWER_CAD_WORKER_PATH, {
      documentBaseUrl,
    }),
    dwfWasmUrl: resolveFileViewerAssetUrl(options?.dwfWasmUrl, DEFAULT_FILE_VIEWER_CAD_DWF_WASM_PATH, {
      documentBaseUrl,
    }),
  };
};

export const resolveFileViewerDocxWorkerUrl = (
  options?: Pick<FileViewerDocxOptions, 'workerUrl'> | null,
  documentBaseUrl?: string
) => {
  return resolveFileViewerAssetUrl(options?.workerUrl, DEFAULT_FILE_VIEWER_DOCX_WORKER_PATH, {
    documentBaseUrl,
  });
};

export const resolveFileViewerSpreadsheetWorkerUrl = (
  options?: Pick<FileViewerSpreadsheetOptions, 'workerUrl'> | null,
  documentBaseUrl?: string
) => {
  return resolveFileViewerAssetUrl(options?.workerUrl, DEFAULT_FILE_VIEWER_SPREADSHEET_WORKER_PATH, {
    documentBaseUrl,
  });
};

export const resolveFileViewerTypstCompilerWasmUrl = (
  options?: Pick<FileViewerTypstOptions, 'compilerWasmUrl'> | null,
  overrides: Array<string | undefined> = [],
  documentBaseUrl?: string
) => {
  return resolveFileViewerAssetUrl(
    options?.compilerWasmUrl || overrides.find(Boolean),
    DEFAULT_FILE_VIEWER_TYPST_COMPILER_WASM_URL,
    { documentBaseUrl }
  );
};

export const resolveFileViewerTypstRendererWasmUrl = (
  options?: Pick<FileViewerTypstOptions, 'rendererWasmUrl'> | null,
  overrides: Array<string | undefined> = [],
  documentBaseUrl?: string
) => {
  return resolveFileViewerAssetUrl(
    options?.rendererWasmUrl || overrides.find(Boolean),
    DEFAULT_FILE_VIEWER_TYPST_RENDERER_WASM_URL,
    { documentBaseUrl }
  );
};

export const resolveFileViewerDataSqlWasmUrl = (
  options?: Pick<FileViewerDataOptions, 'sqlWasmUrl'> | null,
  overrides: Array<string | undefined> = [],
  documentBaseUrl?: string
) => {
  return resolveFileViewerAssetUrl(
    options?.sqlWasmUrl || overrides.find(Boolean),
    DEFAULT_FILE_VIEWER_DATA_SQL_WASM_URL,
    { documentBaseUrl }
  );
};

export const listFileViewerRendererAssetManifests = () => {
  return [...DEFAULT_FILE_VIEWER_RENDERER_ASSET_MANIFESTS];
};

export const getFileViewerRendererAssetManifest = (rendererId: string) => {
  return DEFAULT_FILE_VIEWER_RENDERER_ASSET_MANIFESTS.find(manifest => manifest.rendererId === rendererId) || null;
};

const getRendererAssetOptionValue = (
  options: FileViewerOptions | null | undefined,
  optionPath: FileViewerRendererAssetOptionPath | undefined
) => {
  switch (optionPath) {
    case 'archive.workerUrl':
      return options?.archive?.workerUrl;
    case 'archive.wasmUrl':
      return options?.archive?.wasmUrl;
    case 'cad.wasmPath':
      return options?.cad?.wasmPath;
    case 'cad.workerUrl':
      return options?.cad?.workerUrl;
    case 'cad.dwfWasmUrl':
      return options?.cad?.dwfWasmUrl;
    case 'data.sqlWasmUrl':
      return options?.data?.sqlWasmUrl;
    case 'docx.workerUrl':
      return options?.docx?.workerUrl;
    case 'spreadsheet.workerUrl':
      return options?.spreadsheet?.workerUrl;
    case 'typst.compilerWasmUrl':
      return options?.typst?.compilerWasmUrl;
    case 'typst.rendererWasmUrl':
      return options?.typst?.rendererWasmUrl;
    default:
      return undefined;
  }
};

export const resolveFileViewerRendererAssets = (
  rendererId: string,
  resolveOptions: ResolveFileViewerRendererAssetsOptions = {}
): ResolvedFileViewerRendererAsset[] => {
  const manifest = getFileViewerRendererAssetManifest(rendererId);
  if (!manifest) {
    return [];
  }

  return manifest.assets.map(asset => {
    const optionValue = getRendererAssetOptionValue(resolveOptions.options, asset.optionPath);
    const raw = optionValue ? String(optionValue) : asset.defaultUrl || asset.defaultPath;
    const resolved: ResolvedFileViewerRendererAsset = {
      ...asset,
      configured: Boolean(optionValue),
    };

    if (raw) {
      resolved.url = resolveFileViewerAssetUrl(raw, raw, {
        baseUrl: resolveOptions.baseUrl,
        documentBaseUrl: resolveOptions.documentBaseUrl,
        trimTrailingSlash: asset.kind === 'wasm-directory' || resolveOptions.trimTrailingSlash,
      });
    }

    return resolved;
  });
};
