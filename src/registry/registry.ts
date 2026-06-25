import { DEFAULT_RENDERER_DEFINITIONS } from './formats';
import { normalizeFileExtension } from '../source';
import type {
  FileViewerRendererHandlerRegistration,
  FileViewerRendererPluginInput,
  FileViewerRendererPlugin,
  FileViewerRendererPresetInput,
  FileViewerRendererPresetName,
  FileViewerRendererPreset,
  RendererDefinition,
  RendererRegistry,
} from '../contracts/types';

const autoRendererBucketKey = '__flyfish_file_viewer_auto_renderer_presets__';

export interface RegisterFileViewerAutoRendererPresetOptions {
  /**
   * Stable key used to replace an existing auto preset registration.
   */
  id?: string;
  /**
   * Package name is useful for diagnostics and gives generated integrations a
   * deterministic id even when the preset input is an array.
   */
  packageName?: string;
}

export interface FileViewerAutoRendererPresetEntry<Handler = unknown> {
  id: string;
  packageName?: string;
  input: FileViewerRendererPluginInput<Handler>;
}

interface FileViewerAutoRendererBucket {
  version: number;
  presets: Map<string, FileViewerAutoRendererPresetEntry>;
}

const getAutoRendererBucket = (): FileViewerAutoRendererBucket => {
  const host = globalThis as typeof globalThis & {
    [autoRendererBucketKey]?: FileViewerAutoRendererBucket;
  };
  if (!host[autoRendererBucketKey]) {
    host[autoRendererBucketKey] = {
      version: 0,
      presets: new Map(),
    };
  }
  return host[autoRendererBucketKey];
};

const normalizeDefinition = (definition: RendererDefinition): RendererDefinition => ({
  ...definition,
  extensions: definition.extensions.map(normalizeFileExtension),
});

export const createRendererRegistry = (
  initialDefinitions: readonly RendererDefinition[] = DEFAULT_RENDERER_DEFINITIONS
): RendererRegistry => {
  const byId = new Map<string, RendererDefinition>();
  const byExtension = new Map<string, RendererDefinition>();

  const register = (definition: RendererDefinition) => {
    const normalized = normalizeDefinition(definition);
    const existing = byId.get(normalized.id);
    if (existing) {
      existing.extensions.forEach(extension => {
        if (byExtension.get(extension)?.id === existing.id) {
          byExtension.delete(extension);
        }
      });
    }

    byId.set(normalized.id, normalized);
    normalized.extensions.forEach(extension => {
      const owner = byExtension.get(extension);
      if (owner && owner.id !== normalized.id) {
        throw new Error(`File extension "${extension}" is already registered by renderer "${owner.id}".`);
      }
      byExtension.set(extension, normalized);
    });
  };

  initialDefinitions.forEach(register);

  return {
    register,
    unregister(id: string) {
      const existing = byId.get(id);
      if (!existing) {
        return false;
      }
      existing.extensions.forEach(extension => {
        if (byExtension.get(extension)?.id === id) {
          byExtension.delete(extension);
        }
      });
      byId.delete(id);
      return true;
    },
    getById(id: string) {
      return byId.get(id);
    },
    getByExtension(extension: string) {
      return byExtension.get(normalizeFileExtension(extension));
    },
    hasExtension(extension: string) {
      return byExtension.has(normalizeFileExtension(extension));
    },
    list() {
      return Array.from(byId.values());
    },
    listExtensions() {
      return Array.from(byExtension.keys()).sort();
    },
  };
};

export interface InstallFileViewerRendererPluginsOptions<Handler = unknown> {
  registry: RendererRegistry;
  plugins: Iterable<FileViewerRendererPlugin<Handler>>;
  registerHandler?: (registration: FileViewerRendererHandlerRegistration<Handler>) => void;
}

const isRendererPreset = <Handler>(
  input: FileViewerRendererPluginInput<Handler>
): input is FileViewerRendererPreset<Handler> => {
  return !!input && typeof input === 'object' && !Array.isArray(input) &&
    Array.isArray((input as { renderers?: unknown }).renderers);
};

export const collectFileViewerRendererPlugins = <Handler = unknown>(
  input?: FileViewerRendererPluginInput<Handler> | null
): FileViewerRendererPlugin<Handler>[] => {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input.flatMap(item => collectFileViewerRendererPlugins(item));
  }

  if (isRendererPreset(input)) {
    return collectFileViewerRendererPlugins(input.renderers);
  }

  return [input as FileViewerRendererPlugin<Handler>];
};

