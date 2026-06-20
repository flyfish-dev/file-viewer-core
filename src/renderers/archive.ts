import {
  resolveFileViewerArchiveWasmUrl,
  resolveFileViewerArchiveWorkerUrl,
} from '../platform/assets';
import { disposeFileViewerRendered } from '../rendering/handler';
import type {
  FileRenderContext,
  FileViewerArchiveOptions,
  FileViewerOptions,
  FileViewerRenderedInstance,
} from '../contracts/types';
import {
  createArchiveCacheKey,
  flattenArchiveObject,
  formatArchiveBytes,
  getArchiveEntryExtension,
  type ArchiveEntryView,
} from './archiveShared';
import { readArchiveCache, writeArchiveCache } from './archiveCache';
import { loadArchiveEntriesWithoutWorker } from './archiveFallback';

type WorkerConstructor = new (scriptURL: string | URL, options?: WorkerOptions) => Worker;
type FileConstructor = new (fileBits: BlobPart[], fileName: string, options?: FilePropertyBag) => File;

interface ArchiveWorkerCandidate {
  label: string;
  workerUrl: string;
  wasmUrl?: string;
}

const DEFAULT_MAX_ARCHIVE_SIZE = 320 * 1024 * 1024;
const DEFAULT_MAX_ENTRY_PREVIEW_SIZE = 64 * 1024 * 1024;
const DEFAULT_WORKER_TIMEOUT_MS = 30000;
const MAX_LISTED_ENTRIES = 5000;

