import type { DocxProgressEvent, Options, renderAsync } from '@file-viewer/docx'
import type JSZip from 'jszip'
import {
  resolveFileViewerDocxWorkerJsZipUrl,
  resolveFileViewerDocxWorkerUrl,
} from '../platform/assets'
import {
  applyPrintPageSize,
  buildPrintPageStyle,
  formatCssPixels,
  getElementPrintPageSize,
  type PrintPageSize
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

const DOCX_DEFAULT_PAGE_SIZE: PrintPageSize = {
  width: 794,
  height: 1123
}

const DOCX_PROGRESSIVE_BATCH_SIZE = 2
const DOCX_WORKER_TIMEOUT = 120000
const DOCX_MIN_SCALE = 0.24
const DOCX_MAX_SCALE = 3
const DOCX_ZOOM_STEP = 0.15
const DOCX_EMU_PER_CSS_PIXEL = 9525

type DocxZip = JSZip

interface DocxRelationship {
  id: string;
  type: string;
  target: string;
  targetMode?: string;
}

interface DocxImageFallback {
  role: 'watermark' | 'ole-preview' | 'vml-image';
  key: string;
  dataUrl: string;
  sourcePath: string;
  partPath: string;
  title?: string;
  style?: string;
  width?: number;
  height?: number;
  paragraphIndex?: number;
}

interface DocxChartSeries {
  name: string;
  categories: string[];
  values: number[];
}

interface DocxChartFallback {
  key: string;
  title: string;
  type: string;
  sourcePath: string;
  series: DocxChartSeries[];
  width?: number;
  height?: number;
  paragraphIndex?: number;
}

const loadLibrary = (() => {
  const loader = {
    module: null as null | Promise<{defaultOptions: Options, renderAsync: typeof renderAsync}>,
    async load() {
      if (!this.module) {
        this.module = import('@file-viewer/docx');
      }
      return this.module;
    }
  }
  return async () => {
    return await loader.load();
  }
})()

const createDocxOptions = (
  target: HTMLDivElement,
  context: FileRenderContext | undefined,
  notifyProgressiveRender: () => void
): Partial<Options> => {
  const docxOptions = context?.options?.docx
  const documentBaseUrl = target.ownerDocument.URL || undefined
  const useWorker = docxOptions?.worker !== false
  const usePagedLayout = docxOptions?.visualPagination === true
  const progress = (event: DocxProgressEvent) => {
    if (event.phase === 'render' || event.phase === 'layout' || event.phase === 'done') {
      notifyProgressiveRender()
    }
  }

  return {
    // Word 会写入 autoSpaceDN/autoSpaceDE 等兼容标签；生产预览保持静默，避免 DOCX 调试告警刷屏。
    debug: false,
    experimental: false,
    useWorker,
    workerUrl: useWorker
      ? resolveFileViewerDocxWorkerUrl(docxOptions, documentBaseUrl)
      : undefined,
    workerJsZipUrl: useWorker
      ? resolveFileViewerDocxWorkerJsZipUrl(docxOptions, documentBaseUrl)
      : undefined,
    workerFallback: true,
    workerTimeout: docxOptions?.workerTimeout ?? DOCX_WORKER_TIMEOUT,
    renderPageBatchSize:
      docxOptions?.renderPageBatchSize ??
      (docxOptions?.progressive === false ? Number.MAX_SAFE_INTEGER : DOCX_PROGRESSIVE_BATCH_SIZE),
    renderYieldEveryMs: docxOptions?.renderYieldEveryMs ?? 16,
    strictWordCompatibility: docxOptions?.strictWordCompatibility ?? true,
    paginationTolerance: docxOptions?.paginationTolerance ?? 2,
    breakPages: usePagedLayout,
    maxDynamicPaginationPasses:
      usePagedLayout
        ? docxOptions?.maxDynamicPaginationPasses ?? 1000
        : 0,
    awaitLayout: docxOptions?.awaitLayout ?? usePagedLayout,
    preserveComplexFieldResults: docxOptions?.preserveComplexFieldResults ?? true,
    updatePageReferences: docxOptions?.updatePageReferences ?? false,
    hideWebHiddenContent: docxOptions?.hideWebHiddenContent ?? false,
    ignoreLastRenderedPageBreak: docxOptions?.ignoreLastRenderedPageBreak ?? !usePagedLayout,
    progress
  }
}

const getTargetWindow = (target: HTMLDivElement) => {
  return target.ownerDocument.defaultView
}

const isTargetHTMLElement = (value: unknown, target: HTMLDivElement): value is HTMLElement => {
  const HTMLElementCtor = getTargetWindow(target)?.HTMLElement
  return HTMLElementCtor ? value instanceof HTMLElementCtor : value instanceof HTMLElement
}

const shouldPaginateOversizedDocxSections = (context?: FileRenderContext) => {
  return context?.options?.docx?.visualPagination === true
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
.docx-fit-viewer .docx-flow-frame {
  position: relative;
  width: 100%;
  min-width: 0;
  margin: 0 auto 28px;
  overflow: visible;
}
.docx-fit-viewer .docx-page-frame > section.docx,
.docx-fit-viewer .docx-flow-frame > section.docx {
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
.docx-fit-viewer .docx-flow-frame > section.docx {
  height: auto !important;
  min-height: 0 !important;
  overflow: visible !important;
}
.docx-fit-viewer .docx-page-frame > section.docx > article,
.docx-fit-viewer .docx-flow-frame > section.docx > article {
  position: relative;
  z-index: 1;
}
.docx-fit-viewer .docx-vml-watermark {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.28;
  filter: saturate(0.72) brightness(1.24);
  pointer-events: none;
  user-select: none;
}
.docx-fit-viewer .docx-vml-fallback,
.docx-fit-viewer .docx-chart-fallback {
  display: block;
  max-width: 100%;
  margin: 12px auto;
  break-inside: avoid;
  page-break-inside: avoid;
}
.docx-fit-viewer .docx-vml-fallback {
  text-align: center;
}
.docx-fit-viewer .docx-vml-fallback img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}
.docx-fit-viewer .docx-chart-fallback {
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid #d7dee8;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 1px 6px rgba(15, 23, 42, 0.08);
}
.docx-fit-viewer .docx-chart-fallback svg {
  display: block;
  width: 100%;
  height: auto;
}
`

function getXmlLocalName(node: Element) {
  return node.localName || node.tagName.split(':').pop() || node.tagName
}

function getXmlElements(root: ParentNode, localName: string) {
  return Array.from(root.querySelectorAll('*')).filter(element => getXmlLocalName(element) === localName)
}

function getFirstXmlElement(root: ParentNode, localName: string) {
  return getXmlElements(root, localName)[0]
}

function getXmlAttribute(element: Element, name: string, namespace?: string) {
  return (namespace ? element.getAttributeNS(namespace, name) : null)
    || element.getAttribute(name)
    || element.getAttribute(`r:${name}`)
}

function getXmlText(element: Element | undefined) {
  if (!element) {
    return ''
  }
  return (element.textContent || '').replace(/\s+/g, ' ').trim()
}

function getXmlAncestor(element: Element | null, localName: string) {
  let current = element?.parentElement || null
  while (current) {
    if (getXmlLocalName(current) === localName) {
      return current
    }
    current = current.parentElement
  }
  return null
}

function getParagraphIndex(element: Element) {
  const paragraph = getXmlLocalName(element) === 'p' ? element : getXmlAncestor(element, 'p')
  if (!paragraph) {
    return undefined
  }

  let index = 0
  let sibling = paragraph.previousElementSibling
  while (sibling) {
    if (getXmlLocalName(sibling) === 'p') {
      index += 1
    }
    sibling = sibling.previousElementSibling
  }
  return index
}

function parseXml(xml: string, target: HTMLDivElement) {
  const Parser = getTargetWindow(target)?.DOMParser || globalThis.DOMParser
  if (!Parser) {
    return null
  }

  const doc = new Parser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) {
    return null
  }
  return doc
}

function normalizeZipPath(path: string) {
  const segments: string[] = []
  path.split('/').forEach(segment => {
    if (!segment || segment === '.') {
      return
    }
    if (segment === '..') {
      segments.pop()
      return
    }
    segments.push(segment)
  })
  return segments.join('/')
}

function getDirectoryName(path: string) {
  const index = path.lastIndexOf('/')
  return index >= 0 ? path.slice(0, index) : ''
}

function getRelationshipPath(partPath: string) {
  const directory = getDirectoryName(partPath)
  const name = partPath.slice(directory ? directory.length + 1 : 0)
  return normalizeZipPath(`${directory}/_rels/${name}.rels`)
}

function resolveRelationshipTarget(partPath: string, target: string) {
  if (target.startsWith('/')) {
    return normalizeZipPath(target.slice(1))
  }
  return normalizeZipPath(`${getDirectoryName(partPath)}/${target}`)
}

function getMimeType(path: string) {
  const extension = path.split('.').pop()?.toLowerCase()
  switch (extension) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'bmp':
      return 'image/bmp'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

function parseCssLengthToPixels(value: string | undefined) {
  if (!value) {
    return undefined
  }
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(px|pt|in|cm|mm)?$/i)
  if (!match) {
    return undefined
  }

  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount <= 0) {
    return undefined
  }

  const unit = (match[2] || 'px').toLowerCase()
  switch (unit) {
    case 'pt':
      return amount * 96 / 72
    case 'in':
      return amount * 96
    case 'cm':
      return amount * 96 / 2.54
    case 'mm':
      return amount * 96 / 25.4
    default:
      return amount
  }
}

function parseStyleDeclaration(style: string | undefined) {
  const declarations = new Map<string, string>()
  if (!style) {
    return declarations
  }

  style.split(';').forEach(declaration => {
    const separator = declaration.indexOf(':')
    if (separator <= 0) {
      return
    }
    declarations.set(
      declaration.slice(0, separator).trim().toLowerCase(),
      declaration.slice(separator + 1).trim()
    )
  })
  return declarations
}

function parseShapeSize(style: string | undefined) {
  const declarations = parseStyleDeclaration(style)
  return {
    width: parseCssLengthToPixels(declarations.get('width')),
    height: parseCssLengthToPixels(declarations.get('height'))
  }
}

function getExtentSize(element: Element) {
  const inline = getXmlAncestor(element, 'inline') || getXmlAncestor(element, 'anchor')
  const extent = inline ? getFirstXmlElement(inline, 'extent') : undefined
  const width = Number(extent?.getAttribute('cx'))
  const height = Number(extent?.getAttribute('cy'))
  return {
    width: Number.isFinite(width) && width > 0 ? width / DOCX_EMU_PER_CSS_PIXEL : undefined,
    height: Number.isFinite(height) && height > 0 ? height / DOCX_EMU_PER_CSS_PIXEL : undefined
  }
}

async function readDocxRelationships(zip: DocxZip, partPath: string, target: HTMLDivElement) {
  const relFile = zip.file(getRelationshipPath(partPath))
  const relationships = new Map<string, DocxRelationship>()
  if (!relFile) {
    return relationships
  }

  const relDoc = parseXml(await relFile.async('text'), target)
  if (!relDoc) {
    return relationships
  }

  getXmlElements(relDoc, 'Relationship').forEach(element => {
    const id = element.getAttribute('Id')
    const relationshipTarget = element.getAttribute('Target')
    if (!id || !relationshipTarget) {
      return
    }
    relationships.set(id, {
      id,
      type: element.getAttribute('Type') || '',
      target: relationshipTarget,
      targetMode: element.getAttribute('TargetMode') || undefined
    })
  })
  return relationships
}

async function getDataUrlFromZip(zip: DocxZip, sourcePath: string) {
  const file = zip.file(sourcePath)
  if (!file) {
    return undefined
  }
  const base64 = await file.async('base64')
  return `data:${getMimeType(sourcePath)};base64,${base64}`
}

function getDocxPartPaths(zip: DocxZip) {
  return Object.keys(zip.files)
    .filter(path => path === 'word/document.xml'
      || /^word\/header\d+\.xml$/i.test(path)
      || /^word\/footer\d+\.xml$/i.test(path))
    .sort((left, right) => {
      if (left === 'word/document.xml') {
        return -1
      }
      if (right === 'word/document.xml') {
        return 1
      }
      return left.localeCompare(right)
    })
}

function inferVmlFallbackRole(partPath: string, shape: Element | null, style: string | undefined) {
  const shapeId = `${shape?.getAttribute('id') || ''} ${shape?.getAttribute('o:spid') || ''}`.toLowerCase()
  const normalizedStyle = (style || '').toLowerCase()

  if (
    partPath.includes('/header')
    && (shapeId.includes('watermark') || normalizedStyle.includes('z-index:-') || normalizedStyle.includes('mso-position-horizontal:center'))
  ) {
    return 'watermark' as const
  }

  if (shape?.getAttribute('o:ole') === 't' || shape?.getAttribute('ole') === 't') {
    return 'ole-preview' as const
  }

  return 'vml-image' as const
}

async function collectDocxVmlFallbacks(zip: DocxZip, target: HTMLDivElement) {
  const fallbacks: DocxImageFallback[] = []
  const seen = new Set<string>()

  for (const partPath of getDocxPartPaths(zip)) {
    const partFile = zip.file(partPath)
    if (!partFile) {
      continue
    }

    const doc = parseXml(await partFile.async('text'), target)
    if (!doc) {
      continue
    }

    const relationships = await readDocxRelationships(zip, partPath, target)
    for (const imagedata of getXmlElements(doc, 'imagedata')) {
      const relationshipId = getXmlAttribute(
        imagedata,
        'id',
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
      )
      const relationship = relationshipId ? relationships.get(relationshipId) : undefined
      if (!relationship || relationship.targetMode === 'External' || !relationship.type.includes('/image')) {
        continue
      }

      const sourcePath = resolveRelationshipTarget(partPath, relationship.target)
      const dataUrl = await getDataUrlFromZip(zip, sourcePath)
      if (!dataUrl) {
        continue
      }

      const shape = getXmlAncestor(imagedata, 'shape')
      const style = shape?.getAttribute('style') || undefined
      const role = inferVmlFallbackRole(partPath, shape, style)
      const key = role === 'watermark'
        ? `${role}:${sourcePath}`
        : `${role}:${partPath}:${sourcePath}:${getParagraphIndex(imagedata) ?? 'end'}`

      if (seen.has(key)) {
        continue
      }
      seen.add(key)

      fallbacks.push({
        role,
        key,
        dataUrl,
        sourcePath,
        partPath,
        title: imagedata.getAttribute('o:title') || imagedata.getAttribute('title') || undefined,
        style,
        ...parseShapeSize(style),
        paragraphIndex: partPath === 'word/document.xml' ? getParagraphIndex(imagedata) : undefined
      })
    }
  }

  return fallbacks
}

function parseCacheValues(element: Element | undefined) {
  if (!element) {
    return []
  }

  return getXmlElements(element, 'pt')
    .sort((left, right) => Number(left.getAttribute('idx') || 0) - Number(right.getAttribute('idx') || 0))
    .map(point => getXmlText(getFirstXmlElement(point, 'v')))
    .filter(Boolean)
}

function parseChartSeries(series: Element) {
  const name = parseCacheValues(getFirstXmlElement(getFirstXmlElement(series, 'tx') || series, 'strCache'))[0]
    || parseCacheValues(getFirstXmlElement(getFirstXmlElement(series, 'tx') || series, 'numCache'))[0]
    || 'Series'
  const categories = parseCacheValues(getFirstXmlElement(getFirstXmlElement(series, 'cat') || series, 'strCache'))
  const numericCategories = parseCacheValues(getFirstXmlElement(getFirstXmlElement(series, 'cat') || series, 'numCache'))
  const values = parseCacheValues(getFirstXmlElement(getFirstXmlElement(series, 'val') || series, 'numCache'))
    .map(value => Number(value))
    .filter(value => Number.isFinite(value))

  return {
    name,
    categories: categories.length ? categories : numericCategories,
    values
  }
}

function parseChartFallback(chartDoc: XMLDocument, sourcePath: string, chartElement: Element, paragraphIndex?: number) {
  const chartTypeElement = ['lineChart', 'barChart', 'pieChart', 'areaChart', 'scatterChart']
    .map(type => getXmlElements(chartDoc, type)[0])
    .find(Boolean)
  const chartType = chartTypeElement ? getXmlLocalName(chartTypeElement) : 'chart'
  const title = getXmlText(getFirstXmlElement(getFirstXmlElement(chartDoc, 'title') || chartDoc, 't'))
    || sourcePath.split('/').pop() || 'Chart'
  const series = (chartTypeElement ? getXmlElements(chartTypeElement, 'ser') : getXmlElements(chartDoc, 'ser'))
    .map(parseChartSeries)
    .filter(item => item.values.length)
  const { width, height } = getExtentSize(chartElement)

  if (!series.length) {
    return undefined
  }

  return {
    key: `chart:${sourcePath}:${paragraphIndex ?? 'end'}`,
    title,
    type: chartType,
    sourcePath,
    series,
    width,
    height,
    paragraphIndex
  } satisfies DocxChartFallback
}

async function collectDocxChartFallbacks(zip: DocxZip, target: HTMLDivElement) {
  const partPath = 'word/document.xml'
  const documentFile = zip.file(partPath)
  if (!documentFile) {
    return []
  }

  const documentDoc = parseXml(await documentFile.async('text'), target)
  if (!documentDoc) {
    return []
  }

  const relationships = await readDocxRelationships(zip, partPath, target)
  const fallbacks: DocxChartFallback[] = []
  const seen = new Set<string>()

  for (const chart of getXmlElements(documentDoc, 'chart')) {
    const relationshipId = getXmlAttribute(
      chart,
      'id',
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    )
    const relationship = relationshipId ? relationships.get(relationshipId) : undefined
    if (!relationship || relationship.targetMode === 'External' || !relationship.type.includes('/chart')) {
      continue
    }

    const sourcePath = resolveRelationshipTarget(partPath, relationship.target)
    const chartFile = zip.file(sourcePath)
    if (!chartFile) {
      continue
    }

    const chartDoc = parseXml(await chartFile.async('text'), target)
    const paragraphIndex = getParagraphIndex(chart)
    const fallback = chartDoc ? parseChartFallback(chartDoc, sourcePath, chart, paragraphIndex) : undefined
    if (!fallback || seen.has(fallback.key)) {
      continue
    }
    seen.add(fallback.key)
    fallbacks.push(fallback)
  }

  return fallbacks
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildChartSvg(chart: DocxChartFallback) {
  const width = Math.max(360, Math.round(chart.width || 520))
  const height = Math.max(220, Math.round(chart.height || 320))
  const padding = { top: 52, right: 30, bottom: 56, left: 54 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const allValues = chart.series.flatMap(item => item.values)
  const maxValue = Math.max(...allValues, 1)
  const minValue = Math.min(...allValues, 0)
  const valueSpan = Math.max(maxValue - minValue, 1)
  const colors = ['#2563eb', '#10b981', '#f97316', '#8b5cf6', '#ef4444']
  const maxPoints = Math.max(...chart.series.map(item => item.values.length), 1)

  const pointX = (index: number) => padding.left + (maxPoints === 1 ? plotWidth / 2 : index * plotWidth / (maxPoints - 1))
  const pointY = (value: number) => padding.top + plotHeight - ((value - minValue) / valueSpan) * plotHeight

  const seriesPaths = chart.series.map((series, seriesIndex) => {
    const color = colors[seriesIndex % colors.length]
    const points = series.values.map((value, index) => `${pointX(index).toFixed(1)},${pointY(value).toFixed(1)}`).join(' ')
    const circles = series.values.map((value, index) => {
      const x = pointX(index).toFixed(1)
      const y = pointY(value).toFixed(1)
      return `<circle cx="${x}" cy="${y}" r="3.5" fill="${color}"><title>${escapeHtml(series.name)}: ${escapeHtml(String(value))}</title></circle>`
    }).join('')
    return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${circles}`
  }).join('')

  const categories = chart.series.find(item => item.categories.length)?.categories || []
  const labels = categories.slice(0, maxPoints).map((label, index) => {
    const x = pointX(index)
    const shown = label.length > 14 ? `${label.slice(0, 13)}...` : label
    return `<text x="${x.toFixed(1)}" y="${height - 22}" text-anchor="middle" fill="#64748b" font-size="11">${escapeHtml(shown)}</text>`
  }).join('')

  const legend = chart.series.slice(0, 5).map((series, index) => {
    const x = padding.left + index * 98
    const y = 30
    const color = colors[index % colors.length]
    return `<g transform="translate(${x} ${y})"><rect width="10" height="10" rx="2" fill="${color}"/><text x="15" y="9" fill="#475569" font-size="11">${escapeHtml(series.name)}</text></g>`
  }).join('')

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(chart.title)}">
    <rect x="0" y="0" width="${width}" height="${height}" rx="8" fill="#ffffff"/>
    <text x="${padding.left}" y="22" fill="#0f172a" font-size="15" font-weight="700">${escapeHtml(chart.title)}</text>
    ${legend}
    <line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${padding.left + plotWidth}" y2="${padding.top + plotHeight}" stroke="#cbd5e1"/>
    <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + plotHeight}" stroke="#cbd5e1"/>
    <text x="${padding.left - 8}" y="${padding.top + 4}" text-anchor="end" fill="#64748b" font-size="11">${escapeHtml(maxValue.toFixed(1))}</text>
    <text x="${padding.left - 8}" y="${padding.top + plotHeight}" text-anchor="end" fill="#64748b" font-size="11">${escapeHtml(minValue.toFixed(1))}</text>
    ${seriesPaths}
    ${labels}
  </svg>`
}

function getDocxSections(target: HTMLDivElement) {
  return Array.from(target.querySelectorAll<HTMLElement>('section.docx'))
}

function getDocxArticles(target: HTMLDivElement) {
  return Array.from(target.querySelectorAll<HTMLElement>('section.docx > article'))
}

function getDocxParagraphAnchor(target: HTMLDivElement, paragraphIndex: number | undefined) {
  if (paragraphIndex === undefined) {
    return undefined
  }
  const paragraphs = Array.from(target.querySelectorAll<HTMLElement>('section.docx > article p'))
  return paragraphs[Math.min(Math.max(paragraphIndex, 0), Math.max(paragraphs.length - 1, 0))]
}

function insertDocxFallback(target: HTMLDivElement, node: HTMLElement, paragraphIndex: number | undefined) {
  const anchor = getDocxParagraphAnchor(target, paragraphIndex)
  if (anchor) {
    anchor.after(node)
    return
  }

  const article = getDocxArticles(target)[0]
  if (article) {
    article.appendChild(node)
  }
}

function injectDocxImageFallbacks(target: HTMLDivElement, fallbacks: DocxImageFallback[]) {
  const sections = getDocxSections(target)
  if (!sections.length) {
    return
  }

  fallbacks.forEach(fallback => {
    if (fallback.role === 'watermark') {
      sections.forEach(section => {
        const image = target.ownerDocument.createElement('img')
        image.className = 'docx-vml-watermark'
        image.src = fallback.dataUrl
        image.alt = fallback.title || ''
        image.dataset.docxFallback = fallback.key
        section.prepend(image)
      })
      return
    }

    const figure = target.ownerDocument.createElement('figure')
    figure.className = 'docx-vml-fallback'
    figure.dataset.docxFallback = fallback.key
    if (fallback.width) {
      figure.style.width = `${Math.round(fallback.width)}px`
    }

    const image = target.ownerDocument.createElement('img')
    image.src = fallback.dataUrl
    image.alt = fallback.title || (fallback.role === 'ole-preview' ? 'Embedded object preview' : 'Document image')
    if (fallback.width) {
      image.style.width = `${Math.round(fallback.width)}px`
    }
    if (fallback.height) {
      image.style.height = `${Math.round(fallback.height)}px`
    }
    figure.appendChild(image)
    insertDocxFallback(target, figure, fallback.paragraphIndex)
  })
}

function injectDocxChartFallbacks(target: HTMLDivElement, fallbacks: DocxChartFallback[]) {
  fallbacks.forEach(fallback => {
    const figure = target.ownerDocument.createElement('figure')
    figure.className = 'docx-chart-fallback'
    figure.dataset.docxFallback = fallback.key
    if (fallback.width) {
      figure.style.width = `${Math.round(fallback.width)}px`
    }
    figure.innerHTML = buildChartSvg(fallback)
    insertDocxFallback(target, figure, fallback.paragraphIndex)
  })
}

async function enhanceDocxFallbacks(buffer: ArrayBuffer, target: HTMLDivElement) {
  try {
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(buffer.slice(0))
    const [imageFallbacks, chartFallbacks] = await Promise.all([
      collectDocxVmlFallbacks(zip, target),
      collectDocxChartFallbacks(zip, target)
    ])

    if (imageFallbacks.length) {
      injectDocxImageFallbacks(target, imageFallbacks)
    }
    if (chartFallbacks.length) {
      injectDocxChartFallbacks(target, chartFallbacks)
    }
  } catch (error) {
    console.warn('[file-viewer] DOCX 兼容增强解析失败，已保留 @file-viewer/docx 原始渲染结果。', error)
  }
}

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

    // 新 DOCX 引擎会优先使用 Word 保存的分页；这里保留预览层兜底分页，覆盖缺少分页标记的旧文件。
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

function wrapDocxSections(target: HTMLDivElement, pagedLayout: boolean) {
  const wrapper = target.querySelector('.docx-wrapper')
  if (!wrapper) {
    return []
  }

  return Array.from(wrapper.children).flatMap(child => {
    if (!isTargetHTMLElement(child, target) || !child.matches('section.docx')) {
      return []
    }

    const frame = target.ownerDocument.createElement('div')
    frame.className = pagedLayout ? 'docx-page-frame' : 'docx-flow-frame'
    child.before(frame)
    frame.appendChild(child)
    return [frame]
  })
}

function makeDocxResponsive(target: HTMLDivElement, context?: FileRenderContext) {
  target.classList.add('docx-fit-viewer')
  const style = installResponsiveStyle(target)
  const pagedLayout = shouldPaginateOversizedDocxSections(context)
  if (pagedLayout) {
    paginateOversizedSections(target)
  }
  const frames = wrapDocxSections(target, pagedLayout)
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
        const contentHeight = pagedLayout
          ? page.offsetHeight
          : Math.max(page.scrollHeight, page.offsetHeight)
        if (!pageWidth || !contentHeight) {
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
        frame.style.height = `${Math.ceil(contentHeight * scale)}px`
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

function isDocxFlowFrame(frame: HTMLElement | undefined) {
  return !!frame?.classList.contains('docx-flow-frame')
}

function getDocxFramePrintSize(frame: HTMLElement | undefined) {
  const page = frame ? getDocxPageElement(frame) : null
  if (!page) {
    return DOCX_DEFAULT_PAGE_SIZE
  }

  const size = getElementPrintPageSize(page, DOCX_DEFAULT_PAGE_SIZE)
  if (!isDocxFlowFrame(frame)) {
    return size
  }

  return {
    width: size.width,
    height: Math.max(page.scrollHeight || 0, page.offsetHeight || 0, DOCX_DEFAULT_PAGE_SIZE.height)
  }
}

function normalizeDocxPageForPrint(frame: HTMLElement, pageSize: PrintPageSize) {
  const flowLayout = isDocxFlowFrame(frame)
  const pageWidth = formatCssPixels(pageSize.width)
  const pageHeight = formatCssPixels(pageSize.height)

  applyPrintPageSize(frame, pageSize, { heightMode: flowLayout ? 'min' : 'fixed' })
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
  page.style.minHeight = flowLayout ? '0' : pageHeight
  page.style.height = flowLayout ? 'auto' : pageHeight
  page.style.margin = '0 auto'
  page.style.transform = 'none'
  page.style.transformOrigin = 'top left'
  page.style.overflow = flowLayout ? 'visible' : 'hidden'
  page.style.boxShadow = 'none'
}

function buildDocxPrintStyle(target: HTMLDivElement) {
  const firstFrame = target.querySelector<HTMLElement>('.docx-page-frame, .docx-flow-frame')
  const pageSize = getDocxFramePrintSize(firstFrame || undefined)
  const selector = firstFrame?.classList.contains('docx-flow-frame')
    ? '.viewer-export-content .docx-flow-frame'
    : '.viewer-export-content .docx-page-frame'

  return buildPrintPageStyle({
    selector,
    width: pageSize.width,
    height: firstFrame?.classList.contains('docx-flow-frame')
      ? DOCX_DEFAULT_PAGE_SIZE.height
      : pageSize.height,
    heightMode: firstFrame?.classList.contains('docx-flow-frame') ? 'min' : 'fixed'
  })
}

function prepareDocxCloneForExport(target: HTMLDivElement) {
  const liveFrames = Array.from(target.querySelectorAll<HTMLElement>('.docx-page-frame, .docx-flow-frame'))
  const clone = target.cloneNode(true) as HTMLElement
  const printDocument = target.ownerDocument.createElement('div')
  printDocument.className = 'docx-print-document'
  const scopedStyles = Array.from(clone.querySelectorAll('style'))
    .filter(style => !style.textContent?.includes('.docx-fit-viewer'))
    .map(style => style.outerHTML)
    .join('')

  clone.querySelectorAll<HTMLElement>('.docx-page-frame, .docx-flow-frame').forEach((frame, index) => {
    normalizeDocxPageForPrint(frame, getDocxFramePrintSize(liveFrames[index]))
    printDocument.appendChild(frame.cloneNode(true))
  })

  return printDocument.childElementCount ? `${scopedStyles}${printDocument.outerHTML}` : clone.innerHTML
}

/**
 * 渲染docx文件
 */
export default async function(buffer: ArrayBuffer, target: HTMLDivElement, context?: FileRenderContext): Promise<AppWrapper> {
  let hasNotifiedProgressiveRender = false
  const notifyProgressiveRender = () => {
    if (hasNotifiedProgressiveRender) {
      return
    }
    hasNotifiedProgressiveRender = true
    context?.onProgressiveRender?.()
  }
  const docxOptions = createDocxOptions(target, context, notifyProgressiveRender)
  const { defaultOptions, renderAsync } = await loadLibrary()

  target.dataset.docxWorker = docxOptions.useWorker ? 'self' : 'false'
  await renderAsync(buffer, target, undefined, {
    ...defaultOptions,
    ...docxOptions
  })
  notifyProgressiveRender()

  await enhanceDocxFallbacks(buffer, target)
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