const resolveAutoRendererPresetId = <Handler>(
  input: FileViewerRendererPluginInput<Handler>,
  options: RegisterFileViewerAutoRendererPresetOptions = {}
) => {
  if (options.id) {
    return options.id;
  }
  if (options.packageName) {
    return options.packageName;
  }
  if (isRendererPreset(input)) {
    return input.id;
  }
  if (!Array.isArray(input) && input && typeof input === 'object' && 'id' in input) {
    return String((input as FileViewerRendererPlugin<Handler>).id);
  }
  return 'file-viewer-auto-renderers';
};

export const registerFileViewerAutoRendererPreset = <Handler = unknown>(
  input: FileViewerRendererPluginInput<Handler>,
  options: RegisterFileViewerAutoRendererPresetOptions = {}
) => {
  const bucket = getAutoRendererBucket();
  const id = resolveAutoRendererPresetId(input, options);
  const existing = bucket.presets.get(id);
  if (existing?.input !== input || existing.packageName !== options.packageName) {
    bucket.presets.set(id, {
      id,
      packageName: options.packageName,
      input: input as FileViewerRendererPluginInput,
    });
    bucket.version += 1;
  }

  return () => {
    unregisterFileViewerAutoRendererPreset(id);
  };
};

export const unregisterFileViewerAutoRendererPreset = (id: string) => {
  const bucket = getAutoRendererBucket();
  const removed = bucket.presets.delete(id);
  if (removed) {
    bucket.version += 1;
  }
  return removed;
};

export const clearFileViewerAutoRendererPresets = () => {
  const bucket = getAutoRendererBucket();
  if (!bucket.presets.size) {
    return;
  }
  bucket.presets.clear();
  bucket.version += 1;
};

export const listFileViewerAutoRendererPresets = <Handler = unknown>() =>
  Array.from(getAutoRendererBucket().presets.values()).map(
    entry => entry.input as FileViewerRendererPluginInput<Handler>
  );

export const listFileViewerAutoRendererPresetEntries = <Handler = unknown>() =>
  Array.from(getAutoRendererBucket().presets.values()).map(entry => ({
    ...entry,
    input: entry.input as FileViewerRendererPluginInput<Handler>,
  }));

export const findFileViewerAutoRendererPreset = <Handler = unknown>(
  id: FileViewerRendererPresetName | string
) => {
  const bucket = getAutoRendererBucket();
  const direct = bucket.presets.get(id);
  if (direct) {
    return direct.input as FileViewerRendererPluginInput<Handler>;
  }

  const packageSuffix = id.startsWith('@file-viewer/preset-')
    ? id
    : `@file-viewer/preset-${id}`;
  return Array.from(bucket.presets.values()).find(entry =>
    entry.packageName === packageSuffix ||
    entry.id === packageSuffix
  )?.input as FileViewerRendererPluginInput<Handler> | undefined;
};

export const getFileViewerAutoRendererPresetVersion = () => getAutoRendererBucket().version;

export const hasFileViewerRendererPresetName = (
  input?: FileViewerRendererPresetInput | null
): boolean => {
  if (!input) {
    return false;
  }
  if (typeof input === 'string') {
    return true;
  }
  if (Array.isArray(input)) {
    return input.some(item => hasFileViewerRendererPresetName(item));
  }
  return false;
};

/**
 * Normalizes `options.preset` / `options.presets` into renderer plugin inputs.
 *
 * Passing a preset object is the most portable integration style because it
 * works in any bundler. String selectors intentionally only resolve presets
 * that are already registered by a side-effect import or by build tooling.
 */
export const resolveFileViewerRendererPresetInputs = <Handler = unknown>(
  input?: FileViewerRendererPresetInput<Handler> | null
): FileViewerRendererPluginInput<Handler>[] => {
  if (!input) {
    return [];
  }
  if (typeof input === 'string') {
    const preset = findFileViewerAutoRendererPreset<Handler>(input);
    return preset ? [preset] : [];
  }
  if (Array.isArray(input)) {
    return input.flatMap(item => resolveFileViewerRendererPresetInputs<Handler>(item));
  }
  return [input as FileViewerRendererPluginInput<Handler>];
};

export const installFileViewerRendererPlugins = async <Handler = unknown>({
  registry,
  plugins,
  registerHandler,
}: InstallFileViewerRendererPluginsOptions<Handler>) => {
  for (const plugin of plugins) {
    plugin.definitions?.forEach(definition => {
      registry.register(definition);
    });

    plugin.handlers?.forEach(registration => {
      registerHandler?.(registration);
    });

    await plugin.install?.({ registry, registerHandler });
  }

  return registry;
};
