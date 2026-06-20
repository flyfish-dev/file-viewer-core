import {
  ARCHIVE_EXTENSIONS,
  DEFAULT_SUPPORTED_EXTENSIONS,
} from '../registry/formats';

export const ARCHIVE_PREVIEWABLE_EXTENSIONS = DEFAULT_SUPPORTED_EXTENSIONS as readonly string[];

export interface ArchiveEntryView {
  id: string;
  path: string;
  name: string;
  extension: string;
  size: number;
  lastModified?: number;
  depth: number;
  previewable: boolean;
  compressedFile: {
    name: string;
    size: number;
    lastModified?: number;
    extract(): Promise<File>;
  };
}

export const getArchiveEntryExtension = (name: string) => {
  const clean = name.split(/[?#]/)[0] || name;
  const dot = clean.lastIndexOf('.');
  return dot === -1 ? '' : clean.slice(dot + 1).toLowerCase();
};

export const isArchiveExtension = (extension: string) => (
  (ARCHIVE_EXTENSIONS as readonly string[]).includes(extension.toLowerCase())
);

export const isPreviewableArchiveEntry = (name: string) => {
  const extension = getArchiveEntryExtension(name);
  return ARCHIVE_PREVIEWABLE_EXTENSIONS.includes(extension);
};

export const formatArchiveBytes = (value: number) => {
  if (!Number.isFinite(value) || value < 0) {
    return '-';
  }
  if (value < 1024) {
    return `${value} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let next = value / 1024;
  for (const unit of units) {
    if (next < 1024 || unit === units[units.length - 1]) {
      return `${next.toFixed(next < 10 ? 1 : 0)} ${unit}`;
    }
    next /= 1024;
  }
  return `${value} B`;
};

const isCompressedFile = (value: unknown): value is ArchiveEntryView['compressedFile'] => {
  return typeof value === 'object' &&
    value !== null &&
    'extract' in value &&
    typeof value.extract === 'function';
};

export const flattenArchiveObject = (input: Record<string, unknown>, prefix = ''): ArchiveEntryView[] => {
  const entries: ArchiveEntryView[] = [];

  Object.entries(input).forEach(([key, value]) => {
    const path = prefix ? `${prefix}/${key}` : key;
    if (isCompressedFile(value)) {
      const name = value.name || key;
      const extension = getArchiveEntryExtension(name);
      entries.push({
        id: path,
        path,
        name,
        extension,
        size: value.size || 0,
        lastModified: value.lastModified,
        depth: path.split('/').length - 1,
        previewable: isPreviewableArchiveEntry(name),
        compressedFile: value,
      });
      return;
    }
    if (value && typeof value === 'object') {
      entries.push(...flattenArchiveObject(value as Record<string, unknown>, path));
    }
  });

  return entries;
};

export const createArchiveCacheKey = (archiveName: string, archiveSize: number, entry: ArchiveEntryView) => {
  return [
    'archive-entry',
    archiveName || 'archive',
    archiveSize,
    entry.path,
    entry.size,
    entry.lastModified || 0,
  ].join(':');
};
