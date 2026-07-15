import type { FileViewerPrintMaskOptions, FileViewerPrintMaskRegion } from '../contracts/types';

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

export const normalizeFileViewerPrintMaskRegion = (
  region: Partial<FileViewerPrintMaskRegion> | null | undefined
): FileViewerPrintMaskRegion | null => {
  if (!region) {
    return null;
  }
  const pageIndex = region.pageIndex;
  if (
    pageIndex !== undefined &&
    (!Number.isInteger(pageIndex) || pageIndex < 0)
  ) {
    return null;
  }
  const left = clampPercent(Number(region.left) || 0);
  const top = clampPercent(Number(region.top) || 0);
  const width = clampPercent(Number(region.width) || 0);
  const height = clampPercent(Number(region.height) || 0);
  if (width <= 0 || height <= 0) {
    return null;
  }
  return {
    left,
    top,
    width: Math.min(width, 100 - left),
    height: Math.min(height, 100 - top),
    ...(pageIndex === undefined ? {} : { pageIndex }),
  };
};

export const normalizeFileViewerPrintMaskOptions = (
  mask?: FileViewerPrintMaskOptions | null
): FileViewerPrintMaskOptions | null => {
  if (!mask || !Array.isArray(mask.regions) || !mask.regions.length) {
    return null;
  }
  const regions = mask.regions
    .map(region => normalizeFileViewerPrintMaskRegion(region))
    .filter((region): region is FileViewerPrintMaskRegion => !!region);
  if (!regions.length) {
    return null;
  }
  return {
    regions,
    color: mask.color || '#000000',
  };
};

export const buildFileViewerPrintMaskOverlayHtml = (
  mask?: FileViewerPrintMaskOptions | null,
  pageScoped = false
): string => {
  const normalized = normalizeFileViewerPrintMaskOptions(mask);
  if (!normalized?.regions?.length) {
    return '';
  }
  const color = normalized.color || '#000000';
  const blocks = normalized.regions.map(region => (
    `<div class="viewer-export-print-mask-block" style="left:${region.left}%;top:${region.top}%;width:${region.width}%;height:${region.height}%;background:${color};"></div>`
  )).join('');
  const className = pageScoped
    ? 'viewer-export-print-mask viewer-export-print-mask--page'
    : 'viewer-export-print-mask';
  return `<div class="${className}" aria-hidden="true">${blocks}</div>`;
};

export const FILE_VIEWER_PRINT_MASK_STYLE = `
  .viewer-export-print-mask{position:absolute;inset:0;z-index:15;pointer-events:none;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
  .viewer-export-print-mask--page{z-index:2147483647;}
  .viewer-export-print-mask-block{position:absolute;box-sizing:border-box;print-color-adjust:exact;-webkit-print-color-adjust:exact;}
  [data-viewer-print-page-index]{position:relative!important;isolation:isolate;}
`;

export const applyFileViewerPagePrintMasksToHtml = (
  contentHtml: string,
  mask?: FileViewerPrintMaskOptions | null
) => {
  const normalized = normalizeFileViewerPrintMaskOptions(mask);
  if (!normalized) {
    return contentHtml;
  }
  const regionsByPage = new Map<number, FileViewerPrintMaskRegion[]>();
  normalized.regions?.forEach(region => {
    if (region.pageIndex === undefined) {
      return;
    }
    const pageRegions = regionsByPage.get(region.pageIndex) || [];
    pageRegions.push(region);
    regionsByPage.set(region.pageIndex, pageRegions);
  });
  if (!regionsByPage.size) {
    return contentHtml;
  }

  return contentHtml.replace(
    /(<[A-Za-z][^>]*\sdata-viewer-print-page-index=(['"])(\d+)\2[^>]*>)/g,
    (match, openingTag: string, _quote: string, rawPageIndex: string) => {
      const pageRegions = regionsByPage.get(Number(rawPageIndex));
      if (!pageRegions?.length) {
        return match;
      }
      return `${openingTag}${buildFileViewerPrintMaskOverlayHtml({
        regions: pageRegions,
        color: normalized.color,
      }, true)}`;
    }
  );
};
