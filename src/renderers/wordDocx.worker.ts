import type { Options } from '@file-viewer/docx';
import { renderAsync } from '@file-viewer/docx';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { parseHTML } from 'linkedom';

type DocxWorkerRequest = {
  id: number;
  buffer: ArrayBuffer;
  options: Partial<Options>;
};

type DocxWorkerSuccess = {
  id: number;
  ok: true;
  html: string;
};

type DocxWorkerFailure = {
  id: number;
  ok: false;
  message: string;
  stack?: string;
};

type DocxWorkerResponse = DocxWorkerSuccess | DocxWorkerFailure;

type DocxWorkerScope = {
  addEventListener(type: 'message', listener: (event: MessageEvent<DocxWorkerRequest>) => void): void;
  postMessage(message: DocxWorkerResponse): void;
};

const ctx = self as unknown as DocxWorkerScope;

const getFirstElementChild = function(this: { childNodes?: NodeListOf<ChildNode> }) {
  const nodes = this.childNodes;
  if (!nodes) {
    return null;
  }

  for (let index = 0; index < nodes.length; index += 1) {
    const child = typeof nodes.item === 'function' ? nodes.item(index) : nodes[index];
    if (child?.nodeType === 1) {
      return child;
    }
  }

  return null;
};

const ensureFirstElementChild = (node: unknown) => {
  if (!node || typeof node !== 'object') {
    return;
  }

  const prototype = Object.getPrototypeOf(node);
  if (!prototype || Object.prototype.hasOwnProperty.call(prototype, 'firstElementChild')) {
    return;
  }

  Object.defineProperty(prototype, 'firstElementChild', {
    configurable: true,
    get: getFirstElementChild,
  });
};

class BrowserLikeXmlDomParser extends DOMParser {
  parseFromString(source: string, mimeType: string) {
    const xmlDocument = super.parseFromString(source, mimeType);
    ensureFirstElementChild(xmlDocument);
    ensureFirstElementChild(xmlDocument.documentElement);
    return xmlDocument;
  }
}

const toErrorPayload = (id: number, error: unknown): DocxWorkerFailure => {
  if (error instanceof Error) {
    return {
      id,
      ok: false,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    id,
    ok: false,
    message: String(error),
  };
};

const installDomRuntime = () => {
  const { window } = parseHTML('<!doctype html><html><head></head><body></body></html>');
  const runtime = globalThis as Record<string, unknown>;

  runtime.window = window;
  runtime.document = window.document;
  // @file-viewer/docx expects browser XML namespace behavior where `<w:body>` has
  // localName === "body"; linkedom keeps prefixes, so XML parsing uses xmldom.
  runtime.DOMParser = BrowserLikeXmlDomParser as unknown as typeof DOMParser;
  runtime.Node = window.Node;
  runtime.Element = window.Element;
  runtime.HTMLElement = window.HTMLElement;
  runtime.DocumentFragment = window.DocumentFragment;
  runtime.XMLSerializer = XMLSerializer as unknown as typeof XMLSerializer;

  return window.document;
};

const renderDocxToHtml = async (request: DocxWorkerRequest) => {
  const document = installDomRuntime();
  const styleContainer = document.createElement('div');
  const bodyContainer = document.createElement('div');

  document.body.append(styleContainer, bodyContainer);

  await renderAsync(
    request.buffer,
    bodyContainer as unknown as HTMLElement,
    styleContainer as unknown as HTMLElement,
    {
      ...request.options,
      // Tab stop calculation depends on browser layout APIs and cannot be trusted in Worker DOM.
      experimental: false,
      // Worker output must inline binary assets because the worker is terminated immediately.
      useBase64URL: true,
    },
  );

  return `${styleContainer.innerHTML}${bodyContainer.innerHTML}`;
};

ctx.addEventListener('message', async (event: MessageEvent<DocxWorkerRequest>) => {
  const request = event.data;

  try {
    const html = await renderDocxToHtml(request);
    ctx.postMessage({
      id: request.id,
      ok: true,
      html,
    });
  } catch (error) {
    ctx.postMessage(toErrorPayload(request.id, error));
  }
});
