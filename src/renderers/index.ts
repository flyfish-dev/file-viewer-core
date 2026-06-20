// Browser renderer strategy registry.
//
// Each entry lazy-loads a concrete renderer only after its format is selected.
// Keep renderer-specific dependencies inside the leaf renderer files so the
// core shell and framework wrappers stay fast on first load.
import { DEFAULT_RENDERER_DEFINITIONS } from '../registry/formats';
import { createFileRenderHandlerRegistry } from '../rendering/handler';
import { createFileViewerRendererDispatcher } from '../rendering/dispatcher';
import { createFileViewerUnsupportedState } from '../viewer/state';
import type {
  FileRenderContext,
  FileRenderHandler,
  FileViewerRenderedInstance,
} from '../contracts/types';

type CoreBrowserRendererHandler = FileRenderHandler<FileViewerRenderedInstance, HTMLDivElement>;

interface CoreBrowserRendererHandlerEntry {
  rendererId: string;
  handler: CoreBrowserRendererHandler;
}

const createWrapper = (el: HTMLDivElement): FileViewerRenderedInstance => ({
  $el: el,
  unmount() {
    // DOM renderers clean themselves up through their own returned instance.
  },
});

export const coreBrowserRendererHandlers: readonly CoreBrowserRendererHandlerEntry[] = [
  {
    rendererId: 'code',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement, type?: string) => {
      const { default: renderCode } = await import('./code');
      return renderCode(buffer, target, type);
    },
  },
  {
    rendererId: 'markdown',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement) => {
      const { default: renderMarkdown } = await import('./markdown');
      return renderMarkdown(buffer, target);
    },
  },
  {
    rendererId: 'video',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement, type?: string, context?: FileRenderContext) => {
      const { default: renderVideo } = await import('./video');
      return renderVideo(buffer, target, type, context);
    },
  },
  {
    rendererId: 'audio',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement, type?: string) => {
      const { default: renderAudio } = await import('./audio');
      return renderAudio(buffer, target, type);
    },
  },
  {
    rendererId: 'image',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement, type?: string) => {
      const { default: renderImage } = await import('./image');
      return renderImage(buffer, target, type);
    },
  },
  {
    rendererId: 'umd',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement) => {
      const { default: renderUmd } = await import('./umd');
      return renderUmd(buffer, target);
    },
  },
  {
    rendererId: 'geo',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement, type?: string) => {
      const { default: renderGeo } = await import('./geo');
      return renderGeo(buffer, target, type);
    },
  },
  {
    rendererId: 'open-document',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement, type?: string) => {
      const { default: renderOpenDocument } = await import('./openDocument');
      return renderOpenDocument(buffer, target, type);
    },
  },
  {
    rendererId: 'ofd',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement, _type?: string, context?: FileRenderContext) => {
      const { default: renderOfd } = await import('./ofd');
      return renderOfd(buffer, target, context);
    },
  },
  {
    rendererId: 'pdf',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement, _type?: string, context?: FileRenderContext) => {
      const { default: renderPdf } = await import('./pdf');
      return renderPdf(buffer, target, context);
    },
  },
  {
    rendererId: 'office-word-openxml',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement, _type?: string, context?: FileRenderContext) => {
      const { default: renderWordDocx } = await import('./wordDocx');
      return renderWordDocx(buffer, target, context);
    },
  },
  {
    rendererId: 'office-word-binary',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement, _type?: string, context?: FileRenderContext) => {
      const { default: renderWordDoc } = await import('./wordDoc');
      return renderWordDoc(buffer, target, context);
    },
  },
  {
    rendererId: 'spreadsheet-openxml',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement, type?: string, context?: FileRenderContext) => {
      const { default: renderSpreadsheet } = await import('./spreadsheet');
      return renderSpreadsheet(buffer, target, type, context);
    },
  },
  {
    rendererId: 'email',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement, type?: string, context?: FileRenderContext) => {
      const { default: renderEmail } = await import('./email');
      return renderEmail(buffer, target, type, context);
    },
  },
  {
    rendererId: 'eda',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement, type?: string, context?: FileRenderContext) => {
      const { default: renderEda } = await import('./eda');
      return renderEda(buffer, target, type, context);
    },
  },
  {
    rendererId: 'cad',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement, type?: string, context?: FileRenderContext) => {
      const { default: renderCad } = await import('./cad');
      return renderCad(buffer, target, type, context);
    },
  },
  {
    rendererId: 'typst',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement, type?: string, context?: FileRenderContext) => {
      const { default: renderTypst } = await import('./typst');
      return renderTypst(buffer, target, type, context);
    },
  },
  {
    rendererId: 'office-presentation',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement, type?: string, context?: FileRenderContext) => {
      const { default: renderPptx } = await import('./pptx');
      return renderPptx(buffer, target, type, context);
    },
  },
  {
    rendererId: 'epub',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement) => {
      const { default: renderEpub } = await import('./epub');
      return renderEpub(buffer, target);
    },
  },
  {
    rendererId: 'model',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement, type?: string, context?: FileRenderContext) => {
      const { default: renderModel } = await import('./model');
      return renderModel(buffer, target, type, context);
    },
  },
  {
    rendererId: 'drawing',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement, type?: string, context?: FileRenderContext) => {
      const { default: renderDrawing } = await import('./drawing');
      return renderDrawing(buffer, target, type, context);
    },
  },
  {
    rendererId: 'data-asset',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement, type?: string, context?: FileRenderContext) => {
      const { default: renderDataAsset } = await import('./data');
      return renderDataAsset(buffer, target, type, context);
    },
  },
  {
    rendererId: 'archive',
    handler: async (buffer: ArrayBuffer, target: HTMLDivElement, type?: string, context?: FileRenderContext) => {
      const { default: renderArchive } = await import('./archive');
      return renderArchive(buffer, target, type, context);
    },
  },
];

const renderUnsupported: CoreBrowserRendererHandler = async (_buffer, target, type) => {
  const state = createFileViewerUnsupportedState(type);
  const wrapper = document.createElement('div');
  wrapper.style.textAlign = 'center';
  wrapper.style.marginTop = '80px';

  const message = document.createElement('div');
  message.textContent = state.message;
  wrapper.appendChild(message);

  if (state.description) {
    const description = document.createElement('div');
    description.textContent = state.description;
    wrapper.appendChild(description);
  }

  target.replaceChildren(wrapper);
  return createWrapper(target);
};

export const createFileViewerCoreRendererRegistry = () => {
  const bridge = createFileRenderHandlerRegistry({
    definitions: DEFAULT_RENDERER_DEFINITIONS,
    handlers: coreBrowserRendererHandlers,
  });

  return {
    ...bridge,
    dispatcher: createFileViewerRendererDispatcher({
      registry: bridge.registry,
      handlers: coreBrowserRendererHandlers,
      fallbackHandler: renderUnsupported,
    }),
  };
};

export const fileViewerCoreRendererRegistryBridge = createFileViewerCoreRendererRegistry();
export const fileViewerCoreRendererRegistry = fileViewerCoreRendererRegistryBridge.registry;
export const fileViewerCoreRendererDispatcher = fileViewerCoreRendererRegistryBridge.dispatcher;
export const missingFileViewerCoreRendererHandlers = fileViewerCoreRendererRegistryBridge.missingRendererIds;
