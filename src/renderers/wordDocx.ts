import type { Options, renderAsync } from 'docx-preview'
import { resolveFileViewerDocxWorkerUrl } from '../assets'
import {
  applyPrintPageSize,
  buildPrintPageStyle,
  formatCssPixels,
  getElementPrintPageSize,
  type PrintPageSize
} from '../printLayout'
import {
  createFileViewerZoomChangeEmitter as createZoomChangeEmitter,
} from '../documentZoom'
import type {
  FileRenderContext,
  FileViewerRenderedInstance as AppWrapper,
  FileViewerZoomState
} from '../types'
import {
  registerFileViewerZoomProvider,
  unregisterFileViewerZoomProvider
} from '../documentDom'

const DOCX_DEFAULT_PAGE_SIZE: PrintPageSize = {
  width: 794,
  height: 1123
}

const DOCX_PROGRESSIVE_BATCH_SIZE = 2
const DOCX_WORKER_TIMEOUT = 15000
const DOCX_MIN_SCALE = 0.24
const DOCX_MAX_SCALE = 3
const DOCX_ZOOM_STEP = 0.15

type DocxWorkerResponse = {
  id: number;
  ok: true;
  html: string;
} | {
  id: number;
  ok: false;
  message: string;
  stack?: string;
}

let docxWorkerRequestId = 0

const loadLibrary = (() => {
  const loader = {
    module: null as null | Promise<{defaultOptions: Options, renderAsync: typeof renderAsync}>,
    async load() {
      if (!this.module) {
        this.module = import('docx-preview');
      }
      return this.module;
    }
  }
  return async () => {
    return await loader.load();
  }
})()

const createDocxOptions = (experimental = true): Partial<Options> => ({
  // Word 会写入 autoSpaceDN/autoSpaceDE 等兼容标签；生产预览保持静默，避免 docx-preview 调试告警刷屏。
  debug: false,
  experimental
})

const getTargetWindow = (target: HTMLDivElement) => {
  return target.ownerDocument.defaultView
}

const isTargetHTMLElement = (value: unknown, target: HTMLDivElement): value is HTMLElement => {
  const HTMLElementCtor = getTargetWindow(target)?.HTMLElement
  return HTMLElementCtor ? value instanceof HTMLElementCtor : value instanceof HTMLElement
}

const shouldUseDocxWorker = (target: HTMLDivElement, context?: FileRenderContext) => {
  const view = getTargetWindow(target)
  return context?.options?.docx?.worker === true && typeof view?.Worker === 'function'
}

const shouldMountDocxProgressively = (context?: FileRenderContext) => {
  return context?.options?.docx?.progressive === true
}

const shouldPaginateOversizedDocxSections = (context?: FileRenderContext) => {
  return context?.options?.docx?.visualPagination === true
}

const waitDocxMountFrame = (target: HTMLDivElement) => {
  return new Promise<void>(resolve => {
    const view = getTargetWindow(target)
    if (!view || typeof view.requestAnimationFrame !== 'function') {
      globalThis.setTimeout(resolve, 0)
      return
    }
    view.requestAnimationFrame(() => resolve())
  })
}

async function mountDocxPreviewHtml(
  html: string,
  target: HTMLDivElement,
  context?: FileRenderContext
) {
  if (!shouldMountDocxProgressively(context)) {
    target.innerHTML = html
    context?.onProgressiveRender?.()
    return
  }

  const template = target.ownerDocument.createElement('template')
  template.innerHTML = html
  const sourceWrapper = template.content.querySelector<HTMLElement>('.docx-wrapper')

  if (!sourceWrapper) {
    target.innerHTML = html
    context?.onProgressiveRender?.()
    return
  }

  const pages = Array.from(sourceWrapper.children)
  const liveWrapper = sourceWrapper.cloneNode(false) as HTMLElement
  let hasNotifiedFirstPaint = false

  target.innerHTML = ''
  Array.from(template.content.childNodes).forEach(node => {
    if (node === sourceWrapper) {
      target.appendChild(liveWrapper)
      return
    }
    target.appendChild(node)
  })

  for (let index = 0; index < pages.length; index += DOCX_PROGRESSIVE_BATCH_SIZE) {
    pages.slice(index, index + DOCX_PROGRESSIVE_BATCH_SIZE).forEach(page => {
      liveWrapper.appendChild(page)
    })

    if (!hasNotifiedFirstPaint) {
      hasNotifiedFirstPaint = true
      context?.onProgressiveRender?.()
    }

    if (index + DOCX_PROGRESSIVE_BATCH_SIZE < pages.length) {
      await waitDocxMountFrame(target)
    }
  }
}