const archiveStyle = `
.archive-shell,.archive-viewer{position:relative;box-sizing:border-box;height:100%;min-height:0;display:grid;grid-template-columns:minmax(280px,34%) minmax(0,1fr);background:#edf2f7;color:#172033;font-family:Aptos,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif}
.archive-shell *,.archive-viewer *{box-sizing:border-box}
.archive-sidebar{min-width:0;min-height:0;display:flex;flex-direction:column;gap:12px;padding:16px;border-right:1px solid rgba(23,32,51,.08);background:rgba(255,255,255,.72)}
.archive-head span,.archive-preview-toolbar span{color:#6c7c90;font-size:12px;font-weight:800;letter-spacing:0}
.archive-head strong,.archive-preview-toolbar strong{display:block;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:18px;line-height:1.25}
.archive-head p{margin:8px 0 0;color:#69798b;font-size:13px}
.archive-warning,.archive-info,.archive-error{border-radius:12px;padding:10px 12px;background:#fff7e8;color:#8a4b00;font-size:13px;line-height:1.5}
.archive-info{background:#ecfdf5;color:#166534}
.archive-search{width:100%;height:42px;padding:0 12px;border-radius:12px;border:1px solid rgba(23,32,51,.1);outline:none;background:#fff;color:#172033;font:inherit}
.archive-list{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:7px;padding-right:4px}
.archive-entry{width:100%;min-height:58px;display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px 10px 8px calc(10px + var(--entry-depth,0) * 10px);border:1px solid rgba(23,32,51,.07);border-radius:12px;background:rgba(255,255,255,.86);color:inherit;text-align:left;cursor:pointer;font:inherit}
.archive-entry:hover,.archive-entry.active{border-color:rgba(33,129,95,.28);box-shadow:0 10px 22px rgba(23,32,51,.08)}
.entry-ext{height:34px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;background:rgba(33,129,95,.12);color:#1d7a56;font-size:11px;font-weight:900;text-transform:uppercase}
.entry-copy{min-width:0}
.entry-copy strong,.entry-copy em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.entry-copy em,.archive-entry small{color:#718096;font-size:12px;font-style:normal}
.archive-preview{min-width:0;min-height:0;display:flex;flex-direction:column}
.archive-preview-toolbar{min-height:64px;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 16px;border-bottom:1px solid rgba(23,32,51,.08);background:rgba(255,255,255,.76)}
.archive-preview-toolbar button{height:34px;border:0;border-radius:10px;padding:0 12px;background:#1f7a58;color:#fff;font:inherit;font-size:13px;font-weight:800;cursor:pointer}
.archive-nested-target{position:relative;flex:1;min-height:0;overflow:auto}
.archive-nested-content{width:100%;height:100%;min-height:420px}
.archive-empty{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px;text-align:center;color:#64748b}
.archive-empty strong{color:#172033;font-size:18px}
.archive-state{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(241,245,249,.82);backdrop-filter:blur(8px);z-index:4}
.archive-state>div{display:flex;align-items:center;gap:14px;width:min(92%,430px);padding:18px;border-radius:16px;background:#fff;box-shadow:0 18px 42px rgba(15,23,42,.14)}
.archive-state p{margin:4px 0 0;color:#64748b}
.archive-spinner{width:34px;height:34px;flex-shrink:0;border-radius:999px;border:3px solid rgba(31,122,88,.16);border-top-color:#1f7a58;animation:archive-spin .9s linear infinite}
.archive-error{position:absolute;right:18px;bottom:18px;width:min(460px,calc(100% - 36px));box-shadow:0 16px 36px rgba(23,32,51,.14);z-index:5}
.archive-hidden{display:none!important}
.file-viewer[data-viewer-theme='dark'] .archive-shell,.file-viewer[data-viewer-theme='dark'] .archive-viewer{background:#101820;color:#e6edf3}
.file-viewer[data-viewer-theme='dark'] .archive-sidebar,.file-viewer[data-viewer-theme='dark'] .archive-preview-toolbar{border-color:rgba(139,148,158,.2);background:rgba(21,27,35,.82)}
.file-viewer[data-viewer-theme='dark'] .archive-entry,.file-viewer[data-viewer-theme='dark'] .archive-search,.file-viewer[data-viewer-theme='dark'] .archive-state>div{background:#151b23;color:#e6edf3;border-color:rgba(139,148,158,.2)}
.file-viewer[data-viewer-theme='dark'] .archive-empty strong{color:#f8fafc}
@media (prefers-color-scheme:dark){.file-viewer[data-viewer-theme='system'] .archive-shell,.file-viewer[data-viewer-theme='system'] .archive-viewer{background:#101820;color:#e6edf3}.file-viewer[data-viewer-theme='system'] .archive-sidebar,.file-viewer[data-viewer-theme='system'] .archive-preview-toolbar{border-color:rgba(139,148,158,.2);background:rgba(21,27,35,.82)}.file-viewer[data-viewer-theme='system'] .archive-entry,.file-viewer[data-viewer-theme='system'] .archive-search,.file-viewer[data-viewer-theme='system'] .archive-state>div{background:#151b23;color:#e6edf3;border-color:rgba(139,148,158,.2)}.file-viewer[data-viewer-theme='system'] .archive-empty strong{color:#f8fafc}}
@keyframes archive-spin{to{transform:rotate(360deg)}}
@media (max-width:860px){.archive-shell,.archive-viewer{grid-template-columns:1fr;grid-template-rows:minmax(220px,38%) minmax(0,1fr)}.archive-sidebar{border-right:0;border-bottom:1px solid rgba(23,32,51,.08)}}
`;

const createStyle = (documentRef: Document) => {
  const style = documentRef.createElement('style');
  style.textContent = archiveStyle;
  return style;
};

const createElement = <K extends keyof HTMLElementTagNameMap>(
  documentRef: Document,
  tagName: K,
  className?: string,
  text?: string
) => {
  const element = documentRef.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
};

const normalizeWorkerError = (reason: unknown) => {
  if (reason instanceof Error) {
    return reason.message;
  }
  return typeof reason === 'string' ? reason : JSON.stringify(reason);
};

