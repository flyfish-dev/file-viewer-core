import type {
  FileViewerSearchProvider,
  FileViewerViewStateProvider,
  FileViewerZoomProvider,
} from '../../../contracts/types';

export interface FileViewerSearchProviderHost extends HTMLElement {
  __flyfishViewerSearchProvider?: FileViewerSearchProvider;
}

export interface FileViewerZoomProviderHost extends HTMLElement {
  __flyfishViewerZoomProvider?: FileViewerZoomProvider;
}

export interface FileViewerViewStateProviderHost extends HTMLElement {
  __flyfishViewerViewStateProvider?: FileViewerViewStateProvider;
}

const searchProviderRegistry = new WeakMap<HTMLElement, FileViewerSearchProvider>();
const zoomProviderRegistry = new WeakMap<HTMLElement, FileViewerZoomProvider>();
const viewStateProviderRegistry = new WeakMap<HTMLElement, FileViewerViewStateProvider>();

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

export const registerFileViewerViewStateProvider = (
  host: HTMLElement,
  provider: FileViewerViewStateProvider
) => {
  viewStateProviderRegistry.set(host, provider);
  host.dataset.viewerViewStateProvider = host.dataset.viewerViewStateProvider || 'custom';
  (host as FileViewerViewStateProviderHost).__flyfishViewerViewStateProvider = provider;
};

export const unregisterFileViewerViewStateProvider = (host: HTMLElement | null | undefined) => {
  if (!host) {
    return;
  }
  viewStateProviderRegistry.delete(host);
  delete host.dataset.viewerViewStateProvider;
  delete (host as FileViewerViewStateProviderHost).__flyfishViewerViewStateProvider;
};

export const findFileViewerViewStateProvider = (root: HTMLElement | null | undefined) => {
  if (!root) {
    return null;
  }

  const direct = viewStateProviderRegistry.get(root) ||
    (root as FileViewerViewStateProviderHost).__flyfishViewerViewStateProvider;
  if (direct && root.dataset.viewerViewStateProvider !== 'generic') {
    return direct;
  }

  const hosts = Array.from(
    root.querySelectorAll<FileViewerViewStateProviderHost>('[data-viewer-view-state-provider]')
  );
  const customHost = hosts.find(host => host.dataset.viewerViewStateProvider !== 'generic');
  const genericHost = hosts.find(host => host.dataset.viewerViewStateProvider === 'generic');
  const host = customHost || genericHost;
  if (host) {
    return viewStateProviderRegistry.get(host) || host.__flyfishViewerViewStateProvider || null;
  }
  return direct || null;
};