function createDocxWorker(target: HTMLDivElement, context?: FileRenderContext) {
  const view = getTargetWindow(target)
  if (!view?.Worker) {
    return null
  }

  const workerUrl = resolveFileViewerDocxWorkerUrl(
    context?.options?.docx,
    target.ownerDocument.URL || undefined
  )

  try {
    return new view.Worker(workerUrl, { type: 'module' })
  } catch (moduleWorkerError) {
    try {
      return new view.Worker(workerUrl)
    } catch (classicWorkerError) {
      console.warn(
        '[file-viewer] DOCX Worker 无法创建，回退到 docx-preview 主线程渲染。',
        classicWorkerError || moduleWorkerError
      )
      return null
    }
  }
}

async function renderDocxWithWorker(
  buffer: ArrayBuffer,
  target: HTMLDivElement,
  options: Partial<Options>,
  context?: FileRenderContext
) {
  if (!shouldUseDocxWorker(target, context)) {
    return false
  }

  const worker = createDocxWorker(target, context)
  if (!worker) {
    return false
  }

  const view = getTargetWindow(target)
  const id = ++docxWorkerRequestId
  const timeout = context?.options?.docx?.workerTimeout ?? DOCX_WORKER_TIMEOUT

  return await new Promise<boolean>(resolve => {
    let settled = false
    let timeoutId: number | undefined

    const cleanup = () => {
      if (timeoutId !== undefined) {
        view?.clearTimeout(timeoutId)
      }
      worker.removeEventListener('message', handleMessage)
      worker.removeEventListener('error', handleError)
      worker.removeEventListener('messageerror', handleMessageError)
      worker.terminate()
    }

    const fallback = (reason: unknown) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      console.warn('[file-viewer] DOCX Worker 渲染失败，回退到 docx-preview 主线程渲染。', reason)
      resolve(false)
    }

    const handleMessage = (event: MessageEvent<DocxWorkerResponse>) => {
      if (event.data?.id !== id) {
        return
      }

      if (settled) {
        return
      }
      settled = true
      cleanup()
      if (event.data.ok) {
        void mountDocxPreviewHtml(event.data.html, target, context)
          .then(() => resolve(true))
          .catch(reason => {
            console.warn('[file-viewer] DOCX 渐进挂载失败，回退到 docx-preview 主线程渲染。', reason)
            resolve(false)
          })
        return
      }

      console.warn('[file-viewer] DOCX Worker 渲染失败，回退到 docx-preview 主线程渲染。', event.data.message)
      resolve(false)
    }

    const handleError = (event: ErrorEvent) => {
      fallback(event.error || event.message)
    }

    const handleMessageError = () => {
      fallback('DOCX Worker 消息无法结构化传输')
    }

    worker.addEventListener('message', handleMessage)
    worker.addEventListener('error', handleError)
    worker.addEventListener('messageerror', handleMessageError)

    if (Number.isFinite(timeout) && timeout > 0) {
      timeoutId = view?.setTimeout(() => {
        fallback(`DOCX Worker 超过 ${timeout}ms 未返回结果`)
      }, timeout)
    }

    const workerBuffer = buffer.slice(0)
    // Worker 内输出 HTML，图片和字体使用 data URL，避免 Worker 生命周期结束后 Blob URL 失效。
    worker.postMessage({
      id,
      buffer: workerBuffer,
      options: {
        ...options,
        // docx-preview 的 experimental tab stop 需要真实布局 API，Worker 内无法可靠计算。
        experimental: false,
        useBase64URL: true
      }
    }, [workerBuffer])
  })
}

