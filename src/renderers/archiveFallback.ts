import {
  getArchiveEntryExtension,
  isPreviewableArchiveEntry,
  type ArchiveEntryView,
} from './archiveShared';

const ZIP_LIKE_EXTENSIONS = new Set(['zip', 'zipx', 'jar', 'war', 'ear', 'apk', 'cbz']);
const TAR_LIKE_EXTENSIONS = new Set(['tar', 'tgz', 'gz', 'gzip']);
const TAR_BLOCK_SIZE = 512;

type DecompressionFormat = ConstructorParameters<typeof DecompressionStream>[0];

type FallbackEntrySource = {
  path: string;
  size: number;
  lastModified?: number;
  load: () => Promise<ArrayBuffer>;
};

const toArrayBuffer = (bytes: Uint8Array) => {
  const output = new Uint8Array(bytes.byteLength);
  output.set(bytes);
  return output.buffer;
};

const decompressBytes = async (bytes: Uint8Array, format: DecompressionFormat) => {
  if (typeof DecompressionStream === 'undefined') {
    return null;
  }

  const stream = new Blob([toArrayBuffer(bytes)])
    .stream()
    .pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const normalizeArchivePath = (path: string) => {
  return path.replace(/^\/+/, '').replace(/\\/g, '/');
};

const getPathName = (path: string) => {
  const parts = normalizeArchivePath(path).split('/');
  return parts[parts.length - 1] || path;
};

const getPathDepth = (path: string) => {
  return Math.max(0, normalizeArchivePath(path).split('/').length - 1);
};

const createEntryView = (source: FallbackEntrySource): ArchiveEntryView => {
  const path = normalizeArchivePath(source.path);
  const name = getPathName(path);

  return {
    id: path,
    path,
    name,
    extension: getArchiveEntryExtension(name),
    size: source.size,
    lastModified: source.lastModified,
    depth: getPathDepth(path),
    previewable: isPreviewableArchiveEntry(name),
    compressedFile: {
      name,
      size: source.size,
      lastModified: source.lastModified,
      async extract() {
        const buffer = await source.load();
        return new File([buffer], name, {
          type: 'application/octet-stream',
          lastModified: source.lastModified || Date.now(),
        });
      },
    },
  };
};

const parseOctal = (bytes: Uint8Array, start: number, length: number) => {
  const text = new TextDecoder('ascii')
    .decode(bytes.slice(start, start + length))
    .replace(/\0.*$/, '')
    .trim();

  return text ? Number.parseInt(text, 8) || 0 : 0;
};

const readTarName = (bytes: Uint8Array, offset: number) => {
  const decoder = new TextDecoder('utf-8');
  const name = decoder.decode(bytes.slice(offset, offset + 100)).replace(/\0.*$/, '');
  const prefix = decoder.decode(bytes.slice(offset + 345, offset + 500)).replace(/\0.*$/, '');
  return normalizeArchivePath(prefix ? `${prefix}/${name}` : name);
};

const parseTarEntries = (bytes: Uint8Array) => {
  const entries: ArchiveEntryView[] = [];
  let offset = 0;

  while (offset + TAR_BLOCK_SIZE <= bytes.length) {
    const header = bytes.slice(offset, offset + TAR_BLOCK_SIZE);
    if (header.every(value => value === 0)) {
      break;
    }

    const path = readTarName(bytes, offset);
    const size = parseOctal(bytes, offset + 124, 12);
    const typeFlag = String.fromCharCode(bytes[offset + 156] || 0);
    const dataOffset = offset + TAR_BLOCK_SIZE;
    const nextOffset = dataOffset + Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;

    if (path && typeFlag !== '5') {
      const fileBytes = bytes.slice(dataOffset, dataOffset + size);
      entries.push(createEntryView({
        path,
        size,
        load: async () => toArrayBuffer(fileBytes),
      }));
    }

    offset = nextOffset;
  }

  return entries;
};

const getArchiveExtension = (filename: string) => {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    return 'tgz';
  }
  return getArchiveEntryExtension(filename);
};

const getGzipEntryName = (filename: string) => {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.gzip')) {
    return filename.slice(0, -5) || 'archive';
  }
  if (lower.endsWith('.gz')) {
    return filename.slice(0, -3) || 'archive';
  }
  return `${filename || 'archive'}.bin`;
};

const loadZipEntries = async (data: ArrayBuffer) => {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(data);
  const entries: ArchiveEntryView[] = [];

  zip.forEach((relativePath, file) => {
    if (file.dir) {
      return;
    }

    const metadata = file as typeof file & {
      _data?: {
        uncompressedSize?: number;
      };
    };
    const normalizedPath = normalizeArchivePath(relativePath);
    entries.push(createEntryView({
      path: normalizedPath,
      size: metadata._data?.uncompressedSize || 0,
      lastModified: file.date?.getTime(),
      load: async () => file.async('arraybuffer'),
    }));
  });

  return entries;
};

const loadTarEntries = async (data: ArrayBuffer, filename: string, extension: string) => {
  const source = new Uint8Array(data);
  const bytes = extension === 'tar'
    ? source
    : await decompressBytes(source, 'gzip');

  if (!bytes) {
    return null;
  }

  if (extension === 'gz' || extension === 'gzip') {
    const lower = filename.toLowerCase();
    const isTarGz = lower.endsWith('.tar.gz') || lower.endsWith('.tgz');
    if (!isTarGz) {
      const name = getGzipEntryName(filename);
      return [createEntryView({
        path: name,
        size: bytes.byteLength,
        load: async () => toArrayBuffer(bytes),
      })];
    }
  }

  return parseTarEntries(bytes);
};

/**
 * Worker fallback for constrained browsers, temporary local servers, and
 * mobile WebViews. The main libarchive path still covers broader formats;
 * this covers common ZIP/TAR/GZIP archives without an extra static Worker.
 */
export const loadArchiveEntriesWithoutWorker = async (data: ArrayBuffer, filename: string) => {
  const extension = getArchiveExtension(filename);

  if (ZIP_LIKE_EXTENSIONS.has(extension)) {
    return loadZipEntries(data);
  }

  if (TAR_LIKE_EXTENSIONS.has(extension)) {
    return loadTarEntries(data, filename, extension);
  }

  return null;
};