const withTimeout = async <T,>(
  promise: Promise<T>,
  timeout: number,
  message: string,
  targetWindow?: Window | null
) => {
  let timer = 0;
  const timerWindow = targetWindow || (typeof window !== 'undefined' ? window : undefined);

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = timerWindow?.setTimeout
          ? timerWindow.setTimeout(() => reject(new Error(message)), timeout)
          : setTimeout(() => reject(new Error(message)), timeout) as unknown as number;
      }),
    ]);
  } finally {
    if (timerWindow?.clearTimeout) {
      timerWindow.clearTimeout(timer);
    } else {
      clearTimeout(timer as unknown as ReturnType<typeof setTimeout>);
    }
  }
};

const getDocumentBaseUrl = (documentRef: Document) => {
  return documentRef.baseURI ||
    documentRef.URL ||
    'http://localhost/';
};

const getWorkerConstructor = (documentRef: Document): WorkerConstructor => {
  const WorkerCtor = documentRef.defaultView?.Worker ||
    (typeof Worker !== 'undefined' ? Worker : undefined);
  if (!WorkerCtor) {
    throw new Error('当前浏览器不支持 Web Worker');
  }
  return WorkerCtor as WorkerConstructor;
};

const getFileConstructor = (documentRef: Document): FileConstructor | undefined => {
  return (documentRef.defaultView?.File ||
    (typeof File !== 'undefined' ? File : undefined)) as FileConstructor | undefined;
};

const createArchiveFile = (documentRef: Document, buffer: ArrayBuffer, filename: string) => {
  const FileCtor = getFileConstructor(documentRef);
  if (FileCtor) {
    return new FileCtor([buffer], filename || 'archive.bin', {
      type: 'application/octet-stream',
    });
  }
  return Object.assign(new Blob([buffer], { type: 'application/octet-stream' }), {
    name: filename || 'archive.bin',
  }) as File;
};

const probeWorkerUrl = async (url: string) => {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && /javascript|ecmascript|octet-stream/i.test(contentType)) {
      return true;
    }
    if (response.status && response.status !== 405) {
      return false;
    }
  } catch {
    // Some local servers do not support HEAD; continue with a tiny GET probe.
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-cache',
      headers: {
        Range: 'bytes=0-0',
      },
    });
    const contentType = response.headers.get('content-type') || '';
    return response.ok && /javascript|ecmascript|octet-stream/i.test(contentType);
  } catch {
    return false;
  }
};