const DOCX_RESPONSIVE_CSS = `
.docx-fit-viewer {
  box-sizing: border-box;
  height: 100%;
  overflow: auto;
  background: #ececec;
}
.docx-fit-viewer .docx-wrapper {
  box-sizing: border-box;
  min-width: 0 !important;
  width: 100% !important;
  padding: 24px 14px 40px !important;
  background: #e7e9ec !important;
}
.docx-fit-viewer .docx-page-frame {
  position: relative;
  width: 100%;
  min-width: 0;
  margin: 0 auto 24px;
  overflow: visible;
}
.docx-fit-viewer .docx-page-frame > section.docx {
  position: absolute;
  top: 0;
  left: 50%;
  margin: 0 !important;
  background: #ffffff !important;
  box-shadow: 0 2px 14px rgba(25, 35, 48, 0.18);
  box-sizing: border-box;
  color: #111827;
  overflow: hidden;
  transform-origin: top center;
}
`

function installResponsiveStyle(target: HTMLDivElement) {
  const style = target.ownerDocument.createElement('style')
  style.textContent = DOCX_RESPONSIVE_CSS
  target.prepend(style)
  return style
}

function clonePageShell(section: HTMLElement, article: HTMLElement, pageHeight: number) {
  const nextPage = section.cloneNode(false) as HTMLElement
  nextPage.innerHTML = ''
  nextPage.dataset.docxPaginated = 'true'
  nextPage.style.minHeight = `${pageHeight}px`
  nextPage.style.height = `${pageHeight}px`
  nextPage.style.overflow = 'hidden'

  const nextArticle = article.cloneNode(false) as HTMLElement
  nextPage.appendChild(nextArticle)

  Array.from(section.children).forEach(child => {
    if (child !== article) {
      nextPage.appendChild(child.cloneNode(true))
    }
  })

  return { page: nextPage, article: nextArticle }
}

function getDocxPageHeight(section: HTMLElement) {
  const style = section.ownerDocument.defaultView?.getComputedStyle(section)
  const minHeight = style ? parseFloat(style.minHeight) : 0
  return Number.isFinite(minHeight) && minHeight > 0 ? minHeight : section.offsetHeight
}

function paginateOversizedSections(target: HTMLDivElement) {
  const wrapper = target.querySelector('.docx-wrapper')
  if (!wrapper) {
    return
  }

  Array.from(wrapper.children).forEach(child => {
    if (!isTargetHTMLElement(child, target) || !child.matches('section.docx')) {
      return
    }

    const article = child.querySelector(':scope > article')
    if (!isTargetHTMLElement(article, target)) {
      return
    }

    const pageHeight = getDocxPageHeight(child)
    const originalNodes = Array.from(article.childNodes)
    if (!pageHeight || originalNodes.length < 2 || child.scrollHeight <= pageHeight * 1.15) {
      return
    }

    // docx-preview 只能按已有分页符拆页；没有分页符的长文档需要在预览层补一层视觉分页。
    let current = clonePageShell(child, article, pageHeight)
    child.before(current.page)

    originalNodes.forEach(node => {
      current.article.appendChild(node)

      if (current.page.scrollHeight <= pageHeight + 1 || current.article.childNodes.length === 1) {
        return
      }

      current.article.removeChild(node)
      current = clonePageShell(child, article, pageHeight)
      child.before(current.page)
      current.article.appendChild(node)
    })

    child.remove()
  })
}

