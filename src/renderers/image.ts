import {
  registerFileViewerZoomProvider,
  unregisterFileViewerZoomProvider,
} from '../features/document/dom';
import { createFileViewerZoomChangeEmitter as createZoomChangeEmitter } from '../features/document/zoom';
import type {
  FileViewerRenderedInstance,
  FileViewerZoomState,
} from '../contracts/types';

const imageMimeMap: Record<string, string> = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  ico: 'image/x-icon',
  jxl: 'image/jxl',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  webp: 'image/webp',
};

const imageStyle = `
.image-viewer{position:relative;width:100%;height:100%;overflow:auto;background:#eef1f4;box-sizing:border-box}
.image-stage{min-width:100%;min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
.image-stage img{display:block;width:auto;max-width:none;margin:0 auto;border:0;box-shadow:0 18px 48px rgba(15,23,42,.16);background:#fff;cursor:zoom-in}
.image-lightbox{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:40px;background:rgba(15,23,42,.88);box-sizing:border-box}
.image-lightbox[hidden]{display:none}
.image-lightbox img{display:block;max-width:100%;max-height:100%;object-fit:contain;background:#fff;box-shadow:0 30px 80px rgba(0,0,0,.4);cursor:zoom-out}
.image-lightbox button{position:absolute;top:20px;right:20px;width:40px;height:40px;border:0;border-radius:999px;background:rgba(255,255,255,.92);color:#172033;font-size:24px;line-height:40px;cursor:pointer;box-shadow:0 12px 28px rgba(0,0,0,.18)}
.file-viewer[data-viewer-theme='dark'] .image-viewer{background:#101820}
@media (prefers-color-scheme:dark){.file-viewer[data-viewer-theme='system'] .image-viewer{background:#101820}}
@media (max-width:767px){.image-stage{padding:12px}.image-lightbox{padding:16px}.image-lightbox button{top:12px;right:12px}}
`;

const createStyle = () => {
  const style = document.createElement('style');
  style.textContent = imageStyle;
  return style;
};

const getImageBlobType = (type?: string) => {
  const normalized = (type || '').trim().toLowerCase();
  return imageMimeMap[normalized] || 'image/*';
};

const readBlobDataUrl = async (blob: Blob): Promise<string> => {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        resolve(result);
        return;
      }
      reject(new Error('Unable to read image data URL.'));
    };
    reader.onerror = () => reject(reader.error || new Error('Unable to read image data URL.'));
    reader.readAsDataURL(blob);
  });
};

const renderHeic = async (buffer: ArrayBuffer, type?: string) => {
  const { default: heic2any } = await import('heic2any');
  const result = await heic2any({
    blob: new Blob([buffer], { type: getImageBlobType(type) }),
    toType: 'image/png',
  });
  const blob = Array.isArray(result) ? result[0] : result;
  return readBlobDataUrl(blob);
};

const resolveImageUrl = async (buffer: ArrayBuffer, type?: string) => {
  const normalizedType = (type || '').trim().toLowerCase();
  if (normalizedType === 'heic' || normalizedType === 'heif') {
    return renderHeic(buffer, normalizedType);
  }
  return readBlobDataUrl(new Blob([buffer], { type: getImageBlobType(normalizedType) }));
};

const clampZoom = (value: number) => {
  return Math.min(5, Math.max(0.1, Number(value.toFixed(2))));
};

const applyImageZoom = (image: HTMLImageElement, viewportHeight: number, zoom: number) => {
  if (viewportHeight > 0) {
    image.style.height = `${Math.max(1, Math.round(viewportHeight * zoom))}px`;
    return;
  }
  image.style.height = `${zoom * 100}%`;
};

const createLightbox = (src: string) => {
  const lightbox = document.createElement('div');
  lightbox.className = 'image-lightbox';
  lightbox.hidden = true;
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');

  const image = document.createElement('img');
  image.alt = 'Preview image';
  image.src = src;

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close image preview');
  closeButton.textContent = 'x';

  const close = () => {
    lightbox.hidden = true;
  };

  closeButton.addEventListener('click', close);
  image.addEventListener('click', close);
  lightbox.addEventListener('click', event => {
    if (event.target === lightbox) {
      close();
    }
  });
  lightbox.append(image, closeButton);

  return {
    element: lightbox,
    open() {
      lightbox.hidden = false;
    },
    destroy() {
      closeButton.removeEventListener('click', close);
      image.removeEventListener('click', close);
      lightbox.remove();
    },
  };
};

export default async function renderImage(
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  type?: string
): Promise<FileViewerRenderedInstance> {
  const src = await resolveImageUrl(buffer, type);
  let zoom = 1;
  let viewportHeight = 0;
  const zoomEmitter = createZoomChangeEmitter();

  const root = document.createElement('div');
  root.className = 'image-viewer';
  root.dataset.viewerZoomProvider = 'image';

  const stage = document.createElement('div');
  stage.className = 'image-stage';

  const image = document.createElement('img');
  image.alt = '图片';
  image.src = src;
  stage.append(image);
  root.append(stage);

  const lightbox = createLightbox(src);
  const openLightbox = () => lightbox.open();
  image.addEventListener('click', openLightbox);
  document.body.append(lightbox.element);

  const updateViewportSize = () => {
    viewportHeight = root.clientHeight || 0;
    applyImageZoom(image, viewportHeight, zoom);
    zoomEmitter.emit();
  };
  const resizeObserver = new ResizeObserver(updateViewportSize);
  resizeObserver.observe(root);

  const getZoomState = (): FileViewerZoomState => ({
    scale: zoom,
    label: `${Math.round(zoom * 100)}%`,
    canZoomIn: zoom < 5,
    canZoomOut: zoom > 0.1,
    canReset: zoom !== 1,
    minScale: 0.1,
    maxScale: 5,
  });

  const setZoom = (scale: number) => {
    zoom = clampZoom(scale);
    applyImageZoom(image, viewportHeight, zoom);
    zoomEmitter.emit();
    return getZoomState();
  };

  registerFileViewerZoomProvider(root, {
    zoomIn: () => setZoom(zoom + 0.15),
    zoomOut: () => setZoom(zoom - 0.15),
    resetZoom: () => setZoom(1),
    setZoom,
    getState: getZoomState,
    subscribe: zoomEmitter.subscribe,
  });

  target.replaceChildren(createStyle(), root);
  updateViewportSize();

  return {
    $el: target,
    unmount() {
      unregisterFileViewerZoomProvider(root);
      resizeObserver.disconnect();
      image.removeEventListener('click', openLightbox);
      lightbox.destroy();
      target.replaceChildren();
    },
  };
}
