import type { FileViewerPrintMaskOptions, FileViewerPrintMaskRegion } from '../contracts/types';
import { createFileViewerTranslator, type FileViewerI18nInput } from '../i18n/messages';
import { normalizeFileViewerPrintMaskRegion } from './printMask';

export interface OpenFileViewerPrintMaskDesignerOptions {
  root: HTMLElement;
  i18n?: FileViewerI18nInput;
  color?: string;
  initialRegions?: FileViewerPrintMaskRegion[];
}

export interface FileViewerPrintMaskDesignerResult {
  mask: FileViewerPrintMaskOptions;
}

type Point = { x: number; y: number };

const DESIGNER_STYLE = `
.fv-print-mask-layer{position:absolute;inset:0;z-index:40;pointer-events:none;}
.fv-print-mask-canvas{position:absolute;inset:0;pointer-events:auto;cursor:crosshair;touch-action:none;}
.fv-print-mask-block{position:absolute;background:#000;box-sizing:border-box;pointer-events:auto;}
.fv-print-mask-block-remove{position:absolute;right:-8px;top:-8px;width:18px;height:18px;border:0;border-radius:999px;background:#111;color:#fff;font:700 12px/18px system-ui,sans-serif;cursor:pointer;padding:0;}
.fv-print-mask-toolbar{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:41;display:inline-flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid rgba(20,35,53,.12);border-radius:999px;background:rgba(255,255,255,.94);box-shadow:0 12px 28px rgba(15,23,42,.16);pointer-events:auto;max-width:calc(100% - 24px);flex-wrap:wrap;justify-content:center;}
.fv-print-mask-toolbar span{font:600 12px/1.2 system-ui,sans-serif;color:#40546a;white-space:nowrap;}
.fv-print-mask-toolbar button{min-width:42px;height:30px;padding:0 10px;border:0;border-radius:999px;background:transparent;color:#40546a;font:800 12px/1 system-ui,sans-serif;cursor:pointer;}
.fv-print-mask-toolbar button:hover{background:rgba(33,163,102,.1);color:#16774c;}
.fv-print-mask-toolbar button.primary{background:#16774c;color:#fff;}
.fv-print-mask-toolbar button.primary:hover{background:#0f5f3c;}
`;

const ensureDesignerStyle = (documentRef: Document) => {
  if (documentRef.getElementById('fv-print-mask-designer-style')) {
    return;
  }
  const style = documentRef.createElement('style');
  style.id = 'fv-print-mask-designer-style';
  style.textContent = DESIGNER_STYLE;
  documentRef.head.appendChild(style);
};

const toPercentRegion = (
  start: Point,
  end: Point,
  bounds: DOMRect
): FileViewerPrintMaskRegion | null => {
  if (!bounds.width || !bounds.height) {
    return null;
  }
  const leftPx = Math.min(start.x, end.x);
  const topPx = Math.min(start.y, end.y);
  const widthPx = Math.abs(end.x - start.x);
  const heightPx = Math.abs(end.y - start.y);
  if (widthPx < 8 || heightPx < 8) {
    return null;
  }
  return normalizeFileViewerPrintMaskRegion({
    left: (leftPx / bounds.width) * 100,
    top: (topPx / bounds.height) * 100,
    width: (widthPx / bounds.width) * 100,
    height: (heightPx / bounds.height) * 100,
  });
};

/**
 * Opens an interactive print-mask designer over the rendered content.
 * Loaded asynchronously so the main viewer bundle stays lean.
 */
