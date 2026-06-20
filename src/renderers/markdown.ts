import { marked } from 'marked';
import { createFileViewerZoomChangeEmitter as createZoomChangeEmitter } from '../features/document/zoom';
import {
  registerFileViewerZoomProvider,
  unregisterFileViewerZoomProvider,
} from '../features/document/dom';
import { readFileViewerText as readText } from '../source';
import type {
  FileViewerRenderedInstance,
  FileViewerZoomState,
} from '../contracts/types';

const markdownStyle = `
.markdown-viewer{min-height:100%;padding:28px 16px 48px;background:#eef1f4;overflow:auto;box-sizing:border-box}
.markdown-body{color-scheme:light;--bgColor-default:#fff;--bgColor-muted:#f6f8fa;--bgColor-neutral-muted:#818b981f;--borderColor-default:#d1d9e0;--borderColor-muted:#d1d9e0b3;--borderColor-neutral-muted:#d1d9e0b3;--fgColor-default:#1f2328;--fgColor-muted:#59636e;--fgColor-accent:#0969da;background:var(--bgColor-default);border:1px solid rgba(20,35,53,.1);border-radius:12px;margin:0 auto;box-sizing:border-box;min-width:200px;max-width:var(--markdown-max-width,980px);padding:var(--markdown-padding,45px);color:var(--fgColor-default);font-size:var(--markdown-font-size,16px);box-shadow:0 18px 42px rgba(15,23,42,.1)}
.markdown-body h1,.markdown-body h2,.markdown-body h3{margin-top:24px;margin-bottom:16px;font-weight:700;line-height:1.25}
.markdown-body h1{padding-bottom:.3em;border-bottom:1px solid var(--borderColor-muted);font-size:2em}
.markdown-body h2{padding-bottom:.3em;border-bottom:1px solid var(--borderColor-muted);font-size:1.5em}
.markdown-body p,.markdown-body ul,.markdown-body ol,.markdown-body blockquote,.markdown-body table,.markdown-body pre{margin-top:0;margin-bottom:16px}
.markdown-body a{color:var(--fgColor-accent);text-decoration:none}
.markdown-body a:hover{text-decoration:underline}
.markdown-body code{padding:.2em .4em;border-radius:6px;background:var(--bgColor-neutral-muted);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono',monospace;font-size:85%}
.markdown-body pre{padding:16px;overflow:auto;border-radius:8px;background:var(--bgColor-muted)}
.markdown-body pre code{padding:0;background:transparent;font-size:100%}
.markdown-body table{display:block;width:max-content;max-width:100%;overflow:auto;border-spacing:0;border-collapse:collapse}
.markdown-body th,.markdown-body td{padding:6px 13px;border:1px solid var(--borderColor-default)}
.markdown-body tr{background:var(--bgColor-default);border-top:1px solid var(--borderColor-muted)}
.markdown-body tr:nth-child(2n){background:var(--bgColor-muted)}
.markdown-body blockquote{padding:0 1em;color:var(--fgColor-muted);border-left:.25em solid var(--borderColor-default)}
.file-viewer[data-viewer-theme='dark'] .markdown-viewer{background:#101820}
.file-viewer[data-viewer-theme='dark'] .markdown-body{color-scheme:dark;--bgColor-default:#0d1117;--bgColor-muted:#151b23;--bgColor-neutral-muted:#656c7633;--borderColor-default:#3d444d;--borderColor-muted:#3d444db3;--borderColor-neutral-muted:#3d444db3;--fgColor-default:#f0f6fc;--fgColor-muted:#9198a1;--fgColor-accent:#4493f8;background:var(--bgColor-default);border-color:rgba(139,148,158,.26);color:var(--fgColor-default);box-shadow:0 24px 56px rgba(0,0,0,.38)}
@media (max-width:767px){.markdown-viewer{padding:14px 10px 28px}.markdown-body{padding:22px 18px;border-radius:10px}}
@media (prefers-color-scheme:dark){.file-viewer[data-viewer-theme='system'] .markdown-viewer{background:#101820}.file-viewer[data-viewer-theme='system'] .markdown-body{color-scheme:dark;--bgColor-default:#0d1117;--bgColor-muted:#151b23;--bgColor-neutral-muted:#656c7633;--borderColor-default:#3d444d;--borderColor-muted:#3d444db3;--borderColor-neutral-muted:#3d444db3;--fgColor-default:#f0f6fc;--fgColor-muted:#9198a1;--fgColor-accent:#4493f8;background:var(--bgColor-default);border-color:rgba(139,148,158,.26);color:var(--fgColor-default);box-shadow:0 24px 56px rgba(0,0,0,.38)}}
`;

const createStyle = () => {
  const style = document.createElement('style');
  style.textContent = markdownStyle;
  return style;
};

const clampZoom = (value: number) => {
  return Math.min(2.4, Math.max(0.6, Number(value.toFixed(2))));
};

const applyMarkdownZoom = (host: HTMLElement, zoom: number) => {
  host.style.setProperty('--markdown-max-width', `${980 * zoom}px`);
  host.style.setProperty('--markdown-padding', `${45 * zoom}px`);
  host.style.setProperty('--markdown-font-size', `${16 * zoom}px`);
};

export default async function renderMarkdown(
  buffer: ArrayBuffer,
  target: HTMLDivElement
): Promise<FileViewerRenderedInstance> {
  const text = await readText(buffer);
  let zoom = 1;
  const zoomEmitter = createZoomChangeEmitter();
  const root = document.createElement('div');
  root.className = 'markdown-viewer';
  root.dataset.viewerZoomProvider = 'markdown';

  const article = document.createElement('article');
  article.className = 'markdown-body';
  article.innerHTML = await marked(text);

  applyMarkdownZoom(root, zoom);
  root.append(article);
  target.replaceChildren(createStyle(), root);

  const getZoomState = (): FileViewerZoomState => ({
    scale: zoom,
    label: `${Math.round(zoom * 100)}%`,
    canZoomIn: zoom < 2.4,
    canZoomOut: zoom > 0.6,
    canReset: zoom !== 1,
    minScale: 0.6,
    maxScale: 2.4,
  });

  const setZoom = (scale: number) => {
    zoom = clampZoom(scale);
    applyMarkdownZoom(root, zoom);
    zoomEmitter.emit();
    return getZoomState();
  };

  registerFileViewerZoomProvider(root, {
    zoomIn: () => setZoom(zoom + 0.1),
    zoomOut: () => setZoom(zoom - 0.1),
    resetZoom: () => setZoom(1),
    setZoom,
    getState: getZoomState,
    subscribe: zoomEmitter.subscribe,
  });

  return {
    $el: target,
    unmount() {
      unregisterFileViewerZoomProvider(root);
      target.replaceChildren();
    },
  };
}