function wrapDocxPages(target: HTMLDivElement) {
  const wrapper = target.querySelector('.docx-wrapper')
  if (!wrapper) {
    return []
  }

  return Array.from(wrapper.children).flatMap(child => {
    if (!isTargetHTMLElement(child, target) || !child.matches('section.docx')) {
      return []
    }

    const frame = target.ownerDocument.createElement('div')
    frame.className = 'docx-page-frame'
    child.before(frame)
    frame.appendChild(child)
    return [frame]
  })
}

function makeDocxResponsive(target: HTMLDivElement, context?: FileRenderContext) {
  target.classList.add('docx-fit-viewer')
  const style = installResponsiveStyle(target)
  if (shouldPaginateOversizedDocxSections(context)) {
    paginateOversizedSections(target)
  }
  const frames = wrapDocxPages(target)
  const view = getTargetWindow(target)
  const ResizeObserverCtor = view?.ResizeObserver
  let resizeFrame = 0
  let userZoom = 1
  let currentScale = 1
  let currentFitScale = 1
  const zoomEmitter = createZoomChangeEmitter()

  const clampScale = (scale: number) => {
    return Math.min(DOCX_MAX_SCALE, Math.max(DOCX_MIN_SCALE, Number(scale.toFixed(2))))
  }

  const resize = () => {
    if (!view) {
      return
    }

    view.cancelAnimationFrame(resizeFrame)
    resizeFrame = view.requestAnimationFrame(() => {
      let firstScale = 1
      frames.forEach(frame => {
        const page = frame.firstElementChild
        if (!isTargetHTMLElement(page, target)) {
          return
        }

        page.style.transform = 'translateX(-50%)'

        const pageWidth = page.offsetWidth
        const pageHeight = page.offsetHeight
        if (!pageWidth || !pageHeight) {
          return
        }
        const availableWidth = Math.max(target.clientWidth - 28, 120)
        const fitScale = Math.min(1, Math.max(DOCX_MIN_SCALE, availableWidth / pageWidth))
        const scale = clampScale(fitScale * userZoom)
        firstScale = scale
        currentFitScale = fitScale

        page.style.transform = `translateX(-50%) scale(${scale})`
        frame.style.width = `${Math.ceil(Math.max(pageWidth * scale, target.clientWidth - 28, 120))}px`
        frame.style.maxWidth = 'none'
        frame.style.height = `${Math.ceil(pageHeight * scale)}px`
      })
      currentScale = firstScale
      zoomEmitter.emit()
    })
  }

  const getZoomState = (): FileViewerZoomState => ({
    scale: currentScale,
    label: `${Math.round(currentScale * 100)}%`,
    canZoomIn: currentScale < DOCX_MAX_SCALE,
    canZoomOut: currentScale > DOCX_MIN_SCALE,
    canReset: userZoom !== 1,
    minScale: DOCX_MIN_SCALE,
    maxScale: DOCX_MAX_SCALE
  })

  const setUserZoom = (nextZoom: number) => {
    userZoom = Math.min(6, Math.max(0.2, Number(nextZoom.toFixed(2))))
    resize()
    return getZoomState()
  }

  target.dataset.viewerZoomProvider = 'docx'
  registerFileViewerZoomProvider(target, {
    zoomIn: () => setUserZoom(userZoom + DOCX_ZOOM_STEP),
    zoomOut: () => setUserZoom(userZoom - DOCX_ZOOM_STEP),
    resetZoom: () => setUserZoom(1),
    setZoom: scale => setUserZoom(scale / Math.max(currentFitScale, 0.01)),
    getState: getZoomState,
    subscribe: zoomEmitter.subscribe
  })

  const observer = ResizeObserverCtor ? new ResizeObserverCtor(resize) : null
  observer?.observe(target)
  frames.forEach(frame => {
    const page = getDocxPageElement(frame)
    if (page) {
      observer?.observe(page)
    }
  })
  resize()

  return () => {
    view?.cancelAnimationFrame(resizeFrame)
    observer?.disconnect()
    unregisterFileViewerZoomProvider(target)
    style.remove()
    target.classList.remove('docx-fit-viewer')
  }
}

