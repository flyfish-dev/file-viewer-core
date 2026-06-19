import type {
  FileViewerDocumentAnchor,
  FileViewerSearchProvider,
  FileViewerZoomProvider,
} from './types';

export interface FileViewerSearchProviderHost extends HTMLElement {
  __flyfishViewerSearchProvider?: FileViewerSearchProvider;
}

export interface FileViewerZoomProviderHost extends HTMLElement {
  __flyfishViewerZoomProvider?: FileViewerZoomProvider;
}

export const DEFAULT_FILE_VIEWER_ANCHOR_SELECTOR = [
  '[data-viewer-anchor-id]',
  '.pdfViewer .page',
  '.docx-wrapper section',
  '.docx p',
  '.docx li',
  '.docx table',
  '.markdown-body h1',
  '.markdown-body h2',
  '.markdown-body h3',
  '.markdown-body h4',
  '.markdown-body h5',
  '.markdown-body h6',
  '.markdown-body p',
  '.markdown-body li',
  '.markdown-body pre',
  '.markdown-body table',
  'article h1',
  'article h2',
  'article h3',
  'article h4',
  'article h5',
  'article h6',
  'article p',
  'article li',
  'article pre',
  'article table',
  'pre code',
  'p',
  'li',
  'tr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'pre',
  'table',
].join(',');

export const DEFAULT_FILE_VIEWER_ANCHOR_EXCLUDE_SELECTOR = [
  '.viewer-actions',
  '.viewer-watermark',
  '.state-panel',
  '.pdf-toolbar',
  '.pdf-nav-pane',
  '.flyfish-search-match',
].join(',');

const searchProviderRegistry = new WeakMap<HTMLElement, FileViewerSearchProvider>();
const zoomProviderRegistry = new WeakMap<HTMLElement, FileViewerZoomProvider>();

export const DEFAULT_FILE_VIEWER_SCROLL_CONTAINER_SELECTOR = '[data-viewer-scroll-container], .pdf-wrapper';
export const DEFAULT_FILE_VIEWER_SCROLL_CONTAINER_CANDIDATE_SELECTOR = 'div, section, article, pre';
export const DEFAULT_FILE_VIEWER_SCROLLABLE_OVERFLOW_VALUES = ['auto', 'scroll', 'overlay'] as const;

export interface ResolveFileViewerScrollContainerOptions {
  preferredSelector?: string;
  candidateSelector?: string;
  overflowValues?: readonly string[];
  minScrollRange?: number;
}

const cssEscape = (value: string) => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
};

const trimText = (value: string, maxLength = 160) => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
};

const isElementVisible = (element: Element) => {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
};

const shouldSkipAnchorElement = (element: Element) => {
  return !!element.closest(DEFAULT_FILE_VIEWER_ANCHOR_EXCLUDE_SELECTOR);
};

const getPageNumber = (element: Element) => {
  const pageElement = element.closest<HTMLElement>('[data-page-number], [data-page]');
  const rawPage = pageElement?.dataset.pageNumber || pageElement?.dataset.page;
  const page = rawPage ? Number.parseInt(rawPage, 10) : Number.NaN;
  return Number.isFinite(page) ? page : undefined;
};

const getAnchorType = (element: Element): FileViewerDocumentAnchor['type'] => {
  if (element.matches('.pdfViewer .page, [data-page-number], [data-page]')) {
    return 'page';
  }
  if (element.matches('p, li, tr, pre, code')) {
    return 'line';
  }
  return 'block';
};

const isNestedInAcceptedElement = (element: Element, acceptedElements: Set<Element>) => {
  let parent = element.parentElement;
  while (parent) {
    if (acceptedElements.has(parent)) {
      return true;
    }
    parent = parent.parentElement;
  }
  return false;
};

export const getFileViewerScrollableRange = (element: HTMLElement) => {
  return Math.max(0, element.scrollHeight - element.clientHeight);
};