const patchLibarchiveWorkerSource = (source: string, wasmUrl: string) => {
  const wasmLiteral = JSON.stringify(wasmUrl);
  return source.replace(
    /new URL\((['"])libarchive\.wasm\1\s*,\s*import\.meta\.url\)\.href/g,
    wasmLiteral
  );
};

const prepareWorkerUrl = async (
  candidate: ArchiveWorkerCandidate,
  objectUrls: string[]
) => {
  if (!candidate.wasmUrl) {
    return candidate.workerUrl;
  }

  const response = await fetch(candidate.workerUrl, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`无法读取 libarchive Worker: ${response.status}`);
  }
  const source = await response.text();
  const workerUrl = URL.createObjectURL(new Blob([
    patchLibarchiveWorkerSource(source, candidate.wasmUrl),
  ], { type: 'application/javascript' }));
  objectUrls.push(workerUrl);
  return workerUrl;
};

const resolveWorkerCandidates = async (
  documentRef: Document,
  options?: FileViewerArchiveOptions
): Promise<ArchiveWorkerCandidate[]> => {
  const candidates: ArchiveWorkerCandidate[] = [];
  const baseUrl = getDocumentBaseUrl(documentRef);
  const wasmUrl = options?.wasmUrl
    ? resolveFileViewerArchiveWasmUrl(options, '')
    : undefined;

  if (options?.workerUrl) {
    candidates.push({
      label: '自定义 libarchive Worker',
      workerUrl: resolveFileViewerArchiveWorkerUrl(options, baseUrl),
      wasmUrl,
    });
    return candidates;
  }

  const publicWorkerUrl = resolveFileViewerArchiveWorkerUrl(undefined, baseUrl);
  if (await probeWorkerUrl(publicWorkerUrl)) {
    candidates.push({
      label: '静态 libarchive Worker',
      workerUrl: publicWorkerUrl,
      wasmUrl,
    });
  }

  return candidates;
};

const buildNestedOptions = (
  context: FileRenderContext | undefined,
  archiveOptions: FileViewerArchiveOptions | undefined
): FileViewerOptions => ({
  ...(context?.options || {}),
  archive: archiveOptions,
});

const renderNestedWithCoreFallback = async (
  buffer: ArrayBuffer,
  type: string,
  target: HTMLDivElement,
  context?: FileRenderContext
) => {
  const { fileViewerCoreRendererDispatcher } = await import('./index');
  const handler = fileViewerCoreRendererDispatcher.resolve(type);
  if (!handler) {
    target.textContent = `不支持.${type}格式的在线预览，请下载后预览或转换为支持的格式`;
    return undefined;
  }
  return handler(buffer, target, type, {
    ...context,
    renderNestedBuffer: context?.renderNestedBuffer || renderNestedWithCoreFallback,
  });
};

export default async function renderArchive(
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  _type?: string,
  context?: FileRenderContext
): Promise<FileViewerRenderedInstance> {
  const documentRef = target.ownerDocument;
  const targetWindow = documentRef.defaultView || null;
  const archiveOptions = context?.options?.archive;
  const filename = context?.filename || 'archive.bin';
  const maxArchiveSize = archiveOptions?.maxArchiveSize || DEFAULT_MAX_ARCHIVE_SIZE;
  const maxEntryPreviewSize = archiveOptions?.maxEntryPreviewSize || DEFAULT_MAX_ENTRY_PREVIEW_SIZE;
  const cacheEnabled = archiveOptions?.cache !== false;
  const workerTimeoutMs = archiveOptions?.workerTimeoutMs || DEFAULT_WORKER_TIMEOUT_MS;
  const objectUrls: string[] = [];
  const cleanups: Array<() => void> = [];
  let archiveReader: any = null;
  let entries: ArchiveEntryView[] = [];
  let selectedEntry: ArchiveEntryView | null = null;
  let nestedRendered: FileViewerRenderedInstance | undefined;
  let loading = false;
  let loadingText = '正在读取压缩包目录...';
  let loadingHint = '大文件会在 Worker 中解析，避免阻塞主线程。';
  let errorText = '';
  let archiveNotice = '';
  let encrypted: boolean | null = null;
  let filterText = '';

  const style = createStyle(documentRef);
  const root = createElement(documentRef, 'section', 'archive-shell archive-viewer');
  const sidebar = createElement(documentRef, 'aside', 'archive-sidebar');
  const head = createElement(documentRef, 'div', 'archive-head');
  const badge = createElement(documentRef, 'span', undefined, 'ARCHIVE');
  const title = createElement(documentRef, 'strong', undefined, filename);
  const stats = createElement(documentRef, 'p');
  head.append(badge, title, stats);

  const warning = createElement(documentRef, 'div', 'archive-warning');
  const info = createElement(documentRef, 'div', 'archive-info');
  const search = createElement(documentRef, 'input', 'archive-search') as HTMLInputElement;
  search.type = 'search';
  search.placeholder = '筛选压缩包内文件';
  const list = createElement(documentRef, 'div', 'archive-list');
  list.setAttribute('role', 'list');
  sidebar.append(head, warning, info, search, list);

  const preview = createElement(documentRef, 'main', 'archive-preview');
  const toolbar = createElement(documentRef, 'div', 'archive-preview-toolbar');
  const toolbarTitle = createElement(documentRef, 'div');
  toolbarTitle.append(
    createElement(documentRef, 'span', undefined, '压缩包内预览'),
    createElement(documentRef, 'strong', undefined, '请选择一个文件')
  );
  const downloadButton = createElement(documentRef, 'button', undefined, '下载文件') as HTMLButtonElement;
  downloadButton.type = 'button';
  toolbar.append(toolbarTitle, downloadButton);
  const nestedTarget = createElement(documentRef, 'div', 'archive-nested-target') as HTMLDivElement;
  preview.append(toolbar, nestedTarget);
  root.append(sidebar, preview);

  const state = createElement(documentRef, 'div', 'archive-state');
  const stateContent = createElement(documentRef, 'div');
  const spinner = createElement(documentRef, 'span', 'archive-spinner');
  const stateCopy = createElement(documentRef, 'div');
  const stateTitle = createElement(documentRef, 'strong', undefined, loadingText);
  const stateHint = createElement(documentRef, 'p', undefined, loadingHint);
  stateCopy.append(stateTitle, stateHint);
  stateContent.append(spinner, stateCopy);
  state.append(stateContent);
  root.append(state);

  const error = createElement(documentRef, 'div', 'archive-error');
  const errorTitle = createElement(documentRef, 'strong', undefined, '压缩包预览提示');
  const errorMessage = createElement(documentRef, 'p');
  error.append(errorTitle, errorMessage);
  root.append(error);
  target.replaceChildren(style, root);

  const listen = <K extends keyof HTMLElementEventMap>(
    element: HTMLElement,
    event: K,
    listener: (event: HTMLElementEventMap[K]) => void
  ) => {
    element.addEventListener(event, listener as EventListener);
    cleanups.push(() => element.removeEventListener(event, listener as EventListener));
  };

  const getArchiveStats = () => {
    const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
    const previewableCount = entries.filter(entry => entry.previewable).length;
    return {
      count: entries.length,
      totalSize,
      previewableCount,
    };
  };

  const getFilteredEntries = () => {
    const keyword = filterText.trim().toLowerCase();
    const source = keyword
      ? entries.filter(entry => entry.path.toLowerCase().includes(keyword))
      : entries;
    return source.slice(0, MAX_LISTED_ENTRIES);
  };

  const clearNestedPreview = async () => {
    await disposeFileViewerRendered(nestedRendered);
    nestedRendered = undefined;
    nestedTarget.replaceChildren();
  };

  const closeArchive = async () => {
    await archiveReader?.close?.();
    archiveReader = null;
  };

  const syncState = () => {
    const archiveStats = getArchiveStats();
    stats.textContent = `${archiveStats.count} 个文件 · ${formatArchiveBytes(archiveStats.totalSize)} · ${archiveStats.previewableCount} 个可直接预览`;
    warning.textContent = '检测到加密内容，当前在线预览不接收密码，建议下载后本地解压。';
    warning.classList.toggle('archive-hidden', !encrypted);
    info.textContent = archiveNotice;
    info.classList.toggle('archive-hidden', !archiveNotice);
    state.classList.toggle('archive-hidden', !loading);
    stateTitle.textContent = loadingText;
    stateHint.textContent = loadingHint;
    error.classList.toggle('archive-hidden', !errorText);
    errorMessage.textContent = errorText;
    downloadButton.hidden = !selectedEntry;
    const activeTitle = toolbarTitle.querySelector('strong');
    if (activeTitle) {
      activeTitle.textContent = selectedEntry?.name || '请选择一个文件';
    }
  };

  const renderEmptyState = () => {
    if (selectedEntry || loading || nestedTarget.childElementCount) {
      return;
    }
    const empty = createElement(documentRef, 'div', 'archive-empty');
    empty.append(
      createElement(documentRef, 'strong', undefined, '选择左侧文件即可预览'),
      createElement(documentRef, 'p', undefined, '压缩包只读取目录；文件内容会在点击后按需解压，并在体积允许时缓存到 IndexedDB。')
    );
    nestedTarget.replaceChildren(empty);
  };

  const renderEntryList = () => {
    list.replaceChildren();
    getFilteredEntries().forEach(entry => {
      const button = createElement(documentRef, 'button', 'archive-entry') as HTMLButtonElement;
      button.type = 'button';
      button.style.setProperty('--entry-depth', String(entry.depth));
      button.classList.toggle('active', selectedEntry?.id === entry.id);
      const icon = createElement(documentRef, 'span', 'entry-ext', entry.extension || 'file');
      const copy = createElement(documentRef, 'span', 'entry-copy');
      copy.append(
        createElement(documentRef, 'strong', undefined, entry.name),
        createElement(documentRef, 'em', undefined, entry.path)
      );
      button.append(icon, copy, createElement(documentRef, 'small', undefined, formatArchiveBytes(entry.size)));
      button.addEventListener('click', () => {
        void previewEntry(entry);
      });
      list.append(button);
    });
  };

  const setLoading = (next: boolean, text?: string, hint?: string) => {
    loading = next;
    if (text) {
      loadingText = text;
    }
    if (hint) {
      loadingHint = hint;
    }
    syncState();
    renderEmptyState();
  };

  const setError = (message: string) => {
    errorText = message;
    syncState();
  };

  const terminateWorkers = (workers: Worker[]) => {
    workers.forEach(worker => worker.terminate());
    workers.length = 0;
  };

  const tryOpenArchiveWithWorker = async (Archive: any, candidate: ArchiveWorkerCandidate) => {
    const createdWorkers: Worker[] = [];
    const workerUrl = await prepareWorkerUrl(candidate, objectUrls);
    const WorkerCtor = getWorkerConstructor(documentRef);

    try {
      Archive.init({
        getWorker: () => {
          const worker = new WorkerCtor(workerUrl, { type: 'module' });
          createdWorkers.push(worker);
          return worker;
        },
      });

      setLoading(true, `正在初始化${candidate.label}...`, '如果当前服务器没有正确发布 Worker/WASM，会自动切换兼容模式。');
      const archiveFile = createArchiveFile(documentRef, buffer, filename);
      const archive = await withTimeout<any>(
        Archive.open(archiveFile),
        workerTimeoutMs,
        `${candidate.label} 初始化超时`,
        targetWindow
      );
      archiveReader = archive;
      encrypted = await withTimeout<boolean | null>(
        archive.hasEncryptedData(),
        workerTimeoutMs,
        `${candidate.label} 加密检测超时`,
        targetWindow
      ).catch(() => null);

      setLoading(true, '正在读取压缩包目录...', '目录读取完成后，点击内部文件才会按需解压。');
      const fileTree = await withTimeout<Record<string, unknown>>(
        archive.getFilesObject(),
        workerTimeoutMs,
        `${candidate.label} 读取目录超时`,
        targetWindow
      );

      entries = flattenArchiveObject(fileTree)
        .sort((left, right) => left.path.localeCompare(right.path));
      syncState();
      renderEntryList();
      renderEmptyState();
      return true;
    } catch (reason) {
      if (!archiveReader) {
        terminateWorkers(createdWorkers);
      }
      throw reason;
    }
  };

  const tryOpenArchiveWithFallback = async () => {
    setLoading(true, 'Worker 不可用，正在切换 ZIP/TAR 兼容模式...', '兼容模式无需额外静态 Worker，适合手机 WebView 或本地临时服务器。');
    const fallbackEntries = await loadArchiveEntriesWithoutWorker(buffer, filename);

    if (!fallbackEntries) {
      return false;
    }

    entries = fallbackEntries.sort((left, right) => left.path.localeCompare(right.path));
    encrypted = null;
    archiveNotice = '当前环境的 libarchive Worker 未能启动，已自动切换到 ZIP/TAR/GZIP 兼容模式。RAR、7z 等格式仍建议发布 vendor/libarchive/worker-bundle.js 与 libarchive.wasm。';
    syncState();
    renderEntryList();
    renderEmptyState();
    return true;
  };

  const openArchive = async () => {
    if (buffer.byteLength > maxArchiveSize) {
      setError(`压缩包体积 ${formatArchiveBytes(buffer.byteLength)} 超过安全上限 ${formatArchiveBytes(maxArchiveSize)}，请下载后在本地解压。`);
      return;
    }

    setLoading(true, '正在初始化压缩包解析 Worker...', '大文件会在 Worker 中解析，避免阻塞主线程。');
    setError('');
    archiveNotice = '';

    try {
      const [{ Archive }, candidates] = await Promise.all([
        import('libarchive.js'),
        resolveWorkerCandidates(documentRef, archiveOptions),
      ]);
      const errors: string[] = [];

      for (const candidate of candidates) {
        try {
          await closeArchive();
          await tryOpenArchiveWithWorker(Archive, candidate);
          return;
        } catch (reason) {
          errors.push(`${candidate.label}: ${normalizeWorkerError(reason)}`);
        }
      }

      await closeArchive();
      if (await tryOpenArchiveWithFallback()) {
        return;
      }

      throw new Error(errors.join('；') || '压缩包 Worker 初始化失败');
    } catch (nextError) {
      console.error(nextError);
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  };

  const renderEntryBuffer = async (entry: ArchiveEntryView, entryBuffer: ArrayBuffer) => {
    await clearNestedPreview();
    const child = createElement(documentRef, 'div', 'archive-nested-content') as HTMLDivElement;
    nestedTarget.append(child);
    const nestedContext: FileRenderContext = {
      ...context,
      filename: entry.name,
      options: buildNestedOptions(context, archiveOptions),
    };
    nestedRendered = context?.renderNestedBuffer
      ? await context.renderNestedBuffer(entryBuffer, entry.extension, child, nestedContext)
      : await renderNestedWithCoreFallback(entryBuffer, entry.extension, child, nestedContext);
  };

  const extractEntryBuffer = async (entry: ArchiveEntryView) => {
    const cacheKey = createArchiveCacheKey(filename, buffer.byteLength, entry);
    if (cacheEnabled) {
      const cached = await readArchiveCache(cacheKey);
      if (cached) {
        return cached.buffer;
      }
    }

    const file = await entry.compressedFile.extract();
    const entryBuffer = await file.arrayBuffer();

    if (cacheEnabled) {
      await writeArchiveCache({
        key: cacheKey,
        filename: entry.name,
        size: entryBuffer.byteLength,
        updatedAt: Date.now(),
        buffer: entryBuffer,
      });
    }

    return entryBuffer;
  };

  async function previewEntry(entry: ArchiveEntryView) {
    selectedEntry = entry;
    renderEntryList();
    syncState();
    if (entry.size > maxEntryPreviewSize) {
      setError(`压缩包内文件 ${entry.name} 体积 ${formatArchiveBytes(entry.size)} 超过预览上限 ${formatArchiveBytes(maxEntryPreviewSize)}。`);
      return;
    }

    setLoading(true, `正在按需解压 ${entry.name}...`);
    setError('');

    try {
      const entryBuffer = await extractEntryBuffer(entry);
      setLoading(true, `正在渲染 ${entry.name}...`);
      await renderEntryBuffer(entry, entryBuffer);
    } catch (nextError) {
      console.error(nextError);
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setLoading(false);
    }
  }

  const downloadEntry = async (entry: ArchiveEntryView) => {
    setLoading(true, `正在导出 ${entry.name}...`);
    try {
      const entryBuffer = await extractEntryBuffer(entry);
      const url = URL.createObjectURL(new Blob([entryBuffer]));
      objectUrls.push(url);
      const link = documentRef.createElement('a');
      link.href = url;
      link.download = entry.name;
      documentRef.body.append(link);
      link.click();
      link.remove();
    } finally {
      setLoading(false);
    }
  };

  listen(search, 'input', () => {
    filterText = search.value;
    renderEntryList();
  });
  listen(downloadButton, 'click', () => {
    if (selectedEntry) {
      void downloadEntry(selectedEntry);
    }
  });

  syncState();
  renderEmptyState();
  void openArchive();

  return {
    $el: root,
    async unmount() {
      cleanups.splice(0).forEach(cleanup => cleanup());
      await clearNestedPreview();
      await closeArchive();
      objectUrls.forEach(url => URL.revokeObjectURL(url));
      target.replaceChildren();
    },
  };
}
