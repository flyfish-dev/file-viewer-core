import {
  registerFileViewerZoomProvider,
  unregisterFileViewerZoomProvider,
} from '../features/document/dom';
import { createFileViewerTranslator } from '../i18n/messages';
import { createFileViewerZoomChangeEmitter as createZoomChangeEmitter } from '../features/document/zoom';
import type {
  FileRenderContext,
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

const createStyle = (documentRef: Document) => {
  const style = documentRef.createElement('style');
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

const resolveImageUrl = async (buffer: ArrayBuffer, type?: string) => {
  const normalizedType = (type || '').trim().toLowerCase();
  if (normalizedType === 'heic' || normalizedType === 'heif') {
    throw new Error(
      'HEIC/HEIF image conversion has moved out of @file-viewer/core. Install and pass @file-viewer/renderer-image, or use @file-viewer/preset-all.'
    );
  }
  return readBlobDataUrl(new Blob([buffer], { type: getImageBlobType(normalizedType) }));
};

const roundImageScale = (value: number) => {
  return Number(value.toFixed(3));
};

const createLightbox = (
  documentRef: Document,
  src: string,
  t: ReturnType<typeof createFileViewerTranslator>
) => {
  const lightbox = documentRef.createElement('div');
  lightbox.className = 'image-lightbox';
  lightbox.hidden = true;
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');

  const image = documentRef.createElement('img');
  image.alt = t('image.lightbox.alt');
  image.src = src;

  const closeButton = documentRef.createElement('button');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', t('image.lightbox.close'));
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
  type?: string,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> {
  const t = createFileViewerTranslator(context?.options);
  const documentRef = target.ownerDocument || document;
  const src = await resolveImageUrl(buffer, type);
  let userZoom = 1;
  let fitScale = 1;
  let currentScale = 1;
  let viewportHeight = 0;
  const zoomEmitter = createZoomChangeEmitter();

  const root = documentRef.createElement('div');
  root.className = 'image-viewer';
  root.dataset.viewerZoomProvider = 'image';

  const stage = documentRef.createElement('div');
  stage.className = 'image-stage';

  const image = documentRef.createElement('img');
  image.alt = t('image.alt');
  image.src = src;
  stage.append(image);
  root.append(stage);

  const lightbox = createLightbox(documentRef, src, t);
  const openLightbox = () => lightbox.open();
  image.addEventListener('click', openLightbox);

  const getMinScale = () => Math.min(0.1, fitScale || 0.1);
  const clampScale = (value: number) => {
    const minScale = getMinScale();
    return Math.min(5, Math.max(minScale, roundImageScale(value)));
  };
  const computeFitScale = () => {
    const naturalWidth = image.naturalWidth || 0;
    const naturalHeight = image.naturalHeight || 0;
    if (!naturalWidth || !naturalHeight) {
      return 1;
    }

    const availableWidth = Math.max((root.clientWidth || 0) - 48, 1);
    const availableHeight = Math.max((root.clientHeight || viewportHeight || 0) - 48, 1);
    return Math.min(1, availableWidth / naturalWidth, availableHeight / naturalHeight);
  };
  const applyImageZoom = () => {
    fitScale = computeFitScale();
    currentScale = clampScale(fitScale * userZoom);
    if (image.naturalWidth && image.naturalHeight) {
      image.style.width = `${Math.max(1, Math.round(image.naturalWidth * currentScale))}px`;
      image.style.height = `${Math.max(1, Math.round(image.naturalHeight * currentScale))}px`;
      return;
    }
    image.style.width = 'auto';
    image.style.height = viewportHeight > 0
      ? `${Math.max(1, Math.round(viewportHeight * userZoom))}px`
      : `${userZoom * 100}%`;
  };
  const updateViewportSize = () => {
    viewportHeight = root.clientHeight || 0;
    applyImageZoom();
    zoomEmitter.emit();
  };
  const resizeObserver = new ResizeObserver(updateViewportSize);
  resizeObserver.observe(root);
  image.addEventListener('load', updateViewportSize);

  const getZoomState = (): FileViewerZoomState => ({
    scale: currentScale,
    label: `${Math.round(currentScale * 100)}%`,
    canZoomIn: currentScale < 5,
    canZoomOut: currentScale > getMinScale(),
    canReset: Math.abs(userZoom - 1) > 0.001,
    minScale: getMinScale(),
    maxScale: 5,
  });

  const setZoom = (scale: number) => {
    const nextScale = clampScale(scale);
    userZoom = nextScale / Math.max(fitScale, 0.001);
    applyImageZoom();
    zoomEmitter.emit();
    return getZoomState();
  };

  registerFileViewerZoomProvider(root, {
    zoomIn: () => setZoom(currentScale + 0.15),
    zoomOut: () => setZoom(currentScale - 0.15),
    resetZoom: () => {
      userZoom = 1;
      applyImageZoom();
      zoomEmitter.emit();
      return getZoomState();
    },
    setZoom,
    getState: getZoomState,
    subscribe: zoomEmitter.subscribe,
  });

  target.replaceChildren(createStyle(documentRef), root);
  (context?.surface?.shadowRoot || target).append(lightbox.element);
  updateViewportSize();

  return {
    $el: target,
    unmount() {
      unregisterFileViewerZoomProvider(root);
      resizeObserver.disconnect();
      image.removeEventListener('load', updateViewportSize);
      image.removeEventListener('click', openLightbox);
      lightbox.destroy();
      target.replaceChildren();
    },
  };
}