export const isFileViewerScrollableElement = (
  element: HTMLElement,
  options: ResolveFileViewerScrollContainerOptions = {}
) => {
  const minScrollRange = options.minScrollRange ?? 2;
  if (getFileViewerScrollableRange(element) <= minScrollRange) {
    return false;
  }

  const ownerView = element.ownerDocument?.defaultView;
  const view = ownerView?.getComputedStyle
    ? ownerView
    : (typeof window !== 'undefined' ? window : undefined);
  if (!view?.getComputedStyle) {
    return false;
  }

  const style = view.getComputedStyle(element);
  const overflowY = style.overflowY || style.overflow;
  const overflowValues = options.overflowValues || DEFAULT_FILE_VIEWER_SCROLLABLE_OVERFLOW_VALUES;
  return overflowValues.includes(overflowY);
};

export const resolveFileViewerScrollContainer = (
  root: HTMLElement | null | undefined,
  options: ResolveFileViewerScrollContainerOptions = {}
) => {
  if (!root) {
    return null;
  }

  const preferredSelector = options.preferredSelector || DEFAULT_FILE_VIEWER_SCROLL_CONTAINER_SELECTOR;
  const candidateSelector = options.candidateSelector || DEFAULT_FILE_VIEWER_SCROLL_CONTAINER_CANDIDATE_SELECTOR;
  const preferred = root.querySelector<HTMLElement>(preferredSelector);
  if (preferred && isFileViewerScrollableElement(preferred, options)) {
    return preferred;
  }
  if (isFileViewerScrollableElement(root, options)) {
    return root;
  }

  const scrollableChildren = Array.from(root.querySelectorAll<HTMLElement>(candidateSelector))
    .filter(element => isFileViewerScrollableElement(element, options))
    .sort((a, b) => getFileViewerScrollableRange(b) - getFileViewerScrollableRange(a));
  return scrollableChildren[0] || preferred || root;
};

export const collectFileViewerDocumentAnchors = (root: HTMLElement | null): FileViewerDocumentAnchor[] => {
  if (!root) {
    return [];
  }

  const rootRect = root.getBoundingClientRect();
  const acceptedElements = new Set<Element>();
  const anchors: FileViewerDocumentAnchor[] = [];
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(DEFAULT_FILE_VIEWER_ANCHOR_SELECTOR));

  candidates.forEach(element => {
    if (shouldSkipAnchorElement(element) || !isElementVisible(element)) {
      return;
    }
    const text = trimText(element.textContent || '', 1000);
    if (!text) {
      return;
    }
    if (isNestedInAcceptedElement(element, acceptedElements) && !element.matches('p, li, tr, pre, code')) {
      return;
    }

    acceptedElements.add(element);
    const id = element.dataset.viewerAnchorId || `viewer-anchor-${anchors.length + 1}`;
    element.dataset.viewerAnchorId = id;
    element.dataset.viewerLine = String(anchors.length + 1);

    const rect = element.getBoundingClientRect();
    anchors.push({
      id,
      index: anchors.length,
      line: anchors.length + 1,
      type: getAnchorType(element),
      label: trimText(text, 96),
      text,
      page: getPageNumber(element),
      top: rect.top - rootRect.top + root.scrollTop,
      left: rect.left - rootRect.left + root.scrollLeft,
      width: rect.width,
      height: rect.height,
    });
  });

  return anchors;
};

export const findFileViewerAnchorForElement = (
  element: Element | null,
  anchors: FileViewerDocumentAnchor[],
  root?: HTMLElement | null
) => {
  if (!element) {
    return null;
  }

  const anchorElement = element.closest<HTMLElement>('[data-viewer-anchor-id]');
  if (anchorElement?.dataset.viewerAnchorId) {
    const anchor = anchors.find(item => item.id === anchorElement.dataset.viewerAnchorId);
    if (anchor) {
      return anchor;
    }
  }

  if (!root) {
    return null;
  }

  const rootRect = root.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const top = rect.top - rootRect.top + root.scrollTop;
  let fallback: FileViewerDocumentAnchor | null = null;
  for (const anchor of anchors) {
    if (anchor.top <= top + 1) {
      fallback = anchor;
      continue;
    }
    break;
  }
  return fallback;
};

