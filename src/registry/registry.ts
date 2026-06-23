import { DEFAULT_RENDERER_DEFINITIONS } from './formats';
import { normalizeFileExtension } from '../source';
import type {
  FileViewerRendererHandlerRegistration,
  FileViewerRendererPluginInput,
  FileViewerRendererPlugin,
  FileViewerRendererPreset,
  RendererDefinition,
  RendererRegistry,
} from '../contracts/types';

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
