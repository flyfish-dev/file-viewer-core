import { defaultMsDocCss, parseMsDocToHtml } from 'msdoc-viewer'
import {
  applyPrintPageSize,
  buildPrintPageStyle,
  formatCssPixels
} from '../output/printLayout'
import {
  createFileViewerZoomChangeEmitter as createZoomChangeEmitter,
} from '../features/document/zoom'
import type {
  FileRenderContext,
  FileViewerRenderedInstance as AppWrapper,
  FileViewerZoomState
} from '../contracts/types'
import {
  registerFileViewerZoomProvider,
  unregisterFileViewerZoomProvider
} from '../features/document/dom'

const PAGE_BREAK_MARKER = '<span class="msdoc-page-break"></span>'
const EMPTY_PAGE_HTML = '<p class="msdoc-paragraph"><br></p>'
const MSDOC_PAGE_SIZE = {
  width: 794,
  height: 1123
}
const MSDOC_MIN_SCALE = 0.24
const MSDOC_MAX_SCALE = 3
const MSDOC_ZOOM_STEP = 0.15

const WORD_PAGE_CSS = `
.msdoc-stage{
  box-sizing:border-box;
  min-height:100%;
  padding:32px 24px 48px;
  background:#ececec;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:24px;
}
.msdoc-page{
  width:min(100%,794px);
  box-sizing:border-box;
}
.msdoc-page > .msdoc-root{
  box-sizing:border-box;
  width:100%;
  max-width:none;
  min-height:1123px;
  padding:clamp(24px,7%,96px) clamp(20px,6%,88px);
  background:#fff;
  border:1px solid #d9d9d9;
  box-shadow:0 1px 3px rgba(0,0,0,0.08), 0 12px 32px rgba(0,0,0,0.12);
  overflow-wrap:anywhere;
}
/* 表格不能沿用正文的 anywhere 断词，否则旧 DOC 的列宽和单元格内容会被过度压缩。 */
.msdoc-page .msdoc-table{
  display:table;
  width:auto;
  max-width:100%;
  table-layout:auto!important;
  border-collapse:collapse;
  border-spacing:0;
}
.msdoc-page .msdoc-table tbody,
.msdoc-page .msdoc-table tr{
  width:auto;
}
.msdoc-page .msdoc-cell{
  min-width:1.5em;
  padding:4px 6px;
  vertical-align:top;
  word-break:normal;
  overflow-wrap:normal;
  white-space:normal;
}
.msdoc-page .msdoc-cell .msdoc-paragraph{
  margin:0 0 4px;
  word-break:normal;
  overflow-wrap:break-word;
}
.msdoc-page .msdoc-cell .msdoc-paragraph:last-child{
  margin-bottom:0;
}
.msdoc-page .msdoc-cell span{
  white-space:normal!important;
}
.msdoc-page .msdoc-page-break{
  display:none;
}
@media (max-width: 860px){
  .msdoc-stage{
    padding:16px 12px 24px;
    gap:16px;
  }
  .msdoc-page{
    width:100%;
  }
  .msdoc-page > .msdoc-root{
    min-height:auto;
    padding:24px 20px;
    box-shadow:none;
  }
}
`

const MSDOC_ZOOM_CSS = `
.msdoc-zoom-viewer{
  box-sizing:border-box;
  height:100%;
  overflow:auto;
  background:#ececec;
}
.msdoc-zoom-viewer .msdoc-stage{
  min-width:max-content;
}
.msdoc-zoom-viewer .msdoc-page{
  position:relative;
  max-width:none;
  overflow:visible;
}
.msdoc-zoom-viewer .msdoc-page > .msdoc-root{
  position:absolute;
  top:0;
  left:50%;
  width:${MSDOC_PAGE_SIZE.width}px;
  max-width:none;
  margin:0;
  transform-origin:top center;
}
`

const getTargetWindow = (target: HTMLDivElement) => {
  return target.ownerDocument.defaultView
}

function injectPageBreakMarkers(html: string): string {
  return html.replace(
    /<(p|table|section)([^>]*?)style="([^"]*?\bbreak-before\s*:\s*page;?[^"]*?)"([^>]*)>/gi,
    (match) => `${PAGE_BREAK_MARKER}${match}`
  )
}

function wrapAsWordPages(html: string): string {
  const normalizedHtml = injectPageBreakMarkers(html)
  const pages = normalizedHtml.split(PAGE_BREAK_MARKER)

  return `<div class="msdoc-stage">${pages.map(page => (
    `<section class="msdoc-page"><div class="msdoc-root">${page || EMPTY_PAGE_HTML}</div></section>`
  )).join('')}</div>`
}

function prepareMsDocCloneForExport(target: HTMLDivElement) {
  const clone = target.cloneNode(true) as HTMLElement
  clone.classList.remove('msdoc-zoom-viewer')
  clone.querySelectorAll('style[data-msdoc-zoom]').forEach(style => style.remove())
  clone.querySelectorAll<HTMLElement>('.msdoc-stage, .msdoc-page, .msdoc-root').forEach(node => {
    node.style.height = 'auto'
    node.style.maxHeight = 'none'
    node.style.overflow = 'visible'
    node.style.transform = 'none'
  })

  clone.querySelectorAll<HTMLElement>('.msdoc-page').forEach(page => {
    applyPrintPageSize(page, MSDOC_PAGE_SIZE, { heightMode: 'min' })
    page.style.position = 'relative'
    page.style.width = formatCssPixels(MSDOC_PAGE_SIZE.width)
    page.style.maxWidth = 'none'
    page.style.margin = '0 auto 18px'

    const root = page.querySelector<HTMLElement>('.msdoc-root')
    if (!root) {
      return
    }

    root.style.position = 'relative'
    root.style.top = 'auto'
    root.style.left = 'auto'
    root.style.width = formatCssPixels(MSDOC_PAGE_SIZE.width)
    root.style.maxWidth = 'none'
    root.style.minHeight = formatCssPixels(MSDOC_PAGE_SIZE.height)
    root.style.height = 'auto'
    root.style.transform = 'none'
    root.style.transformOrigin = 'top left'
    root.style.boxShadow = 'none'
    root.style.border = '0'
    root.style.overflow = 'visible'
  })

  return clone.innerHTML
}