export const openFileViewerPrintMaskDesigner = (
  options: OpenFileViewerPrintMaskDesignerOptions
): Promise<FileViewerPrintMaskDesignerResult | null> => {
  const root = options.root;
  const documentRef = root.ownerDocument;
  const t = createFileViewerTranslator(options.i18n);
  const color = options.color || '#000000';
  const regions: FileViewerPrintMaskRegion[] = [...(options.initialRegions || [])]
    .map(region => normalizeFileViewerPrintMaskRegion(region))
    .filter((region): region is FileViewerPrintMaskRegion => !!region);

  ensureDesignerStyle(documentRef);

  const previousPosition = root.style.position;
  if (!previousPosition || previousPosition === 'static') {
    root.style.position = 'relative';
  }

  return new Promise(resolve => {
    let settled = false;
    let drawing: { start: Point; preview: HTMLDivElement } | null = null;

    const layer = documentRef.createElement('div');
    layer.className = 'fv-print-mask-layer';
    layer.setAttribute('data-viewer-print-mask-designer', 'true');

    const canvas = documentRef.createElement('div');
    canvas.className = 'fv-print-mask-canvas';

    const toolbar = documentRef.createElement('div');
    toolbar.className = 'fv-print-mask-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', t('toolbar.printMaskTitle'));

    const hint = documentRef.createElement('span');
    hint.textContent = t('toolbar.printMaskHint');

    const clearButton = documentRef.createElement('button');
    clearButton.type = 'button';
    clearButton.textContent = t('toolbar.printMaskClear');

    const cancelButton = documentRef.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = t('toolbar.printMaskCancel');

    const confirmButton = documentRef.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'primary';
    confirmButton.textContent = t('toolbar.printMaskConfirm');

    toolbar.append(hint, clearButton, cancelButton, confirmButton);
    layer.append(canvas, toolbar);
    root.appendChild(layer);

    const finish = (result: FileViewerPrintMaskDesignerResult | null) => {
      if (settled) {
        return;
      }
      settled = true;
      layer.remove();
      if (!previousPosition) {
        root.style.removeProperty('position');
      } else {
        root.style.position = previousPosition;
      }
      resolve(result);
    };

    const renderRegions = () => {
      canvas.replaceChildren();
      regions.forEach((region, index) => {
        const block = documentRef.createElement('div');
        block.className = 'fv-print-mask-block';
        block.style.left = `${region.left}%`;
        block.style.top = `${region.top}%`;
        block.style.width = `${region.width}%`;
        block.style.height = `${region.height}%`;
        block.style.background = color;

        const remove = documentRef.createElement('button');
        remove.type = 'button';
        remove.className = 'fv-print-mask-block-remove';
        remove.title = t('toolbar.printMaskClear');
        remove.setAttribute('aria-label', t('toolbar.printMaskClear'));
        remove.textContent = '−';
        remove.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          regions.splice(index, 1);
          renderRegions();
        });
        block.appendChild(remove);
        canvas.appendChild(block);
      });
    };

    const pointFromEvent = (event: PointerEvent): Point => {
      const bounds = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
        y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)),
      };
    };

    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      const start = pointFromEvent(event);
      const preview = documentRef.createElement('div');
      preview.className = 'fv-print-mask-block';
      preview.style.background = color;
      preview.style.opacity = '0.72';
      canvas.appendChild(preview);
      drawing = { start, preview };
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener('pointermove', event => {
      if (!drawing) {
        return;
      }
      const end = pointFromEvent(event);
      const left = Math.min(drawing.start.x, end.x);
      const top = Math.min(drawing.start.y, end.y);
      drawing.preview.style.left = `${left}px`;
      drawing.preview.style.top = `${top}px`;
      drawing.preview.style.width = `${Math.abs(end.x - drawing.start.x)}px`;
      drawing.preview.style.height = `${Math.abs(end.y - drawing.start.y)}px`;
    });

    const endDrawing = (event: PointerEvent) => {
      if (!drawing) {
        return;
      }
      const end = pointFromEvent(event);
      const bounds = canvas.getBoundingClientRect();
      const region = toPercentRegion(drawing.start, end, bounds);
      drawing.preview.remove();
      drawing = null;
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
      if (region) {
        regions.push(region);
        renderRegions();
      }
    };

    canvas.addEventListener('pointerup', endDrawing);
    canvas.addEventListener('pointercancel', endDrawing);

    clearButton.addEventListener('click', () => {
      regions.splice(0, regions.length);
      renderRegions();
    });
    cancelButton.addEventListener('click', () => finish(null));
    confirmButton.addEventListener('click', () => {
      if (!regions.length) {
        finish(null);
        return;
      }
      finish({
        mask: {
          regions: regions.map(region => ({ ...region })),
          color,
        },
      });
    });

    renderRegions();
  });
};
