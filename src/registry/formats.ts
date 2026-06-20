import type { RendererDefinition } from '../contracts/types';

export const ARCHIVE_EXTENSIONS = [
  'zip', 'zipx', '7z', 'rar', 'tar', 'gz', 'gzip', 'tgz', 'bz2', 'bzip2', 'tbz', 'tbz2',
  'xz', 'txz', 'lzma', 'zst', 'tzst', 'cab', 'ar', 'cpio', 'iso', 'xar', 'lha', 'lzh',
  'jar', 'war', 'ear', 'apk', 'cbz', 'cbr',
] as const;

export const MODEL_EXTENSIONS = [
  'glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', 'dae', '3ds', '3mf', 'amf', 'usd', 'usda',
  'usdc', 'usdz', 'kmz', 'step', 'stp', 'iges', 'igs', 'ifc', '3dm', 'pcd', 'wrl',
  'vrml', 'xyz', 'vtk', 'vtp',
] as const;

export const TEXT_EXTENSIONS = [
  'txt', 'json', 'js', 'mjs', 'cjs', 'css', 'java', 'py', 'html', 'htm', 'jsx', 'ts',
  'tsx', 'xml', 'log', 'vue', 'yaml', 'yml', 'ini', 'sh', 'bash', 'sql', 'go', 'rs',
  'php', 'c', 'cpp', 'cc', 'h', 'hpp', 'cs', 'diff', 'jsonc', 'json5', 'ipynb', 'toml',
  'proto', 'hcl', 'tex', 'gv', 'http', 'react', 'rb', 'swift', 'kt',
] as const;

export const IMAGE_EXTENSIONS = [
  'gif', 'jpg', 'jpeg', 'bmp', 'tiff', 'tif', 'png', 'svg', 'webp', 'avif', 'ico',
  'heic', 'heif', 'jxl',
] as const;