export const getCurrentFileViewerDocumentAnchor = (
  root: HTMLElement | null,
  anchors: FileViewerDocumentAnchor[]
) => {
  if (!root || !anchors.length) {
    return null;
  }
  const viewportMiddle = root.scrollTop + root.clientHeight * 0.42;
  let current = anchors[0];
  for (const anchor of anchors) {
    if (anchor.top <= viewportMiddle) {
      current = anchor;
      continue;
    }
    break;
  }
  return current;
};

export const scrollToFileViewerDocumentAnchor = (
  root: HTMLElement | null,
  anchor: FileViewerDocumentAnchor | string | number | null | undefined
) => {
  if (!root || anchor === null || anchor === undefined) {
    return false;
  }

  const selector = typeof anchor === 'object'
    ? `[data-viewer-anchor-id="${cssEscape(anchor.id)}"]`
    : typeof anchor === 'number'
      ? `[data-viewer-line="${anchor}"]`
      : `[data-viewer-anchor-id="${cssEscape(anchor)}"]`;

  const target = root.querySelector<HTMLElement>(selector);
  if (target) {
    target.scrollIntoView({ block: 'center', inline: 'nearest' });
    return true;
  }

  if (typeof anchor === 'object') {
    root.scrollTo({
      top: Math.max(0, anchor.top - root.clientHeight * 0.18),
      left: Math.max(0, Math.min(anchor.left, root.scrollWidth - root.clientWidth)),
      behavior: 'smooth',
    });
    return true;
  }

  return false;
};

export const registerFileViewerSearchProvider = (
  host: HTMLElement,
  provider: FileViewerSearchProvider
) => {
  searchProviderRegistry.set(host, provider);
  (host as FileViewerSearchProviderHost).__flyfishViewerSearchProvider = provider;
};

export const unregisterFileViewerSearchProvider = (host: HTMLElement | null | undefined) => {
  if (!host) {
    return;
  }
  searchProviderRegistry.delete(host);
  delete (host as FileViewerSearchProviderHost).__flyfishViewerSearchProvider;
};

export const findFileViewerSearchProvider = (root: HTMLElement | null | undefined) => {
  if (!root) {
    return null;
  }

  const direct = searchProviderRegistry.get(root) || (root as FileViewerSearchProviderHost).__flyfishViewerSearchProvider;
  if (direct) {
    return direct;
  }

  const host = root.querySelector<FileViewerSearchProviderHost>('[data-viewer-search-provider]');
  return host
    ? searchProviderRegistry.get(host) || host.__flyfishViewerSearchProvider || null
    : null;
};

export const registerFileViewerZoomProvider = (
  host: HTMLElement,
  provider: FileViewerZoomProvider
) => {
  zoomProviderRegistry.set(host, provider);
  host.dataset.viewerZoomProvider = host.dataset.viewerZoomProvider || 'custom';
  (host as FileViewerZoomProviderHost).__flyfishViewerZoomProvider = provider;
};

export const unregisterFileViewerZoomProvider = (host: HTMLElement | null | undefined) => {
  if (!host) {
    return;
  }
  zoomProviderRegistry.delete(host);
  delete host.dataset.viewerZoomProvider;
  delete (host as FileViewerZoomProviderHost).__flyfishViewerZoomProvider;
};

export const findFileViewerZoomProvider = (root: HTMLElement | null | undefined) => {
  if (!root) {
    return null;
  }

  const direct = zoomProviderRegistry.get(root) || (root as FileViewerZoomProviderHost).__flyfishViewerZoomProvider;
  if (direct) {
    return direct;
  }

  const host = root.querySelector<FileViewerZoomProviderHost>('[data-viewer-zoom-provider]');
  return host
    ? zoomProviderRegistry.get(host) || host.__flyfishViewerZoomProvider || null
    : null;
};