function getDocxPageElement(frame: HTMLElement) {
  const page = frame.firstElementChild
  const HTMLElementCtor = frame.ownerDocument.defaultView?.HTMLElement
  return HTMLElementCtor && page instanceof HTMLElementCtor ? page : null
}

function getDocxFramePrintSize(frame: HTMLElement | undefined) {
  const page = frame ? getDocxPageElement(frame) : null
  return page ? getElementPrintPageSize(page, DOCX_DEFAULT_PAGE_SIZE) : DOCX_DEFAULT_PAGE_SIZE
}

function normalizeDocxPageForPrint(frame: HTMLElement, pageSize: PrintPageSize) {
  const pageWidth = formatCssPixels(pageSize.width)
  const pageHeight = formatCssPixels(pageSize.height)

  applyPrintPageSize(frame, pageSize)
  frame.style.margin = '0 auto 18px'

  const page = getDocxPageElement(frame)
  if (!page) {
    return
  }

  page.style.position = 'relative'
  page.style.top = 'auto'
  page.style.left = 'auto'
  page.style.width = pageWidth
  page.style.maxWidth = 'none'
  page.style.minHeight = pageHeight
  page.style.height = pageHeight
  page.style.margin = '0 auto'
  page.style.transform = 'none'
  page.style.transformOrigin = 'top left'
  page.style.overflow = 'hidden'
  page.style.boxShadow = 'none'
}

function buildDocxPrintStyle(target: HTMLDivElement) {
  const firstFrame = target.querySelector<HTMLElement>('.docx-page-frame')
  const pageSize = getDocxFramePrintSize(firstFrame || undefined)

  return buildPrintPageStyle({
    selector: '.viewer-export-content .docx-page-frame',
    width: pageSize.width,
    height: pageSize.height
  })
}

function prepareDocxCloneForExport(target: HTMLDivElement) {
  const liveFrames = Array.from(target.querySelectorAll<HTMLElement>('.docx-page-frame'))
  const clone = target.cloneNode(true) as HTMLElement
  const printDocument = target.ownerDocument.createElement('div')
  printDocument.className = 'docx-print-document'
  const scopedStyles = Array.from(clone.querySelectorAll('style'))
    .filter(style => !style.textContent?.includes('.docx-fit-viewer'))
    .map(style => style.outerHTML)
    .join('')

  clone.querySelectorAll<HTMLElement>('.docx-page-frame').forEach((frame, index) => {
    normalizeDocxPageForPrint(frame, getDocxFramePrintSize(liveFrames[index]))
    printDocument.appendChild(frame.cloneNode(true))
  })

  return printDocument.childElementCount ? `${scopedStyles}${printDocument.outerHTML}` : clone.innerHTML
}

/**
 * 渲染docx文件
 */
export default async function(buffer: ArrayBuffer, target: HTMLDivElement, context?: FileRenderContext): Promise<AppWrapper> {
  const docxOptions = createDocxOptions()
  const workerRendered = await renderDocxWithWorker(buffer, target, docxOptions, context)
  target.dataset.docxWorker = workerRendered ? 'true' : 'false'

  if (!workerRendered) {
    const { defaultOptions, renderAsync } = await loadLibrary()
    await renderAsync(buffer, target, undefined, {
      ...defaultOptions,
      ...docxOptions
    })
  }

  const disposeResponsive = makeDocxResponsive(target, context)
  context?.registerExportAdapter?.({
    includeDocumentStyles: false,
    beforeSnapshot: () => {
      const view = getTargetWindow(target)
      if (view) {
        view.dispatchEvent(new view.Event('resize'))
      }
    },
    printStyle: () => buildDocxPrintStyle(target),
    toHtml: () => prepareDocxCloneForExport(target)
  })

  return {
    $el: target,
    unmount() {
      context?.registerExportAdapter?.(null)
      disposeResponsive()
      delete target.dataset.docxWorker
      target.innerHTML = ''
    }
  }
}