function buildMsDocPrintStyle() {
  return buildPrintPageStyle({
    selector: '.viewer-export-content .msdoc-page',
    width: MSDOC_PAGE_SIZE.width,
    height: MSDOC_PAGE_SIZE.height,
    heightMode: 'min'
  })
}

function makeMsDocResponsive(target: HTMLDivElement) {
  const pages = Array.from(target.querySelectorAll<HTMLElement>('.msdoc-page'))
  if (!pages.length) {
    return () => {}
  }

  target.classList.add('msdoc-zoom-viewer')
  const view = getTargetWindow(target)
  const ResizeObserverCtor = view?.ResizeObserver
  const style = target.ownerDocument.createElement('style')
  style.dataset.msdocZoom = 'true'
  style.textContent = MSDOC_ZOOM_CSS
  target.prepend(style)

  const zoomEmitter = createZoomChangeEmitter()
  let resizeFrame = 0
  let userZoom = 1
  let currentScale = 1
  let currentFitScale = 1

  const clampScale = (scale: number) => {
    return Math.min(MSDOC_MAX_SCALE, Math.max(MSDOC_MIN_SCALE, Number(scale.toFixed(2))))
  }

  const resize = () => {
    if (!view) {
      return
    }

    view.cancelAnimationFrame(resizeFrame)
    resizeFrame = view.requestAnimationFrame(() => {
      let firstScale = 1
      let firstFitScale = 1

      pages.forEach(page => {
        const root = page.querySelector<HTMLElement>('.msdoc-root')
        if (!root) {
          return
        }

        const rootWidth = root.offsetWidth || MSDOC_PAGE_SIZE.width
        const rootHeight = Math.max(root.scrollHeight, root.offsetHeight, MSDOC_PAGE_SIZE.height)
        const availableWidth = Math.max(target.clientWidth - 48, 120)
        const fitScale = Math.min(1, Math.max(MSDOC_MIN_SCALE, availableWidth / rootWidth))
        const scale = clampScale(fitScale * userZoom)

        firstScale = scale
        firstFitScale = fitScale

        root.style.transform = `translateX(-50%) scale(${scale})`
        page.style.width = `${Math.ceil(Math.max(rootWidth * scale, 120))}px`
        page.style.height = `${Math.ceil(rootHeight * scale)}px`
      })

      currentScale = firstScale
      currentFitScale = firstFitScale
      zoomEmitter.emit()
    })
  }

  const getZoomState = (): FileViewerZoomState => ({
    scale: currentScale,
    label: `${Math.round(currentScale * 100)}%`,
    canZoomIn: currentScale < MSDOC_MAX_SCALE,
    canZoomOut: currentScale > MSDOC_MIN_SCALE,
    canReset: userZoom !== 1,
    minScale: MSDOC_MIN_SCALE,
    maxScale: MSDOC_MAX_SCALE
  })

  const setUserZoom = (nextZoom: number) => {
    userZoom = Math.min(6, Math.max(0.2, Number(nextZoom.toFixed(2))))
    resize()
    return getZoomState()
  }

  target.dataset.viewerZoomProvider = 'doc'
  registerFileViewerZoomProvider(target, {
    zoomIn: () => setUserZoom(userZoom + MSDOC_ZOOM_STEP),
    zoomOut: () => setUserZoom(userZoom - MSDOC_ZOOM_STEP),
    resetZoom: () => setUserZoom(1),
    setZoom: scale => setUserZoom(scale / Math.max(currentFitScale, 0.01)),
    getState: getZoomState,
    subscribe: zoomEmitter.subscribe
  })

  const observer = ResizeObserverCtor ? new ResizeObserverCtor(resize) : null
  observer?.observe(target)
  pages.forEach(page => {
    const root = page.querySelector<HTMLElement>('.msdoc-root')
    if (root) {
      observer?.observe(root)
    }
  })
  resize()

  return () => {
    view?.cancelAnimationFrame(resizeFrame)
    observer?.disconnect()
    unregisterFileViewerZoomProvider(target)
    style.remove()
    target.classList.remove('msdoc-zoom-viewer')
  }
}

/**
 * 渲染 doc 文件
 */
export default async function render(buffer: ArrayBuffer, target: HTMLDivElement, context?: FileRenderContext): Promise<AppWrapper> {
  const rendered = await parseMsDocToHtml(buffer, {
    renderOptions: {
      css: `${defaultMsDocCss()}\n${WORD_PAGE_CSS}`
    }
  })

  target.innerHTML = `<style data-msdoc>${rendered.css}</style>${wrapAsWordPages(rendered.html)}`
  const disposeResponsive = makeMsDocResponsive(target)
  context?.registerExportAdapter?.({
    includeDocumentStyles: false,
    printStyle: buildMsDocPrintStyle,
    toHtml: () => prepareMsDocCloneForExport(target)
  })

  return {
    $el: target,
    unmount() {
      context?.registerExportAdapter?.(null)
      disposeResponsive()
      target.innerHTML = ''
    }
  }
}