export const DEFAULT_RENDERER_DEFINITIONS = [
  {
    id: 'office-word-openxml',
    label: 'Word OpenXML',
    category: 'office',
    extensions: ['docx', 'docm', 'dotx', 'dotm'],
    async: true,
    capabilities: { download: true, print: 'adapter', exportHtml: 'adapter', zoom: 'provider', search: true },
  },
  {
    id: 'office-word-binary',
    label: 'Word Binary',
    category: 'office',
    extensions: ['doc', 'dot'],
    async: true,
    capabilities: { download: true, print: 'adapter', exportHtml: 'adapter', zoom: 'provider', search: true },
  },
  {
    id: 'office-presentation',
    label: 'PowerPoint',
    category: 'office',
    extensions: ['pptx', 'pptm', 'potx', 'potm', 'ppsx', 'ppsm'],
    async: true,
    capabilities: { download: true, print: true, exportHtml: true, zoom: 'provider', search: true },
  },
  {
    id: 'open-document',
    label: 'Open Document',
    category: 'office',
    extensions: ['rtf', 'odt', 'odp'],
    async: true,
    capabilities: { download: true, print: true, exportHtml: true, zoom: 'provider', search: true },
  },
  {
    id: 'spreadsheet-openxml',
    label: 'Spreadsheet',
    category: 'office',
    extensions: ['xlsx', 'xltx', 'xlsm', 'xlsb', 'xls', 'xlt', 'xltm', 'csv', 'ods', 'fods', 'numbers'],
    async: true,
    capabilities: { download: true, print: false, exportHtml: false, zoom: 'provider', search: true },
  },
  {
    id: 'pdf',
    label: 'PDF',
    category: 'document',
    extensions: ['pdf'],
    async: true,
    capabilities: { download: true, print: 'adapter', exportHtml: 'adapter', zoom: 'provider', search: 'provider' },
  },
  {
    id: 'ofd',
    label: 'OFD',
    category: 'document',
    extensions: ['ofd'],
    async: true,
    capabilities: { download: true, print: true, exportHtml: true, zoom: 'provider', search: true },
  },
  {
    id: 'typst',
    label: 'Typst',
    category: 'document',
    extensions: ['typ', 'typst'],
    async: true,
    capabilities: { download: true, print: 'adapter', exportHtml: 'adapter', zoom: 'provider', search: true },
  },
  {
    id: 'archive',
    label: 'Archive',
    category: 'archive',
    extensions: ARCHIVE_EXTENSIONS,
    async: true,
    capabilities: { download: true, print: false, exportHtml: false, zoom: false, search: true },
  },
  {
    id: 'email',
    label: 'Email',
    category: 'email',
    extensions: ['eml', 'msg', 'mbox'],
    async: true,
    capabilities: { download: true, print: false, exportHtml: true, zoom: false, search: true },
  },
  {
    id: 'eda',
    label: 'EDA',
    category: 'eda',
    extensions: ['olb', 'dra'],
    async: true,
    capabilities: { download: true, print: true, exportHtml: true, zoom: false, search: true },
  },
  {
    id: 'cad',
    label: 'CAD',
    category: 'cad',
    extensions: ['dxf', 'dwg', 'dwf', 'dwfx', 'xps'],
    async: true,
    capabilities: { download: true, print: true, exportHtml: true, zoom: 'provider', search: false },
  },
  {
    id: 'model',
    label: '3D Model',
    category: 'model',
    extensions: MODEL_EXTENSIONS,
    async: true,
    capabilities: { download: true, print: false, exportHtml: false, zoom: 'provider', search: false },
  },
  {
    id: 'geo',
    label: 'Geospatial',
    category: 'geo',
    extensions: ['geojson', 'kml', 'gpx', 'shp'],
    async: true,
    capabilities: { download: true, print: true, exportHtml: true, zoom: 'provider', search: true },
  },
  {
    id: 'drawing',
    label: 'Drawing',
    category: 'drawing',
    extensions: ['excalidraw', 'drawio', 'dio'],
    async: true,
    capabilities: { download: true, print: true, exportHtml: true, zoom: 'provider', search: true },
  },
  {
    id: 'epub',
    label: 'EPUB',
    category: 'ebook',
    extensions: ['epub'],
    async: true,
    capabilities: { download: true, print: false, exportHtml: true, zoom: false, search: 'provider' },
  },
  {
    id: 'umd',
    label: 'UMD',
    category: 'ebook',
    extensions: ['umd'],
    async: true,
    capabilities: { download: true, print: true, exportHtml: true, zoom: 'provider', search: true },
  },
  {
    id: 'image',
    label: 'Image',
    category: 'image',
    extensions: IMAGE_EXTENSIONS,
    async: true,
    capabilities: { download: true, print: true, exportHtml: true, zoom: 'provider', search: false },
  },
  {
    id: 'markdown',
    label: 'Markdown',
    category: 'markdown',
    extensions: ['md', 'markdown'],
    async: true,
    capabilities: { download: true, print: true, exportHtml: true, zoom: false, search: true },
  },
  {
    id: 'code',
    label: 'Code and Text',
    category: 'code',
    extensions: TEXT_EXTENSIONS,
    async: true,
    capabilities: { download: true, print: true, exportHtml: true, zoom: false, search: true },
  },
  {
    id: 'video',
    label: 'Video',
    category: 'media',
    extensions: ['mp4', 'webm', 'm3u8'],
    async: true,
    capabilities: { download: true, print: false, exportHtml: false, zoom: false, search: false },
  },
  {
    id: 'audio',
    label: 'Audio',
    category: 'media',
    extensions: ['mp3', 'mpeg', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac', 'weba', 'midi', 'mid'],
    async: true,
    capabilities: { download: true, print: false, exportHtml: false, zoom: false, search: false },
  },
  {
    id: 'data-asset',
    label: 'Data Asset',
    category: 'asset',
    extensions: ['ttf', 'otf', 'woff', 'woff2', 'psd', 'ai', 'eps', 'sqlite', 'wasm', 'parquet', 'avro', 'webarchive'],
    async: true,
    capabilities: { download: true, print: false, exportHtml: true, zoom: false, search: true },
  },
] as const satisfies readonly RendererDefinition[];

export const DEFAULT_SUPPORTED_EXTENSIONS = Object.freeze(
  Array.from(new Set(DEFAULT_RENDERER_DEFINITIONS.flatMap(definition => definition.extensions))).sort()
);
